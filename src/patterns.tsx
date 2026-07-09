import React from 'react';
import Color from 'color';

/**
 * Trello-style texture overlays: when hue alone can't identify a palette
 * color, a per-position pattern can. Pattern index is stable by palette
 * position, so "Primary" keeps its stripes everywhere it appears — swatches,
 * check strips, wheel nodes, legends.
 *
 * HTML surfaces use CSS gradient patterns (no ids to collide); the SVG color
 * wheel uses <pattern> defs with light/dark ink variants.
 */

export const PATTERN_COUNT = 10;

export const PATTERN_NAMES = [
  'Diagonal', 'Dots', 'Crosshatch', 'Horizontal', 'Vertical',
  'Rings', 'Grid', 'Checker', 'Reverse Diagonal', 'Diamonds',
] as const;

// WCAG relative luminance / contrast — used instead of Color's isDark()
// heuristic so the black-vs-white choice is the one that's actually higher
// contrast, not just "lighter or darker than middle grey".
function relLuminance(hex: string): number {
  const c = Color(hex);
  const [r, g, b] = [c.red(), c.green(), c.blue()].map(v => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(l1: number, l2: number): number {
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Solid black or white — never alpha-blended. A semi-transparent "white"
 * ink over a red swatch doesn't render as white, it renders as a lighter
 * shade of red (blend math: white@0.55 over rgb(239,68,68) = rgb(248,171,171)).
 * That reintroduces the exact hue-dependence patterns exist to route around,
 * so the ink here is fully opaque and picked by actual contrast ratio.
 */
export function patternInk(hex: string): string {
  try {
    const lum = relLuminance(hex);
    return contrastRatio(lum, 0) >= contrastRatio(lum, 1) ? '#000000' : '#ffffff';
  } catch {
    return '#000000';
  }
}

export function patternCSS(index: number, ink: string): React.CSSProperties {
  const i = ((index % PATTERN_COUNT) + PATTERN_COUNT) % PATTERN_COUNT;
  switch (i) {
    case 0: // diagonal stripes
      return { backgroundImage: `repeating-linear-gradient(45deg, ${ink} 0 2px, transparent 2px 8px)` };
    case 1: // dots
      return { backgroundImage: `radial-gradient(${ink} 1.6px, transparent 1.6px)`, backgroundSize: '8px 8px' };
    case 2: // crosshatch
      return { backgroundImage: `repeating-linear-gradient(45deg, ${ink} 0 1.5px, transparent 1.5px 9px), repeating-linear-gradient(135deg, ${ink} 0 1.5px, transparent 1.5px 9px)` };
    case 3: // horizontal stripes
      return { backgroundImage: `repeating-linear-gradient(0deg, ${ink} 0 2px, transparent 2px 8px)` };
    case 4: // vertical stripes
      return { backgroundImage: `repeating-linear-gradient(90deg, ${ink} 0 2px, transparent 2px 8px)` };
    case 5: // rings
      return { backgroundImage: `radial-gradient(circle, transparent 2px, ${ink} 2px 3.4px, transparent 3.4px)`, backgroundSize: '11px 11px' };
    case 6: // grid
      return { backgroundImage: `repeating-linear-gradient(0deg, ${ink} 0 1.5px, transparent 1.5px 9px), repeating-linear-gradient(90deg, ${ink} 0 1.5px, transparent 1.5px 9px)` };
    case 7: // checker
      return { backgroundImage: `repeating-conic-gradient(${ink} 0% 25%, transparent 0% 50%)`, backgroundSize: '10px 10px' };
    case 8: // reverse diagonal stripes
      return { backgroundImage: `repeating-linear-gradient(135deg, ${ink} 0 2px, transparent 2px 8px)` };
    case 9: // diamonds
    default:
      return { backgroundImage: `repeating-conic-gradient(from 45deg, ${ink} 0% 25%, transparent 0% 50%)`, backgroundSize: '10px 10px' };
  }
}

interface PatternOverlayProps {
  index: number;
  hex: string;
  className?: string;
}

/** Absolutely-positioned texture layer; parent needs `position: relative`. */
export const PatternOverlay: React.FC<PatternOverlayProps> = ({ index, hex, className = '' }) => (
  <div
    aria-hidden="true"
    className={`absolute inset-0 pointer-events-none ${className}`}
    style={patternCSS(index, patternInk(hex))}
  />
);

// ── SVG variants for the color wheel ────────────────────────────────────────

const SVG_INKS = { light: '#ffffff', dark: '#000000' } as const;

function svgPatternContent(index: number, ink: string): React.ReactNode {
  const i = ((index % PATTERN_COUNT) + PATTERN_COUNT) % PATTERN_COUNT;
  switch (i) {
    case 0: return <path d="M-1,5 l6,-6 M0,8 l8,-8 M3,9 l6,-6" stroke={ink} strokeWidth="1.6" />;
    case 1: return <circle cx="4" cy="4" r="1.6" fill={ink} />;
    case 2: return <><path d="M0,0 l8,8" stroke={ink} strokeWidth="1.2" /><path d="M8,0 l-8,8" stroke={ink} strokeWidth="1.2" /></>;
    case 3: return <rect x="0" y="3" width="8" height="2" fill={ink} />;
    case 4: return <rect x="3" y="0" width="2" height="8" fill={ink} />;
    case 5: return <circle cx="4" cy="4" r="2.4" fill="none" stroke={ink} strokeWidth="1.3" />;
    case 6: return <><rect x="0" y="3" width="8" height="1.4" fill={ink} /><rect x="3" y="0" width="1.4" height="8" fill={ink} /></>;
    case 7: return <><rect x="0" y="0" width="4" height="4" fill={ink} /><rect x="4" y="4" width="4" height="4" fill={ink} /></>;
    case 8: return <path d="M-1,3 l6,6 M0,0 l8,8 M5,-1 l6,6" stroke={ink} strokeWidth="1.6" />;
    case 9: default: return <rect x="1.6" y="1.6" width="4.8" height="4.8" transform="rotate(45 4 4)" fill={ink} />;
  }
}

/** Mount once inside the wheel's <svg>; provides icue-pat-{i}-{light|dark}. */
export const SvgPatternDefs: React.FC = () => (
  <defs>
    {Array.from({ length: PATTERN_COUNT }, (_, i) =>
      (Object.entries(SVG_INKS) as [string, string][]).map(([name, ink]) => (
        <pattern key={`${i}-${name}`} id={`icue-pat-${i}-${name}`} width="8" height="8" patternUnits="userSpaceOnUse">
          {svgPatternContent(i, ink)}
        </pattern>
      ))
    )}
  </defs>
);

export function svgPatternRef(index: number, hex: string): string {
  let ink: keyof typeof SVG_INKS = 'dark';
  try {
    const lum = relLuminance(hex);
    ink = contrastRatio(lum, 0) >= contrastRatio(lum, 1) ? 'dark' : 'light';
  } catch { /* keep dark */ }
  return `url(#icue-pat-${((index % PATTERN_COUNT) + PATTERN_COUNT) % PATTERN_COUNT}-${ink})`;
}
