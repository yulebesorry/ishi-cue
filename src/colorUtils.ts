import Color from 'color';
import namer from 'color-namer';
import { ColorTheoryRule, PaletteColor, ColorRole } from './types';

export type ColorBlindType = 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia';
export type CVDGroup = 'redgreen' | 'blueyellow';

export const HUE_DANGER_ZONES: Record<CVDGroup, { label: string; cvdNames: string; ranges: [number, number][]; color: string }> = {
  redgreen: {
    label: 'Red-Green',
    cvdNames: 'Protanopia / Deuteranopia',
    ranges: [[0, 15], [35, 55], [120, 150]],
    color: '#ef4444',
  },
  blueyellow: {
    label: 'Blue-Yellow',
    cvdNames: 'Tritanopia',
    ranges: [[180, 240], [280, 320]],
    color: '#3b82f6',
  },
};

export function getHueDangers(hue: number): CVDGroup[] {
  const h = ((hue % 360) + 360) % 360;
  return (Object.entries(HUE_DANGER_ZONES) as [CVDGroup, typeof HUE_DANGER_ZONES[CVDGroup]][])
    .filter(([, zone]) => zone.ranges.some(([lo, hi]) => h >= lo && h <= hi))
    .map(([type]) => type);
}

export function nearestSafeHue(hue: number, group: CVDGroup): number {
  const h = ((hue % 360) + 360) % 360;
  const zones = HUE_DANGER_ZONES[group].ranges;
  if (!zones.some(([lo, hi]) => h >= lo && h <= hi)) return h;

  // Collect all boundary edges (just outside each danger zone)
  const candidates: number[] = [];
  for (const [lo, hi] of zones) {
    candidates.push(lo > 2 ? lo - 3 : 357);
    candidates.push(hi < 357 ? hi + 3 : 3);
  }

  // Return the candidate with smallest angular distance to h
  return candidates.reduce((best, c) => {
    const dBest = Math.min(Math.abs(h - best), 360 - Math.abs(h - best));
    const dC    = Math.min(Math.abs(h - c),    360 - Math.abs(h - c));
    return dC < dBest ? c : best;
  }, candidates[0]);
}

export const CB_LABELS: Record<ColorBlindType, string> = {
  protanopia: 'Protanopia',
  deuteranopia: 'Deuteranopia',
  tritanopia: 'Tritanopia',
  achromatopsia: 'Achromatopsia',
};

export const CB_DESCRIPTIONS: Record<ColorBlindType, string> = {
  protanopia: 'Red-blind — reds appear dark, greens and yellows look similar.',
  deuteranopia: 'Green-blind — most common form, red and green hues are hard to distinguish.',
  tritanopia: 'Blue-yellow blind — blues appear greenish, yellows appear violet or grey.',
  achromatopsia: 'Total color blindness — world seen entirely in grey, black, and white.',
};

// feColorMatrix rows: R, G, B coefficients for each output channel
const CB_MATRICES: Record<ColorBlindType, [number, number, number, number, number, number, number, number, number]> = {
  protanopia:    [0.567, 0.433, 0,     0.558, 0.442, 0,     0,     0.242, 0.758],
  deuteranopia:  [0.625, 0.375, 0,     0.7,   0.3,   0,     0,     0.3,   0.7  ],
  tritanopia:    [0.95,  0.05,  0,     0,     0.433, 0.567, 0,     0.475, 0.525],
  achromatopsia: [0.299, 0.587, 0.114, 0.299, 0.587, 0.114, 0.299, 0.587, 0.114],
};

// EnChroma-style optical notch filter approximation.
// Real EnChroma glasses cut ~530–580 nm (the yellow-green band where L and M
// cones overlap most). In RGB this reduces the green channel's dominance and
// slightly boosts long-wavelength (red) contrast, enhancing R-G separation
// before the light reaches the eye. Not effective for tritanopia/achromatopsia.
// strength: 0 = no filter, 1 = full filter effect.
export function applyEnChromaFilter(hex: string, strength: number = 1): string {
  const s = Math.max(0, Math.min(1, strength));
  const c = Color(hex);
  const r = c.red() / 255;
  const g = c.green() / 255;
  const b = c.blue() / 255;

  // Notch matrix (full strength): reduces green by ~25%, redistributes slightly to red
  // R' = 1.2R − 0.1G   (reds become more distinct)
  // G' = 0.75G          (yellow-green band attenuated)
  // B' = 1.0B           (blues unaffected)
  const fR = 1.2 * r - 0.1 * g;
  const fG = 0.75 * g;
  const fB = b;

  // Blend with the original by strength
  const oR = r + (fR - r) * s;
  const oG = g + (fG - g) * s;
  const oB = b + (fB - b) * s;

  return Color.rgb(
    Math.round(Math.min(255, Math.max(0, oR * 255))),
    Math.round(Math.min(255, Math.max(0, oG * 255))),
    Math.round(Math.min(255, Math.max(0, oB * 255))),
  ).hex();
}

// Which CVD types benefit from the EnChroma filter
export const ENCHROMA_HELPS: Partial<Record<ColorBlindType, true>> = {
  protanopia:  true,
  deuteranopia: true,
};

