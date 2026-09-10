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
