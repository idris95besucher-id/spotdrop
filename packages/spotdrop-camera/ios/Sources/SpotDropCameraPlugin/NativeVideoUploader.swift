import AVFoundation
import Foundation
import UIKit

/// Streams a captured Spot video from disk → optional AVAssetExportSession compress →
/// URLSession file upload to Supabase Storage. Never loads the whole video into a base64
/// string or JS heap.
enum NativeVideoUploader {
    static let maxDurationSeconds: Double = 15
    static let maxLongSidePx: CGFloat = 1920
    /// Hard ceiling for the file that leaves the device.
    static let targetMaxBytes: Int64 = 30 * 1024 * 1024
    /// Encode bitrate for the single compress pass (~6 Mbps @ 1080p30 ≈ 11 MB / 15s).
    static let exportBitrate = 6_000_000

    struct TimingMs {
        var probeMs: Int = 0
        var compressMs: Int = 0
        var coverMs: Int = 0
        var uploadMs: Int = 0
        var serverWaitMs: Int = 0
        var totalMs: Int = 0
    }

    struct Probe {
        var durationSeconds: Double
        var width: Int
        var height: Int
        var sizeBytes: Int64
        var estimatedBitrateMbps: Double
    }

    struct UploadResult {
        var publicObjectPath: String
        var coverObjectPath: String?
        var originalSizeBytes: Int64
        var finalSizeBytes: Int64
        var durationSeconds: Double
        var width: Int
        var height: Int
        var bitrateMbps: Double
        var compressed: Bool
        var uploadSpeedMbps: Double
        var httpStatus: Int
        var timing: TimingMs
    }

    enum UploaderError: LocalizedError {
        case invalidPath
        case missingFile
        case exportFailed(String)
        case uploadFailed(status: Int, body: String)
        case coverFailed

        var errorDescription: String? {
            switch self {
            case .invalidPath: return "Invalid video path."
            case .missingFile: return "Video file is missing on disk."
            case .exportFailed(let reason): return "Video compression failed: \(reason)"
            case .uploadFailed(let status, let body):
                return "Storage upload failed (HTTP \(status)): \(body)"
            case .coverFailed: return "Unable to extract video cover frame."
            }
        }
    }

    static func probe(fileURL: URL) throws -> Probe {
        let attrs = try FileManager.default.attributesOfItem(atPath: fileURL.path)
        let sizeBytes = (attrs[.size] as? NSNumber)?.int64Value ?? 0
        let asset = AVURLAsset(url: fileURL)
        let durationSeconds = CMTimeGetSeconds(asset.duration)
        var width = 0
        var height = 0

        if let track = asset.tracks(withMediaType: .video).first {
            let size = track.naturalSize.applying(track.preferredTransform)
            width = Int(abs(size.width.rounded()))
            height = Int(abs(size.height.rounded()))
        }

        let bitrateMbps: Double
        if durationSeconds > 0.05, sizeBytes > 0 {
            bitrateMbps = (Double(sizeBytes) * 8.0) / durationSeconds / 1_000_000.0
        } else {
            bitrateMbps = 0
        }

        return Probe(
            durationSeconds: durationSeconds.isFinite ? durationSeconds : 0,
            width: width,
            height: height,
            sizeBytes: sizeBytes,
            estimatedBitrateMbps: bitrateMbps
        )
    }

