/**
 * CVD (color vision deficiency) simulation and correction engine.
 *
 * Simulation uses the severity-parameterized matrices from
 * Machado, Oliveira & Fernandes (2009), "A Physiologically-based Model for
 * Simulation of Color Vision Deficiency" (IEEE TVCG). The published table
 * covers severities 0.0–1.0 in 0.1 steps; intermediate severities are
 * interpolated between neighboring entries. Matrices operate on LINEAR RGB,
 * so all pixel work here converts out of and back into gamma-encoded sRGB.
 *
 * Correction ("daltonization") follows the error-redistribution approach:
 * simulate what the viewer loses, then shift that lost signal into channels
 * they can still distinguish.
 */

export type CVDType = 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia';

type MachadoKey = 'protan' | 'deutan' | 'tritan';

const MACHADO_KEY: Partial<Record<CVDType, MachadoKey>> = {
  protanopia: 'protan',
  deuteranopia: 'deutan',
  tritanopia: 'tritan',
};

// Rows are [Rr, Rg, Rb, Gr, Gg, Gb, Br, Bg, Bb]; index = severity * 10.
const MACHADO: Record<MachadoKey, number[][]> = {
  protan: [
    [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
    [0.856167, 0.182038, -0.038205, 0.029342, 0.955115, 0.015544, -0.00288, -0.001563, 1.004443],
    [0.734766, 0.334872, -0.069637, 0.05184, 0.919198, 0.028963, -0.004928, -0.004209, 1.009137],
    [0.630323, 0.465641, -0.095964, 0.069181, 0.890046, 0.040773, -0.006308, -0.007724, 1.014032],
    [0.539009, 0.579343, -0.118352, 0.082546, 0.866121, 0.051332, -0.007136, -0.011959, 1.019095],
    [0.458064, 0.679578, -0.137642, 0.092785, 0.846313, 0.060902, -0.007494, -0.016807, 1.024301],
    [0.38545, 0.769005, -0.154455, 0.100526, 0.829802, 0.069673, -0.007442, -0.02219, 1.029632],
    [0.319627, 0.849633, -0.169261, 0.106241, 0.815969, 0.07779, -0.007025, -0.028051, 1.035076],
    [0.259411, 0.923008, -0.18242, 0.110296, 0.80434, 0.085364, -0.006276, -0.034346, 1.040622],
    [0.203876, 0.990338, -0.194214, 0.112975, 0.794542, 0.092483, -0.005222, -0.041043, 1.046265],
    [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
    [0.866435, 0.177704, -0.044139, 0.049567, 0.939063, 0.01137, -0.003453, 0.007233, 0.99622],
    [0.760729, 0.319078, -0.079807, 0.090568, 0.889315, 0.020117, -0.006027, 0.013325, 0.992702],
    [0.675425, 0.43385, -0.109275, 0.125303, 0.847755, 0.026942, -0.00795, 0.018572, 0.989378],
    [0.605511, 0.52856, -0.134071, 0.155318, 0.812366, 0.032316, -0.009376, 0.023176, 0.9862],
    [0.547494, 0.607765, -0.155259, 0.181692, 0.781742, 0.036566, -0.01041, 0.027275, 0.983136],
    [0.498864, 0.674741, -0.173604, 0.205199, 0.754872, 0.039929, -0.011131, 0.030969, 0.980162],
    [0.457771, 0.731899, -0.18967, 0.226409, 0.731012, 0.042579, -0.011595, 0.034333, 0.977261],
    [0.422823, 0.781057, -0.203881, 0.245752, 0.709602, 0.044646, -0.011843, 0.037423, 0.974421],
    [0.392952, 0.82361, -0.216562, 0.263559, 0.69021, 0.046232, -0.01191, 0.040281, 0.97163],
    [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
    [0.92667, 0.092514, -0.019184, 0.021191, 0.964503, 0.014306, 0.008437, 0.054813, 0.93675],
    [0.89572, 0.13333, -0.02905, 0.029997, 0.9454, 0.024603, 0.013027, 0.104707, 0.882266],
    [0.905871, 0.127791, -0.033662, 0.026856, 0.941251, 0.031893, 0.01341, 0.148296, 0.838294],
    [0.948035, 0.08949, -0.037526, 0.014364, 0.946792, 0.038844, 0.010853, 0.193991, 0.795156],
    [1.017277, 0.027029, -0.044306, -0.006113, 0.958479, 0.047634, 0.006379, 0.248708, 0.744913],
    [1.104996, -0.046633, -0.058363, -0.032137, 0.971635, 0.060503, 0.001336, 0.317922, 0.680742],
    [1.193214, -0.109812, -0.083402, -0.058496, 0.97941, 0.079086, -0.002346, 0.403492, 0.598854],
    [1.257728, -0.139648, -0.118081, -0.078003, 0.975409, 0.102594, -0.003316, 0.501214, 0.502102],
    [1.278864, -0.125333, -0.153531, -0.084748, 0.957674, 0.127074, -0.000989, 0.601151, 0.399838],
    [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
  ],
};

// ── sRGB ↔ linear light ─────────────────────────────────────────────────────

const SRGB_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// 4096-entry inverse table trades a hair of precision for per-pixel speed.
const LINEAR_TO_SRGB_STEPS = 4096;
const LINEAR_TO_SRGB = new Uint8ClampedArray(LINEAR_TO_SRGB_STEPS + 1);
for (let i = 0; i <= LINEAR_TO_SRGB_STEPS; i++) {
  const c = i / LINEAR_TO_SRGB_STEPS;
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  LINEAR_TO_SRGB[i] = Math.round(s * 255);
}

function toSrgb8(linear: number): number {
  const clamped = linear <= 0 ? 0 : linear >= 1 ? 1 : linear;
  return LINEAR_TO_SRGB[Math.round(clamped * LINEAR_TO_SRGB_STEPS)];
}

// ── Matrix lookup ───────────────────────────────────────────────────────────

/** Machado matrix for a type at arbitrary severity 0–1 (interpolated). */
export function getMachadoMatrix(type: Exclude<CVDType, 'achromatopsia'>, severity: number): number[] {
  const table = MACHADO[MACHADO_KEY[type]!];
  const s = Math.max(0, Math.min(1, severity)) * 10;
  const lo = Math.floor(s);
  const hi = Math.min(10, lo + 1);
  const t = s - lo;
  if (t === 0) return table[lo];
  return table[lo].map((v, i) => v + (table[hi][i] - v) * t);
}

// Rec. 709 luminance coefficients for linear RGB.
const LUM_R = 0.2126, LUM_G = 0.7152, LUM_B = 0.0722;

// ── Per-pixel core (linear RGB in, linear RGB out) ──────────────────────────

function simulateLinear(
  r: number, g: number, b: number,
  type: CVDType, severity: number,
  out: [number, number, number],
): void {
  if (type === 'achromatopsia') {
    const y = LUM_R * r + LUM_G * g + LUM_B * b;
    const s = Math.max(0, Math.min(1, severity));
    out[0] = r + (y - r) * s;
    out[1] = g + (y - g) * s;
    out[2] = b + (y - b) * s;
    return;
  }
  const m = getMachadoMatrix(type, severity);
  out[0] = m[0] * r + m[1] * g + m[2] * b;
  out[1] = m[3] * r + m[4] * g + m[5] * b;
  out[2] = m[6] * r + m[7] * g + m[8] * b;
}

/**
 * Daltonize one linear-RGB pixel: add back the perceptual error in channels
 * the viewer can see. Red-green types push the lost red/green difference into
 * blue (and brightness); tritan pushes lost blue difference into red/green.
 * Achromatopsia gets a hue→lightness encoding instead, since no hue channel
 * survives to receive redistributed error.
 */
function daltonizeLinear(
  r: number, g: number, b: number,
  type: CVDType, severity: number, strength: number,
  sim: [number, number, number],
  out: [number, number, number],
): void {
  if (type === 'achromatopsia') {
    const offset = strength * ((r - g) * 0.35 + (g - b) * 0.15);
    out[0] = r + offset;
    out[1] = g + offset;
    out[2] = b + offset;
    return;
  }
  simulateLinear(r, g, b, type, severity, sim);
  const eR = r - sim[0];
  const eG = g - sim[1];
  const eB = b - sim[2];
  if (type === 'tritanopia') {
    out[0] = r + strength * (eR + 0.7 * eB);
    out[1] = g + strength * (eG + 0.7 * eB);
    out[2] = b;
  } else {
    out[0] = r;
    out[1] = g + strength * (0.7 * eR + eG);
    out[2] = b + strength * (0.7 * eR + eB);
  }
}

// ── Hex helpers (used by palette views) ─────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase();
}

const scratch: [number, number, number] = [0, 0, 0];
const scratch2: [number, number, number] = [0, 0, 0];

/** Simulate how a hex color appears to a viewer with the given CVD profile. */
export function simulateHex(hex: string, type: CVDType, severity: number = 1): string {
  const [r8, g8, b8] = hexToRgb(hex);
  simulateLinear(SRGB_TO_LINEAR[r8], SRGB_TO_LINEAR[g8], SRGB_TO_LINEAR[b8], type, severity, scratch);
  return rgbToHex(toSrgb8(scratch[0]), toSrgb8(scratch[1]), toSrgb8(scratch[2]));
}

/** Daltonize a single hex color for the given CVD profile. */
export function daltonizeHex(hex: string, type: CVDType, severity: number = 1, strength: number = 1): string {
  const [r8, g8, b8] = hexToRgb(hex);
  daltonizeLinear(
    SRGB_TO_LINEAR[r8], SRGB_TO_LINEAR[g8], SRGB_TO_LINEAR[b8],
    type, severity, strength, scratch2, scratch,
  );
  return rgbToHex(toSrgb8(scratch[0]), toSrgb8(scratch[1]), toSrgb8(scratch[2]));
}

// ── Site-wide assist filter ─────────────────────────────────────────────────

/**
 * The daltonization correction collapsed into a single 3×3 matrix:
 * D = I + strength · E · (I − M)  — where M is the Machado matrix at the
 * user's severity and E redistributes the invisible error into visible
 * channels. Because the whole operation is linear it can run as one SVG
 * feColorMatrix over the entire page (color-interpolation-filters defaults
 * to linearRGB, matching the space this math lives in).
 */
export function assistMatrix(type: CVDType, severity: number, strength: number = 0.8): number[] {
  const s = Math.max(0, Math.min(2, strength));
  if (type === 'achromatopsia') {
    // Hue→lightness encoding (see daltonizeLinear), expressed as a matrix.
    const a = [0.35, -0.2, -0.15];
    return [
      1 + s * a[0], s * a[1], s * a[2],
      s * a[0], 1 + s * a[1], s * a[2],
      s * a[0], s * a[1], 1 + s * a[2],
    ];
  }
  const m = getMachadoMatrix(type, severity);
  const P = [1 - m[0], -m[1], -m[2], -m[3], 1 - m[4], -m[5], -m[6], -m[7], 1 - m[8]];
  const E = type === 'tritanopia'
    ? [1, 0, 0.7, 0, 1, 0.7, 0, 0, 0]
    : [0, 0, 0, 0.7, 1, 0, 0.7, 0, 1];
  const EP = [
    E[0] * P[0] + E[1] * P[3] + E[2] * P[6], E[0] * P[1] + E[1] * P[4] + E[2] * P[7], E[0] * P[2] + E[1] * P[5] + E[2] * P[8],
    E[3] * P[0] + E[4] * P[3] + E[5] * P[6], E[3] * P[1] + E[4] * P[4] + E[5] * P[7], E[3] * P[2] + E[4] * P[5] + E[5] * P[8],
    E[6] * P[0] + E[7] * P[3] + E[8] * P[6], E[6] * P[1] + E[7] * P[4] + E[8] * P[7], E[6] * P[2] + E[7] * P[5] + E[8] * P[8],
  ];
  return [
    1 + s * EP[0], s * EP[1], s * EP[2],
    s * EP[3], 1 + s * EP[4], s * EP[5],
    s * EP[6], s * EP[7], 1 + s * EP[8],
  ];
}

/** feColorMatrix `values` string for the assist matrix. */
export function assistMatrixValues(type: CVDType, severity: number, strength: number = 0.8): string {
  const d = assistMatrix(type, severity, strength);
  return `${d[0]} ${d[1]} ${d[2]} 0 0  ${d[3]} ${d[4]} ${d[5]} 0 0  ${d[6]} ${d[7]} ${d[8]} 0 0  0 0 0 1 0`;
}

// ── Confusion axes (used by the calibration screener) ───────────────────────

export type ConfusionAxis = 'protan' | 'deutan' | 'tritan';

/**
 * Unit null directions of the severity-1.0 Machado matrices in linear RGB:
 * color differences along these axes are (near-)invisible to the corresponding
 * dichromat while remaining plainly visible to typical vision. Protan and
 * deutan matrices are exactly rank-2; the tritan matrix is not a perfect
 * projection (a known limit of the model), so its vector is the
 * minimum-visibility direction rather than a true null.
 */
export const CONFUSION_AXES: Record<ConfusionAxis, [number, number, number]> = {
  protan: [0.9896, -0.1437, -0.0029],
  deutan: [0.9221, -0.3860, 0.0284],
  tritan: [0.1308, -0.1445, 0.9808],
};

export const AXIS_TO_TYPE: Record<ConfusionAxis, CVDType> = {
  protan: 'protanopia',
  deutan: 'deuteranopia',
  tritan: 'tritanopia',
};

/**
 * Build a figure/background hex pair straddling a confusion axis.
 * `base` is a linear-RGB anchor (keep channels ~0.3–0.65 so ±t stays in
 * gamut); `t` is the chromatic contrast amplitude in linear-RGB units —
 * the screener staircases it downward to estimate severity.
 */
export function confusionPair(
  axis: ConfusionAxis, base: [number, number, number], t: number,
): { figure: string; bg: string } {
  const n = CONFUSION_AXES[axis];
  const clamp01 = (v: number) => (v <= 0 ? 0 : v >= 1 ? 1 : v);
  const toHex = (r: number, g: number, b: number) =>
    rgbToHex(toSrgb8(clamp01(r)), toSrgb8(clamp01(g)), toSrgb8(clamp01(b)));
  return {
    figure: toHex(base[0] + t * n[0], base[1] + t * n[1], base[2] + t * n[2]),
    bg: toHex(base[0] - t * n[0], base[1] - t * n[1], base[2] - t * n[2]),
  };
}

// ── ImageData processors (used by the Vision Lens) ──────────────────────────

/** In-place CVD simulation over canvas pixels. */
export function simulateImageData(data: Uint8ClampedArray, type: CVDType, severity: number = 1): void {
  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) {
    simulateLinear(
      SRGB_TO_LINEAR[data[i]], SRGB_TO_LINEAR[data[i + 1]], SRGB_TO_LINEAR[data[i + 2]],
      type, severity, out,
    );
    data[i] = toSrgb8(out[0]);
    data[i + 1] = toSrgb8(out[1]);
    data[i + 2] = toSrgb8(out[2]);
  }
}

/** In-place daltonization (correction) over canvas pixels. */
export function daltonizeImageData(
  data: Uint8ClampedArray, type: CVDType, severity: number = 1, strength: number = 1,
): void {
  const sim: [number, number, number] = [0, 0, 0];
  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) {
    daltonizeLinear(
      SRGB_TO_LINEAR[data[i]], SRGB_TO_LINEAR[data[i + 1]], SRGB_TO_LINEAR[data[i + 2]],
      type, severity, strength, sim, out,
    );
    data[i] = toSrgb8(out[0]);
    data[i + 1] = toSrgb8(out[1]);
    data[i + 2] = toSrgb8(out[2]);
  }
}
