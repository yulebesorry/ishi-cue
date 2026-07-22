/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Palette,
  RefreshCw,
  Sparkles,
  Info,
  Zap,
  Layout,
  Eye,
  Monitor,
  Smartphone,
  CreditCard,
  Sun,
  Moon,
  Disc,
  Download,
  Upload,
  ScanEye,
  Glasses,
  Crosshair,
  Grip,
  ChevronDown,
  Wand2,
  ShieldCheck,
  LayoutGrid
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Color from 'color';
import confetti from 'canvas-confetti';
import { ColorTheoryRule, PaletteColor } from './types';
import { generatePaletteFromRule, getColorName, simulateColorBlind, paletteConflicts, CB_LABELS } from './colorUtils';
import type { ColorBlindType } from './colorUtils';
import { assistMatrixValues } from './cvd';

const CB_TYPES: ColorBlindType[] = ['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'];
import { ColorWheelView } from './components/ColorWheelView';
import { AccessibilityView } from './components/AccessibilityView';
import { ColorSwatch } from './components/ColorSwatch';
import { ExportModal } from './components/ExportModal';
import { ImageColorPicker } from './components/ImageColorPicker';
import { IshiharaDemo } from './components/IshiharaDemo';
import { VisionLensView } from './components/VisionLensView';
import { CalibrateView } from './components/CalibrateView';
import { useVisionProfile } from './profile';
import { PatternOverlay } from './patterns';

const RULES: { id: ColorTheoryRule; name: string; description: string }[] = [
  { id: 'design-system', name: 'Design System', description: 'One Color → Full Design System. Generates 10 essential UI colors.' },
  { id: 'complementary', name: 'Complementary', description: 'Opposite colors on the wheel for high contrast.' },
  { id: 'analogous', name: 'Analogous', description: 'Adjacent colors for a harmonious, serene feel.' },
  { id: 'triadic', name: 'Triadic', description: 'Three evenly spaced colors for vibrant balance.' },
  { id: 'tetradic', name: 'Tetradic', description: 'Four colors in two complementary pairs.' },
  { id: 'monochromatic', name: 'Monochromatic', description: 'Variations in lightness and saturation of one hue.' },
  { id: 'split-complementary', name: 'Split Complementary', description: 'Base color plus two colors adjacent to its complement.' },
];

type ViewMode = 'palette' | 'preview' | 'wheel' | 'system' | 'image' | 'ishihara' | 'lens' | 'calibrate';
type AppMode = 'designer' | 'personal';

// The app splits into two audiences with different jobs: designers auditing
// and building color systems for colorblind/low-vision viewers, versus
// colorblind/low-vision people correcting what's in front of them right now.
// Each tab belongs to exactly one side.
const TABS: Record<AppMode, { id: ViewMode; label: string; icon: typeof Palette }[]> = {
  designer: [
    { id: 'palette', label: 'Palette', icon: Palette },
    { id: 'wheel', label: 'Wheel', icon: Disc },
    { id: 'preview', label: 'Preview', icon: Eye },
    { id: 'system', label: 'Accessibility', icon: ShieldCheck },
    { id: 'image', label: 'Image', icon: Upload },
    { id: 'ishihara', label: 'Plate Test', icon: ScanEye },
  ],
  personal: [
    { id: 'lens', label: 'Vision Lens', icon: Glasses },
    { id: 'calibrate', label: 'Calibrate', icon: Crosshair },
  ],
};