    /// Single 1080p export when the source is over the 30 MB ceiling (or over max duration).
    /// Otherwise returns the original file URL unchanged.
    static func compressIfNeeded(
        sourceURL: URL,
        probe: Probe,
        onLog: (String) -> Void
    ) throws -> (url: URL, compressed: Bool, compressMs: Int) {
        let needsCompress =
            probe.sizeBytes > targetMaxBytes
            || probe.durationSeconds > maxDurationSeconds + 0.25
            || max(probe.width, probe.height) > Int(maxLongSidePx) + 2

        guard needsCompress else {
            onLog("[NATIVE-UPLOAD] compress skipped — already within limits")
            return (sourceURL, false, 0)
        }

        let started = CFAbsoluteTimeGetCurrent()
        onLog("[NATIVE-UPLOAD] compress start | sourceBytes=\(probe.sizeBytes) | \(probe.width)x\(probe.height) | \(String(format: "%.2f", probe.durationSeconds))s")

        let asset = AVURLAsset(url: sourceURL)
        let preset = AVAssetExportPreset1920x1080
        guard let session = AVAssetExportSession(asset: asset, presetName: preset) else {
            throw UploaderError.exportFailed("AVAssetExportSession unavailable")
        }

        let outURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("spotdrop-export-\(UUID().uuidString).mp4")
        try? FileManager.default.removeItem(at: outURL)

        session.outputURL = outURL
        session.outputFileType = .mp4
        session.shouldOptimizeForNetworkUse = true

        // Cap at 15s from the start of the clip.
        let end = min(probe.durationSeconds, maxDurationSeconds)
        session.timeRange = CMTimeRange(
            start: .zero,
            duration: CMTime(seconds: max(end, 0.1), preferredTimescale: 600)
        )

        let semaphore = DispatchSemaphore(value: 0)
        var exportError: String?

        session.exportAsynchronously {
            if session.status != .completed {
                exportError = session.error?.localizedDescription ?? "status=\(session.status.rawValue)"
            }
            semaphore.signal()
        }

        semaphore.wait()

        let compressMs = Int(((CFAbsoluteTimeGetCurrent() - started) * 1000).rounded())

        if let exportError {
            throw UploaderError.exportFailed(exportError)
        }

        let finalAttrs = try FileManager.default.attributesOfItem(atPath: outURL.path)
        let finalBytes = (finalAttrs[.size] as? NSNumber)?.int64Value ?? 0
        onLog("[NATIVE-UPLOAD] compress done | ms=\(compressMs) | finalBytes=\(finalBytes)")

        return (outURL, true, compressMs)
    }

    static func extractCoverJPEG(from sourceURL: URL) throws -> Data {
        let asset = AVURLAsset(url: sourceURL)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 1080, height: 1920)

        let time = CMTime(seconds: min(1.0, max(CMTimeGetSeconds(asset.duration) * 0.1, 0)), preferredTimescale: 600)
        let cgImage = try generator.copyCGImage(at: time, actualTime: nil)
        let image = UIImage(cgImage: cgImage)

        guard let data = image.jpegData(compressionQuality: 0.85) else {
            throw UploaderError.coverFailed
        }

