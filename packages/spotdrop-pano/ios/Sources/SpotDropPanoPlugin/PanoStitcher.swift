import UIKit
import CoreImage
import ImageIO
import UniformTypeIdentifiers
import SpotDropPanoOpenCV

enum PanoStitchError: LocalizedError {
    case notEnoughFrames
    case alignmentFailed
    case validationFailed
    case renderFailed
    case encodeFailed
    case openCV(String)

    var errorDescription: String? {
        switch self {
        case .notEnoughFrames:
            return "Continue moving to the right."
        case .alignmentFailed, .validationFailed, .renderFailed, .encodeFailed:
            return "Panorama could not be created. Please try again."
        case .openCV(let message):
            return message
        }
    }
}

struct PanoFrameSample {
    let image: CGImage
    let yaw: Double
    let blurScore: Double
}

struct PanoStitchOutput {
    let path: String
    let width: Int
    let height: Int
}

/// Final export uses OpenCV `cv::Stitcher` (cylindrical warper, RANSAC matching,
/// bundle adjustment, wave correction, graph-cut seams, multiband blend).
/// Live preview remains a lightweight cylindrical composite for responsiveness.
enum PanoStitcher {
    static let maxOutputWidth = 8192
    static let maxFrameShortSide = 1200
    static let jpegQuality: CGFloat = 0.92
    static let horizontalFOV: Double = 1.02
    static let minAlignedFrames = 3
    static let minAspectRatio = 1.15
    static let livePreviewShortSide = 200
    static let livePreviewMaxWidth = 2200
    /// The sequential native compositor (`PanoNativeCompositor`) doesn't pay the
    /// same all-pairs/bundle-adjustment cost the old OpenCV stitcher did, so it can
    /// afford more frames — which directly helps "captures too little of the
    /// scene": a wide sweep no longer gets truncated to as few as 42 frames before
    /// it reaches the stitcher.
    static let maxStitchFrames = 60

    /// Primary stitch path (Stage 1 of the panorama rewrite): sequential Vision-
    /// based registration + Core Image compositing. See `PanoNativeCompositor` for
    /// why this replaces the old OpenCV `cv::Stitcher` pipeline.
    static func stitch(frames: [PanoFrameSample]) throws -> PanoStitchOutput {
        let selected = selectFramesForStitch(frames)
        guard selected.count >= minAlignedFrames else {
            throw PanoStitchError.notEnoughFrames
        }

        let yawValues = selected.map(\.yaw)
        if let minYaw = yawValues.min(), let maxYaw = yawValues.max(), maxYaw - minYaw < 0.25 {
            throw PanoStitchError.notEnoughFrames
        }

        let prepared = try prepareFrames(selected)
        return try PanoNativeCompositor.composite(
            frames: prepared.map(\.image),
            jpegQuality: jpegQuality
        )
    }

    /// The previous OpenCV-backed implementation. Kept, unused, as a fast manual
    /// rollback during rollout — not called anywhere right now. Remove together
    /// with the OpenCV dependency (Package.swift, SpotDropPanoOpenCV target,
    /// scripts/ensure-spotdrop-pano-spm.mjs) once the native path above is
    /// validated on device.
    static func stitchOpenCVLegacy(frames: [PanoFrameSample]) throws -> PanoStitchOutput {
        let selected = selectFramesForStitch(frames)
        guard selected.count >= minAlignedFrames else {
            throw PanoStitchError.notEnoughFrames
        }

        let yawValues = selected.map(\.yaw)
        if let minYaw = yawValues.min(), let maxYaw = yawValues.max(), maxYaw - minYaw < 0.25 {
            throw PanoStitchError.notEnoughFrames
        }

        let prepared = try prepareFrames(selected)
        let paths = try writeTemporaryJPEGs(prepared)
        defer {
            for path in paths {
                try? FileManager.default.removeItem(atPath: path)
            }
        }

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("spotdrop-pano-\(UUID().uuidString).jpg")

        let result = OpenCVPanoStitcher.stitchImagePaths(paths, outputPath: outputURL.path)

        if let message = result["error"] as? String, !message.isEmpty {
            throw PanoStitchError.openCV(message)
        }

        guard let path = result["path"] as? String,
              let widthNum = result["width"] as? NSNumber,
              let heightNum = result["height"] as? NSNumber else {
            throw PanoStitchError.openCV("Panorama could not be created. Please try again.")
        }

        let width = widthNum.intValue
        let height = heightNum.intValue
        guard width > 0, height > 0 else {
            throw PanoStitchError.openCV("Panorama could not be created. Please try again.")
        }

        // Soft validation — OpenCV already cropped; keep sanity checks only.
        let aspect = Double(width) / Double(max(1, height))
        guard aspect >= minAspectRatio else {
            throw PanoStitchError.validationFailed
        }
        guard width <= maxOutputWidth, height <= 4096 else {
            throw PanoStitchError.validationFailed
        }

        // Verify JPEG header.
        guard let handle = try? FileHandle(forReadingFrom: URL(fileURLWithPath: path)) else {
            throw PanoStitchError.encodeFailed
        }
        let header = handle.readData(ofLength: 2)
        try? handle.close()
        guard header.count == 2, header[0] == 0xFF, header[1] == 0xD8 else {
            throw PanoStitchError.encodeFailed
        }

        return PanoStitchOutput(path: path, width: width, height: height)
    }

