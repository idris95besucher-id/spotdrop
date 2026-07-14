import CoreImage
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
import simd

/// Sequential panorama compositor.
///
/// Registers each frame against its immediate predecessor (`PanoRegistration`),
/// accumulates the resulting transforms into one coordinate space anchored on the
/// first frame, then warps and composites every frame onto a single growing canvas
/// in capture order.
///
/// Deliberately NOT included, on purpose: all-pairs feature matching, global bundle
/// adjustment, or graph-cut seam search across the whole panorama — the things that
/// made the old OpenCV `cv::Stitcher` pipeline both slow and memory-hungry. Frames
/// arrive in known sequential order from a roughly planar handheld sweep, so
/// adjacent-pair registration plus straightforward compositing is sufficient, and
/// peak memory is bounded by "one canvas plus one incoming frame" rather than
/// "every captured frame plus OpenCV's entire internal working set" at once.
///
/// Stage 1 note: this version composites frames with a plain over-blend (no seam
/// feathering yet) — hard seams in overlap regions are a known, deliberate
/// limitation to revisit once the underlying registration geometry is confirmed
/// correct on a real device. Getting the geometry right first, before adding more
/// filter-chain complexity on top, is the safer order given this code has not been
/// compiled or run.
enum PanoNativeCompositor {
    /// Cap on the long edge of the final composited canvas — mirrors the safety
    /// cap the old OpenCV path applied after stitching.
    static let maxOutputWidth = 8192

    private struct Placed {
        let image: CGImage
        /// Maps this frame's own pixel coordinates into the shared canvas
        /// coordinate space established by the first frame (which is the identity).
        let transform: simd_float3x3
    }

    /// Consecutive registration failures allowed before giving up entirely. A
    /// handful of bad frames in a row usually means the user swept past something
    /// with no texture (blank sky/wall) and will recover a few frames later; a long
    /// run of failures means the sequence has genuinely fallen apart and we should
    /// fail cleanly instead of returning a badly fragmented panorama.
    private static let maxConsecutiveSkips = 6

    /// Two independent cumulative-transform estimates for the same frame (see
    /// below) are considered in agreement if they place the frame's center within
    /// this many pixels of each other.
    private static let agreementToleranceInPixels: CGFloat = 24

    static func composite(frames: [CGImage], jpegQuality: CGFloat) throws -> PanoStitchOutput {
        guard frames.count >= 2 else {
            throw PanoStitchError.notEnoughFrames
        }

        var placed: [Placed] = [Placed(image: frames[0], transform: matrix_identity_float3x3)]
        var consecutiveSkips = 0

        for index in 1..<frames.count {
            let currentImage = frames[index]
            guard let lastPlaced = placed.last else { break }

            // Primary estimate: register against the most recently *placed* frame
            // (not the raw previous array index — if that frame was itself
            // skipped, chaining against it would compose a transform with the
            // wrong reference and corrupt everything after it).
            guard let primary = try? PanoRegistration.register(floating: currentImage, reference: lastPlaced.image) else {
                consecutiveSkips += 1
                print("[SpotDropPano] frame \(index) skipped: primary registration failed (\(consecutiveSkips) in a row)")
                if consecutiveSkips > maxConsecutiveSkips {
                    throw PanoStitchError.alignmentFailed
                }
                continue
            }

            let primaryCumulative = lastPlaced.transform * primary.transform

            // Secondary estimate: also register against the frame before that, when
            // available, as an independent cross-check. This stands in for a
            // proper global bundle adjustment (which would jointly solve all pairs
            // at once — a much larger undertaking) with a much cheaper "windowed"
            // local adjustment: two independent paths through the last two frames
            // that, when they agree, we average to reduce accumulated drift, and
            // when they disagree, we fall back to the primary (closest, most
            // reliable) estimate alone rather than guessing.
            var resolvedCumulative = primaryCumulative
            if placed.count >= 2 {
                let secondReference = placed[placed.count - 2]
                if let secondary = try? PanoRegistration.register(
                    floating: currentImage,
                    reference: secondReference.image,
                    crossCheck: false
                ) {
                    let secondaryCumulative = secondReference.transform * secondary.transform
                    if agrees(primaryCumulative, secondaryCumulative, image: currentImage) {
                        resolvedCumulative = average(primaryCumulative, secondaryCumulative)
                    }
                }
            }

            placed.append(Placed(image: currentImage, transform: resolvedCumulative))
            consecutiveSkips = 0
        }

        guard placed.count >= PanoStitcher.minAlignedFrames else {
            throw PanoStitchError.alignmentFailed
        }

        print("[SpotDropPano] placed \(placed.count) of \(frames.count) captured frames")

        return try render(placed: placed, jpegQuality: jpegQuality)
    }

