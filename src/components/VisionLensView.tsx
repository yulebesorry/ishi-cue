import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload,
  Download,
  Glasses,
  Eye,
  Sliders,
  X,
  Clipboard,
  Wand2,
  Info,
} from 'lucide-react';
import { CVDType, daltonizeImageData, simulateImageData } from '../cvd';
import { CB_LABELS, CB_DESCRIPTIONS } from '../colorUtils';
import { useActiveCVDProfile } from '../profile';

interface VisionLensViewProps {
  isDarkMode: boolean;
}

const CVD_TYPES: CVDType[] = ['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'];

const SEVERITY_PRESETS = [
  { label: 'Mild', value: 0.3 },
  { label: 'Moderate', value: 0.6 },
  { label: 'Severe', value: 0.85 },
  { label: 'Full', value: 1.0 },
];

// Cap processing size — keeps per-pixel work under ~2MP so slider changes feel live.
const MAX_DIMENSION = 1400;

// Procedural test chart: hue×lightness grid plus classic confusion pairs,
// so the lens is demonstrable before the user uploads anything.
function drawSampleChart(): HTMLCanvasElement {
  const w = 960, h = 640;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  // Hue × lightness grid (top two thirds)
  const cols = 18, rows = 6;
  const cw = w / cols, ch = (h * 0.62) / rows;
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      const hue = (x / cols) * 360;
      const light = 30 + (y / (rows - 1)) * 45;
      ctx.fillStyle = `hsl(${hue}, 85%, ${light}%)`;
      ctx.fillRect(x * cw, y * ch, Math.ceil(cw), Math.ceil(ch));
    }
  }

  // Confusable pairs (bottom third): red/green, orange/yellow-green, blue/purple
  const pairs = [
    ['#c0392b', '#27ae60'],
    ['#e67e22', '#9acd32'],
    ['#2e6fdb', '#7d3fbf'],
    ['#8b4513', '#556b2f'],
  ];
  const py = h * 0.66, ph = h * 0.30;
  const pw = w / pairs.length;
  pairs.forEach(([a, b], i) => {
    ctx.fillStyle = a;
    ctx.fillRect(i * pw + 12, py, pw - 24, ph / 2 - 6);
    ctx.fillStyle = b;
    ctx.fillRect(i * pw + 12, py + ph / 2 + 6, pw - 24, ph / 2 - 6);
  });
  return c;
}

