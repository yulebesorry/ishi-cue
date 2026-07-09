import React, { createContext, useContext, useState, useCallback } from 'react';
import { CVDType } from './cvd';

/**
 * The user's calibrated vision profile — the thing that turns this app from
 * a simulator for designers into a tool tuned to its actual user.
 * `type: 'none'` means "screened, no deficiency detected"; a null profile
 * means "never calibrated".
 */
export interface VisionProfile {
  type: CVDType | 'none';
  severity: number; // 0–1
  confidence: 'low' | 'medium' | 'high';
  calibratedAt: string; // ISO date
}

const STORAGE_KEY = 'ishi-cue.visionProfile';
const PATTERNS_KEY = 'ishi-cue.patterns'; // 'on' | 'off'; absent = auto
const ASSIST_KEY = 'ishi-cue.assist';     // 'on' | 'off'; absent = auto

function load(): VisionProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p?.type === 'string' && typeof p?.severity === 'number') return p;
    return null;
  } catch {
    return null;
  }
}

function loadOverride(key: string): boolean | null {
  try {
    const raw = localStorage.getItem(key);
    return raw === 'on' ? true : raw === 'off' ? false : null;
  } catch {
    return null;
  }
}

interface VisionProfileContextValue {
  profile: VisionProfile | null;
  setProfile: (p: VisionProfile) => void;
  clearProfile: () => void;
  /** Trello-style texture overlays on color surfaces. Auto-on for CVD profiles. */
  patternsEnabled: boolean;
  setPatternsEnabled: (on: boolean) => void;
  /** Site-wide daltonization filter ("glasses for the app"). Auto-on for CVD profiles. */
  assistEnabled: boolean;
  setAssistEnabled: (on: boolean) => void;
}

const VisionProfileContext = createContext<VisionProfileContextValue>({
  profile: null,
  setProfile: () => {},
  clearProfile: () => {},
  patternsEnabled: false,
  setPatternsEnabled: () => {},
  assistEnabled: false,
  setAssistEnabled: () => {},
});

export const VisionProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfileState] = useState<VisionProfile | null>(load);
  const [patternsOverride, setPatternsOverride] = useState<boolean | null>(() => loadOverride(PATTERNS_KEY));
  const [assistOverride, setAssistOverride] = useState<boolean | null>(() => loadOverride(ASSIST_KEY));

  const setProfile = useCallback((p: VisionProfile) => {
    setProfileState(p);
    // A fresh profile is an explicit "accommodate me now" — drop stale manual
    // toggle choices so the auto behavior kicks in visibly.
    setPatternsOverride(null);
    setAssistOverride(null);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
      localStorage.removeItem(PATTERNS_KEY);
      localStorage.removeItem(ASSIST_KEY);
    } catch { /* private mode */ }
  }, []);

  const clearProfile = useCallback(() => {
    setProfileState(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* private mode */ }
  }, []);

  const setPatternsEnabled = useCallback((on: boolean) => {
    setPatternsOverride(on);
    try { localStorage.setItem(PATTERNS_KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
  }, []);

  const setAssistEnabled = useCallback((on: boolean) => {
    setAssistOverride(on);
    try { localStorage.setItem(ASSIST_KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
  }, []);

  const hasCVD = profile !== null && profile.type !== 'none';
  const patternsEnabled = patternsOverride ?? hasCVD;
  const assistEnabled = assistOverride ?? hasCVD;

  return (
    <VisionProfileContext.Provider value={{ profile, setProfile, clearProfile, patternsEnabled, setPatternsEnabled, assistEnabled, setAssistEnabled }}>
      {children}
    </VisionProfileContext.Provider>
  );
};

export function useVisionProfile() {
  return useContext(VisionProfileContext);
}

/** The profile as a concrete CVD type + severity, or null if none/typical. */
export function useActiveCVDProfile(): { type: CVDType; severity: number } | null {
  const { profile } = useVisionProfile();
  if (!profile || profile.type === 'none') return null;
  return { type: profile.type, severity: profile.severity };
}
