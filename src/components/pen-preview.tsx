import { Pen, fountainWidths } from "@/lib/ink-model";

export default function PenPreview({ pen }: { pen: Pen }) {
  const marker = pen.style === "highlighter";
  const tip = Math.max(1.2, Math.min(marker ? 15 : 5, pen.width));
  return <>
    <svg className="ink-preset-art" viewBox="0 0 48 58" aria-hidden="true" fill="none">
      {marker ? <>
        <path d="M14 27L15 17L30 12L34 27Z" fill={pen.color} stroke="currentColor" strokeOpacity=".25" />
        <path d="M14 26H34V33H14Z" fill="#a4adba" />
        <rect x="10" y="32" width="28" height="25" rx="5" fill={pen.color} stroke="currentColor" strokeOpacity=".3" />
        <path d="M14 37V52" stroke="white" strokeOpacity=".4" strokeWidth="3" strokeLinecap="round" />
        <path d="M34 36V53" stroke="black" strokeOpacity=".18" strokeWidth="3" />
        <path d="M17 20L29 16" stroke="black" strokeOpacity=".15" />
      </> : pen.style === "pencil" ? <>
        <path d="M18 27L24 5L30 27Z" fill="#d6b58a" />
        <path d="M21.8 13L24 5L26.2 13Z" fill={pen.color} stroke="currentColor" strokeOpacity=".3" />
        <path d="M18 27L21 25L24 28L27 25L30 27V57H18Z" fill={pen.color} stroke="currentColor" strokeOpacity=".3" />
        <path d="M21 28V57" stroke="white" strokeOpacity=".4" />
        <path d="M27 28V57" stroke="black" strokeOpacity=".25" strokeWidth="2" />
      </> : pen.style === "fountain" ? <>
        <path d="M24 4L33 21L29 31H19L15 21Z" fill="#d9bd7e" stroke="#f2dcaa" strokeWidth=".7" />
        <path d="M24 5V24M18 24L21 28M30 24L27 28" stroke="#79633e" strokeWidth=".8" />
        <circle cx="24" cy="21" r="1.8" fill="#55452d" />
        <rect x="18" y="30" width="12" height="9" rx="2" fill="#343944" />
        <rect x="15" y="38" width="18" height="19" rx="3" fill={pen.color} stroke="currentColor" strokeOpacity=".35" />
        <path d="M16 40H32" stroke="#d9bd7e" strokeWidth="2" />
        <path d="M19 44V55" stroke="white" strokeOpacity=".35" strokeWidth="2" strokeLinecap="round" />
      </> : <>
        <path d="M24 6V12" stroke={pen.color} strokeWidth={tip} strokeLinecap="round" />
        <path d="M22.5 11H25.5L30 28H18Z" fill="#b9c2cf" stroke="#e1e5eb" strokeWidth=".6" />
        <path d="M24 14L26 26" stroke="white" strokeOpacity=".6" />
        <rect x="17" y="27" width="14" height="30" rx="3" fill={pen.color} stroke="currentColor" strokeOpacity=".4" />
        <path d="M20 31V54" stroke="white" strokeOpacity=".35" strokeWidth="2" strokeLinecap="round" />
        <path d="M28 30V55" stroke="black" strokeOpacity=".2" strokeWidth="2" />
        {[33, 37, 41].map(y => <path key={y} d={`M22 ${y}H30`} stroke="black" strokeOpacity=".22" />)}
      </>}
    </svg>
    <span className="ink-preset-swatch" style={{ background: pen.color, height: Math.max(2, Math.min(7, pen.width * .6)), opacity: pen.opacity }} />
    <span className="ink-pen-width">{pen.style === "fountain" ? `${fountainWidths(pen).min.toFixed(1)}-${fountainWidths(pen).max.toFixed(1)}` : pen.width} px</span>
    {pen.opacity < 1 && <span className="ink-pen-opacity">{Math.round(pen.opacity * 100)}%</span>}
  </>;
}
