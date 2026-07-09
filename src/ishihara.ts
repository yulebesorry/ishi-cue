import Color from 'color';
import { ColorBlindType, simulateColorBlind } from './colorUtils';

/**
 * Shared Ishihara plate engine. Used two ways:
 *  - IshiharaDemo simulates CVD onto plates so typical-vision users can see
 *    what disappears.
 *  - CalibrateView shows plates RAW — the viewer's own eyes are the filter —
 *    with figure/background pairs straddling a confusion axis (see cvd.ts).
 */

export interface Dot {
  x: number;
  y: number;
  r: number;
  color: string;
}

export const PLATE_SIZE = 200;

/**
 * Fraction of the figure's mask pixels that must land under some dot before
 * the packer stops. A single-pass random rejection sampler at a plausible
 * dot count (e.g. ~520 dots of radius 3.5-7 in this plate) only reaches
 * ~40% figure coverage before most attempts start colliding — that reads as
 * scattered noise, not a digit. 0.85 is the point where the shape is
 * unambiguous while still keeping a genuine dot texture instead of a solid
 * fill (real Ishihara plates aren't 100% covered either).
 */
const FIGURE_COVERAGE_TARGET = 0.85;

export interface DotJitter {
  hue: number; // full range of hue wobble in degrees
  sat: number; // full range of HSV saturation wobble
  val: number; // full range of HSV value wobble (also masks luminance cues)
}

// Matches the original demo behavior.
export const DEMO_JITTER: DotJitter = { hue: 32, sat: 28, val: 22 };

// Screener plates need tighter hue wobble (the figure/bg chroma gap is the
// signal) and wider lightness wobble (confusion axes leak ~10% luminance,
// which must drown in noise so brightness can't give the digit away).
export const SCREENER_JITTER: DotJitter = { hue: 10, sat: 24, val: 34 };