        return data
    }

    static func uploadFile(
        fileURL: URL,
        supabaseUrl: String,
        bucket: String,
        objectPath: String,
        accessToken: String,
        apikey: String,
        contentType: String,
        onProgress: ((Double) -> Void)?
    ) throws -> (httpStatus: Int, uploadMs: Int, serverWaitMs: Int, responseBody: String) {
        let base = supabaseUrl.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let encodedPath = objectPath
            .split(separator: "/")
            .map { String($0).addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? String($0) }
            .joined(separator: "/")
        guard let url = URL(string: "\(base)/storage/v1/object/\(bucket)/\(encodedPath)") else {
            throw UploaderError.uploadFailed(status: 0, body: "Invalid upload URL")
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(apikey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        request.setValue("false", forHTTPHeaderField: "x-upsert")
        request.setValue("3600", forHTTPHeaderField: "cacheControl")
        request.timeoutInterval = 300

        let started = CFAbsoluteTimeGetCurrent()
        let semaphore = DispatchSemaphore(value: 0)
        var statusCode = 0
        var responseBody = ""
        var transportError: String?
        var lastProgressAt = started

        let delegate = NativeUploadProgressDelegate { sent, total in
            lastProgressAt = CFAbsoluteTimeGetCurrent()
            if total > 0 {
                onProgress?(min(0.99, Double(sent) / Double(total)))
            }
        }

        let session = URLSession(configuration: .default, delegate: delegate, delegateQueue: nil)
        let task = session.uploadTask(with: request, fromFile: fileURL) { data, response, error in
            if let error {
                transportError = error.localizedDescription
            }
            if let http = response as? HTTPURLResponse {
                statusCode = http.statusCode
            }
            if let data, let text = String(data: data, encoding: .utf8) {
                responseBody = text
            }
            semaphore.signal()
        }
        task.resume()
        semaphore.wait()
        session.finishTasksAndInvalidate()

        let finishedAt = CFAbsoluteTimeGetCurrent()
        let elapsedMs = Int(((finishedAt - started) * 1000).rounded())
        let serverWaitMs = Int(max(0, (finishedAt - lastProgressAt) * 1000).rounded())
        let uploadMs = max(elapsedMs - serverWaitMs, 0)

        if let transportError {
            throw UploaderError.uploadFailed(status: statusCode, body: transportError)
        }

        if statusCode < 200 || statusCode >= 300 {
            throw UploaderError.uploadFailed(status: statusCode, body: String(responseBody.prefix(500)))
        }

        onProgress?(1)
        return (statusCode, uploadMs, serverWaitMs, responseBody)
    }

    static func uploadBytes(
        data: Data,
        supabaseUrl: String,
        bucket: String,
        objectPath: String,
        accessToken: String,
        apikey: String,
        contentType: String
    ) throws -> Int {
        let base = supabaseUrl.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let encodedPath = objectPath
            .split(separator: "/")
            .map { String($0).addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? String($0) }
            .joined(separator: "/")
        guard let url = URL(string: "\(base)/storage/v1/object/\(bucket)/\(encodedPath)") else {
            throw UploaderError.uploadFailed(status: 0, body: "Invalid cover upload URL")
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(apikey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        request.setValue("false", forHTTPHeaderField: "x-upsert")
        request.setValue("3600", forHTTPHeaderField: "cacheControl")

        let semaphore = DispatchSemaphore(value: 0)
        var statusCode = 0
        var responseBody = ""
        var transportError: String?

        let task = URLSession.shared.uploadTask(with: request, from: data) { data, response, error in
            if let error { transportError = error.localizedDescription }
            if let http = response as? HTTPURLResponse { statusCode = http.statusCode }
            if let data, let text = String(data: data, encoding: .utf8) { responseBody = text }
            semaphore.signal()
        }
        task.resume()
        semaphore.wait()

        if let transportError {
            throw UploaderError.uploadFailed(status: statusCode, body: transportError)
        }
        if statusCode < 200 || statusCode >= 300 {
            throw UploaderError.uploadFailed(status: statusCode, body: String(responseBody.prefix(500)))
        }
        return statusCode
    }

    /// Full pipeline: probe → compress once if needed → cover → stream upload from disk.
    static func prepareAndUpload(
        path: String,
        supabaseUrl: String,
        bucket: String,
        objectPath: String,
        coverObjectPath: String?,
        accessToken: String,
        apikey: String,
        onProgress: ((Double) -> Void)?,
        onLog: (String) -> Void
    ) throws -> UploadResult {
        let totalStarted = CFAbsoluteTimeGetCurrent()
        var timing = TimingMs()

        guard path.hasPrefix(NSHomeDirectory()) else {
            throw UploaderError.invalidPath
        }

        let sourceURL = URL(fileURLWithPath: path)
        guard FileManager.default.fileExists(atPath: sourceURL.path) else {
            throw UploaderError.missingFile
        }

        let probeStarted = CFAbsoluteTimeGetCurrent()
        let originalProbe = try probe(fileURL: sourceURL)
        timing.probeMs = Int(((CFAbsoluteTimeGetCurrent() - probeStarted) * 1000).rounded())

        onLog("[NATIVE-UPLOAD] probe | originalBytes=\(originalProbe.sizeBytes) | \(originalProbe.width)x\(originalProbe.height) | duration=\(String(format: "%.2f", originalProbe.durationSeconds))s | bitrateMbps=\(String(format: "%.2f", originalProbe.estimatedBitrateMbps)) | probeMs=\(timing.probeMs)")

        let compressResult = try compressIfNeeded(sourceURL: sourceURL, probe: originalProbe, onLog: onLog)
        timing.compressMs = compressResult.compressMs
        let uploadURL = compressResult.url
        let uploadProbe = try probe(fileURL: uploadURL)

        onLog("[NATIVE-UPLOAD] final file ready | finalBytes=\(uploadProbe.sizeBytes) | \(uploadProbe.width)x\(uploadProbe.height) | duration=\(String(format: "%.2f", uploadProbe.durationSeconds))s | bitrateMbps=\(String(format: "%.2f", uploadProbe.estimatedBitrateMbps)) | compressed=\(compressResult.compressed)")

        var coverPath: String?
        if let coverObjectPath {
            let coverStarted = CFAbsoluteTimeGetCurrent()
            let coverData = try extractCoverJPEG(from: uploadURL)
            timing.coverMs = Int(((CFAbsoluteTimeGetCurrent() - coverStarted) * 1000).rounded())
            onLog("[NATIVE-UPLOAD] cover extracted | bytes=\(coverData.count) | coverMs=\(timing.coverMs)")
            _ = try uploadBytes(
                data: coverData,
                supabaseUrl: supabaseUrl,
                bucket: bucket,
                objectPath: coverObjectPath,
                accessToken: accessToken,
                apikey: apikey,
                contentType: "image/jpeg"
            )
            coverPath = coverObjectPath
            onLog("[NATIVE-UPLOAD] cover uploaded | path=\(coverObjectPath)")
        }

        onLog("[NATIVE-UPLOAD] upload start | path=\(objectPath) | bytes=\(uploadProbe.sizeBytes)")
        let contentType = uploadURL.pathExtension.lowercased() == "mp4" ? "video/mp4" : "video/quicktime"
        let uploadOutcome = try uploadFile(
            fileURL: uploadURL,
            supabaseUrl: supabaseUrl,
            bucket: bucket,
            objectPath: objectPath,
            accessToken: accessToken,
            apikey: apikey,
            contentType: contentType,
            onProgress: onProgress
        )
        timing.uploadMs = uploadOutcome.uploadMs
        timing.serverWaitMs = uploadOutcome.serverWaitMs

        if compressResult.compressed, compressResult.url != sourceURL {
            try? FileManager.default.removeItem(at: compressResult.url)
        }

        timing.totalMs = Int(((CFAbsoluteTimeGetCurrent() - totalStarted) * 1000).rounded())
        let uploadSeconds = max(Double(timing.uploadMs) / 1000.0, 0.001)
        let speedMbps = (Double(uploadProbe.sizeBytes) * 8.0) / uploadSeconds / 1_000_000.0

        onLog("[NATIVE-UPLOAD] upload complete | http=\(uploadOutcome.httpStatus) | uploadMs=\(timing.uploadMs) | serverWaitMs=\(timing.serverWaitMs) | speedMbps=\(String(format: "%.2f", speedMbps)) | totalMs=\(timing.totalMs)")

        return UploadResult(
            publicObjectPath: objectPath,
            coverObjectPath: coverPath,
            originalSizeBytes: originalProbe.sizeBytes,
            finalSizeBytes: uploadProbe.sizeBytes,
            durationSeconds: uploadProbe.durationSeconds,
            width: uploadProbe.width,
            height: uploadProbe.height,
            bitrateMbps: uploadProbe.estimatedBitrateMbps,
            compressed: compressResult.compressed,
            uploadSpeedMbps: speedMbps,
            httpStatus: uploadOutcome.httpStatus,
            timing: timing
        )
    }

}

private final class NativeUploadProgressDelegate: NSObject, URLSessionTaskDelegate {
    let onProgress: (Int64, Int64) -> Void

    init(onProgress: @escaping (Int64, Int64) -> Void) {
        self.onProgress = onProgress
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didSendBodyData bytesSent: Int64,
        totalBytesSent: Int64,
        totalBytesExpectedToSend: Int64
    ) {
        onProgress(totalBytesSent, totalBytesExpectedToSend)
    }
}
