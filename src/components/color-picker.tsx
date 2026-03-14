"use client";

interface ColorPickerProps {
  selectedColor: number;
  onSelectColor: (color: number) => void;
}

function argbToHex(argb: number): string {
  const rgb = argb & 0x00ffffff;
  return "#" + rgb.toString(16).padStart(6, "0").toUpperCase();
}

// Matches Android app's 20 colors (4 rows of 5)
const COLORS: number[] = [
  // Row 1: Bold accents
  0xffff5252, 0xffff7043, 0xffffca28, 0xff66bb6a, 0xff42a5f5,
  // Row 2: Pastels & soft
  0xffffab91, 0xfff48fb1, 0xffce93d8, 0xffa5d6a7, 0xff81d4fa,
  // Row 3: Dimmer & earthy
  0xffbcaaa4, 0xff8d6e63, 0xff78909c, 0xff7e57c2, 0xff26a69a,
  // Row 4: Neutrals & pops
  0xffeceff1, 0xffb0bec5, 0xffef5350, 0xff2e7d32, 0xffe0e0e0,
];

function isLightColor(argb: number): boolean {
  const r = (argb >> 16) & 0xff;
  const g = (argb >> 8) & 0xff;
  const b = argb & 0xff;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.7;
}

export default function ColorPicker({
  selectedColor,
  onSelectColor,
}: ColorPickerProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, 40px)",
        gap: 10,
      }}
    >
      {COLORS.map((color) => {
        const hex = argbToHex(color);
        const isSelected = color === selectedColor;
        const isLight = isLightColor(color);

        return (
          <button
            key={color}
            type="button"
            onClick={() => onSelectColor(color)}
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              backgroundColor: hex,
              border: isLight
                ? "1px solid var(--border)"
                : "1px solid transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              outline: isSelected
                ? "2px solid var(--primary)"
                : "none",
              outlineOffset: 2,
              transition: "outline 0.15s",
            }}
            aria-label={hex}
          >
            {isSelected && (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke={isLight ? "#333333" : "#FFFFFF"}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}