const LogoIcon = ({ size = 24, className = "" }: { size?: number, className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" className={className} style={{ minWidth: size, minHeight: size }}>
    {/* Crosshair guide lines */}
    <line x1="20" y1="0" x2="20" y2="40" stroke="#1A1A1A" strokeWidth="0.4" opacity="0.2" />
    <line x1="0" y1="20" x2="40" y2="20" stroke="#1A1A1A" strokeWidth="0.4" opacity="0.2" />

    {/* Outer orbit ring */}
    <circle cx="20" cy="20" r="18.5" fill="none" stroke="#1A1A1A" strokeWidth="0.6" opacity="0.3" />

    {/* Inner orbit ring */}
    <circle cx="20" cy="20" r="12" fill="none" stroke="#1A1A1A" strokeWidth="0.5" opacity="0.3" />

    {/* Bullseye — thick black ring */}
    <circle cx="20" cy="20" r="9" fill="#1A1A1A" />

    {/* Tick-mark ring inside bullseye */}
    <circle cx="20" cy="20" r="7.5" fill="none" stroke="#F5F1E8" strokeWidth="0.9" strokeDasharray="0.9 1.7" opacity="0.85" />

    {/* Inner cream circle */}
    <circle cx="20" cy="20" r="6.5" fill="#F5F1E8" />

    {/* Right half of inner circle — cobalt dial */}
    <path d="M20 13.5 A6.5 6.5 0 0 1 20 26.5 Z" fill="#2855A8" />

    {/* Orbiting dots — outer ring */}
    <circle cx="20" cy="1.5" r="2.2" fill="#1A1A1A" />
    <circle cx="36" cy="10" r="1.4" fill="#8B8478" />

    {/* Orbiting dots — inner ring */}
    <circle cx="9" cy="13" r="1.8" fill="#C8402A" />
    <circle cx="8" cy="26" r="1.6" fill="#B8860B" />
    <circle cx="25" cy="31" r="1.8" fill="#2855A8" />
  </svg>
);

export default function App() {
  const [baseColor, setBaseColor] = useState('#4f46e5');
  const [rule, setRule] = useState<ColorTheoryRule>('design-system');
  const [palette, setPalette] = useState<PaletteColor[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [appMode, setAppMode] = useState<AppMode>(() => {
    try { return (localStorage.getItem('ishi-q.appMode') as AppMode) || 'personal'; } catch { return 'personal'; }
  });
  const [viewMode, setViewMode] = useState<ViewMode>(() => (appMode === 'designer' ? 'palette' : 'lens'));
  const switchMode = (mode: AppMode) => {
    setAppMode(mode);
    setViewMode(TABS[mode][0].id);
    try { localStorage.setItem('ishi-q.appMode', mode); } catch { /* private mode */ }
  };
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isHighContrast, setIsHighContrast] = useState(() => {
    try { return localStorage.getItem('ishi-cue.highContrast') === 'on'; } catch { return false; }
  });
  const { profile, setProfile, clearProfile, patternsEnabled, setPatternsEnabled, assistEnabled, setAssistEnabled } = useVisionProfile();

  // High contrast swaps the cream paper for white + navy ink (see index.css)
  useEffect(() => {
    document.documentElement.classList.toggle('high-contrast', isHighContrast);
    try { localStorage.setItem('ishi-cue.highContrast', isHighContrast ? 'on' : 'off'); } catch { /* private mode */ }
  }, [isHighContrast]);

  // Site-wide "glasses" filter: daltonize everything below the header so the
  // colors the user confuses pull apart. One feColorMatrix, computed from
  // their profile.
  const hasCVDProfile = profile !== null && profile.type !== 'none';
  const assistActive = assistEnabled && hasCVDProfile;
  const assistValues = useMemo(
    () => (hasCVDProfile ? assistMatrixValues(profile!.type as ColorBlindType, profile!.severity) : null),
    [hasCVDProfile, profile?.type, profile?.severity],
  );
  const [showVisionMenu, setShowVisionMenu] = useState(false);
  const visionMenuRef = useRef<HTMLDivElement>(null);

  // Close the vision menu on outside click
  useEffect(() => {
    if (!showVisionMenu) return;
    const onDown = (e: MouseEvent) => {
      if (visionMenuRef.current && !visionMenuRef.current.contains(e.target as Node)) {
        setShowVisionMenu(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showVisionMenu]);

  // Quick-pick vision modes: plain-language types a visitor recognizes
  // themselves in; picking one adapts the whole app immediately.
  const VISION_MODES: { label: string; sub: string; type: ColorBlindType | 'none' }[] = [
    { label: 'Red-Green · Deuteranopia', sub: 'Most common — green looks red, red looks like a dull green.', type: 'deuteranopia' },
    { label: 'Red-Green · Protanopia', sub: 'Red-blind variant — reds appear dark and muted.', type: 'protanopia' },
    { label: 'Blue-Yellow · Tritanopia', sub: 'Less common — blues and yellows blur into other colors.', type: 'tritanopia' },
    { label: 'Monochromacy · Achromatopsia', sub: 'Rare — no color perception at all; contrast and texture do the work.', type: 'achromatopsia' },
    { label: 'Typical Vision', sub: 'No accommodation needed.', type: 'none' },
  ];

  const pickVisionMode = (type: ColorBlindType | 'none') => {
    if (type === 'none') {
      clearProfile();
    } else {
      // Manual pick, not screened: full severity is the safe accommodation
      // default; the Calibrate screener refines it.
      setProfile({ type, severity: 1.0, confidence: 'low', calibratedAt: new Date().toISOString() });
    }
    setShowVisionMenu(false);
  };

  // Initialize palette
  useEffect(() => {
    setPalette(prev => {
      const newPalette = generatePaletteFromRule(baseColor, rule, isDarkMode);
      
      // If switching to design-system, we want the full 10 colors regardless of locks
      if (rule === 'design-system') {
        return newPalette;
      }

      // For other rules, we want 5 colors and preserve locks if they exist
      if (prev.length > 0) {
        // Only take the first 5 colors from newPalette for standard rules
        const basePalette = newPalette.slice(0, 5);
        return basePalette.map((color, i) => {
          // If we had a locked color at this index, preserve it
          if (prev[i]?.isLocked) return prev[i];
          return color;
        });
      }
      
      return newPalette.slice(0, 5);
    });
  }, [baseColor, rule, isDarkMode]);

  const getColorByRole = (role: string) => {
    const color = palette.find(c => c.role === role);
    return color ? color.hex : (palette[0]?.hex || '#000000');
  };

  const handleCopy = (hex: string, index: number) => {
    navigator.clipboard.writeText(hex);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const updateColor = useCallback((index: number, updates: Partial<PaletteColor>) => {
    setPalette(prev => prev.map((c, i) => {
      if (i === index) {
        const newColor = { ...c, ...updates };
        if (updates.hex) {
          newColor.name = getColorName(updates.hex);
        }
        return newColor;
      }
      return c;
    }));
  }, []);

  const handleBaseColorChange = useCallback((hex: string) => {
    setBaseColor(hex);
  }, []);

  const generateShades = (hex: string) => {
    const base = Color(hex);
    const shades: PaletteColor[] = [
      { hex: base.lighten(0.4).hex(), name: getColorName(base.lighten(0.4).hex()), role: 'Highlight' },
      { hex: base.lighten(0.2).hex(), name: getColorName(base.lighten(0.2).hex()), role: 'Surface' },
      { hex: base.hex(), name: getColorName(base.hex()), role: 'Primary' },
      { hex: base.darken(0.2).hex(), name: getColorName(base.darken(0.2).hex()), role: 'Secondary' },
      { hex: base.darken(0.4).hex(), name: getColorName(base.darken(0.4).hex()), role: 'Background' },
    ];
    setPalette(shades);
    setBaseColor(hex);
  };

  const handleRandomize = () => {
    const randomHex = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
    setBaseColor(randomHex);
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.8 },
      colors: [randomHex]
    });
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDarkMode ? 'bg-[#1A1612] text-[#F5F1E8] dark' : 'bg-[#EDE8DC] text-[#1A1A1A]'} font-mono selection:bg-stone-200`}>
      {/* Paper grain texture overlay */}
      <div className="grain-overlay fixed inset-0 pointer-events-none z-[9998]" aria-hidden="true" />
      {/* Header */}
      <header className={`border-b border-zinc-800 ${isDarkMode ? 'bg-[#221E18]' : 'bg-[#F5F1E8]'} px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between sticky top-0 z-10`}>
        <div className="flex items-center gap-3 sm:gap-4">
          <LogoIcon size={42} className="shrink-0" />
          <div>
            <h1 className="text-3xl font-bold tracking-tighter uppercase leading-none font-display">
              ISHI Q
            </h1>
            <p className={`text-[10px] ${isDarkMode ? 'text-stone-300' : 'text-[#2C2418]'} font-black uppercase tracking-[0.2em]`}>Color tool · Accessible by design</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Retro Theme Slider */}
          <div className="flex items-center gap-2 sm:gap-3">
            <Sun size={12} className={`sm:w-[14px] sm:h-[14px] ${isDarkMode ? 'text-gray-600' : 'text-zinc-900'}`} />
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={`relative w-10 h-5 sm:w-12 sm:h-6 border-2 border-zinc-800 transition-colors ${isDarkMode ? 'bg-zinc-800' : 'bg-zinc-100'}`}
            >
              <div className={`absolute top-0.5 bottom-0.5 w-3 sm:w-4 bg-zinc-900 border border-zinc-700 transition-all duration-300 ${isDarkMode ? 'left-[22px] sm:left-[26px]' : 'left-0.5'}`} />
            </button>
            <Moon size={12} className={`sm:w-[14px] sm:h-[14px] ${isDarkMode ? 'text-zinc-100' : 'text-[#2C2418]'}`} />
          </div>
        </div>
      </header>

      {/* Assist filter definition — applied to main content when active */}
      {assistValues && (
        <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
          <defs>
            <filter id="icue-assist" colorInterpolationFilters="linearRGB">
              <feColorMatrix type="matrix" values={assistValues} />
            </filter>
          </defs>
        </svg>
      )}

      {/* Main Content */}
      <main
        className={`max-w-[1800px] mx-auto p-4 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-stretch`}
        style={assistActive ? { filter: 'url(#icue-assist)' } : undefined}
      >
        {/* Palette Display */}
        <section className={`${appMode === 'designer' ? 'lg:col-span-8' : 'lg:col-span-12'} flex flex-col gap-6`}>
          <div className="space-y-3 flex-none">
            {/* Top-level split: designers auditing/building color systems for
                colorblind & low-vision viewers, vs. colorblind/low-vision
                people correcting what's in front of them right now. These are
                different jobs for different people — every tab belongs to
                exactly one side, so the mode switch is the primary choice. */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => switchMode('designer')}
                className={`text-left p-3 rounded-none border transition-all flex items-start gap-2.5 ${
                  appMode === 'designer'
                    ? (isDarkMode ? 'border-[#F5F1E8] bg-[#2A241E] ring-1 ring-[#F5F1E8]' : 'border-[#2855A8] bg-[#EEF2FF] ring-1 ring-[#2855A8]')
                    : (isDarkMode ? 'border-zinc-800 hover:border-zinc-600 bg-[#1E1A15]' : 'border-zinc-800 hover:border-zinc-600 bg-stone-100/50')
                }`}
              >
                <LayoutGrid size={16} className={`shrink-0 mt-0.5 ${appMode === 'designer' ? 'text-[#2855A8]' : isDarkMode ? 'text-stone-400' : 'text-zinc-500'}`} />
                <div>
                  <div className={`text-xs font-black uppercase tracking-widest ${isDarkMode ? 'text-zinc-100' : 'text-zinc-900'}`}>Design Mode</div>
                  <div className={`text-[10px] mt-0.5 leading-tight font-medium ${isDarkMode ? 'text-stone-400' : 'text-[#4A3C34]'}`}>Build &amp; audit color systems for colorblind and low-vision users</div>
                </div>
              </button>
              <button
                onClick={() => switchMode('personal')}
                className={`text-left p-3 rounded-none border transition-all flex items-start gap-2.5 ${
                  appMode === 'personal'
                    ? (isDarkMode ? 'border-[#F5F1E8] bg-[#2A241E] ring-1 ring-[#F5F1E8]' : 'border-[#2855A8] bg-[#EEF2FF] ring-1 ring-[#2855A8]')
                    : (isDarkMode ? 'border-zinc-800 hover:border-zinc-600 bg-[#1E1A15]' : 'border-zinc-800 hover:border-zinc-600 bg-stone-100/50')
                }`}
              >
                <Glasses size={16} className={`shrink-0 mt-0.5 ${appMode === 'personal' ? 'text-[#2855A8]' : isDarkMode ? 'text-stone-400' : 'text-zinc-500'}`} />
                <div>
                  <div className={`text-xs font-black uppercase tracking-widest ${isDarkMode ? 'text-zinc-100' : 'text-zinc-900'}`}>Vision Mode</div>
                  <div className={`text-[10px] mt-0.5 leading-tight font-medium ${isDarkMode ? 'text-stone-400' : 'text-[#4A3C34]'}`}>See images and the web through your own color vision</div>
                </div>
              </button>
            </div>

            {/* Vision Tools — these adapt the app itself to your vision, so
                they only apply in Vision Mode. Design Mode audits a palette
                against CVD types with its own explicit tools instead. */}
            {appMode === 'personal' && (
              <div className={`${isDarkMode ? 'bg-[#221E18]' : 'bg-[#F5F1E8]'} p-3 rounded-none border border-zinc-800 retro-shadow space-y-2`}>
                <span className={`text-[9px] font-bold uppercase tracking-widest ${isDarkMode ? 'text-stone-300' : 'text-[#2C2418]'}`}>Vision Tools</span>
                <div className="flex flex-wrap gap-1.5">
                  {/* Vision mode picker: tell us how you see, the site adapts */}
                  <div ref={visionMenuRef} className="relative">
                    <button
                      onClick={() => setShowVisionMenu(v => !v)}
                      title="Pick your color vision type and the whole site adapts"
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest border border-zinc-800 transition-colors ${
                        profile
                          ? (isDarkMode ? 'bg-[#2A241E] text-stone-200 hover:bg-[#F5F1E8] hover:text-[#1A1A1A]' : 'bg-[#EEF2FF] text-[#2855A8] hover:bg-[#2855A8] hover:text-white')
                          : (isDarkMode ? 'text-stone-300 hover:bg-[#2A241E]' : 'text-[#2C2418] hover:bg-zinc-900 hover:text-white')
                      }`}
                    >
                      <Crosshair size={11} />
                      {profile
                        ? (profile.type === 'none' ? 'Typical Vision' : `${CB_LABELS[profile.type]} · ${Math.round(profile.severity * 100)}%`)
                        : 'My Vision'}
                      <ChevronDown size={10} className={`transition-transform ${showVisionMenu ? 'rotate-180' : ''}`} />
                    </button>

                    <AnimatePresence>
                      {showVisionMenu && (
                        <motion.div
                          initial={{ opacity: 0, y: 6, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 6, scale: 0.98 }}
                          className={`absolute left-0 top-full mt-2 w-80 border border-zinc-800 retro-shadow z-50 ${isDarkMode ? 'bg-[#221E18]' : 'bg-[#F5F1E8]'}`}
                        >
                          <div className={`px-4 py-3 border-b border-zinc-800`}>
                            <p className={`text-[10px] font-black uppercase tracking-widest ${isDarkMode ? 'text-[#F5F1E8]' : 'text-[#1A1A1A]'}`}>How do you see color?</p>
                            <p className={`text-[9px] mt-0.5 font-medium leading-relaxed ${isDarkMode ? 'text-stone-400' : 'text-[#4A3C34]'}`}>
                              Pick the closest match — colors, contrast, and patterns across the site adjust for you.
                            </p>
                          </div>
                          {VISION_MODES.map(mode => {
                            const isActive = profile ? profile.type === mode.type : mode.type === 'none';
                            return (
                              <button
                                key={mode.type}
                                onClick={() => pickVisionMode(mode.type)}
                                className={`w-full text-left px-4 py-2.5 border-b border-zinc-800/50 transition-colors group ${
                                  isActive
                                    ? (isDarkMode ? 'bg-[#2A241E]' : 'bg-[#EEF2FF]')
                                    : (isDarkMode ? 'hover:bg-[#2A241E]' : 'hover:bg-stone-200/60')
                                }`}
                              >
                                <span className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-wider ${isDarkMode ? 'text-stone-100' : 'text-[#1A1A1A]'}`}>
                                  {mode.label}
                                  {isActive && <span className="text-[8px] px-1.5 py-0.5 bg-[#2855A8] text-white tracking-widest">Active</span>}
                                </span>
                                <span className={`block mt-0.5 text-[9px] font-medium leading-snug normal-case ${isDarkMode ? 'text-stone-400' : 'text-[#4A3C34]'}`}>
                                  {mode.sub}
                                </span>
                              </button>
                            );
                          })}
                          <button
                            onClick={() => { setShowVisionMenu(false); setViewMode('calibrate'); }}
                            className={`w-full flex items-center justify-between px-4 py-3 text-[9px] font-black uppercase tracking-widest transition-colors ${
                              isDarkMode ? 'text-stone-200 hover:bg-[#F5F1E8] hover:text-[#1A1A1A]' : 'text-[#2855A8] hover:bg-[#2855A8] hover:text-white'
                            }`}
                          >
                            <span className="flex items-center gap-1.5"><ScanEye size={11} /> Not sure? Take the 1-minute screening</span>
                            <span>→</span>
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  {/* Assist filter toggle — recolors the site through the user's corrective lens */}
                  {hasCVDProfile && (
                    <button
                      onClick={() => setAssistEnabled(!assistEnabled)}
                      title={assistActive
                        ? 'Assist on — the site is recolored so the colors you confuse pull apart. Click to see true colors.'
                        : 'Assist off — showing true colors. Click to recolor the site for your vision.'}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest border border-zinc-800 transition-colors ${
                        assistActive
                          ? 'bg-[#2855A8] text-white'
                          : (isDarkMode ? 'text-stone-300 hover:bg-[#2A241E]' : 'text-[#2C2418] hover:bg-zinc-900 hover:text-white')
                      }`}
                    >
                      <Wand2 size={11} />
                      Assist · {assistActive ? 'On' : 'Off'}
                    </button>
                  )}
                  {/* Pattern overlay toggle — texture as a second channel for color identity */}
                  <button
                    onClick={() => setPatternsEnabled(!patternsEnabled)}
                    title={patternsEnabled ? 'Pattern overlays on — each palette color carries a unique texture' : 'Turn on pattern overlays so colors are tellable apart by texture, not just hue'}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest border border-zinc-800 transition-colors ${
                      patternsEnabled
                        ? (isDarkMode ? 'bg-[#F5F1E8] text-[#1A1A1A]' : 'bg-zinc-900 text-white')
                        : (isDarkMode ? 'text-stone-300 hover:bg-[#2A241E]' : 'text-[#2C2418] hover:bg-zinc-900 hover:text-white')
                    }`}
                  >
                    <Grip size={11} />
                    Patterns · {patternsEnabled ? 'On' : 'Off'}
                  </button>
                  {/* High contrast: white paper + navy ink, max luminance contrast */}
                  <button
                    onClick={() => setIsHighContrast(v => !v)}
                    title="High contrast — white background with navy ink (17:1) instead of cream"
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest border border-zinc-800 transition-colors ${
                      isHighContrast
                        ? (isDarkMode ? 'bg-[#F5F1E8] text-[#1A1A1A]' : 'bg-zinc-900 text-white')
                        : (isDarkMode ? 'text-stone-300 hover:bg-[#2A241E]' : 'text-[#2C2418] hover:bg-zinc-900 hover:text-white')
                    }`}
                  >
                    <span className="w-2.5 h-2.5 border border-current" style={{ background: 'linear-gradient(135deg, currentColor 50%, transparent 50%)' }} aria-hidden="true" />
                    Contrast · {isHighContrast ? 'On' : 'Off'}
                  </button>
                </div>
              </div>
            )}

            <div className={`flex flex-col sm:flex-row items-stretch sm:items-center justify-between ${isDarkMode ? 'bg-[#221E18]' : 'bg-[#F5F1E8]'} p-2 rounded-none border border-zinc-800 retro-shadow gap-3`}>
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-1 w-full">
                {TABS[appMode].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setViewMode(tab.id)}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-none text-sm font-bold transition-all ${
                      viewMode === tab.id
                        ? (isDarkMode ? 'bg-[#F5F1E8] text-[#1A1A1A]' : 'bg-[#2855A8] text-white')
                        : (isDarkMode ? 'text-stone-100 hover:bg-[#2A241E]' : 'text-zinc-900 hover:bg-zinc-900 hover:text-white')
                    }`}
                  >
                    <tab.icon size={16} />
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {appMode === 'designer' && (
              <div className={`${isDarkMode ? 'bg-[#221E18]' : 'bg-[#F5F1E8]'} px-4 py-2.5 rounded-none border border-zinc-800 retro-shadow flex items-center gap-3`}>
                <div
                  className="w-4 h-4 rounded-none shrink-0 border border-black/20"
                  style={{ backgroundColor: baseColor }}
                />
                <div className="flex flex-col min-w-0">
                  <span className={`text-[9px] font-bold uppercase tracking-widest leading-none mb-0.5 ${isDarkMode ? 'text-stone-300' : 'text-[#2C2418]'}`}>Theory Mode</span>
                  <span className={`text-xs font-black ${isDarkMode ? 'text-zinc-100' : 'text-zinc-900'} uppercase tracking-[0.12em] leading-none truncate`}>
                    {rule.replace(/-/g, ' ')}
                  </span>
                </div>
                <div className={`ml-auto text-[10px] font-mono font-bold ${isDarkMode ? 'text-stone-300' : 'text-[#2C2418]'} shrink-0`}>
                  {baseColor.toUpperCase()}
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 flex flex-col min-h-0">
            <AnimatePresence mode="wait">
              {viewMode === 'palette' ? (
                <motion.div
                  key="palette-view"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex flex-col gap-6 flex-1"
                >
                  <div className={`grid grid-cols-5 ${rule === 'design-system' ? 'grid-rows-2 gap-y-8 sm:gap-y-12 min-h-[340px]' : 'min-h-[170px]'} gap-x-2 sm:gap-x-4 gap-y-4 flex-1`}>
                    {palette.map((color, i) => (
                      <ColorSwatch
                        key={`${i}-${color.hex}`}
                        color={color}
                        index={i}
                        isDarkMode={isDarkMode}
                        onUpdate={updateColor}
                        onCopy={handleCopy}
                        isCopied={copiedIndex === i}
                        onGenerateShades={generateShades}
                      />
                    ))}
                  </div>

                  {/* Colorblind check strip */}
                  <div className={`${isDarkMode ? 'bg-[#221E18]' : 'bg-[#F5F1E8]'} border border-zinc-800 p-4 space-y-6`}>
                    <p className={`text-xs font-black uppercase tracking-widest ${isDarkMode ? 'text-stone-300' : 'text-[#2C2418]'}`}>Colorblind Check</p>
                    {CB_TYPES.map(type => {
                      const conflicts = paletteConflicts(palette, type);
                      const ok = conflicts.length === 0;
                      return (
                        <div key={type} className="flex items-center gap-3">
                          <span className={`text-[11px] font-bold uppercase tracking-wider w-28 shrink-0 ${isDarkMode ? 'text-stone-300' : 'text-[#2C2418]'}`}>
                            {CB_LABELS[type]}
                          </span>
                          <div className="flex h-9 flex-1 border border-zinc-800 overflow-hidden">
                            {palette.map((c, i) => {
                              const sim = simulateColorBlind(c.hex, type);
                              return (
                                <div key={i} className="flex-1 h-full relative"
                                  style={{ backgroundColor: sim }}>
                                  {patternsEnabled && <PatternOverlay index={i} hex={sim} />}
                                </div>
                              );
                            })}
                          </div>
                          <span className={`text-xs font-black uppercase shrink-0 flex items-center gap-1 w-20 ${ok ? (isDarkMode ? 'text-green-400' : 'text-green-700') : (isDarkMode ? 'text-amber-300' : 'text-amber-800')}`}>
                            {ok ? '✓ Good' : `⚠ ${conflicts.length} conflict${conflicts.length > 1 ? 's' : ''}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              ) : viewMode === 'preview' ? (
                <motion.div
                  key="mockup-view"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1"
                >
                  {/* ... Landing Page Mockup ... */}
                  <div className={`${isDarkMode ? 'bg-[#221E18]' : 'bg-[#F5F1E8]'} rounded-none border border-zinc-800 retro-shadow overflow-hidden flex flex-col`}>
                    <div className={`p-4 border-b border-zinc-800 flex items-center gap-2 ${isDarkMode ? 'bg-[#1E1A15]/80' : 'bg-stone-200/50'}`}>
                      <Monitor size={14} className="text-gray-400" />
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Landing Page Hero</span>
                    </div>
                    <div className="p-8 space-y-6 flex-1 flex flex-col justify-center" style={{ backgroundColor: getColorByRole('Primary') + '10' }}>
                      <div className="space-y-2">
                        <div className="h-2 w-20 rounded-none" style={{ backgroundColor: getColorByRole('Secondary') }} />
                        <h4 className={`text-3xl font-bold leading-tight ${isDarkMode ? 'text-white' : 'text-zinc-900'}`} style={{ color: getColorByRole('Primary') }}>
                          Design your future <br /> with ChromaTheory.
                        </h4>
                        <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'} max-w-xs`}>
                          The ultimate tool for designers to create, manage, and deploy beautiful color systems.
                        </p>
                      </div>
                      <div className="flex gap-3">
                        <button className="px-6 py-2.5 rounded-none text-sm font-bold shadow-none" style={{ backgroundColor: getColorByRole('Primary'), color: '#fff' }}>
                          Get Started
                        </button>
                        <button className={`px-6 py-2.5 rounded-none text-sm font-bold border ${isDarkMode ? 'border-zinc-700' : 'border-zinc-800'}`} style={{ borderColor: getColorByRole('Accent'), color: getColorByRole('Accent') }}>
                          Learn More
                        </button>
                      </div>
                      <div className="pt-4 flex gap-4">
                        {['Secondary', 'Accent', 'Surface'].map(role => (
                          <div key={role} className="w-10 h-10 rounded-none border border-zinc-800" style={{ backgroundColor: getColorByRole(role) }} />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Mobile App Mockup */}
                  <div className={`${isDarkMode ? 'bg-[#221E18]' : 'bg-[#F5F1E8]'} rounded-none border border-zinc-800 retro-shadow overflow-hidden flex flex-col`}>
                    <div className={`p-4 border-b border-zinc-800 flex items-center gap-2 ${isDarkMode ? 'bg-[#1E1A15]/80' : 'bg-stone-200/50'}`}>
                      <Smartphone size={14} className="text-gray-400" />
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Mobile Dashboard</span>
                    </div>
                    <div className={`p-6 space-y-6 flex-1 ${isDarkMode ? 'bg-[#1A1612]' : 'bg-stone-100'}`}>
                      <div className="flex items-center justify-between">
                        <div className={`w-10 h-10 rounded-none ${isDarkMode ? 'bg-zinc-800' : 'bg-gray-200'} border border-zinc-800`} />
                        <div className={`w-8 h-8 rounded-none ${isDarkMode ? 'bg-[#221E18]' : 'bg-[#F5F1E8]'} shadow-none border border-zinc-800 flex items-center justify-center`}>
                          <RefreshCw size={14} style={{ color: getColorByRole('Primary') }} />
                        </div>
                      </div>
                      <div className={`${isDarkMode ? 'bg-[#221E18]' : 'bg-[#F5F1E8]'} p-6 rounded-none shadow-none space-y-4 border border-zinc-800`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-gray-400 uppercase">Total Balance</span>
                          <CreditCard size={16} style={{ color: getColorByRole('Secondary') }} />
                        </div>
                        <div className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-zinc-900'}`} style={{ color: getColorByRole('Primary') }}>$12,450.00</div>
                        <div className="flex gap-1">
                          {['Primary', 'Secondary', 'Accent', 'Surface', 'Background'].map(role => (
                            <div key={role} className="h-1 flex-1 rounded-none" style={{ backgroundColor: getColorByRole(role) }} />
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-4 rounded-none text-white shadow-none border border-zinc-800" style={{ backgroundColor: getColorByRole('Accent') }}>
                          <div className="text-[10px] font-bold opacity-80 uppercase">Savings</div>
                          <div className="text-lg font-bold">$2,400</div>
                        </div>
                        <div className="p-4 rounded-none text-white shadow-none border border-zinc-800" style={{ backgroundColor: getColorByRole('Surface') }}>
                          <div className="text-[10px] font-bold opacity-80 uppercase">Invested</div>
                          <div className="text-lg font-bold">$8,100</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card Mockup */}
                  <div className={`${isDarkMode ? 'bg-[#221E18]' : 'bg-[#F5F1E8]'} rounded-none border border-zinc-800 retro-shadow overflow-hidden flex flex-col md:col-span-2`}>
                    <div className={`p-4 border-b border-zinc-800 flex items-center gap-2 ${isDarkMode ? 'bg-[#1E1A15]/80' : 'bg-stone-200/50'}`}>
                      <Layout size={14} className="text-gray-400" />
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Component Preview</span>
                    </div>
                    <div className="p-6 sm:p-8 grid grid-cols-1 sm:grid-cols-3 gap-6">
                      <div className={`p-5 border border-zinc-800 ${isDarkMode ? 'bg-[#1A1612]' : 'bg-stone-100'} flex flex-col h-full`}>
                        <div className="aspect-video rounded-none shadow-none border border-zinc-800 mb-4" style={{ backgroundColor: getColorByRole('Secondary') }} />
                        <div className="space-y-2 mb-6 flex-1">
                          <div className="h-4 w-3/4 rounded-none" style={{ backgroundColor: getColorByRole('Primary') + '20' }} />
                          <div className={`h-2.5 w-full rounded-none ${isDarkMode ? 'bg-zinc-800' : 'bg-gray-200'}`} />
                          <div className={`h-2.5 w-1/2 rounded-none ${isDarkMode ? 'bg-zinc-800' : 'bg-gray-200'}`} />
                        </div>
                        <button className="w-full py-2.5 rounded-none text-[10px] font-bold uppercase tracking-widest text-white shadow-none border border-zinc-800" style={{ backgroundColor: getColorByRole('Primary') }}>
                          Action
                        </button>
                      </div>

                      <div className={`${isDarkMode ? 'bg-[#1A1612]' : 'bg-stone-100'} p-5 border border-zinc-800 flex flex-col items-center text-center h-full`}>
                        <div className="w-12 h-12 rounded-none flex items-center justify-center border border-zinc-800 mb-4 mt-2" style={{ backgroundColor: getColorByRole('Background') + '20' }}>
                          <Sparkles size={24} style={{ color: getColorByRole('Background') }} />
                        </div>
                        <div className="space-y-1 mb-6 flex-1">
                          <h5 className={`text-xs font-bold uppercase tracking-tight ${isDarkMode ? 'text-white' : 'text-zinc-900'}`} style={{ color: getColorByRole('Primary') }}>Premium Access</h5>
                          <p className="text-[10px] text-gray-500 leading-tight">Get exclusive color sets and advanced tools.</p>
                        </div>
                        <button className="w-full py-2.5 rounded-none text-[10px] font-bold uppercase tracking-widest text-white shadow-none border border-zinc-800" style={{ backgroundColor: getColorByRole('Secondary') }}>
                          Upgrade Now
                        </button>
                      </div>

                      <div className={`p-5 border border-zinc-800 ${isDarkMode ? 'bg-[#1A1612]' : 'bg-stone-100'} flex flex-col h-full space-y-4`}>
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] font-bold uppercase tracking-widest ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>Project Status</span>
                          <div className="px-2 py-0.5 text-[8px] font-bold uppercase tracking-tighter text-white" style={{ backgroundColor: getColorByRole('Accent') }}>Active</div>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex justify-between items-end">
                            <span className="text-[9px] text-gray-500 uppercase font-medium">Progress</span>
                            <span className={`text-[10px] font-bold ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>74%</span>
                          </div>
                          <div className={`h-1.5 w-full rounded-none ${isDarkMode ? 'bg-zinc-800' : 'bg-gray-200'} overflow-hidden`}>
                            <div className="h-full" style={{ width: '74%', backgroundColor: getColorByRole('Primary') }} />
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 pt-2">
                          <div className="px-2 py-1 text-[8px] font-bold border border-zinc-800" style={{ color: getColorByRole('Primary'), backgroundColor: getColorByRole('Primary') + '10' }}>DESIGN</div>
                          <div className="px-2 py-1 text-[8px] font-bold border border-zinc-800" style={{ color: getColorByRole('Secondary'), backgroundColor: getColorByRole('Secondary') + '10' }}>SYSTEM</div>
                          <div className="px-2 py-1 text-[8px] font-bold border border-zinc-800" style={{ color: getColorByRole('Accent'), backgroundColor: getColorByRole('Accent') + '10' }}>UI/UX</div>
                        </div>

                        <div className="flex-1" />
                        
                        <div className="pt-4 border-t border-zinc-800/50 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-none border border-zinc-800 shrink-0" style={{ backgroundColor: getColorByRole('Surface') }} />
                          <div className="flex-1 space-y-1">
                            <div className="h-1.5 w-1/2 rounded-none" style={{ backgroundColor: getColorByRole('Primary') + '40' }} />
                            <div className={`h-1 w-full rounded-none ${isDarkMode ? 'bg-zinc-800' : 'bg-gray-200'}`} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : viewMode === 'wheel' ? (
                <motion.div
                  key="wheel-view"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex-1"
                >
                  <ColorWheelView 
                    palette={palette} 
                    isDarkMode={isDarkMode} 
                    onUpdate={updateColor}
                    onBaseColorChange={handleBaseColorChange}
                  />
                </motion.div>
              ) : viewMode === 'system' ? (
                <motion.div
                  key="accessibility-view"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex-1"
                >
                  <AccessibilityView palette={palette} isDarkMode={isDarkMode} onUpdate={updateColor} />
                </motion.div>
              ) : viewMode === 'image' ? (
                <motion.div
                  key="image-view"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex-1"
                >
                  <ImageColorPicker
                    isDarkMode={isDarkMode}
                    onColorsExtracted={(colors) => {
                      setBaseColor(colors[0]);
                    }}
                  />
                </motion.div>
              ) : viewMode === 'ishihara' ? (
                <motion.div
                  key="ishihara-view"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex-1"
                >
                  <IshiharaDemo palette={palette} isDarkMode={isDarkMode} />
                </motion.div>
              ) : viewMode === 'lens' ? (
                <motion.div
                  key="lens-view"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex-1"
                >
                  <VisionLensView isDarkMode={isDarkMode} />
                </motion.div>
              ) : viewMode === 'calibrate' ? (
                <motion.div
                  key="calibrate-view"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex-1"
                >
                  <CalibrateView isDarkMode={isDarkMode} />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </section>

        {/* Sidebar Controls — palette-building UI, not relevant to the
            personal (Vision Lens / Calibrate) tools, so it only shows up
            alongside the designer tabs. */}
        {appMode === 'designer' && (
        <aside className="lg:col-span-4 flex flex-col">
          <section className={`${isDarkMode ? 'bg-[#221E18]' : 'bg-[#F5F1E8]'} p-6 rounded-none border border-zinc-800 retro-shadow space-y-6 h-full flex flex-col relative overflow-hidden`}>
            {/* Bauhaus dot grid decoration */}
            <div className="absolute top-0 right-0 w-20 h-20 dot-grid-decoration pointer-events-none" style={{ color: isDarkMode ? '#F5F1E8' : '#1A1A1A', opacity: 0.08 }} aria-hidden="true" />
            <div className="space-y-2 flex-none">
              <div className="flex items-center justify-between">
                <label className={`text-xs font-bold uppercase tracking-widest flex items-center gap-2 ${isDarkMode ? 'text-stone-300' : 'text-[#2C2418]'}`}>
                  <Zap size={14} className="text-[#2855A8]" />
                  Base Color
                </label>
                <button
                  onClick={() => setIsExportModalOpen(true)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-none text-[10px] font-bold uppercase tracking-widest border border-zinc-800 transition-all ${
                    isDarkMode
                      ? 'bg-[#2A241E] text-stone-300 hover:bg-[#2855A8] hover:text-white hover:border-[#2855A8]'
                      : 'bg-stone-100 text-[#2C2418] hover:bg-[#2855A8] hover:text-white hover:border-[#2855A8]'
                  }`}
                >
                  <Download size={11} />
                  Export
                </button>
              </div>
              <div className="flex gap-2">
                <div className="relative w-12 h-12 shrink-0 border border-zinc-800 overflow-hidden">
                  <input 
                    type="color" 
                    value={baseColor}
                    onChange={(e) => setBaseColor(e.target.value)}
                    className="absolute inset-[-10px] w-[calc(100%+20px)] h-[calc(100%+20px)] cursor-pointer"
                  />
                </div>
                <input 
                  type="text" 
                  value={baseColor.toUpperCase()}
                  onChange={(e) => setBaseColor(e.target.value)}
                  className={`w-32 px-3 rounded-none border border-zinc-800 font-mono text-base focus:ring-2 focus:ring-[#2855A8] outline-none ${isDarkMode ? 'bg-[#1E1A15] text-[#F5F1E8]' : 'bg-[#F5F1E8] text-[#1A1A1A]'}`}
                />
              </div>
            </div>

            <div className="space-y-3 flex-1 flex flex-col">
              <label className={`text-xs font-bold uppercase tracking-widest flex-none ${isDarkMode ? 'text-stone-300' : 'text-[#2C2418]'}`}>Theory Rule</label>
              <div className="grid grid-cols-2 gap-2 flex-1 content-start">
                {RULES.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setRule(r.id)}
                    className={`text-left p-3 rounded-none border transition-all flex flex-col justify-center min-h-[80px] ${
                      rule === r.id
                        ? (isDarkMode ? 'border-[#F5F1E8] bg-[#2A241E] ring-1 ring-[#F5F1E8]' : 'border-[#2855A8] bg-[#EEF2FF] ring-1 ring-[#2855A8]')
                        : (isDarkMode ? 'border-zinc-800 hover:border-zinc-600 bg-[#1E1A15]' : 'border-zinc-800 hover:border-zinc-600 bg-stone-100/50')
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {rule === r.id && (
                        <div 
                          className="w-2 h-2 rounded-none shrink-0" 
                          style={{ backgroundColor: baseColor }}
                        />
                      )}
                      <div className={`text-[11px] sm:text-base leading-tight transition-all ${
                        rule === r.id 
                          ? (isDarkMode ? 'font-black text-zinc-100' : 'font-black text-zinc-900') 
                          : (isDarkMode ? 'font-bold text-stone-300' : 'font-bold text-[#2C2418]')
                      }`}>{r.name}</div>
                    </div>
                    <div className={`text-[10px] mt-1 leading-tight line-clamp-2 transition-colors ${
                      rule === r.id
                        ? (isDarkMode ? 'text-stone-300 font-semibold' : 'text-[#4A3C34] font-semibold')
                        : (isDarkMode ? 'text-stone-400 font-medium' : 'text-[#4A3C34] font-medium')
                    }`}>{r.description}</div>
                  </button>
                ))}

                {/* Randomize Button as a Grid Item */}
                <button
                  onClick={handleRandomize}
                  className={`text-left p-3 rounded-none border transition-all flex flex-col justify-center min-h-[80px] group ${
                    isDarkMode
                      ? 'border-zinc-800 hover:border-[#F5F1E8] bg-[#1E1A15] hover:bg-[#2A241E]'
                      : 'border-zinc-800 hover:border-[#2855A8] bg-stone-100/50 hover:bg-[#EEF2FF]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <RefreshCw size={14} className="shrink-0 group-hover:rotate-180 transition-transform duration-500" />
                    <div className={`text-[11px] sm:text-base font-bold leading-tight uppercase tracking-wider ${
                      isDarkMode ? 'text-zinc-100' : 'text-zinc-900'
                    }`}>Randomize</div>
                  </div>
                  <div className={`text-[10px] mt-1 leading-tight font-medium ${isDarkMode ? 'text-stone-400' : 'text-[#4A3C34]'}`}>
                    Generate a completely random base color and rule.
                  </div>
                </button>
              </div>
            </div>
          </section>
        </aside>
        )}
      </main>

      {/* Agent Settings Modal */}
      <ExportModal 
        isOpen={isExportModalOpen} 
        onClose={() => setIsExportModalOpen(false)} 
        palette={palette} 
        isDarkMode={isDarkMode} 
      />

      {/* Footer */}
      <footer className={`max-w-[1800px] mx-auto px-8 py-12 border-t border-zinc-800 mt-12 flex flex-col md:flex-row items-center justify-between gap-6 ${isDarkMode ? 'text-stone-400' : 'text-[#2C2418]'}`}>
        <div className="flex items-center gap-2 text-sm">
          <Info size={16} />
          <span>Colors generated using standard color theory algorithms.</span>
        </div>
        <div className="flex items-center gap-6 text-xs font-bold uppercase tracking-widest">
          <a href="#" className={`hover:${isDarkMode ? 'text-white' : 'text-zinc-900'} transition-colors`}>Documentation</a>
          <a href="#" className={`hover:${isDarkMode ? 'text-white' : 'text-zinc-900'} transition-colors`}>API Access</a>
          <a href="#" className={`hover:${isDarkMode ? 'text-white' : 'text-zinc-900'} transition-colors`}>Privacy</a>
        </div>
      </footer>
    </div>
  );
}