export const VisionLensView: React.FC<VisionLensViewProps> = ({ isDarkMode }) => {
  const activeProfile = useActiveCVDProfile();
  const [source, setSource] = useState<HTMLImageElement | HTMLCanvasElement | null>(null);
  const [sourceName, setSourceName] = useState<string>('image');
  const [cvdType, setCvdType] = useState<CVDType>(activeProfile?.type ?? 'deuteranopia');
  const [severity, setSeverity] = useState(activeProfile?.severity ?? 1.0);

  // Adopt the profile live when it changes (e.g. header vision-mode picker)
  useEffect(() => {
    if (activeProfile) {
      setCvdType(activeProfile.type);
      setSeverity(activeProfile.severity);
    }
  }, [activeProfile?.type, activeProfile?.severity]);
  const [strength, setStrength] = useState(0.8);
  const [simulateView, setSimulateView] = useState(false);
  const [divider, setDivider] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const beforeCanvasRef = useRef<HTMLCanvasElement>(null);
  const afterCanvasRef = useRef<HTMLCanvasElement>(null);
  const compareRef = useRef<HTMLDivElement>(null);
  const sourceDataRef = useRef<ImageData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const panel = isDarkMode ? 'bg-[#221E18]' : 'bg-[#F5F1E8]';
  const inner = isDarkMode ? 'bg-[#1E1A15]' : 'bg-stone-100';
  const muted = isDarkMode ? 'text-stone-300' : 'text-[#2C2418]';
  const strong = isDarkMode ? 'text-[#F5F1E8]' : 'text-[#1A1A1A]';

  const loadFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please provide an image file.');
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setSource(img);
      setSourceName(file.name.replace(/\.[^.]+$/, '') || 'image');
      setError(null);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => setError('Could not read that image.');
    img.src = url;
  }, []);

  // Paste a screenshot straight from the clipboard — the fastest path from
  // "thing on the internet I can't read" to a corrected view.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (file) {
        e.preventDefault();
        loadFile(file);
        setSourceName('pasted-screenshot');
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [loadFile]);

  // Decode source → cached ImageData at capped resolution
  useEffect(() => {
    if (!source) { sourceDataRef.current = null; return; }
    const sw = source.width, sh = source.height;
    const scale = Math.min(1, MAX_DIMENSION / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const ctx = off.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(source, 0, 0, w, h);
    sourceDataRef.current = ctx.getImageData(0, 0, w, h);
    setDivider(50);
  }, [source]);

  // Re-render both panes whenever the profile or view mode changes
  useEffect(() => {
    const src = sourceDataRef.current;
    const before = beforeCanvasRef.current;
    const after = afterCanvasRef.current;
    if (!src || !before || !after) return;

    const { width: w, height: h } = src;
    before.width = w; before.height = h;
    after.width = w; after.height = h;

    const beforeData = new ImageData(new Uint8ClampedArray(src.data), w, h);
    const afterData = new ImageData(new Uint8ClampedArray(src.data), w, h);

    daltonizeImageData(afterData.data, cvdType, severity, strength);
    if (simulateView) {
      simulateImageData(beforeData.data, cvdType, severity);
      simulateImageData(afterData.data, cvdType, severity);
    }

    before.getContext('2d')!.putImageData(beforeData, 0, 0);
    after.getContext('2d')!.putImageData(afterData, 0, 0);
  }, [source, cvdType, severity, strength, simulateView]);

  const updateDivider = useCallback((clientX: number) => {
    const rect = compareRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDivider(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)));
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    const move = (e: PointerEvent) => updateDivider(e.clientX);
    const up = () => setIsDragging(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [isDragging, updateDivider]);

  const handleDownload = () => {
    const src = sourceDataRef.current;
    if (!src) return;
    const out = document.createElement('canvas');
    out.width = src.width; out.height = src.height;
    const data = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
    daltonizeImageData(data.data, cvdType, severity, strength);
    out.getContext('2d')!.putImageData(data, 0, 0);
    const a = document.createElement('a');
    a.download = `${sourceName}-corrected-${cvdType}.png`;
    a.href = out.toDataURL('image/png');
    a.click();
  };

  return (
    <div className={`flex flex-col gap-6 p-6 rounded-none border border-zinc-800 retro-shadow ${panel} min-h-[600px]`}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 flex items-center justify-center ${isDarkMode ? 'bg-zinc-800 text-zinc-100' : 'bg-zinc-900 text-white'}`}>
            <Glasses size={15} />
          </div>
          <div>
            <h2 className={`text-xs font-black uppercase tracking-widest ${strong}`}>Vision Lens</h2>
            <p className={`text-[10px] font-medium ${muted}`}>Recolor any image so the differences you can't see become ones you can.</p>
          </div>
        </div>
        {source && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSimulateView(v => !v)}
              className={`flex items-center gap-2 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest border transition-colors ${
                simulateView
                  ? isDarkMode ? 'bg-zinc-100 text-zinc-900 border-zinc-100' : 'bg-zinc-900 text-white border-zinc-900'
                  : isDarkMode ? 'border-zinc-700 text-zinc-400 hover:border-zinc-400' : 'border-zinc-300 text-zinc-500 hover:border-zinc-700'
              }`}
              title="Show both panes through the selected vision profile — proves the correction separates colors that used to collide"
            >
              <Eye size={12} />
              {simulateView ? 'Viewing as ' + CB_LABELS[cvdType] : 'View as ' + CB_LABELS[cvdType]}
            </button>
            <button
              onClick={handleDownload}
              className={`flex items-center gap-2 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest border border-zinc-800 transition-colors ${
                isDarkMode ? 'bg-[#2A241E] text-stone-300 hover:bg-[#2855A8] hover:text-white' : 'bg-stone-100 text-[#2C2418] hover:bg-[#2855A8] hover:text-white'
              }`}
            >
              <Download size={12} />
              Download
            </button>
            <button
              onClick={() => { setSource(null); setError(null); }}
              className={`p-1.5 border border-zinc-800 transition-colors ${isDarkMode ? 'text-stone-400 hover:text-white' : 'text-zinc-500 hover:text-black'}`}
              title="Clear image"
            >
              <X size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Dropzone / comparison area */}
      {!source ? (
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) loadFile(file);
          }}
          className={`flex-1 flex flex-col items-center justify-center gap-4 border-2 border-dashed ${isDarkMode ? 'border-zinc-700' : 'border-zinc-400'} p-12 min-h-[380px]`}
        >
          <Upload size={28} className={muted} />
          <div className="text-center space-y-1">
            <p className={`text-sm font-black uppercase tracking-widest ${strong}`}>Drop a screenshot or image</p>
            <p className={`text-[11px] font-medium ${muted} flex items-center gap-1.5 justify-center`}>
              <Clipboard size={11} /> or paste one from your clipboard (⌘V)
            </p>
          </div>
          {error && <p className="text-xs font-bold text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest border border-zinc-800 transition-colors ${
                isDarkMode ? 'bg-[#2A241E] text-stone-200 hover:bg-[#2855A8] hover:text-white' : 'bg-stone-100 text-[#2C2418] hover:bg-[#2855A8] hover:text-white'
              }`}
            >
              Browse Files
            </button>
            <button
              onClick={() => { setSource(drawSampleChart()); setSourceName('test-chart'); }}
              className={`flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest border border-zinc-800 transition-colors ${
                isDarkMode ? 'text-stone-300 hover:bg-[#2A241E]' : 'text-[#2C2418] hover:bg-zinc-900 hover:text-white'
              }`}
            >
              <Wand2 size={12} />
              Try Test Chart
            </button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f); }} />
        </div>
      ) : (
        <div className="space-y-2">
          <div
            ref={compareRef}
            className="relative w-full border border-zinc-800 overflow-hidden select-none touch-none cursor-ew-resize"
            onPointerDown={e => { setIsDragging(true); updateDivider(e.clientX); }}
          >
            <canvas ref={beforeCanvasRef} className="block w-full h-auto" />
            <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${divider}%)` }}>
              <canvas ref={afterCanvasRef} className="block w-full h-auto" />
            </div>
            {/* Divider handle */}
            <div className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)]" style={{ left: `${divider}%` }}>
              <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-7 h-7 bg-white border-2 border-zinc-900 flex items-center justify-center">
                <Sliders size={12} className="text-zinc-900 rotate-90" />
              </div>
            </div>
            {/* Pane labels */}
            <span className="absolute top-2 left-2 px-2 py-1 text-[9px] font-black uppercase tracking-widest bg-black/70 text-white pointer-events-none">
              {simulateView ? 'Original · as you see it' : 'Original'}
            </span>
            <span className="absolute top-2 right-2 px-2 py-1 text-[9px] font-black uppercase tracking-widest bg-[#2855A8] text-white pointer-events-none">
              {simulateView ? 'Corrected · as you see it' : 'Corrected'}
            </span>
          </div>
          <p className={`text-[10px] font-medium ${muted}`}>Drag the divider to compare. Left is untouched; right is recolored for {CB_LABELS[cvdType].toLowerCase()}.</p>
        </div>
      )}

      {/* Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Vision type */}
        <div className={`p-4 border border-zinc-800 ${inner} space-y-3`}>
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-black uppercase tracking-widest ${strong}`}>Vision Type</span>
            {activeProfile && (
              cvdType === activeProfile.type && Math.abs(severity - activeProfile.severity) < 0.01 ? (
                <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 ${isDarkMode ? 'bg-green-900/40 text-green-300' : 'bg-green-100 text-green-800'}`}>
                  ✓ My Profile
                </span>
              ) : (
                <button
                  onClick={() => { setCvdType(activeProfile.type); setSeverity(activeProfile.severity); }}
                  className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 border transition-colors ${
                    isDarkMode ? 'border-zinc-600 text-stone-300 hover:border-zinc-300' : 'border-zinc-400 text-zinc-600 hover:border-zinc-800 hover:text-zinc-900'
                  }`}
                >
                  Use My Profile
                </button>
              )
            )}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {CVD_TYPES.map(type => (
              <button
                key={type}
                onClick={() => setCvdType(type)}
                className={`py-2 px-2 text-[9px] font-black uppercase tracking-wider border transition-colors ${
                  cvdType === type
                    ? isDarkMode ? 'bg-zinc-100 text-zinc-900 border-zinc-100' : 'bg-zinc-900 text-white border-zinc-900'
                    : isDarkMode ? 'border-zinc-700 text-zinc-400 hover:border-zinc-400' : 'border-zinc-300 text-zinc-500 hover:border-zinc-700'
                }`}
              >
                {CB_LABELS[type]}
              </button>
            ))}
          </div>
          <p className={`text-[10px] leading-relaxed font-medium ${muted}`}>{CB_DESCRIPTIONS[cvdType]}</p>
          <AnimatePresence>
            {cvdType === 'achromatopsia' && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`flex items-start gap-2 p-2.5 border border-dashed ${isDarkMode ? 'border-zinc-700' : 'border-zinc-400'}`}
              >
                <Info size={12} className="shrink-0 mt-0.5 text-blue-400" />
                <p className={`text-[10px] leading-relaxed font-medium ${muted}`}>
                  With no surviving hue channel, correction here encodes hue as brightness:
                  warm colors lighten, cool colors darken, so different colors stop reading as identical greys.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Severity + strength */}
        <div className={`p-4 border border-zinc-800 ${inner} space-y-4`}>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-black uppercase tracking-widest ${strong}`}>Severity</span>
              <span className={`text-[10px] font-mono font-bold ${muted}`}>{Math.round(severity * 100)}%</span>
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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-black uppercase tracking-widest ${strong}`}>Correction Strength</span>
              <span className={`text-[10px] font-mono font-bold ${muted}`}>{Math.round(strength * 100)}%</span>
            </div>
            <input
              type="range" min="0" max="1.5" step="0.05"
              value={strength}
              onChange={e => setStrength(parseFloat(e.target.value))}
              className={`w-full h-1.5 rounded-none appearance-none cursor-pointer ${isDarkMode ? 'accent-zinc-100' : 'accent-zinc-900'}`}
            />
            <p className={`text-[10px] leading-relaxed font-medium ${muted}`}>
              Higher strength separates confusable colors harder at the cost of natural-looking hues.
              Values past 100% overdrive the shift.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-3 pt-4 border-t border-zinc-800">
        <div className={`p-1.5 shrink-0 ${isDarkMode ? 'bg-blue-900/30 text-blue-300' : 'bg-blue-100 text-blue-700'}`}>
          <Info size={16} />
        </div>
        <p className={`text-[10px] leading-relaxed ${muted}`}>
          Simulation uses the physiologically-based Machado et&nbsp;al. (2009) model applied in linear RGB.
          Correction redistributes the color information your cone response misses into channels it keeps —
          set your type and severity, then tune strength until the confusable pairs in the test chart pull apart.
        </p>
      </div>
    </div>
  );
};