    // MARK: - Frame selection

    /// Keep sharp, well-spaced frames; drop blur / near-duplicates before OpenCV.
    private static func selectFramesForStitch(_ frames: [PanoFrameSample]) -> [PanoFrameSample] {
        let sorted = frames.sorted { $0.yaw < $1.yaw }
        guard !sorted.isEmpty else { return [] }

        let blurThreshold = sorted.map(\.blurScore).sorted()[max(0, sorted.count / 5)]
        let minBlur = max(18, min(blurThreshold * 0.65, 40))

        var selected: [PanoFrameSample] = []
        selected.reserveCapacity(min(maxStitchFrames, sorted.count))

        for sample in sorted {
            if sample.blurScore < minBlur, !selected.isEmpty {
                continue
            }
            if let last = selected.last {
                let spacing = sample.yaw - last.yaw
                // ~25–55% overlap band for FOV≈1.0 → spacing ~0.18–0.45
                if spacing < 0.14 {
                    // Prefer sharper of near-duplicates.
                    if sample.blurScore > last.blurScore {
                        selected[selected.count - 1] = sample
                    }
                    continue
                }
                if spacing > 0.85 {
                    // Large gap — still keep; OpenCV may fail later with a clear error.
                }
            }
            selected.append(sample)
            if selected.count >= maxStitchFrames { break }
        }

        // Always keep first and last if possible for full span.
        if let first = sorted.first, let last = sorted.last, selected.count >= 2 {
            if abs(selected.first!.yaw - first.yaw) > 0.05 {
                selected.insert(first, at: 0)
            }
            if abs(selected.last!.yaw - last.yaw) > 0.05 {
                selected.append(last)
            }
            if selected.count > maxStitchFrames {
                selected = Array(selected.prefix(maxStitchFrames))
            }
        }

        return selected
    }

    private static func prepareFrames(_ frames: [PanoFrameSample]) throws -> [PanoFrameSample] {
        var prepared: [PanoFrameSample] = []
        prepared.reserveCapacity(frames.count)

        for sample in frames {
            autoreleasepool {
                let shortSide = min(sample.image.width, sample.image.height)
                let scale = shortSide > maxFrameShortSide
                    ? CGFloat(maxFrameShortSide) / CGFloat(shortSide)
                    : 1
                let w = max(1, Int(CGFloat(sample.image.width) * scale))
                let h = max(1, Int(CGFloat(sample.image.height) * scale))
                guard let scaled = scaleImage(sample.image, width: w, height: h) else { return }
                prepared.append(PanoFrameSample(image: scaled, yaw: sample.yaw, blurScore: sample.blurScore))
            }
        }

        guard prepared.count >= minAlignedFrames else {
            throw PanoStitchError.notEnoughFrames
        }
        return prepared
    }

    private static func writeTemporaryJPEGs(_ frames: [PanoFrameSample]) throws -> [String] {
        var paths: [String] = []
        paths.reserveCapacity(frames.count)

        for (index, sample) in frames.enumerated() {
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("spotdrop-pano-frame-\(index)-\(UUID().uuidString).jpg")
            guard let dest = CGImageDestinationCreateWithURL(
                url as CFURL,
                UTType.jpeg.identifier as CFString,
                1,
                nil
            ) else {
                throw PanoStitchError.encodeFailed
            }
            let options: [CFString: Any] = [kCGImageDestinationLossyCompressionQuality: 0.92]
            CGImageDestinationAddImage(dest, sample.image, options as CFDictionary)
            guard CGImageDestinationFinalize(dest) else {
                throw PanoStitchError.encodeFailed
            }
            paths.append(url.path)
        }
        return paths
    }

    // MARK: - Live preview (lightweight; final export uses OpenCV)

