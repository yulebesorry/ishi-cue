import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import Color from 'color';
import { motion } from 'motion/react';
import { PaletteColor } from '../types';
import { ColorBlindType, simulateColorBlind } from '../colorUtils';
import { ScanEye, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';

interface IshiharaDemoProps {
  palette: PaletteColor[];
  isDarkMode: boolean;
}

interface Dot {
  x: number;
  y: number;
  r: number;
  color: string;
}

const PLATE_SIZE = 200;
const DOT_COUNT  = 520;
const DIGITS     = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

const CVD_VIEWS: { type: ColorBlindType | 'normal'; label: string }[] = [
  { type: 'normal',       label: 'Normal Vision'  },
  { type: 'protanopia',   label: 'Protanopia'     },
  { type: 'deuteranopia', label: 'Deuteranopia'   },
  { type: 'tritanopia',   label: 'Tritanopia'     },
  { type: 'achromatopsia',label: 'Achromatopsia'  },
];

const SEVERITY_PRESETS = [
  { label: 'Mild',     value: 0.3  },
  { label: 'Moderate', value: 0.6  },
  { label: 'Full',     value: 1.0  },
];

// Deterministic LCG seeded by a number
function makeLCG(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function hashStr(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Render text to an offscreen canvas and return a flat boolean mask
function buildTextMask(text: string, size: number): boolean[] {
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

function inMask(x: number, y: number, mask: boolean[], size: number): boolean {
  const px = Math.round(x), py = Math.round(y);
  if (px < 0 || px >= size || py < 0 || py >= size) return false;
  return mask[py * size + px];
}

// Generate stable random dot positions for a given digit
function buildDots(digit: string, seed: number, figureHex: string, bgHex: string): Dot[] {
  const rng     = makeLCG(hashStr(digit + '|' + seed));
  const rngC    = makeLCG(hashStr(digit + '|' + seed + 'color'));
  const mask    = buildTextMask(digit, PLATE_SIZE);
  const center  = PLATE_SIZE / 2;
  const outerR  = PLATE_SIZE / 2 - 3;
  const dots: Dot[] = [];

  for (let attempt = 0; attempt < DOT_COUNT * 25 && dots.length < DOT_COUNT; attempt++) {
    const angle = rng() * Math.PI * 2;
    const dist  = Math.sqrt(rng()) * outerR;
    const x     = center + dist * Math.cos(angle);
    const y     = center + dist * Math.sin(angle);
    const r     = 3.5 + rng() * 3.5;
    if (dots.some(d => Math.hypot(d.x - x, d.y - y) < d.r + r + 1.5)) continue;
    const isFig = inMask(x, y, mask, PLATE_SIZE);
    const base  = Color(isFig ? figureHex : bgHex);
    const hue   = (base.hue() + (rngC() - 0.5) * 32 + 360) % 360;
    const sat   = Math.min(100, Math.max(8,  base.saturationv() + (rngC() - 0.5) * 28));
    const val   = Math.min(96,  Math.max(18, base.value()       + (rngC() - 0.5) * 22));
    dots.push({ x, y, r, color: Color.hsv(hue, sat, val).hex() });
  }
  return dots;
}

function drawPlate(
  canvas: HTMLCanvasElement | null,
  dots: Dot[],
  cvdType: ColorBlindType | 'normal',
  severity: number,
  isDarkMode: boolean,
) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const size   = PLATE_SIZE;
  const center = size / 2;
  const r      = size / 2 - 2;

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

// Detect if the figure is still visible by comparing avg simulated color of figure vs bg dots
function figureVisible(dots: Dot[], mask: boolean[], cvdType: ColorBlindType | 'normal', severity: number): boolean {
  let fr = 0, fg = 0, fb = 0, fc = 0;
  let br = 0, bg = 0, bb = 0, bc = 0;
  for (const dot of dots) {
    const hex = cvdType === 'normal' ? dot.color : simulateColorBlind(dot.color, cvdType, severity);
    const c = Color(hex);
    const fig = inMask(dot.x, dot.y, mask, PLATE_SIZE);
    if (fig) { fr += c.red(); fg += c.green(); fb += c.blue(); fc++; }
    else      { br += c.red(); bg += c.green(); bb += c.blue(); bc++; }
  }
  if (!fc || !bc) return true;
  const dr = fr/fc - br/bc, dg = fg/fc - bg/bc, db = fb/fc - bb/bc;
  return Math.sqrt(dr*dr + dg*dg + db*db) > 22;
}

export const IshiharaDemo: React.FC<IshiharaDemoProps> = ({ palette, isDarkMode }) => {
  const [digit,     setDigit]     = useState('8');
  const [figureIdx, setFigureIdx] = useState(0);
  const [bgIdx,     setBgIdx]     = useState(Math.min(1, palette.length - 1));
  const [severity,  setSeverity]  = useState(1.0);
  const [seed,      setSeed]      = useState(0);

  const canvasRefs = CVD_VIEWS.map(() => useRef<HTMLCanvasElement>(null));

  // Rebuild dots when digit, palette colors, or seed changes
  const { dots, mask } = useMemo(() => {
    const figHex = palette[figureIdx]?.hex ?? '#e63946';
    const bgHex  = palette[bgIdx]?.hex     ?? '#a8dadc';
    const d      = buildDots(digit, seed, figHex, bgHex);
    const m      = buildTextMask(digit, PLATE_SIZE);
    return { dots: d, mask: m };
  }, [digit, figureIdx, bgIdx, palette, seed]);

  // Redraw all canvases when dots, severity, or dark mode changes
  useEffect(() => {
    CVD_VIEWS.forEach(({ type }, i) => {
      drawPlate(canvasRefs[i].current, dots, type, severity, isDarkMode);
    });
  }, [dots, severity, isDarkMode]);

  const strong = isDarkMode ? 'text-[#F5F1E8]' : 'text-[#1A1A1A]';
  const muted  = isDarkMode ? 'text-stone-300'  : 'text-[#2C2418]';
  const inner  = isDarkMode ? 'bg-[#1E1A15]'   : 'bg-stone-100';

  return (
    <div className={`flex flex-col gap-8 p-6 border border-zinc-800 retro-shadow ${isDarkMode ? 'bg-[#221E18]' : 'bg-[#F5F1E8]'} min-h-[600px]`}>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-zinc-800 text-zinc-100' : 'bg-zinc-900 text-white'}`}>
            <ScanEye size={20} />
          </div>
          <div>
            <h2 className={`text-base font-black uppercase tracking-widest ${strong}`}>Ishihara Plate Test</h2>
            <p className={`text-[10px] mt-0.5 leading-snug max-w-sm ${muted}`}>
              Uses your palette colors to generate a dot-pattern plate.
              If the digit disappears under a simulation, colorblind users
              cannot distinguish those two colors.
            </p>
          </div>
        </div>
        <button
          onClick={() => setSeed(s => s + 1)}
          title="Regenerate dots"
          className={`p-2 border border-zinc-800 shrink-0 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors`}
        >
          <RefreshCw size={14} className={muted} />
        </button>
      </div>

      {/* Controls row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

        {/* Digit selector */}
        <div className={`p-4 border border-zinc-800 ${inner} space-y-2`}>
          <p className={`text-[11px] font-black uppercase tracking-widest ${muted}`}>Digit</p>
          <div className="flex flex-wrap gap-1.5">
            {DIGITS.map(d => (
              <button
                key={d}
                onClick={() => setDigit(d)}
                className={`w-8 h-8 text-sm font-black border transition-colors ${
                  digit === d
                    ? isDarkMode ? 'bg-zinc-100 text-zinc-900 border-zinc-100' : 'bg-zinc-900 text-white border-zinc-900'
                    : isDarkMode ? 'border-zinc-700 text-zinc-400 hover:border-zinc-400' : 'border-zinc-300 text-zinc-600 hover:border-zinc-700'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* Figure color */}
        <div className={`p-4 border border-zinc-800 ${inner} space-y-2`}>
          <p className={`text-[11px] font-black uppercase tracking-widest ${muted}`}>Figure Color</p>
          <div className="flex flex-wrap gap-1.5">
            {palette.map((c, i) => (
              <button
                key={i}
                onClick={() => setFigureIdx(i)}
                className={`w-8 h-8 border-2 transition-all hover:scale-110 ${
                  figureIdx === i ? 'border-zinc-900 dark:border-white scale-110' : 'border-transparent'
                }`}
                style={{ backgroundColor: c.hex }}
                title={c.name}
              />
            ))}
          </div>
          <p className={`text-[11px] font-mono font-bold ${muted}`}>{palette[figureIdx]?.hex?.toUpperCase()}</p>
        </div>

        {/* Background color */}
        <div className={`p-4 border border-zinc-800 ${inner} space-y-2`}>
          <p className={`text-[11px] font-black uppercase tracking-widest ${muted}`}>Background Color</p>
          <div className="flex flex-wrap gap-1.5">
            {palette.map((c, i) => (
              <button
                key={i}
                onClick={() => setBgIdx(i)}
                className={`w-8 h-8 border-2 transition-all hover:scale-110 ${
                  bgIdx === i ? 'border-zinc-900 dark:border-white scale-110' : 'border-transparent'
                }`}
                style={{ backgroundColor: c.hex }}
                title={c.name}
              />
            ))}
          </div>
          <p className={`text-[11px] font-mono font-bold ${muted}`}>{palette[bgIdx]?.hex?.toUpperCase()}</p>
        </div>
      </div>

      {/* Severity */}
      <div className={`p-4 border border-zinc-800 ${inner} space-y-3`}>
        <div className="flex items-center justify-between">
          <span className={`text-[10px] font-black uppercase tracking-widest ${strong}`}>CVD Severity</span>
          <span className={`text-[10px] font-mono ${muted}`}>{Math.round(severity * 100)}%</span>
        </div>
        <div className="flex gap-1.5">
          {SEVERITY_PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => setSeverity(p.value)}
              className={`flex-1 py-1.5 text-[9px] font-black uppercase tracking-wider border transition-colors ${
                Math.abs(severity - p.value) < 0.01
                  ? isDarkMode ? 'bg-zinc-100 text-zinc-900 border-zinc-100' : 'bg-zinc-900 text-white border-zinc-900'
                  : isDarkMode ? 'border-zinc-700 text-zinc-400 hover:border-zinc-400' : 'border-zinc-300 text-zinc-500 hover:border-zinc-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <input
          type="range" min="0.05" max="1" step="0.01"
          value={severity}
          onChange={e => setSeverity(parseFloat(e.target.value))}
          className={`w-full h-1.5 rounded-none appearance-none cursor-pointer ${isDarkMode ? 'accent-zinc-100' : 'accent-zinc-900'}`}
        />
      </div>

      {/* Plates */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {CVD_VIEWS.map(({ type, label }, i) => {
          const visible = figureVisible(dots, mask, type, severity);
          const isNormal = type === 'normal';
          return (
            <motion.div
              key={type}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex flex-col items-center gap-2"
            >
              <canvas
                ref={canvasRefs[i]}
                width={PLATE_SIZE}
                height={PLATE_SIZE}
                className="w-full max-w-[180px] aspect-square border border-zinc-800 retro-shadow"
              />
              <div className="text-center space-y-1 w-full">
                <p className={`text-[11px] font-black uppercase tracking-widest ${strong}`}>{label}</p>
                {isNormal ? (
                  <p className={`text-[10px] font-medium ${muted}`}>Reference</p>
                ) : visible ? (
                  <div className={`flex items-center justify-center gap-1 ${isDarkMode ? 'text-green-400' : 'text-green-700'}`}>
                    <CheckCircle2 size={13} />
                    <span className="text-[10px] font-black uppercase">Visible</span>
                  </div>
                ) : (
                  <div className={`flex items-center justify-center gap-1 ${isDarkMode ? 'text-red-400' : 'text-red-700'}`}>
                    <AlertCircle size={13} />
                    <span className="text-[10px] font-black uppercase">Invisible</span>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Info */}
      <p className={`text-[10px] leading-relaxed border-t border-zinc-800 pt-4 ${muted}`}>
        The Ishihara test uses dots of similar lightness but different hue to hide a figure from colorblind viewers.
        An "Invisible" result here means the selected figure and background colors are indistinguishable at that CVD type
        and severity — the same failure mode that makes real designs inaccessible.
        Try swapping the figure and background colors, or adjust the palette until all five views show "Visible."
      </p>
    </div>
  );
};
