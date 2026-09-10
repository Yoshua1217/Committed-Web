/** Treat plain-language fraction terms as text so TeX preserves word spaces. */
export function formatNoteMath(expression: string): string {
  function groupAt(start: number): { content: string; end: number } | null {
    if (expression[start] !== "{") return null;
    let depth = 1;
    for (let index = start + 1; index < expression.length; index++) {
      if (expression[index] === "\\") { index++; continue; }
      if (expression[index] === "{") depth++;
      if (expression[index] === "}" && --depth === 0) {
        return { content: expression.slice(start + 1, index), end: index + 1 };
      }
    }
    return null;
  }
  function term(value: string): string {
    // Leave equations, commands, and single-letter algebra in math mode.
    const words = value.match(/\p{L}+/gu) ?? [];
    if (/^[\p{L}\s.,'’\-]+$/u.test(value) && words.filter(word => word.length > 1).length >= 2) {
      return `\\text{${value}}`;
    }
    return formatNoteMath(value);
  }
  const fractions = /\\(?:dfrac|tfrac|frac)\b\s*/g;
  let result = "", cursor = 0;
  for (let match = fractions.exec(expression); match; match = fractions.exec(expression)) {
    const numerator = groupAt(fractions.lastIndex);
    if (!numerator) continue;
    let denominatorStart = numerator.end;
    while (/\s/.test(expression[denominatorStart] ?? "")) denominatorStart++;
    const denominator = groupAt(denominatorStart);
    if (!denominator) continue;
    result += expression.slice(cursor, match.index) + match[0]
      + `{${term(numerator.content)}}{${term(denominator.content)}}`;
    cursor = denominator.end;
    fractions.lastIndex = cursor;
  }
  return result + expression.slice(cursor);
}
