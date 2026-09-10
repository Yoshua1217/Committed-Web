import { Capacitor, registerPlugin } from "@capacitor/core";
import type { InkObject } from "./ink-model";
const recognition = registerPlugin<{ recognize: (options: { language: string; strokes: { x: number; y: number; t: number }[][] }) => Promise<{ candidates: string[] }> }>("HandwritingRecognition");
export const canRecognizeHandwriting = () => Capacitor.getPlatform() === "android" && Capacitor.isPluginAvailable("HandwritingRecognition");
export async function recognizeHandwriting(objects: InkObject[], language = "en-US") {
  if (!canRecognizeHandwriting()) throw new Error("Automatic handwriting conversion is available in the Android app. You can add a reviewed transcription here.");
  const strokes = objects.filter(o => o.kind === "stroke" && o.style !== "highlighter").sort((a, b) => a.order - b.order).map(o => { const first = o.points[0]?.t ?? 0; return o.points.map(p => ({ x: p.x, y: p.y, t: Math.round(o.order + p.t - first) })); });
  if (!strokes.length) throw new Error("Select pen strokes to recognize.");
  const result = await recognition.recognize({ language, strokes });
  return result.candidates;
}
