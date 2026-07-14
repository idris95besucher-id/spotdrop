#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// OpenCV-backed panorama stitcher (cylindrical + wave-correct + multiband).
@interface OpenCVPanoStitcher : NSObject

/// Stitch JPEG/PNG files already on disk into a cylindrical panorama JPEG.
/// Returns @{ path, width, height } on success, or @{ error: NSString } on failure.
+ (NSDictionary *)stitchImagePaths:(NSArray<NSString *> *)imagePaths
                        outputPath:(NSString *)outputPath;

+ (NSString *)openCVVersion;

@end

NS_ASSUME_NONNULL_END
