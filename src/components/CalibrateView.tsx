import React, { useState, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Color from 'color';
import {
  Crosshair,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Trash2,
  Info,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { ConfusionAxis, AXIS_TO_TYPE, confusionPair, CVDType } from '../cvd';
import { CB_LABELS, CB_DESCRIPTIONS } from '../colorUtils';
import { PLATE_SIZE, buildDots, drawPlate, makeLCG, SCREENER_JITTER, Dot } from '../ishihara';
import { useVisionProfile, VisionProfile } from '../profile';

interface CalibrateViewProps {
  isDarkMode: boolean;
}

type Stage = 'intro' | 'test' | 'result';

export interface Trial {
  kind: 'control' | 'axis' | 'staircase';
  axis?: ConfusionAxis;
  t?: number;
  digit: string;
  seed: number;
  figure: string;
  bg: string;
}

export interface Answer {
  trial: Trial;
  response: string; // digit or 'none'
  correct: boolean;
}

const AXES: ConfusionAxis[] = ['protan', 'deutan', 'tritan'];
const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

// Classification contrasts: one comfortable, one faint — misses at either flag the axis.
const CLASS_LEVELS = [0.2, 0.11];
// Staircase contrasts, strong → faint. The faintest level you can read sets severity.
// The bottom level sits just above the typical-vision readability threshold.
const STAIR_LEVELS = [0.3, 0.21, 0.15, 0.105, 0.075];

/**
 * Map the faintest readable contrast to a severity estimate using the Machado
 * model itself: simulating our plate pairs shows the perceived contrast
 * fraction falls 1.0 → 0.53 → 0.26 → 0 at severities 0 → 0.3 → 0.6 → 1.0.
 * A viewer reads a plate when perceivedContrast ≥ threshold, so the smallest
 * readable t gives fraction ≈ θ/t (θ from the typical-vision threshold),
 * which we invert through that curve.
 */
function severityFromThreshold(tRead: number | null): number {
  if (tRead === null) return 1.0;
  const f = Math.min(1, 0.058 / tRead);
  const curve: [number, number][] = [[1, 0], [0.53, 0.3], [0.26, 0.6], [0, 1]]; // [fraction, severity]
  for (let i = 0; i < curve.length - 1; i++) {
    const [f1, s1] = curve[i], [f2, s2] = curve[i + 1];
    if (f <= f1 && f >= f2) return s1 + ((f1 - f) / (f1 - f2)) * (s2 - s1);
  }
  return f > 1 ? 0 : 1;
}

function pickDigit(rng: () => number, avoid?: string): string {
  let d = DIGITS[Math.floor(rng() * 10) % 10];
  if (d === avoid) d = DIGITS[(DIGITS.indexOf(d) + 3) % 10];
  return d;
}

// Grayish linear-RGB anchor with all channels safely inside ±t gamut headroom.
function pickBase(rng: () => number): [number, number, number] {
  return [0.36 + rng() * 0.2, 0.36 + rng() * 0.2, 0.36 + rng() * 0.2];
}

function buildTrials(runSeed: number): Trial[] {
  const rng = makeLCG(runSeed);
  const trials: Trial[] = [];

  // Controls: pure luminance contrast — readable with any color vision.
  for (let i = 0; i < 2; i++) {
    const hue = rng() * 360;
    trials.push({
      kind: 'control',
      digit: pickDigit(rng),
      seed: Math.floor(rng() * 1e9),
      figure: Color.hsv(hue, 22, 82).hex(),
      bg: Color.hsv(hue, 22, 46).hex(),
    });
  }

  for (const axis of AXES) {
    for (const t of CLASS_LEVELS) {
      const { figure, bg } = confusionPair(axis, pickBase(rng), t);
      trials.push({ kind: 'axis', axis, t, digit: pickDigit(rng), seed: Math.floor(rng() * 1e9), figure, bg });
    }
  }

  // Fisher–Yates shuffle so axis plates can't be anticipated
  for (let i = trials.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [trials[i], trials[j]] = [trials[j], trials[i]];
  }
  return trials;
}

function buildStaircase(axis: ConfusionAxis, runSeed: number): Trial[] {
  const rng = makeLCG(runSeed ^ 0x5f3759df);
  let prev: string | undefined;
  return STAIR_LEVELS.map(t => {
    const digit = pickDigit(rng, prev);
    prev = digit;
    const { figure, bg } = confusionPair(axis, pickBase(rng), t);
    return { kind: 'staircase' as const, axis, t, digit, seed: Math.floor(rng() * 1e9), figure, bg };
  });
}

export interface Analysis {
  type: CVDType | 'none';
  severity: number;
  confidence: VisionProfile['confidence'];
  axisMisses: Record<ConfusionAxis, number>;
  controlsMissed: number;
}

export function analyze(answers: Answer[]): Analysis {
  const controls = answers.filter(a => a.trial.kind === 'control');
  const controlsMissed = controls.filter(a => !a.correct).length;

  const axisMisses = { protan: 0, deutan: 0, tritan: 0 } as Record<ConfusionAxis, number>;
  for (const a of answers) {
    if (a.trial.kind === 'axis' && !a.correct) axisMisses[a.trial.axis!]++;
  }

  const stair = answers.filter(a => a.trial.kind === 'staircase');
  const totalMisses = axisMisses.protan + axisMisses.deutan + axisMisses.tritan;

  if (totalMisses === 0) {
    return { type: 'none', severity: 0, confidence: controlsMissed ? 'low' : 'high', axisMisses, controlsMissed };
  }

  // Severity: the faintest staircase plate read correctly sets the threshold.
  let severity = 1.0;
  if (stair.length > 0) {
    const readLevels = stair.filter(a => a.correct).map(a => a.trial.t!);
    const tMin = readLevels.length > 0 ? Math.min(...readLevels) : null;
    severity = Math.max(0.15, Math.min(1, severityFromThreshold(tMin)));
  }

  // Type: red-green axes are near-parallel, so misses on both are expected for
  // protans and deutans alike — the axis missed harder wins. Misses across all
  // three axes point at achromatopsia.
  let type: CVDType;
  const rg = axisMisses.protan + axisMisses.deutan;
  if (axisMisses.tritan >= 1 && rg >= 3 && totalMisses >= 5) {
    type = 'achromatopsia';
  } else if (axisMisses.tritan > Math.max(axisMisses.protan, axisMisses.deutan)) {
    type = 'tritanopia';
  } else if (axisMisses.protan > axisMisses.deutan) {
    type = 'protanopia';
  } else {
    type = 'deuteranopia';
  }

  // Confidence: controls must pass; a clean monotone staircase reads stronger.
  let confidence: VisionProfile['confidence'] = 'medium';
  if (controlsMissed > 0) confidence = 'low';
  else if (stair.length > 0) {
    const sorted = [...stair].sort((a, b) => b.trial.t! - a.trial.t!);
    let flips = 0;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].correct && !sorted[i - 1].correct) flips++;
    }
    confidence = flips === 0 ? 'high' : 'medium';
  }

  return { type, severity, confidence, axisMisses, controlsMissed };
}

