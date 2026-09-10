/** Measure offscreen so resizing never temporarily collapses the live editor. */
export function sizeNoteEditor(editor: HTMLTextAreaElement): void {
  const measure = editor.cloneNode(false) as HTMLTextAreaElement;
  measure.removeAttribute("id");
  measure.removeAttribute("name");
  measure.setAttribute("aria-hidden", "true");
  measure.tabIndex = -1;
  measure.value = editor.value;
  const computed = getComputedStyle(editor);
  measure.style.cssText = computed.cssText;
  for (const property of Array.from(computed)) {
    measure.style.setProperty(property, computed.getPropertyValue(property));
  }
  Object.assign(measure.style, {
    position: "fixed", left: "-100000px", top: "0", visibility: "hidden",
    width: `${editor.getBoundingClientRect().width}px`, height: "0", minHeight: "0",
    maxHeight: "none", fieldSizing: "fixed", pointerEvents: "none",
  });
  document.body.appendChild(measure);
  const border = parseFloat(computed.borderTopWidth) + parseFloat(computed.borderBottomWidth);
  const height = measure.scrollHeight + border;
  measure.remove();
  editor.style.height = `${Math.ceil(height)}px`;
  editor.scrollTop = 0;
}
