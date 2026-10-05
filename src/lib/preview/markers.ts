import { sectionMarker } from '@commitpress/sdk-node/preview';

/** Mark an existing layout element without the SDK wrapper's display: contents. */
export function sectionAttributes(path: string, label?: string) {
  const { style, ...attributes } = sectionMarker(path, label);
  return attributes;
}