    // MARK: - Drift reconciliation

    private static func transformedCenter(_ m: simd_float3x3, image: CGImage) -> CGPoint {
        let center = simd_float3(Float(image.width) / 2, Float(image.height) / 2, 1)
        let r = m * center
        guard abs(r.z) > 1e-6 else { return .zero }
        return CGPoint(x: CGFloat(r.x / r.z), y: CGFloat(r.y / r.z))
    }

    private static func agrees(_ a: simd_float3x3, _ b: simd_float3x3, image: CGImage) -> Bool {
        let pa = transformedCenter(a, image: image)
        let pb = transformedCenter(b, image: image)
        let distance = hypot(pa.x - pb.x, pa.y - pb.y)
        return distance < agreementToleranceInPixels
    }

    /// Simple element-wise average of the two candidate transforms, renormalized so
    /// the homogeneous scale term stays 1. Cheap and effective for two transforms
    /// that already roughly agree (which `agrees` above gates on) — this is not a
    /// substitute for real bundle adjustment, just a low-risk way to cancel some of
    /// each path's independent error.
    private static func average(_ a: simd_float3x3, _ b: simd_float3x3) -> simd_float3x3 {
        var m = (a + b) * Float(0.5)
        let w = m[2][2]
        if abs(w) > 1e-6 {
            m = m * (1 / w)
        }
        return m
    }

    // MARK: - Geometry

    private static func project(_ point: CGPoint, by m: simd_float3x3) -> CGPoint {
        let v = simd_float3(Float(point.x), Float(point.y), 1)
        let r = m * v
        guard abs(r.z) > 1e-6 else { return .zero }
        return CGPoint(x: CGFloat(r.x / r.z), y: CGFloat(r.y / r.z))
    }

    /// Order: top-left, top-right, bottom-left, bottom-right — in ordinary pixel
    /// space (origin top-left, Y increasing downward), matching CGImage/Vision.
    private static func corners(of image: CGImage) -> [CGPoint] {
        let w = CGFloat(image.width)
        let h = CGFloat(image.height)
        return [
            CGPoint(x: 0, y: 0),
            CGPoint(x: w, y: 0),
            CGPoint(x: 0, y: h),
            CGPoint(x: w, y: h),
        ]
    }

    /// CGImage/Vision pixel space has Y increasing downward from the top-left.
    /// CIImage uses a Y-up coordinate system. Every other computation in this file
    /// stays in ordinary top-left/Y-down pixel space and flips through this single
    /// function only at the point of talking to Core Image — so if the flip is
    /// wrong, this is the one place to fix.
    private static func toCoreImageSpace(_ point: CGPoint, canvasHeight: CGFloat) -> CGPoint {
        CGPoint(x: point.x, y: canvasHeight - point.y)
    }

    // MARK: - Rendering

