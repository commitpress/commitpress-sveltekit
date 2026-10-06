import type { PreviewAssetMap } from '@commitpress/sdk-node/preview';
import type { SiteContent } from '../../commitpress.generated';

/** Shared with the root layout so global previews update the header and footer. */
export const previewSite = $state({
  content: null as SiteContent | null,
  assets: {} as PreviewAssetMap,
});

export function setPreviewSite(content: SiteContent) {
  // Empty groups may be omitted by the editor after their last row is removed.
  previewSite.content = {
    ...content,
    details: content.details ?? {} as SiteContent['details'],
    nav: content.nav ?? [],
    mobile_nav: content.mobile_nav ?? [],
  };
}

export function clearPreviewSite() {
  previewSite.content = null;
  previewSite.assets = {};
}
