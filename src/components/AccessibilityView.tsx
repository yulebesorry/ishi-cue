import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import Color from 'color';
import { PaletteColor } from '../types';
import {
  AlertCircle,
  CheckCircle2,
  Info,
  RefreshCw,
  Eye,
  Sliders,
} from 'lucide-react';
import {
  ColorBlindType,
  CVDGroup,
  CB_LABELS,
  CB_DESCRIPTIONS,
  simulateColorBlind,
  paletteConflicts,
  HUE_DANGER_ZONES,
  getHueDangers,
  nearestSafeHue,
  applyEnChromaFilter,
  ENCHROMA_HELPS,
} from '../colorUtils';

interface AccessibilityViewProps {
  palette: PaletteColor[];
  isDarkMode: boolean;
  onUpdate?: (index: number, updates: Partial<PaletteColor>) => void;
}

const CB_TYPES: ColorBlindType[] = ['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'];

const SVG_FILTERS: Record<ColorBlindType, string> = {
  protanopia:   'url(#cb-protanopia)',
  deuteranopia: 'url(#cb-deuteranopia)',
  tritanopia:   'url(#cb-tritanopia)',
  achromatopsia:'url(#cb-achromatopsia)',
};

const SEVERITY_PRESETS = [
  { label: 'Mild',     value: 0.3,  note: 'Anomalous trichromacy — most common' },
  { label: 'Moderate', value: 0.6,  note: 'Reduced cone sensitivity' },
  { label: 'Severe',   value: 0.85, note: 'Near-dichromacy' },
  { label: 'Full',     value: 1.0,  note: 'Complete dichromacy — rarest' },
];