    private static func render(placed: [Placed], jpegQuality: CGFloat) throws -> PanoStitchOutput {
        // Pass 1: bounding box of every frame once warped into canvas space.
        var minX = CGFloat.greatestFiniteMagnitude
        var minY = CGFloat.greatestFiniteMagnitude
        var maxX = -CGFloat.greatestFiniteMagnitude
        var maxY = -CGFloat.greatestFiniteMagnitude

        for item in placed {
            for corner in corners(of: item.image) {
                let p = project(corner, by: item.transform)
                minX = min(minX, p.x)
                minY = min(minY, p.y)
                maxX = max(maxX, p.x)
                maxY = max(maxY, p.y)
            }
        }

        guard minX.isFinite, minY.isFinite, maxX.isFinite, maxY.isFinite, maxX > minX, maxY > minY else {
            throw PanoStitchError.renderFailed
        }

        let canvasWidth = (maxX - minX).rounded(.up)
        let canvasHeight = (maxY - minY).rounded(.up)

        guard canvasWidth > 0, canvasHeight > 0, canvasWidth <= 32_768, canvasHeight <= 32_768 else {
            throw PanoStitchError.renderFailed
        }

        // Pass 2: warp + composite each frame in capture order. Later frames draw
        // over earlier ones in the overlap band (plain over-blend — see file header
        // note on deferred feathering).
        var composite: CIImage?

        for item in placed {
            let ciImage = CIImage(cgImage: item.image)

            let canvasCorners = corners(of: item.image).map { corner -> CGPoint in
                let projected = project(corner, by: item.transform)
                return CGPoint(x: projected.x - minX, y: projected.y - minY)
            }
            let ciCorners = canvasCorners.map { toCoreImageSpace($0, canvasHeight: canvasHeight) }

            guard ciCorners.count == 4,
                  let warped = perspectiveWarp(
                    ciImage,
                    topLeft: ciCorners[0],
                    topRight: ciCorners[1],
                    bottomLeft: ciCorners[2],
                    bottomRight: ciCorners[3]
                  ) else {
                continue
            }

            composite = composite.map { warped.composited(over: $0) } ?? warped
        }

        guard let finalImage = composite else {
            throw PanoStitchError.renderFailed
        }

        var renderImage = finalImage
        var renderWidth = canvasWidth
        var renderHeight = canvasHeight

        if canvasWidth > CGFloat(maxOutputWidth) {
            let scale = CGFloat(maxOutputWidth) / canvasWidth
            renderImage = finalImage.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
            renderWidth = (canvasWidth * scale).rounded(.up)
            renderHeight = (canvasHeight * scale).rounded(.up)
        }

        let context = CIContext(options: [.useSoftwareRenderer: false])
        let canvasRect = CGRect(x: 0, y: 0, width: renderWidth, height: renderHeight)

        guard let cgImage = context.createCGImage(renderImage, from: canvasRect) else {
            throw PanoStitchError.renderFailed
        }

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("spotdrop-pano-\(UUID().uuidString).jpg")

        guard let destination = CGImageDestinationCreateWithURL(
            outputURL as CFURL,
            UTType.jpeg.identifier as CFString,
            1,
            nil
        ) else {
            throw PanoStitchError.encodeFailed
        }

        let options: [CFString: Any] = [kCGImageDestinationLossyCompressionQuality: jpegQuality]
        CGImageDestinationAddImage(destination, cgImage, options as CFDictionary)
        guard CGImageDestinationFinalize(destination) else {
            throw PanoStitchError.encodeFailed
        }

        return PanoStitchOutput(path: outputURL.path, width: cgImage.width, height: cgImage.height)
    }

    private static func perspectiveWarp(
        _ image: CIImage,
        topLeft: CGPoint,
        topRight: CGPoint,
        bottomLeft: CGPoint,
        bottomRight: CGPoint
    ) -> CIImage? {
        guard let filter = CIFilter(name: "CIPerspectiveTransform") else { return nil }
        filter.setValue(image, forKey: kCIInputImageKey)
        filter.setValue(CIVector(cgPoint: topLeft), forKey: "inputTopLeft")
        filter.setValue(CIVector(cgPoint: topRight), forKey: "inputTopRight")
        filter.setValue(CIVector(cgPoint: bottomLeft), forKey: "inputBottomLeft")
        filter.setValue(CIVector(cgPoint: bottomRight), forKey: "inputBottomRight")
        return filter.outputImage
    }
}
