import React, { useRef, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { PaletteColor } from '../types';
import { ColorBlindType } from '../colorUtils';
import { PLATE_SIZE, buildDots, buildTextMask, drawPlate, figureVisible } from '../ishihara';
import { useActiveCVDProfile } from '../profile';
import { ScanEye, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';

interface IshiharaDemoProps {
  palette: PaletteColor[];
  isDarkMode: boolean;
}

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

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

export const IshiharaDemo: React.FC<IshiharaDemoProps> = ({ palette, isDarkMode }) => {
  const activeProfile = useActiveCVDProfile();
  const [digit,     setDigit]     = useState('8');
  const [figureIdx, setFigureIdx] = useState(0);
  const [bgIdx,     setBgIdx]     = useState(Math.min(1, palette.length - 1));
  const [severity,  setSeverity]  = useState(activeProfile?.severity ?? 1.0);

  // Adopt the profile live when it changes (e.g. header vision-mode picker)
  useEffect(() => {
    if (activeProfile) setSeverity(activeProfile.severity);
  }, [activeProfile?.severity]);
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
