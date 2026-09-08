import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import ts from "typescript";

const js = ts.transpileModule(fs.readFileSync(new URL("../src/lib/notes-tables.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
new Function("module", "exports", js)(mod, mod.exports);
const { collectMarkdownTables, createTable, serializeTable, changeTable, encodeTableCell, decodeTableCell, tableInsertion } = mod.exports;

test("chosen dimensions survive Markdown save/reload, including a single cell", () => {
  for (const [rows, columns] of [[1, 1], [3, 4], [50, 20]]) {
    const table = createTable(rows, columns);
    const [saved] = collectMarkdownTables(serializeTable(table));
    assert.deepEqual(saved.rows, table.rows);
    assert.equal(saved.rows.length, rows);
    assert.equal(saved.alignments.length, columns);
  }
  for (const sizes of [[0, 3], [3, 0], [1.5, 3], [51, 2], [3, 21], [NaN, 2]]) assert.throws(() => createTable(...sizes), RangeError);
});

test("cell edits preserve pipes, backslashes, newlines, and Markdown formatting", () => {
  const table = createTable(2, 2);
  const value = "**bold** | C:\\notes\\\n$\\frac{1}{2}$ |";
  table.rows[1][0] = encodeTableCell(value);
  const [saved] = collectMarkdownTables(serializeTable(table));
  assert.equal(decodeTableCell(saved.rows[1][0]), value);
  assert.equal(saved.rows[1].length, 2);
});

test("recognizes imported alignment and leaves code blocks and malformed rows alone", () => {
  const markdown = "| A | B |\n| :---: | ---: |\n| 1 | 2 |";
  const content = "```md\n" + markdown + "\n```\n~~~\n" + markdown + "\n~~~\n" + markdown + "\n| too | many | cells |\nText";
  const tables = collectMarkdownTables(content);
  assert.equal(tables.length, 1);
  assert.deepEqual(tables[0].alignments, ["center", "right"]);
  assert.equal(content.slice(tables[0].start, tables[0].end), markdown);
  assert.equal(collectMarkdownTables("A | B\n--- | ---\n1 | 2").length, 1);
});

test("row and column actions preserve remaining content and column alignment", () => {
  const table = { rows: [["A", "B"], ["one", "two"], ["three", "four"]], alignments: ["left", "right"] };
  const added = changeTable(table, "column-before", 1, 1);
  assert.deepEqual(added.rows, [["A", "", "B"], ["one", "", "two"], ["three", "", "four"]]);
  assert.deepEqual(added.alignments, ["left", "left", "right"]);
  assert.deepEqual(changeTable(added, "remove-column", 1, 1), table);
  assert.deepEqual(changeTable(changeTable(table, "row-after", 1, 0), "remove-row", 2, 0), table);
  assert.deepEqual(changeTable(table, "remove-row", 0, 0).rows[0], ["one", "two"]);
  assert.deepEqual(changeTable(table, "row-before", 0, 0).rows[0], ["", ""]);
  assert.deepEqual(changeTable(table, "column-after", 0, 1).rows[0], ["A", "B", ""]);
  const single = createTable(1, 1);
  assert.deepEqual(changeTable(single, "remove-row", 0, 0), single);
  assert.deepEqual(changeTable(single, "remove-column", 0, 0), single);
});

test("insertion goes below the command line without losing surrounding prose", () => {
  const content = "Before\nIntroduction /table continued\nAfter";
  const start = content.indexOf("/table");
  const result = tableInsertion(content, start, start + 6, createTable(2, 3));
  assert.ok(result.content.startsWith("Before\nIntroduction  continued\n\n|"));
  assert.ok(result.content.endsWith("\n\nAfter"));
  assert.equal(collectMarkdownTables(result.content)[0].start, result.tableStart);
  const empty = tableInsertion("/table", 0, 6, createTable(1, 1));
  assert.equal(empty.tableStart, 0);
  assert.equal(collectMarkdownTables(empty.content).length, 1);
});

test("editing or deleting one table retains other tables and surrounding text", () => {
  const first = serializeTable(createTable(2, 2));
  const second = serializeTable(createTable(3, 3));
  const content = `Before\n\n${first}\n\nBetween\n\n${second}\n\nAfter`;
  const tables = collectMarkdownTables(content);
  const target = tables[1];
  const replacement = serializeTable(changeTable(target, "row-after", 1, 0));
  const edited = content.slice(0, target.start) + replacement + content.slice(target.end);
  assert.equal(collectMarkdownTables(edited)[1].rows.length, 4);
  assert.equal(edited.slice(0, target.start), content.slice(0, target.start));
  const deleted = content.slice(0, target.start) + content.slice(target.end);
  assert.equal(collectMarkdownTables(deleted).length, 1);
  assert.ok(deleted.endsWith("\n\nAfter"));
});
