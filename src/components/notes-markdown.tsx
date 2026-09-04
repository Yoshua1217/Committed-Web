"use client";

import React from "react";

function parseInline(text: string, keyPrefix: string): React.ReactNode[] {
  const matcher = /(\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|~~[^~]+~~|`[^`]+`|<u>.*?<\/u>|\*[^*]+\*)/g;
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = matcher.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${index++}`;
    if (token.startsWith("[[")) {
      nodes.push(<span className="notes-preview-wikilink" key={key}>{token.slice(2, -2)}</span>);
    } else if (token.startsWith("[")) {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      nodes.push(link ? <a key={key} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a> : token);
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("~~")) {
      nodes.push(<s key={key}>{token.slice(2, -2)}</s>);
    } else if (token.startsWith("`")) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("<u>")) {
      nodes.push(<u key={key}>{token.slice(3, -4)}</u>);
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    cursor = match.index + token.length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

export default function NotesMarkdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let inCode = false;
  let codeLines: string[] = [];
  let codeStart = 0;

  const flushCode = () => {
    if (!codeLines.length && !inCode) return;
    elements.push(<pre key={`code-${codeStart}`}><code>{codeLines.join("\n")}</code></pre>);
    codeLines = [];
  };

  lines.forEach((line, index) => {
    if (line.trim().startsWith("```")) {
      if (inCode) flushCode();
      else codeStart = index;
      inCode = !inCode;
      return;
    }
    if (inCode) {
      codeLines.push(line);
      return;
    }
    if (/^---+$/.test(line.trim())) {
      elements.push(<hr key={index} />);
      return;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const children = parseInline(heading[2], `heading-${index}`);
      elements.push(level === 1
        ? <h1 key={index}>{children}</h1>
        : level === 2
          ? <h2 key={index}>{children}</h2>
          : level === 3
            ? <h3 key={index}>{children}</h3>
            : <h4 key={index}>{children}</h4>);
      return;
    }
    const checkbox = line.match(/^\s*-?\s*\[([ xX])\]\s+(.+)$/);
    if (checkbox) {
      const checked = checkbox[1].toLowerCase() === "x";
      elements.push(<div className="notes-preview-check" key={index}><span aria-hidden="true">{checked ? "✓" : ""}</span><span className={checked ? "is-checked" : ""}>{parseInline(checkbox[2], `check-${index}`)}</span></div>);
      return;
    }
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) {
      elements.push(<div className="notes-preview-list" key={index}><span className="notes-preview-bullet" aria-hidden="true" /><span>{parseInline(bullet[1], `bullet-${index}`)}</span></div>);
      return;
    }
    const numbered = line.match(/^\s*(\d+)\.\s+(.+)$/);
    if (numbered) {
      elements.push(<div className="notes-preview-list" key={index}><span>{numbered[1]}.</span><span>{parseInline(numbered[2], `number-${index}`)}</span></div>);
      return;
    }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      elements.push(<blockquote key={index}>{parseInline(quote[1], `quote-${index}`)}</blockquote>);
      return;
    }
    elements.push(line ? <p key={index}>{parseInline(line, `line-${index}`)}</p> : <div className="notes-preview-space" key={index} />);
  });

  if (inCode) flushCode();
  return <div className="notes-markdown-preview">{elements}</div>;
}
