/**
 * Maximum media items in a single new Spot: one photo OR one video, no
 * carousel. This only caps *creation* (upload validation + the Share screen's
 * editor state) — existing published multi-photo Spots are unaffected and
 * still render their full carousel when viewed.
 */
export const SPOT_MAX_PHOTOS = 1;
