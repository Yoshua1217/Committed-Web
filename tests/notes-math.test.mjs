import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import ts from "typescript";
import katex from "katex";

const js = ts.transpileModule(fs.readFileSync(new URL("../src/lib/notes-math.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
new Function("module", "exports", js)(mod, mod.exports);
const { formatNoteMath } = mod.exports;

test("plain-language fractions preserve word spaces in rendered math", () => {
  const expression = formatNoteMath(String.raw`\frac{- Change in what you give up}{Change in what you want}`);
  assert.equal(expression, String.raw`\frac{\text{- Change in what you give up}}{\text{Change in what you want}}`);
  const html = katex.renderToString(`\\displaystyle ${expression}`, { throwOnError: true });
  assert.match(html, /<mtext>.*Change.*in.*what.*you.*give.*up<\/mtext>/);
});

test("algebra, explicit text, and malformed fractions remain unchanged", () => {
  for (const expression of [String.raw`\frac{x + y}{2}`, String.raw`\frac{x y}{a b}`, String.raw`\frac{\text{already spaced}}{\alpha + 1}`, String.raw`\frac{unfinished`, String.raw`\frac{a}`]) {
    assert.equal(formatNoteMath(expression), expression);
  }
});

test("nested fractions and multiple fractions preserve phrases", () => {
  assert.equal(formatNoteMath(String.raw`\frac{\frac{goods given up}{goods gained}}{total output} + \dfrac{total cost}{total units}`), String.raw`\frac{\frac{\text{goods given up}}{\text{goods gained}}}{\text{total output}} + \dfrac{\text{total cost}}{\text{total units}}`);
});
