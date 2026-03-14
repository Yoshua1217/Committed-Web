"use client";

import { resolveIconName } from "@/lib/icons";

interface MaterialIconProps {
  /** Android PascalCase name (e.g. "FitnessCenter") or Material Symbols name */
  name: string;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}

/**
 * Renders a Google Material Symbols Rounded icon.
 * Accepts either Android PascalCase names or Material Symbols snake_case names.
 */
export default function MaterialIcon({ name, size = 24, color, style }: MaterialIconProps) {
  const symbolName = resolveIconName(name);

  return (
    <span
      className="material-symbols-rounded"
      style={{
        fontSize: size,
        color: color || "inherit",
        lineHeight: 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        userSelect: "none",
        ...style,
      }}
    >
      {symbolName}
    </span>
  );
}
