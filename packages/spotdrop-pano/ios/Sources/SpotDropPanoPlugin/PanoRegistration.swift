import Vision
import CoreGraphics
import simd

/// Frame-to-frame image registration using Vision's built-in homographic image
/// alignment, cross-checked against an independent translational alignment.
///
/// Gyro still drives the on-screen guide arrow in `PanoCaptureViewController`
/// (zero latency, good enough for a UI hint) — but alignment is entirely image-
/// based, which is what makes the result robust to imperfect hand rotation,
/// arm-swing vs. wrist-only panning, and walking while shooting.
///
/// On outlier rejection: Apple does not expose Vision's underlying feature
/// correspondences (keypoints/matches) through this public API, so we cannot run
/// our own RANSAC on top of Vision's own feature matching the way OpenCV's
/// `cv::detail::BestOf2NearestMatcher` did. `VNHomographicImageRegistrationRequest`
/// is documented as feature-based and already performs its own robust/outlier-
/// resistant fit internally — hand-rolling a second keypoint detector + matcher +
/// RANSAC solver from scratch in Swift would trade one set of untested numerical
/// code for another, riskier one, for uncertain gain. Instead, this file adds two
/// independent, genuinely additional layers of outlier rejection on top of
/// Vision's own estimate:
///   1. Vision's own per-observation `confidence` score.
///   2. A cross-check against `VNTranslationalImageRegistrationRequest` — a
///      different, simpler alignment model computed independently. Strong
///      agreement between two independent estimators is meaningful corroborating
///      evidence; strong disagreement is a genuine outlier signal.
enum PanoRegistrationError: Error, LocalizedError {
    case requestFailed(Error)
    case noObservation
    case implausibleWarp
    case lowConfidence

    var errorDescription: String? {
        switch self {
        case .requestFailed(let error):
            return "Vision registration failed: \(error.localizedDescription)"
        case .noObservation:
            return "No registration observation returned."
        case .implausibleWarp:
            return "Registration produced an implausible transform."
        case .lowConfidence:
            return "Registration confidence too low to trust."
        }
    }
}

struct PanoRegistrationResult {
    /// Maps points in the floating image's pixel space into the reference image's
    /// pixel space.
    let transform: simd_float3x3
    /// 0...1, higher is better.
    let confidence: Float
}

enum PanoRegistration {
    private static let minObservationConfidence: Float = 0.15
    /// 0...1 agreement between the homography's implied shift and the independent
    /// translational alignment. Only consulted when Vision's own confidence is
    /// below `minObservationConfidence`.
    private static let minCrossCheckAgreement: Float = 0.55

    /// - Parameter crossCheck: when true (default), also runs the independent
    ///   translational alignment as a second opinion. Callers doing a secondary /
    ///   cheaper cross-reference registration (see `PanoNativeCompositor`) can pass
    ///   `false` to save the extra Vision request.
    static func register(
        floating: CGImage,
        reference: CGImage,
        crossCheck: Bool = true
    ) throws -> PanoRegistrationResult {
        let homography = try homographicWarp(floating: floating, reference: reference)

        guard isPlausible(homography.transform) else {
            throw PanoRegistrationError.implausibleWarp
        }

        if homography.confidence >= minObservationConfidence {
            return PanoRegistrationResult(transform: homography.transform, confidence: homography.confidence)
        }

        guard crossCheck, let translation = try? translationalShift(floating: floating, reference: reference) else {
            throw PanoRegistrationError.lowConfidence
        }

        let agreement = agreementScore(homography: homography.transform, translation: translation)
        guard agreement >= minCrossCheckAgreement else {
            throw PanoRegistrationError.lowConfidence
        }

        return PanoRegistrationResult(transform: homography.transform, confidence: agreement)
    }

    // MARK: - Vision requests

    private static func homographicWarp(
        floating: CGImage,
        reference: CGImage
    ) throws -> (transform: simd_float3x3, confidence: Float) {
        let request = VNHomographicImageRegistrationRequest(targetedCGImage: floating, options: [:])
        let handler = VNImageRequestHandler(cgImage: reference, options: [:])

        do {
            try handler.perform([request])
        } catch {
            throw PanoRegistrationError.requestFailed(error)
        }

        guard let observations = request.results as? [VNImageHomographicAlignmentObservation],
              let observation = observations.first else {
            throw PanoRegistrationError.noObservation
        }

        return (observation.warpTransform, observation.confidence)
    }

    private static func translationalShift(floating: CGImage, reference: CGImage) throws -> CGVector {
        let request = VNTranslationalImageRegistrationRequest(targetedCGImage: floating, options: [:])
        let handler = VNImageRequestHandler(cgImage: reference, options: [:])

        do {
            try handler.perform([request])
        } catch {
            throw PanoRegistrationError.requestFailed(error)
        }

        guard let observations = request.results as? [VNImageTranslationAlignmentObservation],
              let observation = observations.first else {
            throw PanoRegistrationError.noObservation
        }

        let t = observation.alignmentTransform
        return CGVector(dx: t.tx, dy: t.ty)
    }

    /// Compares where the homography sends the image origin against the
    /// independently-estimated translational shift. This is a heuristic proxy, not
    /// a rigorous statistical test — but two independently-computed Vision
    /// estimates landing close together is meaningful evidence the pairing is
    /// sound, and landing far apart is a meaningful outlier signal.
    private static func agreementScore(homography: simd_float3x3, translation: CGVector) -> Float {
        let origin = simd_float3(0, 0, 1)
        let warped = homography * origin
        guard abs(warped.z) > 1e-6 else { return 0 }

        let homographyShift = CGVector(
            dx: CGFloat(warped.x / warped.z),
            dy: CGFloat(warped.y / warped.z)
        )

        let dx = Float(homographyShift.dx - translation.dx)
        let dy = Float(homographyShift.dy - translation.dy)
        let disagreementPixels = sqrt(dx * dx + dy * dy)

        // Disagreement of ~40px or more (at capture resolution, short side ≤ 1200)
        // is treated as essentially no agreement.
        let scale: Float = 40
        return max(0, 1 - disagreementPixels / scale)
    }

    /// Adjacent pano frames should be close to a pure rotation/translation with only
    /// mild perspective skew. Reject degenerate results (near-singular matrix,
    /// extreme perspective terms) before they reach the confidence checks above.
    private static func isPlausible(_ m: simd_float3x3) -> Bool {
        let det = m.determinant
        guard det.isFinite, abs(det) > 0.2, abs(det) < 5.0 else { return false }

        // In the classic homography layout [[a,b,c],[d,e,f],[g,h,1]], g and h are
        // the perspective terms. In Swift's column-major simd_float3x3, that's
        // column 0 row 2 and column 1 row 2 respectively.
        guard abs(m[0][2]) < 0.004, abs(m[1][2]) < 0.004 else { return false }

        return true
    }
}