export const AccessibilityView: React.FC<AccessibilityViewProps> = ({ palette, isDarkMode, onUpdate }) => {
  const getInitialColor = (role: string, fallbackIndex: number) =>
    palette.find(c => c.role === role)?.hex || palette[fallbackIndex]?.hex || (fallbackIndex === 0 ? '#000000' : '#FFFFFF');

  const [textColor, setTextColor] = useState(getInitialColor('Primary', 0));
  const [bgColor, setBgColor]     = useState(getInitialColor('Background', palette.length - 1));
  const [severity,       setSeverity]       = useState(1.0);
  const [filterStrength, setFilterStrength] = useState(1.0);
  const [showFilter,     setShowFilter]     = useState(false);

  useEffect(() => {
    setTextColor(getInitialColor('Primary', 0));
    setBgColor(getInitialColor('Background', palette.length - 1));
  }, [palette]);

  const contrastInfo = useMemo(() => {
    try {
      const c1 = Color(textColor);
      const c2 = Color(bgColor);
      const ratio = c1.contrast(c2);
      const aaNormal = ratio >= 4.5;
      const aaLarge  = ratio >= 3;
      const aaaNormal = ratio >= 7;
      const aaaLarge  = ratio >= 4.5;

      let suggestedText = textColor;
      let suggestedRatio = ratio;
      if (!aaNormal) {
        const isBgDark = Color(bgColor).isDark();
        let tmp = Color(textColor);
        for (let i = 0; i < 20; i++) {
          tmp = isBgDark ? tmp.lighten(0.1) : tmp.darken(0.1);
          const r = tmp.contrast(Color(bgColor));
          if (r >= 4.5) { suggestedText = tmp.hex(); suggestedRatio = r; break; }
        }
      }
      return { ratio: ratio.toFixed(2), aaNormal, aaLarge, aaaNormal, aaaLarge, suggestedText, suggestedRatio: suggestedRatio.toFixed(2) };
    } catch { return null; }
  }, [textColor, bgColor]);

  const conflictMap = useMemo(() =>
    Object.fromEntries(CB_TYPES.map(t => [t, paletteConflicts(palette, t, severity)])) as Record<ColorBlindType, [number, number][]>,
    [palette, severity]
  );

  const panel = isDarkMode ? 'bg-[#221E18]' : 'bg-[#F5F1E8]';
  const muted  = isDarkMode ? 'text-stone-300' : 'text-[#2C2418]';
  const strong = isDarkMode ? 'text-[#F5F1E8]' : 'text-[#1A1A1A]';
  const inner  = isDarkMode ? 'bg-[#1E1A15]' : 'bg-stone-100';

  return (
    <div className={`flex flex-col gap-10 p-6 rounded-none border border-zinc-800 retro-shadow ${panel} min-h-[600px]`}>

      {/* Hidden SVG filter defs */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <filter id="cb-protanopia">
            <feColorMatrix type="matrix" values="0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0" />
          </filter>
          <filter id="cb-deuteranopia">
            <feColorMatrix type="matrix" values="0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0" />
          </filter>
          <filter id="cb-tritanopia">
            <feColorMatrix type="matrix" values="0.95 0.05 0 0 0  0 0.433 0.567 0 0  0 0.475 0.525 0 0  0 0 0 1 0" />
          </filter>
          <filter id="cb-achromatopsia">
            <feColorMatrix type="matrix" values="0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0 0 0 1 0" />
          </filter>
        </defs>
      </svg>

      {/* ── Contrast Checker ──────────────────────────── */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 flex items-center justify-center ${isDarkMode ? 'bg-zinc-800 text-zinc-100' : 'bg-zinc-900 text-white'}`}>
            <RefreshCw size={15} />
          </div>
          <h2 className={`text-xs font-black uppercase tracking-widest ${strong}`}>Contrast Checker</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Text Color picker */}
          <div className="space-y-2">
            <label className={`text-[10px] font-bold uppercase tracking-widest ${muted}`}>Text Color</label>
            <div className="flex gap-2">
              <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)}
                className="w-10 h-10 border border-zinc-800 p-0 cursor-pointer rounded-none" />
              <input type="text" value={textColor.toUpperCase()} onChange={e => setTextColor(e.target.value)}
                className={`flex-1 px-3 py-2 text-xs font-mono border border-zinc-800 rounded-none ${isDarkMode ? 'bg-zinc-900 text-white' : 'bg-gray-50 text-black'}`} />
            </div>
            <div className="flex flex-wrap gap-1 pt-1">
              {palette.map((c, i) => (
                <button key={i} onClick={() => setTextColor(c.hex)}
                  className="w-5 h-5 border border-zinc-800 rounded-none hover:scale-110 transition-transform"
                  style={{ backgroundColor: c.hex }} title={c.name} />
              ))}
            </div>
          </div>

          {/* Background picker */}
          <div className="space-y-2">
            <label className={`text-[10px] font-bold uppercase tracking-widest ${muted}`}>Background</label>
            <div className="flex gap-2">
              <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)}
                className="w-10 h-10 border border-zinc-800 p-0 cursor-pointer rounded-none" />
              <input type="text" value={bgColor.toUpperCase()} onChange={e => setBgColor(e.target.value)}
                className={`flex-1 px-3 py-2 text-xs font-mono border border-zinc-800 rounded-none ${isDarkMode ? 'bg-zinc-900 text-white' : 'bg-gray-50 text-black'}`} />
            </div>
            <div className="flex flex-wrap gap-1 pt-1">
              {palette.map((c, i) => (
                <button key={i} onClick={() => setBgColor(c.hex)}
                  className="w-5 h-5 border border-zinc-800 rounded-none hover:scale-110 transition-transform"
                  style={{ backgroundColor: c.hex }} title={c.name} />
              ))}
            </div>
          </div>
        </div>

        {contrastInfo && (
          <div className={`p-5 border border-zinc-800 retro-shadow ${inner}`}>
            <div className="flex items-end justify-between mb-5">
              <div>
                <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${muted}`}>Contrast Ratio</div>
                <div className={`text-5xl font-black tabular-nums ${strong}`}>{contrastInfo.ratio}<span className="text-2xl">:1</span></div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <div className={`flex items-center gap-1.5 text-[11px] font-bold ${contrastInfo.aaNormal ? (isDarkMode ? 'text-green-400' : 'text-green-700') : (isDarkMode ? 'text-red-400' : 'text-red-700')}`}>
                  {contrastInfo.aaNormal ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                  WCAG AA
                </div>
                <div className={`flex items-center gap-1.5 text-[11px] font-bold ${contrastInfo.aaaNormal ? (isDarkMode ? 'text-green-400' : 'text-green-700') : (isDarkMode ? 'text-red-400' : 'text-red-700')}`}>
                  {contrastInfo.aaaNormal ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                  WCAG AAA
                </div>
              </div>
            </div>

            {/* Preview swatch */}
            <div className="border border-zinc-800 px-5 py-4 mb-4 cursor-pointer group transition-opacity"
              style={{ backgroundColor: bgColor, color: textColor }}
              onClick={() => { const t = textColor; setTextColor(bgColor); setBgColor(t); }}
              title="Click to swap"
            >
              <p className="text-base font-bold leading-snug">The quick brown fox jumps over the lazy dog.</p>
              <p className="text-xs mt-1 opacity-70">Click to swap text / background</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className={`p-3 border border-zinc-800 ${isDarkMode ? 'bg-zinc-900' : 'bg-white'}`}>
                <div className={`text-[11px] font-bold uppercase mb-1.5 ${muted}`}>Normal Text</div>
                <div className="flex justify-between">
                  <span className={`text-[11px] font-bold ${contrastInfo.aaNormal ? (isDarkMode ? 'text-green-400' : 'text-green-700') : (isDarkMode ? 'text-red-400' : 'text-red-700')}`}>AA {contrastInfo.aaNormal ? 'PASS' : 'FAIL'}</span>
                  <span className={`text-[11px] font-bold ${contrastInfo.aaaNormal ? (isDarkMode ? 'text-green-400' : 'text-green-700') : (isDarkMode ? 'text-red-400' : 'text-red-700')}`}>AAA {contrastInfo.aaaNormal ? 'PASS' : 'FAIL'}</span>
                </div>
              </div>
              <div className={`p-3 border border-zinc-800 ${isDarkMode ? 'bg-zinc-900' : 'bg-white'}`}>
                <div className={`text-[11px] font-bold uppercase mb-1.5 ${muted}`}>Large Text</div>
                <div className="flex justify-between">
                  <span className={`text-[11px] font-bold ${contrastInfo.aaLarge ? (isDarkMode ? 'text-green-400' : 'text-green-700') : (isDarkMode ? 'text-red-400' : 'text-red-700')}`}>AA {contrastInfo.aaLarge ? 'PASS' : 'FAIL'}</span>
                  <span className={`text-[11px] font-bold ${contrastInfo.aaaLarge ? (isDarkMode ? 'text-green-400' : 'text-green-700') : (isDarkMode ? 'text-red-400' : 'text-red-700')}`}>AAA {contrastInfo.aaaLarge ? 'PASS' : 'FAIL'}</span>
                </div>
              </div>
            </div>

            {!contrastInfo.aaNormal && (
              <div className={`mt-3 p-4 border border-dashed border-zinc-700 ${isDarkMode ? 'bg-zinc-800/30' : 'bg-zinc-50'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Info size={13} className="text-blue-400" />
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${strong}`}>Suggested Fix</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 border border-zinc-800" style={{ backgroundColor: contrastInfo.suggestedText }} />
                    <span className="font-mono text-xs font-bold">{contrastInfo.suggestedText.toUpperCase()}</span>
                    <span className={`text-[10px] ${muted}`}>{contrastInfo.suggestedRatio}:1</span>
                  </div>
                  <button onClick={() => setTextColor(contrastInfo.suggestedText)}
                    className="text-[10px] font-bold uppercase tracking-widest bg-zinc-900 text-white px-3 py-1.5 hover:bg-black transition-colors">
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Vision Simulation ─────────────────────────── */}
      <section className="space-y-5 pt-8 border-t border-zinc-800">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 flex items-center justify-center ${isDarkMode ? 'bg-zinc-800 text-zinc-100' : 'bg-zinc-900 text-white'}`}>
              <Eye size={15} />
            </div>
            <h2 className={`text-xs font-black uppercase tracking-widest ${strong}`}>Vision Simulation</h2>
            <span className={`text-[10px] font-medium ${muted}`}>— all four types, side by side</span>
          </div>
          <button
            onClick={() => setShowFilter(f => !f)}
            className={`flex items-center gap-2 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest border transition-colors ${
              showFilter
                ? isDarkMode ? 'bg-zinc-100 text-zinc-900 border-zinc-100' : 'bg-zinc-900 text-white border-zinc-900'
                : isDarkMode ? 'border-zinc-700 text-zinc-400 hover:border-zinc-400' : 'border-zinc-300 text-zinc-500 hover:border-zinc-700'
            }`}
          >
            <span>🔍</span>
            {showFilter ? 'Filter Glasses On' : 'Simulate Filter Glasses'}
          </button>
        </div>

        {/* Filter controls — only shown when active */}
        {showFilter && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-4 border border-zinc-800 ${inner} space-y-3`}
          >
            <div className="flex items-start gap-3">
              <div className={`p-1.5 shrink-0 mt-0.5 ${isDarkMode ? 'bg-amber-900/30 text-amber-300' : 'bg-amber-100 text-amber-800'}`}>
                <Info size={14} />
              </div>
              <p className={`text-[10px] leading-relaxed ${muted}`}>
                Approximates optical notch filter glasses (e.g. EnChroma). The filter
                cuts the ~530–580 nm yellow-green band where red and green cones overlap,
                enhancing R-G separation before light hits the eye. Each card now shows
                <strong className={` ${strong}`}> No Glasses</strong> and
                <strong className={` ${strong}`}> With Filter</strong> strips.
                Only effective for red-green CVD (Protanopia, Deuteranopia).
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-[11px] font-black uppercase tracking-wider shrink-0 ${muted}`}>Filter strength</span>
              <input
                type="range" min="0.1" max="1" step="0.05"
                value={filterStrength}
                onChange={e => setFilterStrength(parseFloat(e.target.value))}
                className={`flex-1 h-1.5 rounded-none appearance-none cursor-pointer ${isDarkMode ? 'accent-zinc-100' : 'accent-zinc-900'}`}
              />
              <span className={`text-[9px] font-mono shrink-0 ${muted}`}>{Math.round(filterStrength * 100)}%</span>
            </div>
          </motion.div>
        )}

        {/* Severity slider */}
        <div className={`p-4 border border-zinc-800 ${inner} space-y-3`}>
          <div className="flex items-center justify-between">
            <div>
              <span className={`text-[10px] font-black uppercase tracking-widest ${strong}`}>Severity</span>
              <span className={`ml-2 text-[10px] ${muted}`}>
                {SEVERITY_PRESETS.find(p => Math.abs(p.value - severity) < 0.01)?.note ?? 'Custom'}
              </span>
            </div>
            <span className={`text-[10px] font-mono font-bold ${muted}`}>{Math.round(severity * 100)}%</span>
          </div>

          {/* Preset buttons */}
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

          {/* Continuous slider */}
          <input
            type="range" min="0.05" max="1" step="0.01"
            value={severity}
            onChange={e => setSeverity(parseFloat(e.target.value))}
            className={`w-full h-1.5 rounded-none appearance-none cursor-pointer ${isDarkMode ? 'accent-zinc-100' : 'accent-zinc-900'}`}
          />
          <div className="flex justify-between">
            <span className={`text-[10px] font-medium uppercase tracking-wider ${muted}`}>Normal vision</span>
            <span className={`text-[10px] font-medium uppercase tracking-wider ${muted}`}>Full dichromacy</span>
          </div>
        </div>

        {/* Normal vision reference */}
        <div className={`p-3 border border-zinc-800 ${inner}`}>
          <div className={`text-[11px] font-bold uppercase tracking-widest mb-2 ${muted}`}>Normal Vision (reference)</div>
          <div className="flex h-10 w-full border border-zinc-800 overflow-hidden">
            {palette.map((c, i) => (
              <div key={i} className="flex-1 h-full" style={{ backgroundColor: c.hex }} title={c.name} />
            ))}
          </div>
        </div>

        {/* 2×2 grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {CB_TYPES.map(type => {
            const conflicts = conflictMap[type];
            const hasConflicts = conflicts.length > 0;
            const simColors = palette.map(c => simulateColorBlind(c.hex, type, severity));

            return (
              <motion.div
                key={type}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-4 border rounded-none retro-shadow ${
                  hasConflicts
                    ? 'border-amber-500/60'
                    : 'border-zinc-800'
                } ${inner}`}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className={`text-[11px] font-black uppercase tracking-widest ${strong}`}>{CB_LABELS[type]}</div>
                    <div className={`text-[10px] leading-relaxed mt-0.5 max-w-[200px] font-medium ${muted}`}>{CB_DESCRIPTIONS[type]}</div>
                  </div>
                  {hasConflicts ? (
                    <div className={`flex items-center gap-1 shrink-0 ml-2 ${isDarkMode ? 'text-amber-300' : 'text-amber-800'}`}>
                      <AlertCircle size={15} />
                      <span className="text-[11px] font-black uppercase">{conflicts.length} conflict{conflicts.length > 1 ? 's' : ''}</span>
                    </div>
                  ) : (
                    <div className={`flex items-center gap-1 shrink-0 ml-2 ${isDarkMode ? 'text-green-400' : 'text-green-700'}`}>
                      <CheckCircle2 size={15} />
                      <span className="text-[11px] font-black uppercase">Good</span>
                    </div>
                  )}
                </div>

                {/* Simulated palette strip */}
                <div className="space-y-1 mb-2">
                  {showFilter && (
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold uppercase tracking-wider w-16 shrink-0 ${muted}`}>No glasses</span>
                      <div className="flex h-5 flex-1 border border-zinc-800 overflow-hidden">
                        {palette.map((c, i) => (
                          <div key={i} className="flex-1 h-full"
                            style={{ backgroundColor: simulateColorBlind(c.hex, type, severity) }}
                            title={c.name} />
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    {showFilter && (
                      <span className={`text-[8px] font-bold uppercase tracking-wider w-16 shrink-0 ${
                        ENCHROMA_HELPS[type] ? 'text-green-500' : muted
                      }`}>
                        {ENCHROMA_HELPS[type] ? '✓ Filter' : '— Filter'}
                      </span>
                    )}
                    <div className={`flex h-${showFilter ? '5' : '8'} flex-1 border border-zinc-800 overflow-hidden`}>
                      {palette.map((c, i) => {
                        const filtered = (showFilter && ENCHROMA_HELPS[type])
                          ? applyEnChromaFilter(c.hex, filterStrength)
                          : c.hex;
                        return (
                          <div key={i} className="flex-1 h-full"
                            style={{ backgroundColor: simulateColorBlind(filtered, type, severity) }}
                            title={c.name} />
                        );
                      })}
                    </div>
                  </div>
                  {showFilter && !ENCHROMA_HELPS[type] && (
                    <p className={`text-[10px] italic font-medium ${muted}`}>
                      Optical filter glasses do not help this CVD type.
                    </p>
                  )}
                </div>

                {/* Conflict labels */}
                {hasConflicts && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {conflicts.map(([a, b]) => (
                      <span key={`${a}-${b}`} className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 border ${isDarkMode ? 'bg-amber-900/30 text-amber-200 border-amber-700' : 'bg-amber-100 text-amber-800 border-amber-300'}`}>
                        {palette[a]?.role || `#${a}`} ≈ {palette[b]?.role || `#${b}`}
                      </span>
                    ))}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>

        <div className={`flex items-start gap-3 pt-4 border-t border-zinc-800`}>
          <div className={`p-1.5 shrink-0 ${isDarkMode ? 'bg-blue-900/30 text-blue-300' : 'bg-blue-100 text-blue-700'}`}>
            <Info size={16} />
          </div>
          <p className={`text-[10px] leading-relaxed ${muted}`}>
            WCAG 2.1 AA requires 4.5:1 contrast for normal text, 3:1 for large text.
            Simulations use standard color-blindness matrices — results are approximate.
            Palettes flagged with conflicts may look identical to affected users.
          </p>
        </div>
      </section>

      {/* ── Hue Analysis ──────────────────────────────── */}
      <HueAnalysis palette={palette} isDarkMode={isDarkMode} onUpdate={onUpdate} />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Hue Analysis sub-component
// ─────────────────────────────────────────────────────────────────────────────

interface HueAnalysisProps {
  palette: PaletteColor[];
  isDarkMode: boolean;
  onUpdate?: (index: number, updates: Partial<PaletteColor>) => void;
}

const CVD_GROUPS: CVDGroup[] = ['redgreen', 'blueyellow'];

function shiftHue(hex: string, newHue: number): string {
  const c = Color(hex);
  return Color.hsv(newHue, c.saturationv(), c.value()).hex();
}

const HueAnalysis: React.FC<HueAnalysisProps> = ({ palette, isDarkMode, onUpdate }) => {
  const strong = isDarkMode ? 'text-[#F5F1E8]' : 'text-[#1A1A1A]';
  const muted  = isDarkMode ? 'text-stone-300' : 'text-[#2C2418]';
  const inner  = isDarkMode ? 'bg-[#1E1A15]' : 'bg-stone-100';

  // Per-color hue info
  const colorHues = useMemo(() =>
    palette.map((c, i) => {
      const hue = Color(c.hex).hue();
      const dangers = getHueDangers(hue);
      return { index: i, color: c, hue, dangers };
    }),
    [palette]
  );

  const anyDanger = colorHues.some(c => c.dangers.length > 0);

  return (
    <section className="space-y-5 pt-8 border-t border-zinc-800">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 flex items-center justify-center ${isDarkMode ? 'bg-zinc-800 text-zinc-100' : 'bg-zinc-900 text-white'}`}>
          <Sliders size={15} />
        </div>
        <h2 className={`text-xs font-black uppercase tracking-widest ${strong}`}>Hue Analysis</h2>
        <span className={`text-[10px] font-medium ${muted}`}>— confusion zones by CVD type</span>
      </div>

      {/* Hue Bar */}
      <div className={`p-4 border border-zinc-800 ${inner} space-y-5`}>

        {/* Legend */}
        <div className="flex flex-wrap gap-4">
          {CVD_GROUPS.map(group => (
            <div key={group} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-none opacity-60" style={{ backgroundColor: HUE_DANGER_ZONES[group].color }} />
              <span className={`text-[9px] font-bold uppercase tracking-wider ${muted}`}>
                {HUE_DANGER_ZONES[group].label} — {HUE_DANGER_ZONES[group].cvdNames}
              </span>
            </div>
          ))}
        </div>

        {/* Hue spectrum bar */}
        <div className="relative h-8 w-full rounded-none border border-zinc-800 overflow-visible">
          {/* Rainbow gradient */}
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(to right, hsl(0,100%,50%), hsl(30,100%,50%), hsl(60,100%,50%), hsl(90,100%,50%), hsl(120,100%,50%), hsl(150,100%,50%), hsl(180,100%,50%), hsl(210,100%,50%), hsl(240,100%,50%), hsl(270,100%,50%), hsl(300,100%,50%), hsl(330,100%,50%), hsl(360,100%,50%))',
            }}
          />

          {/* Danger zone overlays */}
          {CVD_GROUPS.map(group =>
            HUE_DANGER_ZONES[group].ranges.map(([lo, hi]) => (
              <div
                key={`${group}-${lo}`}
                className="absolute top-0 h-full pointer-events-none"
                style={{
                  left:  `${(lo / 360) * 100}%`,
                  width: `${((hi - lo) / 360) * 100}%`,
                  backgroundColor: HUE_DANGER_ZONES[group].color,
                  opacity: 0.35,
                }}
              />
            ))
          )}

          {/* Palette color dots */}
          {colorHues.map(({ index, color, hue, dangers }) => (
            <div
              key={index}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
              style={{ left: `${(hue / 360) * 100}%` }}
              title={`${color.role || color.name} — ${Math.round(hue)}°`}
            >
              <div
                className={`w-5 h-5 rounded-none border-2 shadow-md transition-transform hover:scale-125 ${
                  dangers.length > 0 ? 'border-white' : 'border-white/60'
                }`}
                style={{ backgroundColor: color.hex }}
              />
              {dangers.length > 0 && (
                <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full border border-white" />
              )}
            </div>
          ))}
        </div>

        {/* Hue degree labels */}
        <div className="flex justify-between px-0.5">
          {[0, 60, 120, 180, 240, 300, 360].map(deg => (
            <span key={deg} className={`text-[8px] font-mono ${muted}`}>{deg}°</span>
          ))}
        </div>
      </div>

      {/* Per-color warnings + shift controls */}
      {anyDanger ? (
        <div className="space-y-2">
          <p className={`text-[10px] font-black uppercase tracking-widest ${muted}`}>Colors in confusion zones</p>
          {colorHues.filter(c => c.dangers.length > 0).map(({ index, color, hue, dangers }) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex flex-col sm:flex-row sm:items-center gap-3 p-3 border border-amber-500/40 ${isDarkMode ? 'bg-amber-500/5' : 'bg-amber-50'}`}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-8 h-8 border border-zinc-800 shrink-0" style={{ backgroundColor: color.hex }} />
                <div className="min-w-0">
                  <div className={`text-[11px] font-black uppercase truncate ${strong}`}>
                    {color.role || color.name}
                  </div>
                  <div className={`text-[9px] font-mono ${muted}`}>{color.hex.toUpperCase()} · Hue {Math.round(hue)}°</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 shrink-0">
                {dangers.map(group => {
                  const safe = nearestSafeHue(hue, group);
                  const safeHex = shiftHue(color.hex, safe);
                  return (
                    <div key={group} className="flex items-center gap-1.5">
                      <div
                        className="w-4 h-4 border border-zinc-800 shrink-0"
                        style={{ backgroundColor: safeHex }}
                        title={`Safe for ${HUE_DANGER_ZONES[group].label}: ${safeHex} (${Math.round(safe)}°)`}
                      />
                      <span className={`text-[9px] ${muted} hidden sm:inline`}>{Math.round(safe)}°</span>
                      {onUpdate && (
                        <button
                          onClick={() => onUpdate(index, { hex: safeHex })}
                          className={`text-[8px] font-black uppercase tracking-wider px-2 py-1 border transition-colors ${
                            isDarkMode
                              ? 'border-zinc-700 hover:border-zinc-400 text-zinc-300 hover:text-white bg-zinc-800/50'
                              : 'border-zinc-400 hover:border-zinc-700 text-zinc-600 hover:text-zinc-900 bg-white'
                          }`}
                          title={`Shift away from ${HUE_DANGER_ZONES[group].label} confusion zone`}
                        >
                          Fix {HUE_DANGER_ZONES[group].label}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          ))}

          {onUpdate && (
            <button
              onClick={() => {
                colorHues
                  .filter(c => c.dangers.length > 0)
                  .forEach(({ index, color, hue, dangers }) => {
                    const safe = nearestSafeHue(hue, dangers[0]);
                    onUpdate(index, { hex: shiftHue(color.hex, safe) });
                  });
              }}
              className={`w-full mt-2 py-2.5 text-[10px] font-black uppercase tracking-widest border border-zinc-800 transition-colors ${
                isDarkMode ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-900'
              }`}
            >
              Shift All to Safe Hues
            </button>
          )}
        </div>
      ) : (
        <div className={`flex items-center gap-3 p-4 border border-zinc-800 ${inner}`}>
          <CheckCircle2 size={16} className={`shrink-0 ${isDarkMode ? 'text-green-400' : 'text-green-700'}`} />
          <p className={`text-[11px] font-bold ${strong}`}>
            All palette hues are outside known CVD confusion zones.
          </p>
        </div>
      )}

      <div className={`flex items-start gap-3 pt-4 border-t border-zinc-800`}>
        <div className={`p-1.5 shrink-0 ${isDarkMode ? 'bg-amber-900/30 text-amber-300' : 'bg-amber-100 text-amber-800'}`}>
          <Info size={16} />
        </div>
        <p className={`text-[10px] leading-relaxed ${muted}`}>
          Color blindness does not change hue values — it changes how the brain perceives them.
          Reds (0–15°), yellows (35–55°), and greens (120–150°) cause red-green confusion.
          Blues (180–240°) and purples (280–320°) cause blue-yellow confusion.
          Shifting hues preserves saturation and lightness; only the hue degree changes.
        </p>
      </div>
    </section>
  );
};