    static func makeLivePreview(frames: [PanoFrameSample]) -> CGImage? {
        guard !frames.isEmpty else { return nil }

        let sorted = frames.sorted { $0.yaw < $1.yaw }
        var scaled: [(CGImage, Double)] = []
        scaled.reserveCapacity(sorted.count)

        for sample in sorted {
            autoreleasepool {
                let shortSide = min(sample.image.width, sample.image.height)
                let scale = shortSide > livePreviewShortSide
                    ? CGFloat(livePreviewShortSide) / CGFloat(shortSide)
                    : 1
                let w = max(1, Int(CGFloat(sample.image.width) * scale))
                let h = max(1, Int(CGFloat(sample.image.height) * scale))
                if let img = scaleImage(sample.image, width: w, height: h) {
                    scaled.append((img, sample.yaw))
                }
            }
        }

        guard let first = scaled.first else { return nil }
        let frameW = first.0.width
        let frameH = first.0.height
        let pixelsPerRadian = Double(frameW) / horizontalFOV
        let minYaw = scaled.first!.1
        let maxYaw = scaled.last!.1
        var canvasW = Int((maxYaw - minYaw) * pixelsPerRadian) + frameW + 4
        canvasW = min(livePreviewMaxWidth, max(frameW, canvasW))
        let canvasH = frameH

        let colorSpace = CGColorSpaceCreateDeviceRGB()
        guard let ctx = CGContext(
            data: nil,
            width: canvasW,
            height: canvasH,
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return nil }

        ctx.clear(CGRect(x: 0, y: 0, width: canvasW, height: canvasH))
        ctx.interpolationQuality = .medium

        for (image, yaw) in scaled {
            let x = Int((yaw - minYaw) * pixelsPerRadian)
            let clampedX = max(0, min(canvasW - frameW, x))
            let feather = max(6, frameW / 10)
            drawSoftHorizontal(
                context: ctx,
                image: image,
                x: clampedX,
                width: frameW,
                height: frameH,
                feather: feather
            )
        }

        return ctx.makeImage()
    }

    private static func drawSoftHorizontal(
        context: CGContext,
        image: CGImage,
        x: Int,
        width: Int,
        height: Int,
        feather: Int
    ) {
        context.saveGState()
        let rect = CGRect(x: x, y: 0, width: width, height: height)
        if let mask = softEdgeMask(width: width, height: height, feather: feather) {
            context.clip(to: rect, mask: mask)
        }
        context.draw(image, in: rect)
        context.restoreGState()
    }

    private static func softEdgeMask(width: Int, height: Int, feather: Int) -> CGImage? {
        let colorSpace = CGColorSpaceCreateDeviceGray()
        guard let ctx = CGContext(
            data: nil,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.none.rawValue
        ) else { return nil }

        ctx.setFillColor(gray: 1, alpha: 1)
        ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
        let soft = max(1, feather)
        for i in 0..<soft {
            let alpha = CGFloat(i) / CGFloat(soft)
            ctx.setFillColor(gray: alpha, alpha: 1)
            ctx.fill(CGRect(x: i, y: 0, width: 1, height: height))
            ctx.fill(CGRect(x: width - 1 - i, y: 0, width: 1, height: height))
        }
        return ctx.makeImage()
    }

    // MARK: - Blur score (capture-time)

    static func laplacianVariance(_ image: CGImage) -> Double {
        let targetW = 160
        let targetH = max(1, Int(Double(image.height) * Double(targetW) / Double(max(1, image.width))))
        guard let small = scaleImage(image, width: targetW, height: targetH),
              let data = rgbaBytes(small) else {
            return 0
        }

        var gray = [Float](repeating: 0, count: targetW * targetH)
        for i in 0..<(targetW * targetH) {
            let o = i * 4
            gray[i] = 0.299 * Float(data[o]) + 0.587 * Float(data[o + 1]) + 0.114 * Float(data[o + 2])
        }

        var sum = 0.0
        var sumSq = 0.0
        var count = 0.0
        for y in 1..<(targetH - 1) {
            for x in 1..<(targetW - 1) {
                let c = Int(gray[y * targetW + x])
                let lap =
                    -Int(gray[(y - 1) * targetW + x]) +
                    -Int(gray[y * targetW + (x - 1)]) +
                    4 * c +
                    -Int(gray[y * targetW + (x + 1)]) +
                    -Int(gray[(y + 1) * targetW + x])
                let v = Double(lap)
                sum += v
                sumSq += v * v
                count += 1
            }
        }
        guard count > 0 else { return 0 }
        let mean = sum / count
        return max(0, sumSq / count - mean * mean)
    }

    // MARK: - Image helpers

    private static func scaleImage(_ image: CGImage, width: Int, height: Int) -> CGImage? {
        if image.width == width && image.height == height { return image }
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        guard let ctx = CGContext(
            data: nil,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return nil }
        ctx.interpolationQuality = .high
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        return ctx.makeImage()
    }

    private static func rgbaBytes(_ image: CGImage) -> [UInt8]? {
        let w = image.width
        let h = image.height
        var data = [UInt8](repeating: 0, count: w * h * 4)
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        guard let ctx = CGContext(
            data: &data,
            width: w,
            height: h,
            bitsPerComponent: 8,
            bytesPerRow: w * 4,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return nil }
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
        return data
    }
}