function severityLabel(s: number): string {
  if (s < 0.2) return 'Minimal';
  if (s < 0.5) return 'Mild';
  if (s < 0.75) return 'Moderate';
  if (s < 0.9) return 'Severe';
  return 'Complete';
}

export const CalibrateView: React.FC<CalibrateViewProps> = ({ isDarkMode }) => {
  const { profile, setProfile, clearProfile } = useVisionProfile();
  const [stage, setStage] = useState<Stage>('intro');
  const [runSeed, setRunSeed] = useState(() => Date.now() & 0x7fffffff);
  const [trials, setTrials] = useState<Trial[]>([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const panel = isDarkMode ? 'bg-[#221E18]' : 'bg-[#F5F1E8]';
  const inner = isDarkMode ? 'bg-[#1E1A15]' : 'bg-stone-100';
  const muted = isDarkMode ? 'text-stone-300' : 'text-[#2C2418]';
  const strong = isDarkMode ? 'text-[#F5F1E8]' : 'text-[#1A1A1A]';

  const trial = trials[current];

  const dots: Dot[] = useMemo(() => {
    if (!trial) return [];
    return buildDots(trial.digit, trial.seed, trial.figure, trial.bg, SCREENER_JITTER);
  }, [trial]);

  // Plates render RAW — no simulation. The viewer's own eyes are the test.
  // Callback ref (not useEffect): AnimatePresence mounts the canvas after the
  // previous stage finishes exiting, which is later than effects fire.
  const plateRef = useCallback((node: HTMLCanvasElement | null) => {
    canvasRef.current = node;
    if (node && dots.length > 0) drawPlate(node, dots, 'normal', 0, isDarkMode);
  }, [dots, isDarkMode]);

  const start = useCallback(() => {
    const seed = Date.now() & 0x7fffffff;
    setRunSeed(seed);
    setTrials(buildTrials(seed));
    setCurrent(0);
    setAnswers([]);
    setAnalysis(null);
    setStage('test');
  }, []);

  const answer = useCallback((response: string) => {
    if (!trial) return;
    const record: Answer = { trial, response, correct: response === trial.digit };
    const nextAnswers = [...answers, record];
    setAnswers(nextAnswers);

    const isLast = current === trials.length - 1;
    if (!isLast) {
      setCurrent(c => c + 1);
      return;
    }

    const hasStaircase = trials.some(t => t.kind === 'staircase');
    const interim = analyze(nextAnswers);
    if (!hasStaircase && interim.type !== 'none') {
      // Classification flagged an axis — extend the run with its staircase.
      const axis = (Object.entries(interim.axisMisses) as [ConfusionAxis, number][])
        .sort((a, b) => b[1] - a[1])[0][0];
      const stair = buildStaircase(axis, runSeed);
      setTrials(ts => [...ts, ...stair]);
      setCurrent(c => c + 1);
      return;
    }

    setAnalysis(interim);
    setStage('result');
  }, [trial, answers, current, trials, runSeed]);

  const save = useCallback(() => {
    if (!analysis) return;
    setProfile({
      type: analysis.type,
      severity: Math.round(analysis.severity * 100) / 100,
      confidence: analysis.confidence,
      calibratedAt: new Date().toISOString(),
    });
    setStage('intro');
  }, [analysis, setProfile]);

  const phaseLabel = trial?.kind === 'staircase' ? 'Threshold' : 'Screening';

  return (
    <div className={`flex flex-col gap-6 p-6 rounded-none border border-zinc-800 retro-shadow ${panel} min-h-[600px]`}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 flex items-center justify-center ${isDarkMode ? 'bg-zinc-800 text-zinc-100' : 'bg-zinc-900 text-white'}`}>
          <Crosshair size={15} />
        </div>
        <div>
          <h2 className={`text-xs font-black uppercase tracking-widest ${strong}`}>Vision Calibration</h2>
          <p className={`text-[10px] font-medium ${muted}`}>A short plate screening that tunes the whole app to your eyes.</p>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {stage === 'intro' && (
          <motion.div key="intro" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-5 flex-1">
            {profile && (
              <div className={`p-4 border border-zinc-800 ${inner} flex items-center justify-between gap-4 flex-wrap`}>
                <div className="flex items-center gap-3">
                  <ShieldCheck size={18} className={isDarkMode ? 'text-green-400' : 'text-green-700'} />
                  <div>
                    <p className={`text-[11px] font-black uppercase tracking-widest ${strong}`}>
                      Current profile: {profile.type === 'none' ? 'No deficiency detected' : `${CB_LABELS[profile.type]} · ${severityLabel(profile.severity)} (${Math.round(profile.severity * 100)}%)`}
                    </p>
                    <p className={`text-[10px] font-medium ${muted}`}>
                      Calibrated {new Date(profile.calibratedAt).toLocaleDateString()} · confidence {profile.confidence}
                    </p>
                  </div>
                </div>
                <button
                  onClick={clearProfile}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest border border-zinc-800 transition-colors ${
                    isDarkMode ? 'text-stone-400 hover:text-red-400 hover:border-red-400' : 'text-zinc-500 hover:text-red-700 hover:border-red-700'
                  }`}
                >
                  <Trash2 size={11} /> Clear
                </button>
              </div>
            )}

            <div className={`p-5 border border-zinc-800 ${inner} space-y-4 flex-1`}>
              <p className={`text-sm font-bold leading-relaxed ${strong}`}>
                You'll see about 8–14 dot plates. Tap the digit you see in each one —
                or "I see nothing" if no digit stands out. Takes about a minute.
              </p>
              <ul className={`space-y-2 text-[11px] font-medium leading-relaxed ${muted}`}>
                <li className="flex gap-2"><ArrowRight size={12} className="shrink-0 mt-0.5" /> Plates are generated along cone-confusion axes: which ones vanish for you reveals your vision type.</li>
                <li className="flex gap-2"><ArrowRight size={12} className="shrink-0 mt-0.5" /> A second round fades the color contrast step by step to estimate how strong the deficiency is.</li>
                <li className="flex gap-2"><ArrowRight size={12} className="shrink-0 mt-0.5" /> Answer honestly — guessing wrong on purpose or squinting just skews your own profile.</li>
              </ul>
              <div className={`flex items-start gap-2 p-3 border border-dashed ${isDarkMode ? 'border-zinc-700' : 'border-zinc-400'}`}>
                <Info size={13} className="shrink-0 mt-0.5 text-blue-400" />
                <p className={`text-[10px] leading-relaxed font-medium ${muted}`}>
                  This is a screening estimate, not a medical diagnosis — results depend on your display.
                  For best accuracy set screen brightness to a comfortable high level and turn off
                  Night Shift / True Tone / blue-light filters first.
                </p>
              </div>
            </div>

            <button
              onClick={start}
              className={`w-full py-3.5 text-xs font-black uppercase tracking-[0.2em] border border-zinc-800 transition-colors ${
                isDarkMode ? 'bg-[#F5F1E8] text-[#1A1A1A] hover:bg-white' : 'bg-[#2855A8] text-white hover:bg-[#1e4285]'
              }`}
            >
              {profile ? 'Retake Screening' : 'Start Screening'}
            </button>
          </motion.div>
        )}

        {stage === 'test' && trial && (
          <motion.div key={`trial-${current}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-6 flex-1">
            {/* Progress */}
            <div className="w-full space-y-1.5">
              <div className="flex justify-between">
                <span className={`text-[9px] font-black uppercase tracking-widest ${muted}`}>{phaseLabel} · Plate {current + 1} of {trials.length}</span>
                <span className={`text-[9px] font-mono font-bold ${muted}`}>{Math.round((current / trials.length) * 100)}%</span>
              </div>
              <div className={`h-1.5 w-full border border-zinc-800 ${isDarkMode ? 'bg-zinc-900' : 'bg-white'}`}>
                <div className="h-full bg-[#2855A8] transition-all duration-300" style={{ width: `${(current / trials.length) * 100}%` }} />
              </div>
            </div>

            <canvas
              ref={plateRef}
              width={PLATE_SIZE}
              height={PLATE_SIZE}
              className="w-full max-w-[300px] aspect-square border border-zinc-800 retro-shadow"
            />

            <div className="space-y-3 w-full max-w-md">
              <p className={`text-center text-[11px] font-black uppercase tracking-widest ${strong}`}>Which digit do you see?</p>
              <div className="grid grid-cols-5 gap-1.5">
                {DIGITS.map(d => (
                  <button
                    key={d}
                    onClick={() => answer(d)}
                    className={`h-11 text-base font-black border transition-colors ${
                      isDarkMode
                        ? 'border-zinc-700 text-zinc-200 hover:bg-zinc-100 hover:text-zinc-900 hover:border-zinc-100'
                        : 'border-zinc-400 text-zinc-800 hover:bg-zinc-900 hover:text-white hover:border-zinc-900'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <button
                onClick={() => answer('none')}
                className={`w-full py-2.5 text-[10px] font-black uppercase tracking-widest border border-dashed transition-colors ${
                  isDarkMode ? 'border-zinc-600 text-stone-300 hover:border-zinc-300' : 'border-zinc-500 text-zinc-600 hover:border-zinc-900 hover:text-zinc-900'
                }`}
              >
                I see nothing
              </button>
            </div>
          </motion.div>
        )}

        {stage === 'result' && analysis && (
          <motion.div key="result" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-5 flex-1">
            <div className={`p-6 border border-zinc-800 ${inner} text-center space-y-3`}>
              {analysis.type === 'none' ? (
                <>
                  <CheckCircle2 size={32} className={`mx-auto ${isDarkMode ? 'text-green-400' : 'text-green-700'}`} />
                  <h3 className={`text-xl font-black uppercase tracking-widest ${strong}`}>No deficiency detected</h3>
                  <p className={`text-[11px] font-medium max-w-sm mx-auto leading-relaxed ${muted}`}>
                    You read every confusion-axis plate. Saving this profile keeps the app in standard mode.
                  </p>
                </>
              ) : (
                <>
                  <AlertCircle size={32} className={`mx-auto ${isDarkMode ? 'text-amber-300' : 'text-amber-700'}`} />
                  <h3 className={`text-xl font-black uppercase tracking-widest ${strong}`}>{CB_LABELS[analysis.type]}</h3>
                  <p className={`text-3xl font-black tabular-nums ${strong}`}>
                    {severityLabel(analysis.severity)} <span className="text-base">· {Math.round(analysis.severity * 100)}%</span>
                  </p>
                  <p className={`text-[11px] font-medium max-w-sm mx-auto leading-relaxed ${muted}`}>{CB_DESCRIPTIONS[analysis.type]}</p>
                </>
              )}
              <p className={`text-[9px] font-black uppercase tracking-widest ${muted}`}>
                Confidence: {analysis.confidence}
                {analysis.controlsMissed > 0 && ' · control plate missed — consider retaking'}
              </p>
            </div>

            {/* Axis breakdown */}
            <div className="grid grid-cols-3 gap-2">
              {AXES.map(axis => (
                <div key={axis} className={`p-3 border border-zinc-800 ${inner} text-center`}>
                  <p className={`text-[9px] font-black uppercase tracking-widest ${muted}`}>{CB_LABELS[AXIS_TO_TYPE[axis]]}</p>
                  <p className={`text-lg font-black ${analysis.axisMisses[axis] > 0 ? (isDarkMode ? 'text-amber-300' : 'text-amber-700') : (isDarkMode ? 'text-green-400' : 'text-green-700')}`}>
                    {analysis.axisMisses[axis]}/{CLASS_LEVELS.length}
                  </p>
                  <p className={`text-[8px] font-bold uppercase tracking-wider ${muted}`}>missed</p>
                </div>
              ))}
            </div>

            <div className="flex gap-2 mt-auto">
              <button
                onClick={save}
                className={`flex-1 py-3 text-[11px] font-black uppercase tracking-[0.15em] border border-zinc-800 transition-colors ${
                  isDarkMode ? 'bg-[#F5F1E8] text-[#1A1A1A] hover:bg-white' : 'bg-[#2855A8] text-white hover:bg-[#1e4285]'
                }`}
              >
                Save as My Profile
              </button>
              <button
                onClick={start}
                className={`flex items-center justify-center gap-2 px-5 py-3 text-[11px] font-black uppercase tracking-widest border border-zinc-800 transition-colors ${
                  isDarkMode ? 'text-stone-300 hover:bg-[#2A241E]' : 'text-[#2C2418] hover:bg-zinc-900 hover:text-white'
                }`}
              >
                <RefreshCw size={12} /> Retake
              </button>
            </div>
            <p className={`text-[9px] leading-relaxed text-center ${muted}`}>
              Screening estimate only — display color accuracy affects results. Not a medical diagnosis.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