// Deterministic LCG seeded by a number
export function makeLCG(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export function hashStr(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Render text to an offscreen canvas and return a flat boolean mask
export function buildTextMask(text: string, size: number): boolean[] {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#fff';
  const fs = text.length > 1 ? size * 0.46 : size * 0.66;
  ctx.font = `900 ${fs}px Arial Black, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, size / 2);
  const d = ctx.getImageData(0, 0, size, size).data;
  const mask = new Array<boolean>(size * size);
  for (let i = 0; i < size * size; i++) mask[i] = d[i * 4] > 128;
  return mask;
}

export function inMask(x: number, y: number, mask: boolean[], size: number): boolean {
  const px = Math.round(x), py = Math.round(y);
  if (px < 0 || px >= size || py < 0 || py >= size) return false;
  return mask[py * size + px];
}

// Radius tiers for the organic packing pass: biggest dots first (classic
// Ishihara look), each successive tier filling gaps the previous left.
const PACK_TIERS = [
  { rMin: 4.5, rMax: 6.5, attempts: 2500, pad: 1.0 },
  { rMin: 3.0, rMax: 4.5, attempts: 3000, pad: 0.8 },
  { rMin: 2.0, rMax: 3.0, attempts: 3500, pad: 0.6 },
];

// Generate stable random dot positions for a given figure text
export function buildDots(
  digit: string,
  seed: number,
  figureHex: string,
  bgHex: string,
  jitter: DotJitter = DEMO_JITTER,
): Dot[] {
  const rng = makeLCG(hashStr(digit + '|' + seed));
  const rngC = makeLCG(hashStr(digit + '|' + seed + 'color'));
  const mask = buildTextMask(digit, PLATE_SIZE);
  const center = PLATE_SIZE / 2;
  const outerR = PLATE_SIZE / 2 - 3;
  const dots: Dot[] = [];
  const covered = new Uint8Array(PLATE_SIZE * PLATE_SIZE);

  const colorFor = (x: number, y: number): string => {
    const isFig = inMask(x, y, mask, PLATE_SIZE);
    const base = Color(isFig ? figureHex : bgHex);
    const hue = (base.hue() + (rngC() - 0.5) * jitter.hue + 360) % 360;
    const sat = Math.min(100, Math.max(8, base.saturationv() + (rngC() - 0.5) * jitter.sat));
    const val = Math.min(96, Math.max(18, base.value() + (rngC() - 0.5) * jitter.val));
    return Color.hsv(hue, sat, val).hex();
  };

  const stamp = (x: number, y: number, r: number) => {
    const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(PLATE_SIZE - 1, Math.ceil(x + r));
    const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(PLATE_SIZE - 1, Math.ceil(y + r));
    for (let yy = y0; yy <= y1; yy++) {
      for (let xx = x0; xx <= x1; xx++) {
        if ((xx - x) ** 2 + (yy - y) ** 2 <= r * r) covered[yy * PLATE_SIZE + xx] = 1;
      }
    }
  };

  // Pass 1: organic rejection-sampled packing, largest dots first.
  for (const tier of PACK_TIERS) {
    for (let attempt = 0; attempt < tier.attempts; attempt++) {
      const angle = rng() * Math.PI * 2;
      const dist = Math.sqrt(rng()) * outerR;
      const x = center + dist * Math.cos(angle);
      const y = center + dist * Math.sin(angle);
      const r = tier.rMin + rng() * (tier.rMax - tier.rMin);
      if (dots.some(d => Math.hypot(d.x - x, d.y - y) < d.r + r + tier.pad)) continue;
      dots.push({ x, y, r, color: colorFor(x, y) });
      stamp(x, y, r);
    }
  }

  // Pass 2: gap fill. Rejection sampling alone plateaus around ~40% figure
  // coverage — most random attempts collide once the plate is half full.
  // Walking the actual uncovered pixels (in random order) guarantees every
  // remaining attempt lands somewhere useful, until the digit reads clean.
  const gaps: [number, number][] = [];
  for (let y = 0; y < PLATE_SIZE; y++) {
    for (let x = 0; x < PLATE_SIZE; x++) {
      if (Math.hypot(x - center, y - center) <= outerR && !covered[y * PLATE_SIZE + x]) {
        gaps.push([x, y]);
      }
    }
  }
  for (let i = gaps.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [gaps[i], gaps[j]] = [gaps[j], gaps[i]];
  }

  let figTotal = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) figTotal++;
  // Recompute actual figure coverage from the bitmap (not just the dots
  // placed in this pass) — a per-dot approximation undercounts everything
  // tiers 1-3 already covered and the loop never terminates early.
  const figCoverage = (): number => {
    if (figTotal === 0) return 1;
    let hit = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i] && covered[i]) hit++;
    return hit / figTotal;
  };

  let sinceCheck = 0;
  for (const [gx, gy] of gaps) {
    if (covered[gy * PLATE_SIZE + gx]) continue; // already stamped by an earlier gap dot
    const cx = gx + 0.5, cy = gy + 0.5;
    const r = 1.4 + rng() * 1.0;
    dots.push({ x: cx, y: cy, r, color: colorFor(cx, cy) });
    stamp(cx, cy, r);
    if (++sinceCheck >= 40) {
      sinceCheck = 0;
      if (figCoverage() >= FIGURE_COVERAGE_TARGET) break;
    }
  }

  return dots;
}

export function drawPlate(
  canvas: HTMLCanvasElement | null,
  dots: Dot[],
  cvdType: ColorBlindType | 'normal',
  severity: number,
  isDarkMode: boolean,
) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const size = PLATE_SIZE;
  const center = size / 2;
  const r = size / 2 - 2;

  ctx.clearRect(0, 0, size, size);

  // Outer circle background
  ctx.beginPath();
  ctx.arc(center, center, r, 0, Math.PI * 2);
  ctx.fillStyle = isDarkMode ? '#1c1c1c' : '#efefef';
  ctx.fill();

  // Clip to circle
  ctx.save();
  ctx.beginPath();
  ctx.arc(center, center, r, 0, Math.PI * 2);
  ctx.clip();

  for (const dot of dots) {
    const hex = cvdType === 'normal'
      ? dot.color
      : simulateColorBlind(dot.color, cvdType, severity);
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
    ctx.fillStyle = hex;
    ctx.fill();
  }

  ctx.restore();

  // Outer ring
  ctx.beginPath();
  ctx.arc(center, center, r, 0, Math.PI * 2);
  ctx.strokeStyle = isDarkMode ? '#333' : '#d0d0d0';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// Detect if the figure is visible by comparing avg simulated color of figure vs bg dots
export function figureVisible(
  dots: Dot[],
  mask: boolean[],
  cvdType: ColorBlindType | 'normal',
  severity: number,
): boolean {
  let fr = 0, fg = 0, fb = 0, fc = 0;
  let br = 0, bg = 0, bb = 0, bc = 0;
  for (const dot of dots) {
    const hex = cvdType === 'normal' ? dot.color : simulateColorBlind(dot.color, cvdType, severity);
    const c = Color(hex);
    const fig = inMask(dot.x, dot.y, mask, PLATE_SIZE);
    if (fig) { fr += c.red(); fg += c.green(); fb += c.blue(); fc++; }
    else { br += c.red(); bg += c.green(); bb += c.blue(); bc++; }
  }
  if (!fc || !bc) return true;
  const dr = fr / fc - br / bc, dg = fg / fc - bg / bc, db = fb / fc - bb / bc;
  return Math.sqrt(dr * dr + dg * dg + db * db) > 22;
}
