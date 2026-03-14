"use client";

import React from "react";

interface MarkdownRendererProps {
  content: string;
}

function parseInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold italic: ***text***
    let match = remaining.match(/^\*\*\*(.+?)\*\*\*/);
    if (match) {
      nodes.push(
        <strong key={key++}>
          <em>{parseInline(match[1])}</em>
        </strong>
      );
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Bold: **text** or __text__
    match = remaining.match(/^\*\*(.+?)\*\*/);
    if (!match) match = remaining.match(/^__(.+?)__/);
    if (match) {
      nodes.push(<strong key={key++}>{parseInline(match[1])}</strong>);
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Italic: *text* or _text_
    match = remaining.match(/^\*(.+?)\*/);
    if (!match) match = remaining.match(/^_(.+?)_/);
    if (match) {
      nodes.push(<em key={key++}>{parseInline(match[1])}</em>);
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Inline code: `text`
    match = remaining.match(/^`(.+?)`/);
    if (match) {
      nodes.push(
        <code
          key={key++}
          style={{
            backgroundColor: "var(--surface-variant)",
            borderRadius: "4px",
            padding: "2px 6px",
            fontSize: "0.9em",
          }}
        >
          {match[1]}
        </code>
      );
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Plain character
    const nextSpecial = remaining.slice(1).search(/[*_`]/);
    if (nextSpecial === -1) {
      nodes.push(remaining);
      break;
    } else {
      nodes.push(remaining.slice(0, nextSpecial + 1));
      remaining = remaining.slice(nextSpecial + 1);
    }
  }

  return nodes;
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let key = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Headers
    const h3Match = line.match(/^###\s+(.+)/);
    if (h3Match) {
      elements.push(
        <h3 key={key++} style={{ fontSize: "16px", fontWeight: 700, margin: "12px 0 4px" }}>
          {parseInline(h3Match[1])}
        </h3>
      );
      i++;
      continue;
    }

    const h2Match = line.match(/^##\s+(.+)/);
    if (h2Match) {
      elements.push(
        <h2 key={key++} style={{ fontSize: "18px", fontWeight: 700, margin: "14px 0 4px" }}>
          {parseInline(h2Match[1])}
        </h2>
      );
      i++;
      continue;
    }

    const h1Match = line.match(/^#\s+(.+)/);
    if (h1Match) {
      elements.push(
        <h1 key={key++} style={{ fontSize: "22px", fontWeight: 700, margin: "16px 0 6px" }}>
          {parseInline(h1Match[1])}
        </h1>
      );
      i++;
      continue;
    }

    // Unordered list items (- or *)
    if (/^[-*]\s+/.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^[-*]\s+/, "");
        items.push(<li key={items.length}>{parseInline(itemText)}</li>);
        i++;
      }
      elements.push(
        <ul key={key++} style={{ margin: "8px 0", paddingLeft: "20px" }}>
          {items}
        </ul>
      );
      continue;
    }

    // Ordered list items
    if (/^\d+\.\s+/.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\d+\.\s+/, "");
        items.push(<li key={items.length}>{parseInline(itemText)}</li>);
        i++;
      }
      elements.push(
        <ol key={key++} style={{ margin: "8px 0", paddingLeft: "20px" }}>
          {items}
        </ol>
      );
      continue;
    }

    // Empty line → paragraph break
    if (line.trim() === "") {
      elements.push(<div key={key++} style={{ height: "8px" }} />);
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={key++} style={{ margin: "4px 0" }}>
        {parseInline(line)}
      </p>
    );
    i++;
  }

  return <div>{elements}</div>;
}
