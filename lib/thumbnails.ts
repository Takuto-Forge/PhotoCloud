export const THUMBNAIL_PREFIX = "__photocloud_thumbnails__/v1/";
export const THUMBNAIL_CACHE_VERSION = "1";

export const THUMBNAIL_VARIANTS = ["gallery", "preview"] as const;

export type ThumbnailVariant = (typeof THUMBNAIL_VARIANTS)[number];

export function isThumbnailVariant(value: string | null): value is ThumbnailVariant {
  return THUMBNAIL_VARIANTS.includes(value as ThumbnailVariant);
}

export function isGeneratedThumbnailKey(key: string) {
  return key.startsWith(THUMBNAIL_PREFIX);
}
