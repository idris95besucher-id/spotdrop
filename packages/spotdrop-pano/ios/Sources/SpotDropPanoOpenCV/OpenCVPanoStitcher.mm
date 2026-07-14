#import "OpenCVPanoStitcher.h"

// OpenCV headers redefine Objective-C YES/NO — isolate carefully.
#ifdef NO
#undef NO
#endif
#ifdef YES
#undef YES
#endif

#ifdef __cplusplus
#import <opencv2/opencv.hpp>
#import <opencv2/stitching.hpp>
#import <opencv2/imgcodecs.hpp>
#import <opencv2/imgproc.hpp>
#endif

#ifndef NO
#define NO ((BOOL)0)
#endif
#ifndef YES
#define YES ((BOOL)1)
#endif

@implementation OpenCVPanoStitcher

+ (NSString *)openCVVersion {
#ifdef __cplusplus
    return [NSString stringWithUTF8String:cv::getVersionString().c_str()];
#else
    return @"unknown";
#endif
}

+ (NSDictionary *)stitchImagePaths:(NSArray<NSString *> *)imagePaths
                        outputPath:(NSString *)outputPath {
#ifdef __cplusplus
    try {
        if (imagePaths.count < 2) {
            return @{ @"error": @"Continue moving to the right." };
        }

        std::vector<cv::Mat> images;
        images.reserve((size_t)imagePaths.count);

        for (NSString *path in imagePaths) {
            cv::Mat img = cv::imread(path.UTF8String, cv::IMREAD_COLOR);
            if (img.empty()) {
                return @{ @"error": @"Unable to read panorama frames." };
            }
            // Bound memory: keep short side ≤ 1200 for stitcher input.
            const int maxShort = 1200;
            int shortSide = std::min(img.cols, img.rows);
            if (shortSide > maxShort) {
                double scale = (double)maxShort / (double)shortSide;
                cv::Mat resized;
                cv::resize(img, resized, cv::Size(), scale, scale, cv::INTER_AREA);
                img = resized;
            }
            images.push_back(img);
        }

        cv::Ptr<cv::Stitcher> stitcher = cv::Stitcher::create(cv::Stitcher::PANORAMA);

        // Cylindrical projection — closest to phone panorama geometry.
        stitcher->setWarper(cv::makePtr<cv::CylindricalWarper>());

        // Feature matching with confidence threshold (rejects weak matches).
        stitcher->setFeaturesMatcher(cv::makePtr<cv::detail::BestOf2NearestMatcher>(false, 0.35f));

        // Exposure / white-balance style gain compensation across overlaps.
        stitcher->setExposureCompensator(cv::makePtr<cv::detail::BlocksGainCompensator>());

        // Graph-cut seams reduce ghosting / duplicated objects in overlaps.
        stitcher->setSeamFinder(
            cv::makePtr<cv::detail::GraphCutSeamFinder>(cv::detail::GraphCutSeamFinderBase::COST_COLOR));

        // Multi-band blending for smooth frequency-aware seams.
        stitcher->setBlender(cv::makePtr<cv::detail::MultiBandBlender>(false, 5));

        // Bundle adjustment + horizontal wave correction → straighter horizon / verticals.
        stitcher->setBundleAdjuster(cv::makePtr<cv::detail::BundleAdjusterRay>());
        stitcher->setWaveCorrection(true);
        stitcher->setWaveCorrectKind(cv::detail::WAVE_CORRECT_HORIZ);

        // Slightly coarser registration for speed/memory; fine compositing.
        stitcher->setRegistrationResol(0.4);
        stitcher->setSeamEstimationResol(0.08);
        stitcher->setCompositingResol(cv::Stitcher::ORIG_RESOL);
        stitcher->setPanoConfidenceThresh(0.6);

        cv::Mat pano;
        cv::Stitcher::Status status = stitcher->stitch(images, pano);

        if (status != cv::Stitcher::OK || pano.empty()) {
            NSString *message = @"Panorama could not be created. Please try again.";
            switch (status) {
                case cv::Stitcher::ERR_NEED_MORE_IMGS:
                    message = @"Continue moving to the right.";
                    break;
                case cv::Stitcher::ERR_HOMOGRAPHY_EST_FAIL:
                case cv::Stitcher::ERR_CAMERA_PARAMS_ADJUST_FAIL:
                    message = @"Move more slowly and keep the phone level.";
                    break;
                default:
                    break;
            }
            return @{ @"error": message };
        }

        // Crop near-black empty borders via content mask.
        cv::Mat gray;
        cv::cvtColor(pano, gray, cv::COLOR_BGR2GRAY);
        cv::Mat mask;
        cv::threshold(gray, mask, 4, 255, cv::THRESH_BINARY);
        std::vector<cv::Point> nonzero;
        cv::findNonZero(mask, nonzero);
        if (!nonzero.empty()) {
            int minX = pano.cols, maxX = 0, minY = pano.rows, maxY = 0;
            for (const auto &p : nonzero) {
                minX = std::min(minX, p.x);
                maxX = std::max(maxX, p.x);
                minY = std::min(minY, p.y);
                maxY = std::max(maxY, p.y);
            }
            const int inset = 2;
            minX = std::min(std::max(0, minX + inset), pano.cols - 1);
            minY = std::min(std::max(0, minY + inset), pano.rows - 1);
            maxX = std::max(minX + 1, std::min(pano.cols - 1, maxX - inset));
            maxY = std::max(minY + 1, std::min(pano.rows - 1, maxY - inset));
            cv::Rect bounds(minX, minY, maxX - minX + 1, maxY - minY + 1);
            if (bounds.width > 32 && bounds.height > 32) {
                pano = pano(bounds).clone();
            }
        }

        // Cap extreme widths for memory safety on older phones.
        const int maxWidth = 8192;
        if (pano.cols > maxWidth) {
            double scale = (double)maxWidth / (double)pano.cols;
            cv::Mat resized;
            cv::resize(pano, resized, cv::Size(), scale, scale, cv::INTER_AREA);
            pano = resized;
        }

        std::vector<int> params = {cv::IMWRITE_JPEG_QUALITY, 92};
        if (!cv::imwrite(outputPath.UTF8String, pano, params)) {
            return @{ @"error": @"Unable to save panorama image." };
        }

        return @{
            @"path": outputPath,
            @"width": @(pano.cols),
            @"height": @(pano.rows)
        };
    } catch (const cv::Exception &e) {
        (void)e;
        return @{ @"error": @"Panorama could not be created. Please try again." };
    } catch (...) {
        return @{ @"error": @"Panorama could not be created. Please try again." };
    }
#else
    return @{ @"error": @"OpenCV is unavailable." };
#endif
}

@end
