/** CMS image descriptors passed to page and preview components. */
export type ImageVariant = {
  name: string;
  path: string;
  width: number;
  height: number;
  bytes: number;
  custom?: boolean;
};

export type ImageAsset = {
  id: string;
  filename: string;
  path: string;
  source_type: string;
  width: number;
  height: number;
  bytes: number;
  uploaded_at: number;
  updated_at?: number;
  alt: string;
  variants: ImageVariant[];
};

/** The assets referenced by a page, indexed by their CMS id. */
export type ImageManifest = Record<string, ImageAsset>;
