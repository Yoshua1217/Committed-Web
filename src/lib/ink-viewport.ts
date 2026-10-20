/** Keep interactive buffers bounded, independent of the CSS zoom transform. */
export function inkRasterSize(paper: { width: number; height: number }, devicePixelRatio: number) {
  const ratio = Math.min(Math.max(1, devicePixelRatio || 1), 2, Math.sqrt(4_000_000 / (paper.width * paper.height)), 4096 / Math.max(paper.width, paper.height));
  return { width: Math.max(1, Math.floor(paper.width * ratio)), height: Math.max(1, Math.floor(paper.height * ratio)) };
}

/** Rasterize only the visible ink, with a screen-space gutter for smooth scrolling. */
export function inkRasterRegion(paper: { width: number; height: number }, scale: number, dpr: number, page: { left: number; top: number }, clip: { left: number; top: number; right: number; bottom: number }) {
  const left = Math.max(0, (clip.left - page.left) / scale), top = Math.max(0, (clip.top - page.top) / scale);
  const right = Math.min(paper.width, (clip.right - page.left) / scale), bottom = Math.min(paper.height, (clip.bottom - page.top) / scale);
  if (right <= left || bottom <= top) return null;
  const gutter = 128 / scale;
  const x = Math.max(0, left - gutter), y = Math.max(0, top - gutter);
  const width = Math.min(paper.width, right + gutter) - x, height = Math.min(paper.height, bottom + gutter) - y;
  const ratio = Math.min(Math.max(1, dpr || 1) * scale, Math.sqrt(4_000_000 / (width * height)), 4096 / Math.max(width, height));
  return { x, y, width, height, pixelWidth: Math.max(1, Math.floor(width * ratio)), pixelHeight: Math.max(1, Math.floor(height * ratio)) };
}

/** Reuse the scroll gutter until visible content approaches its edge. */
export function inkRegionCovers(region: NonNullable<ReturnType<typeof inkRasterRegion>>, paper: { width: number; height: number }, scale: number, page: { left: number; top: number }, clip: { left: number; top: number; right: number; bottom: number }) {
  const left = Math.max(0, (clip.left - page.left) / scale), top = Math.max(0, (clip.top - page.top) / scale);
  const right = Math.min(paper.width, (clip.right - page.left) / scale), bottom = Math.min(paper.height, (clip.bottom - page.top) / scale);
  if (right <= left || bottom <= top) return true;
  const margin = 32 / scale, epsilon = 1e-6;
  return region.x <= Math.max(0, left - margin) + epsilon && region.y <= Math.max(0, top - margin) + epsilon
    && region.x + region.width >= Math.min(paper.width, right + margin) - epsilon
    && region.y + region.height >= Math.min(paper.height, bottom + margin) - epsilon;
}

/** Keep page edges within a small scroll gutter at every zoom level. */
export function fitInkView(paper: { width: number; height: number }, viewport: { width: number; height: number }, mode: "page" | "width") {
  const gutter = Math.min(36, viewport.width / 4, viewport.height / 4);
  const widthScale = (viewport.width - gutter * 2) / paper.width;
  const scale = Math.max(.1, Math.min(6, widthScale, mode === "page" ? (viewport.height - gutter * 2) / paper.height : Infinity));
  return { scale, x: (viewport.width - paper.width * scale) / 2, y: gutter };
}

export function constrainInkView(view: { x: number; y: number; scale: number }, paper: { width: number; height: number }, viewport: { width: number; height: number }) {
  const clampAxis = (offset: number, pageSize: number, viewportSize: number) => {
    if (viewportSize <= 0) return offset;
    const gutter = Math.min(36, viewportSize / 4);
    const oppositeEdge = viewportSize - pageSize * view.scale - gutter;
    return Math.max(Math.min(gutter, oppositeEdge), Math.min(Math.max(gutter, oppositeEdge), offset));
  };
  return { ...view, x: clampAxis(view.x, paper.width, viewport.width), y: clampAxis(view.y, paper.height, viewport.height) };
}
