/** Stored and pasted HTML is restricted to formatting; never trust document markup. */
export function cleanCanvasHtml(value: string): string {
  const doc = new DOMParser().parseFromString(value, "text/html");
  const allowed = new Set(["P", "DIV", "BR", "B", "STRONG", "I", "EM", "U", "S", "UL", "OL", "LI", "H1", "H2", "H3", "MARK", "A", "SPAN"]);
  const clean = (parent: Element) => {
    for (const child of Array.from(parent.children)) {
      if (["SCRIPT", "STYLE", "IFRAME", "OBJECT", "SVG", "MATH"].includes(child.tagName)) { child.remove(); continue; }
      clean(child);
      if (!allowed.has(child.tagName)) { child.replaceWith(...child.childNodes); continue; }
      const href = child.getAttribute("href"), checked = child.getAttribute("data-canvas-check"), style = (child as HTMLElement).style;
      const color = style.color, background = style.backgroundColor;
      for (const attribute of Array.from(child.attributes)) child.removeAttribute(attribute.name);
      if (child.tagName === "SPAN" && checked !== null) { child.setAttribute("data-canvas-check", checked === "true" ? "true" : "false"); child.setAttribute("role", "checkbox"); child.setAttribute("aria-checked", checked === "true" ? "true" : "false"); child.setAttribute("tabindex", "0"); child.setAttribute("contenteditable", "false"); child.textContent = checked === "true" ? "☑" : "☐"; }
      if (child.tagName === "A" && href && /^(https?:\/\/|mailto:)/i.test(href)) { child.setAttribute("href", href); child.setAttribute("target", "_blank"); child.setAttribute("rel", "noopener noreferrer"); }
      if (color && !/url|var\(/i.test(color)) (child as HTMLElement).style.color = color;
      if (background && !/url|var\(/i.test(background)) (child as HTMLElement).style.backgroundColor = background;
    }
  };
  clean(doc.body);
  return doc.body.innerHTML;
}
export function canvasPlainText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("br").forEach(n => n.replaceWith("\n"));
  doc.querySelectorAll("p,div,li,h1,h2,h3").forEach(n => n.append("\n"));
  return doc.body.textContent?.trim() ?? "";
}
export function textHtml(text: string): string { return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>"); }
export function toggleCanvasCheck(html: string, index: number): string {
  const doc = new DOMParser().parseFromString(html, "text/html"), check = doc.querySelectorAll("[data-canvas-check]")[index];
  if (check) check.setAttribute("data-canvas-check", check.getAttribute("data-canvas-check") === "true" ? "false" : "true");
  return cleanCanvasHtml(doc.body.innerHTML);
}
/** Measure at document scale so text growth is independent of camera zoom. */
export function canvasTextHeight(html: string, width: number, fontSize: number, padding: string): number {
  const measure = document.createElement("div"); measure.className = "canvas-object-text";
  Object.assign(measure.style, { position: "fixed", inset: "auto", left: "0", top: "0", visibility: "hidden", pointerEvents: "none", boxSizing: "border-box", width: `${width}px`, height: "auto", display: "block", padding, fontSize: `${fontSize}px`, fontFamily: "system-ui", lineHeight: "1.5" });
  measure.innerHTML = cleanCanvasHtml(html); document.body.appendChild(measure);
  const height = Math.ceil(measure.getBoundingClientRect().height); measure.remove(); return height;
}