// severity: 0 = normal vision, 1 = full dichromacy (most severe).
// Interpolates linearly so 0.3 ≈ mild anomalous trichromacy, 0.6 ≈ moderate.
export function simulateColorBlind(hex: string, type: ColorBlindType, severity: number = 1): string {
  const s = Math.max(0, Math.min(1, severity));
  const c = Color(hex);
  const r = c.red(), g = c.green(), b = c.blue();
  const m = CB_MATRICES[type];
  const r2 = m[0]*r + m[1]*g + m[2]*b;
  const g2 = m[3]*r + m[4]*g + m[5]*b;
  const b2 = m[6]*r + m[7]*g + m[8]*b;
  return Color.rgb(
    Math.round(Math.min(255, Math.max(0, r + (r2 - r) * s))),
    Math.round(Math.min(255, Math.max(0, g + (g2 - g) * s))),
    Math.round(Math.min(255, Math.max(0, b + (b2 - b) * s))),
  ).hex();
}

function rgbDistance(a: string, b: string): number {
  const ca = Color(a), cb = Color(b);
  const dr = ca.red() - cb.red();
  const dg = ca.green() - cb.green();
  const db = ca.blue() - cb.blue();
  return Math.sqrt(dr*dr + dg*dg + db*db);
}

export function paletteConflicts(palette: PaletteColor[], type: ColorBlindType, severity: number = 1): [number, number][] {
  const sim = palette.map(c => simulateColorBlind(c.hex, type, severity));
  const conflicts: [number, number][] = [];
  for (let i = 0; i < sim.length; i++) {
    for (let j = i + 1; j < sim.length; j++) {
      if (rgbDistance(sim[i], sim[j]) < 35) conflicts.push([i, j]);
    }
  }
  return conflicts;
}

export const COLOR_ROLES: ColorRole[] = [
  'Primary',
  'Primary Light',
  'Primary Dark',
  'Secondary',
  'Accent',
  'Surface',
  'Background',
  'Text',
  'Success',
  'Warning',
  'Error',
  'Neutral',
  'Highlight'
];

export const getColorName = (hex: string): string => {
  try {
    const names = namer(hex);
    return names.ntc[0].name;
  } catch (e) {
    return 'Unknown Color';
  }
};

export const generatePaletteFromRule = (baseHex: string, rule: ColorTheoryRule, isDarkMode: boolean = false): PaletteColor[] => {
  const base = Color(baseHex);
  const palette = [base];

  switch (rule) {
    case 'complementary':
      palette.push(base.rotate(180));
      palette.push(base.lighten(0.2));
      palette.push(base.rotate(180).darken(0.2));
      palette.push(base.desaturate(0.5));
      break;
    case 'analogous':
      palette.push(base.rotate(-30));
      palette.push(base.rotate(-15));
      palette.push(base.rotate(15));
      palette.push(base.rotate(30));
      break;
    case 'triadic':
      palette.push(base.rotate(120));
      palette.push(base.rotate(240));
      palette.push(base.rotate(120).lighten(0.2));
      palette.push(base.rotate(240).darken(0.2));
      break;
    case 'tetradic':
      palette.push(base.rotate(90));
      palette.push(base.rotate(180));
      palette.push(base.rotate(270));
      palette.push(base.lighten(0.2));
      break;
    case 'monochromatic':
      palette.push(base.lighten(0.2));
      palette.push(base.lighten(0.4));
      palette.push(base.darken(0.2));
      palette.push(base.darken(0.4));
      break;
    case 'split-complementary':
      palette.push(base.rotate(150));
      palette.push(base.rotate(210));
      palette.push(base.lighten(0.1));
      palette.push(base.darken(0.1));
      break;
    case 'design-system':
      const s = base.saturationl();
      // Primary shades - smarter adjustments based on base lightness
      const isBaseDark = base.isDark();
      palette.push(isBaseDark ? base.lighten(0.3) : base.lighten(0.15)); // Primary Light
      palette.push(isBaseDark ? base.darken(0.15) : base.darken(0.3));  // Primary Dark
      
      // Accent - complementary but with dynamic saturation for better contrast
      const accentSaturation = s < 30 ? s + 40 : s + 10;
      palette.push(base.rotate(180).saturationl(Math.min(accentSaturation, 90)).lightness(isDarkMode ? 60 : 50)); // Accent
      
      // Background & Surface - derived from base hue for cohesion
      const baseHue = base.hue();
      if (isDarkMode) {
        // Dark mode: Deep, desaturated version of base hue
        palette.push(Color.hsl(baseHue, 15, 15)); // Surface
        palette.push(Color.hsl(baseHue, 10, 8));   // Background
        palette.push(Color.hsl(baseHue, 10, 95));  // Text
      } else {
        // Light mode: Very pale, desaturated version of base hue
        palette.push(Color.hsl(baseHue, 8, 100)); // Surface
        palette.push(Color.hsl(baseHue, 12, 98));  // Background
        palette.push(Color.hsl(baseHue, 20, 15)); // Text
      }
      
      // Semantic - adapted to base color's saturation for cohesion
      // We keep the functional hues but adapt the "energy"
      palette.push(Color.hsl(142, Math.min(s + 20, 75), isDarkMode ? 50 : 45)); // Success
      palette.push(Color.hsl(38, Math.min(s + 30, 90), isDarkMode ? 60 : 55));  // Warning
      palette.push(Color.hsl(0, Math.min(s + 25, 80), isDarkMode ? 55 : 50));   // Error
      break;
  }

  if (rule === 'design-system') {
    const roles: ColorRole[] = [
      'Primary',
      'Primary Light',
      'Primary Dark',
      'Accent',
      'Surface',
      'Background',
      'Text',
      'Success',
      'Warning',
      'Error'
    ];
    return palette.map((c, i) => ({
      hex: c.hex(),
      name: getColorName(c.hex()),
      role: roles[i]
    }));
  }

  return palette.map((c, i) => ({
    hex: c.hex(),
    name: getColorName(c.hex()),
    role: COLOR_ROLES[i % COLOR_ROLES.length]
  }));
};
