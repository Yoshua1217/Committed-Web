export type TableAlignment = "left" | "center" | "right";
export interface NoteTable {
  rows: string[][];
  alignments: TableAlignment[];
}
export interface MarkdownTable extends NoteTable {
  startLine: number;
  endLine: number;
  start: number;
  end: number;
}

// Keep escaped pipes inside cells, including pipes in formulas and code.
function splitRow(line: string): string[] | null {
  const value = line.trim();
  const cells: string[] = [];
  let cell = "";
  let escaped = false;
  for (const character of value) {
    if (character === "|" && !escaped) {
      cells.push(cell.trim());
      cell = "";
    } else cell += character;
    escaped = character === "\\" && !escaped;
  }
  cells.push(cell.trim());
  if (cells.length < 2) return null;
  if (value.startsWith("|")) cells.shift();
  if (cells.at(-1) === "" && value.endsWith("|")) cells.pop();
  return cells.length ? cells : null;
}

export function collectMarkdownTables(content: string): MarkdownTable[] {
  const lines = content.split("\n");
  const offsets: number[] = [];
  let offset = 0;
  for (const line of lines) { offsets.push(offset); offset += line.length + 1; }
  const tables: MarkdownTable[] = [];
  let fence: string | null = null;
  for (let index = 0; index < lines.length; index++) {
    const marker = lines[index].trim().match(/^(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    const header = splitRow(lines[index]);
    const separator = splitRow(lines[index + 1] ?? "");
    if (!header || !separator || header.length !== separator.length || !separator.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    const rows = [header];
    let endLine = index + 2;
    while (endLine < lines.length) {
      const row = splitRow(lines[endLine]);
      // Leave malformed rows as source instead of silently dropping cells.
      if (!row || row.length !== header.length) break;
      rows.push(row);
      endLine++;
    }
    tables.push({ rows, alignments: separator.map((cell) => cell.endsWith(":") ? cell.startsWith(":") ? "center" : "right" : "left"), startLine: index, endLine, start: offsets[index], end: offsets[endLine - 1] + lines[endLine - 1].length });
    index = endLine - 1;
  }
  return tables;
}

export function serializeTable(table: NoteTable): string {
  const row = (cells: string[]) => `| ${cells.join(" | ")} |`;
  return [row(table.rows[0]), row(table.alignments.map((alignment) => alignment === "center" ? ":---:" : alignment === "right" ? "---:" : "---")), ...table.rows.slice(1).map(row)].join("\n");
}

export function createTable(rows: number, columns: number): NoteTable {
  if (!Number.isInteger(rows) || !Number.isInteger(columns) || rows < 1 || rows > 50 || columns < 1 || columns > 20) throw new RangeError("Choose 1–50 rows and 1–20 columns.");
  return { rows: Array.from({ length: rows }, () => Array<string>(columns).fill("")), alignments: Array<TableAlignment>(columns).fill("left") };
}

export function encodeTableCell(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

export function decodeTableCell(value: string): string {
  return value.replace(/<br\s*\/?>/gi, "\n").replace(/\\([\\|])/g, "$1");
}

export type TableAction = "row-before" | "row-after" | "column-before" | "column-after" | "remove-row" | "remove-column";
export function changeTable(table: NoteTable, action: TableAction, row: number, column: number): NoteTable {
  const next = { rows: table.rows.map((cells) => [...cells]), alignments: [...table.alignments] };
  row = Math.max(0, Math.min(row, next.rows.length - 1));
  column = Math.max(0, Math.min(column, next.alignments.length - 1));
  if (action === "row-before" || action === "row-after") next.rows.splice(row + Number(action === "row-after"), 0, Array<string>(next.alignments.length).fill(""));
  if (action === "remove-row" && next.rows.length > 1) next.rows.splice(row, 1);
  if (action === "column-before" || action === "column-after") {
    const index = column + Number(action === "column-after");
    next.rows.forEach((cells) => cells.splice(index, 0, ""));
    next.alignments.splice(index, 0, "left");
  }
  if (action === "remove-column" && next.alignments.length > 1) {
    next.rows.forEach((cells) => cells.splice(column, 1));
    next.alignments.splice(column, 1);
  }
  return next;
}

export function tableInsertion(content: string, start: number, end: number, table: NoteTable) {
  const before = content.slice(0, start);
  // Insert below the current line, retaining any text after the command.
  const lineEnd = content.indexOf("\n", end);
  const suffixEnd = lineEnd < 0 ? content.length : lineEnd;
  const prefix = before + content.slice(end, suffixEnd);
  const separator = prefix.length ? prefix.endsWith("\n\n") ? "" : prefix.endsWith("\n") ? "\n" : "\n\n" : "";
  const tableStart = prefix.length + separator.length;
  const markdown = serializeTable(table);
  return { content: prefix + separator + markdown + "\n\n" + content.slice(Math.min(content.length, suffixEnd + 1)), tableStart };
}
