"use client";

import React from "react";
import katex from "katex";
import "katex/contrib/mhchem";

function safeUrl(value: string, image = false) {
  const trimmed = value.trim();
  if (trimmed.startsWith("/")) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return parsed.href;
    if (!image && parsed.protocol === "mailto:") return parsed.href;
  } catch {
    // Invalid and unsupported URLs remain visible as Markdown source.
  }
  return null;
}

function renderMath(token: string, key: string) {
  const expression = token.slice(1, -1);
  try {
    const html = katex.renderToString(expression, {
      displayMode: false,
      throwOnError: true,
      strict: "warn",
      trust: false,
    });
    return <span className="notes-preview-math" key={key} dangerouslySetInnerHTML={{ __html: html }} />;
  } catch {
    return token;
  }
}

function renderSmartArrows(text: string) {
  return text.replace(/<==>|<-->|<=>|<->|==>|-->|<--|=>|->|<-/g, (token) => ({
    "<==>": "⟺",
    "<-->": "⟷",
    "<=>": "⇔",
    "<->": "↔",
    "==>": "⟹",
    "-->": "⟶",
    "<--": "⟵",
    "=>": "⇒",
    "->": "→",
    "<-": "←",
  })[token] ?? token);
}

function headingSlug(source: string) {
  const plain = source
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/<\/?(?:u|sub)>/g, "")
    .replace(/[$*`~]/g, "")
    .trim()
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return plain || "section";
}

export interface MarkdownHeading {
  id: string;
  label: string;
  level: number;
  source: string;
  line: number;
}

export function collectMarkdownHeadings(content: string, instanceId: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  const slugCounts = new Map<string, number>();
  let scanningCode = false;

  content.split("\n").forEach((line, lineIndex) => {
    if (line.trim().startsWith("```")) {
      scanningCode = !scanningCode;
      return;
    }
    if (scanningCode) return;
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (!match) return;
    const baseSlug = headingSlug(match[2]);
    const occurrence = (slugCounts.get(baseSlug) ?? 0) + 1;
    slugCounts.set(baseSlug, occurrence);
    const label = match[2]
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\[\[([^\]]+)\]\]/g, "$1")
      .replace(/<\/?(?:u|sub)>/g, "")
      .replace(/[$*`~]/g, "")
      .trim();
    headings.push({
      id: `${instanceId}-${baseSlug}${occurrence > 1 ? `-${occurrence}` : ""}`,
      label: label || "Untitled section",
      level: match[1].length,
      source: match[2],
      line: lineIndex,
    });
  });
  return headings;
}

function parseInline(text: string, keyPrefix: string): React.ReactNode[] {
  const matcher = /(!\[[^\]]*\]\([^)]+\)|\$[^$\n]+\$|\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|~~[^~]+~~|`[^`]+`|<u>.*?<\/u>|<sub>.*?<\/sub>|\*[^*]+\*)/g;
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = matcher.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(renderSmartArrows(text.slice(cursor, match.index)));
    const token = match[0];
    const key = `${keyPrefix}-${index++}`;
    if (token.startsWith("![")) {
      const image = token.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      const source = image ? safeUrl(image[2], true) : null;
      nodes.push(source
        // eslint-disable-next-line @next/next/no-img-element
        ? <img className="notes-preview-inline-image" key={key} src={source} alt={image?.[1] ?? ""} loading="lazy" />
        : token);
    } else if (token.startsWith("$")) {
      nodes.push(renderMath(token, key));
    } else if (token.startsWith("[[")) {
      nodes.push(<span className="notes-preview-wikilink" key={key}>{token.slice(2, -2)}</span>);
    } else if (token.startsWith("[")) {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const href = link ? safeUrl(link[2]) : null;
      nodes.push(link && href ? <a key={key} href={href} target="_blank" rel="noreferrer">{renderSmartArrows(link[1])}</a> : token);
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{renderSmartArrows(token.slice(2, -2))}</strong>);
    } else if (token.startsWith("~~")) {
      nodes.push(<s key={key}>{renderSmartArrows(token.slice(2, -2))}</s>);
    } else if (token.startsWith("`")) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("<u>")) {
      nodes.push(<u key={key}>{renderSmartArrows(token.slice(3, -4))}</u>);
    } else if (token.startsWith("<sub>")) {
      nodes.push(<sub key={key}>{renderSmartArrows(token.slice(5, -6))}</sub>);
    } else {
      nodes.push(<em key={key}>{renderSmartArrows(token.slice(1, -1))}</em>);
    }
    cursor = match.index + token.length;
  }
  if (cursor < text.length) nodes.push(renderSmartArrows(text.slice(cursor)));
  return nodes;
}

export default function NotesMarkdown({ content, headingIdPrefix }: { content: string; headingIdPrefix?: string }) {
  const lines = content.split("\n");
  const generatedId = React.useId().replace(/:/g, "");
  const instanceId = headingIdPrefix ?? generatedId;
  const headings = collectMarkdownHeadings(content, instanceId);

  const headingByLine = new Map(headings.map((heading) => [heading.line, heading]));
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
    const blockImage = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (blockImage) {
      const source = safeUrl(blockImage[2], true);
      if (source) {
        elements.push(<figure className="notes-preview-image" key={index}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={source} alt={blockImage[1]} loading="lazy" />
          {blockImage[1] && <figcaption>{blockImage[1]}</figcaption>}
        </figure>);
        return;
      }
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const headingId = headingByLine.get(index)?.id;
      const children = parseInline(heading[2], `heading-${index}`);
      elements.push(level === 1
        ? <h1 id={headingId} key={index}>{children}</h1>
        : level === 2
          ? <h2 id={headingId} key={index}>{children}</h2>
          : level === 3
            ? <h3 id={headingId} key={index}>{children}</h3>
            : level === 4
              ? <h4 id={headingId} key={index}>{children}</h4>
              : level === 5
                ? <h5 id={headingId} key={index}>{children}</h5>
                : <h6 id={headingId} key={index}>{children}</h6>);
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
