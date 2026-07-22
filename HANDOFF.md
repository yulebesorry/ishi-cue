# Ishi Q — Handoff

Written 2026-07-09 to close out a long session before context ran out. Read this
first in any new session before touching code — it's the fast path to full
context. If anything here conflicts with what you observe in the code, trust
the code and update this file.

## What this project is

**Ishi Q** (renamed from "Ishi Cue" this session) is a color-vision accessibility
tool. Joshua, the user, is colorblind himself and built this **primarily for
colorblind and low-vision people to use on their own behalf** — not as a
simulator for normal-vision designers to preview other people's perception.
That distinction drove most of the architectural decisions below. When in
doubt about a design choice, ask "does this help the colorblind/low-vision
person directly, right now?" — that's the north star.

- **Real source**: `/Users/joshuayule/Desktop/DEV/SMORGASBOARD/SMORGASBOARD-2`
- **NOT this**: `/Users/joshuayule/Desktop/SMORGASBOARD` — a stale fragment
  copy from early in the project. Never edit there; work is silently lost.
- **GitHub**: `github.com/yulebesorry/ishi-cue` (repo name unchanged; app
  renamed), branch `main`
- **Deployed**: `https://ishicue.netlify.app`, auto-deploys on every push to
  `main` via `netlify.toml` (`npm run build`, publish `dist`)
- **Stack**: React 19 + Vite 6 + Tailwind 4, package name `ishi-q`

### Dev workflow
- `npm run dev` → port 3000 (launch.json entry `ishi-cue` at
  `~/Desktop/DEV/.claude/launch.json`)
- `npm run lint` → `tsc --noEmit`, run after every edit
- `npm run build` → prints the output JS/CSS hash; compare against
  `curl -s https://ishicue.netlify.app/ | grep -o 'assets/index-[^"]*'`
  to confirm a deploy landed
- Preview via the Claude Browser tools (whatever they're named in the new
  session — `mcp__Claude_Browser__*` as of this session, but tool names have
  shifted mid-session before; search if the old names don't resolve)
- **Joshua tests live, concurrently, in the same shared browser tab more than
  once this session.** If you see unexpected state (patterns toggled, a
  different tab active, a profile suddenly set) mid-verification, check
  whether it's his own interaction before assuming a bug.

### Git hygiene
- Never `git add -A` — the stray duplicate folder (see Known Issues) would
  get swept in. Stage files explicitly.
- Commit messages in this repo explain *why*, not just *what* — match that
  style. End with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Push straight to `main` — no PR workflow in use here, and Joshua has
  explicitly asked for pushes each time a fix is verified.

## Current architecture

### Two-mode structure (the big recent restructure)
`App.tsx` has `appMode: 'designer' | 'personal'` state, persisted to
`localStorage['ishi-q.appMode']`, **defaults to `'personal'` on first visit**
(deliberate — matches who this app is for).

A toggle labeled **"Design Mode" / "Vision Mode"** switches between them —
see Inclusive Language section below for why it's *not* labeled
"Designers"/"Colorblind Users".

```
TABS.designer = Palette, Wheel, Preview, Accessibility, Image, Plate Test
TABS.personal = Vision Lens, Calibrate, Palette, Plate Test
```

Palette and Plate Test intentionally appear in **both** modes — Joshua asked
for this explicitly so Plate Test (and later Palette) could be used together
with the Vision Tools (Patterns especially), which only render in personal
mode.

Mode-conditional pieces:
- **Sidebar** (Base Color + Theory Rule buttons) — designer-only,
  conditionally rendered `<aside>`. Personal mode gets full content width
  instead (`lg:col-span-12` vs `lg:col-span-8`).
- **"Theory Mode" bar** (shows current rule + hex) — designer-only.
- **"Vision Tools" panel** (My Vision picker, Assist, Patterns, Contrast
  toggles) — a dedicated labeled section directly below the mode-toggle row,
  **personal-mode-only**. This moved twice this session: started in the
  header, was cross-cutting (both modes) → became personal-mode-only in the
  header → got physically relocated out of the header into this new section
  (still personal-mode-only). Current position is final as of the last
  commit — don't be surprised by the churn history if you find old
  descriptions of it elsewhere.
- **Dark mode toggle** — stays in the header, both modes, always visible.

### Core accessibility engine
- **`src/cvd.ts`** — Machado et al. (2009) CVD simulation, applied in linear
  RGB (not gamma-encoded sRGB — this matters for correctness). Also:
  daltonization (color *correction*, not simulation — trades fidelity for
  perceptual separation, see Design Decisions below), confusion-axis pair
  generation (used by Calibrate), and `assistMatrix` (the whole daltonization
  operation collapsed into one 3×3 matrix, applied site-wide as a single
  `feColorMatrix`).
- **`src/ishihara.ts`** — shared Ishihara plate dot-packing engine (used by
  both the Plate Test demo and the Calibrate screener). Two-pass packer:
  tiered rejection sampling for the organic look, then a gap-fill pass over
  literally-uncovered pixels, targeting **85% figure-mask coverage**. See
  Known Gotchas — this is fragile if touched carelessly.
- **`src/profile.tsx`** — `VisionProfile` React context, localStorage-backed
  (keys are still `ishi-cue.*`, see below). `patternsEnabled`/`assistEnabled`
  auto-turn-on when a CVD profile exists, but can be manually overridden;
  picking a new profile clears manual overrides so the auto-behavior is
  visible again.
- **`src/patterns.tsx`** — Trello-style texture overlays (10 patterns,
  stable per palette position). Ink is **fully opaque black or white**,
  chosen via real WCAG contrast ratio — earlier versions used alpha-blended
  ink which silently tinted with the underlying hue (see Gotchas).

### Feature components
- `src/components/VisionLensView.tsx` — upload/paste any image, see it
  corrected for your profile, before/after comparison slider. Desktop layout
  is side-by-side (image | controls column) so both are visible without
  scrolling — this took two iterations to get right (see Gotchas).
- `src/components/CalibrateView.tsx` — Ishihara-style screener using
  confusion-axis color pairs (not simulated — the viewer's own eyes are the
  test), estimates CVD type + severity, saves a `VisionProfile`.
- `src/components/IshiharaDemo.tsx` — "Plate Test", uses current palette
  colors to build a literal digit-hidden dot plate, shows it simulated
  across all 4 CVD types + normal-vision reference. Figure/Background swatch
  pickers now respect `patternsEnabled` (added this session — they didn't
  before, which made adding this tab to Vision Mode pointless until fixed).
- `src/components/AccessibilityView.tsx` — Contrast Checker, Vision
  Simulation, Hue Analysis. This is squarely a **designer/palette-audit**
  tool (third-person framing: "colorblind users cannot..."), not a personal
  tool — see Design Decisions.
- `extension/` — MV3 browser extension, no build step, load unpacked.
  `content.js` **duplicates** the assist-matrix math from `cvd.ts` (content
  scripts can't import app modules) — parity-tested to be byte-identical as
  of when it was written, but if you change the CVD math in `cvd.ts`, you
  must manually mirror the change into `content.js` or they'll drift.

## Design decisions worth knowing before you second-guess them

These were each discussed at length with Joshua — revisit only if he
raises it again, not on your own initiative.

1. **Daltonization intentionally does not preserve color fidelity.** It
   redistributes the color information a given CVD type can't perceive into
   channels that survive — the "corrected" output can look quite different
   from the original to someone with typical vision. This is correct and
   intentional; matching the original exactly would just reproduce the same
   unreadable result. The Correction Strength slider in Vision Lens controls
   this tradeoff (0% = untouched original, higher = more aggressive
   separation).

2. **Mode toggle labels are task-based ("Design Mode"/"Vision Mode"), not
   identity-based.** Joshua initially suggested "Designers"/"Colorblind
   Users". Researched via WebSearch (NN/g, IxDF, APA, AFB/CNIB style
   guides): identity-based labels risk excluding people who don't
   self-identify with a disability term even when a tool would help them
   (e.g. someone with mild anomalous trichromacy who's never called
   themselves "colorblind", or someone with age-related low vision).
   Task-based labels sidestep the self-diagnosis requirement entirely. The
   descriptive subtitles under each mode button *do* name the audience
   ("colorblind and low-vision users") since explanatory body text doesn't
   carry the same exclusion risk as a button label someone has to click to
   self-select. Don't reintroduce identity labels elsewhere without this
   context.

3. **Accessibility tab (Contrast Checker/Vision Simulation/Hue Analysis) and
   Plate Test are fundamentally palette-audit tools**, mechanically
   identical to traditional colorblindness simulators for designers — even
   though Plate Test now also lives in Vision Mode per Joshua's explicit
   request. The distinction that matters: Vision Lens/Calibrate/the
   extension take *existing content* and correct it for personal
   consumption; Accessibility/Plate Test take *a palette being built* and
   check whether *other people* would be able to read it. Both are
   legitimate; know which one you're extending.

4. **Removed a false claim from the footer.** It said "Colors generated
   using standard color theory algorithms and Gemini AI." Checked: `@google
   /genai` is an installed dependency and `types.ts` has a whole dead
   `AgentConfig`/`DEFAULT_AGENTS` scaffold (four AI palette-suggestion
   "agent" configs), but **none of it is ever imported or called anywhere in
   the app**. All palette generation is pure HSL-rotation math in
   `generatePaletteFromRule` (`colorUtils.ts`). Footer now just says
   "standard color theory algorithms." **Open question for Joshua**: wire up
   real AI suggestions using that dormant scaffold, or delete the dead code
   (the dependency + the unused types)? Not yet decided either way.

5. **Internal localStorage keys were deliberately left as `ishi-cue.*`**
   during the Ishi Q rename (`STORAGE_KEY`, `PATTERNS_KEY`, `ASSIST_KEY` in
   `profile.tsx`; `isHighContrast` key in `App.tsx`). Renaming them would
   silently wipe every returning visitor's saved profile and preferences.
   New keys introduced after the rename (e.g. `ishi-q.appMode`) correctly
   use the new prefix. Don't "fix" the inconsistency without a migration
   path.

## Known gotchas — read before touching these areas

- **`ishihara.ts` dot coverage**: the packer's early-stop check recomputes
  actual figure-mask coverage from the pixel bitmap on each check. An
  earlier version approximated it with a running per-dot counter and it
  silently broke (degraded to ~3000 dots / 200ms+ per plate, blowing way
  past the 85% target because the counter never reflected true coverage).
  If you touch this function, keep the bitmap recompute — don't
  "optimize" it back to a running counter without re-verifying against real
  images/digits.
- **Palette swatch grid height** (`App.tsx`, the `grid grid-cols-5 ...`
  block in the Design Mode Palette view): at `lg:` widths, individual
  swatches switch from `aspect-square` to pure flex-height (`aspect-auto`),
  which depends on the two-column layout's `items-stretch` matching the
  sidebar's natural height. If the sidebar happens to render shorter (e.g.
  Theory Rule button text wrapping to fewer lines at a wider viewport), the
  shared row height shrinks and swatches can collapse to near-zero height —
  this actually happened in production and looked like "missing swatches."
  Fixed with explicit `min-h-[340px]`/`min-h-[170px]` floors on the grid.
  Any future changes to this height-stretch relationship should re-test at
  multiple widths, not just the one you're looking at.
- **`transition-colors` + root class swap**: a CSS transition can freeze at
  `t=0` when a color changes via toggling a class on `<html>` (e.g. High
  Contrast mode), which then pins the *stale* color above the cascade —
  higher priority than even `!important`. High Contrast mode disables color
  transitions for exactly this reason (`.high-contrast .transition-colors,
  .high-contrast .transition-all { transition: none !important; }` in
  `index.css`). If HC mode ever looks like it's "not applying," check for a
  frozen transition before assuming a specificity bug.
- **Canvas refs inside `AnimatePresence mode="wait"`**: `useEffect` fires
  before the canvas actually mounts in this animation setup, so draws
  silently no-op. Use a callback ref instead (see `CalibrateView.tsx`'s
  `plateRef` for the pattern).
- **`object-contain` + click-to-pick-color math**: any `<img>`/`<canvas>`
  using `object-contain` inside a box whose aspect ratio doesn't match the
  content's needs letterbox-aware click mapping — naive proportional mapping
  across the full box picks the wrong pixel (or a dead-zone pixel) for any
  non-matching aspect ratio. `ImageColorPicker.tsx`'s `handleImageClick` has
  the correct letterbox math; copy that pattern if you add another
  click-to-sample-color feature.
- **Stray duplicate folder**: `SMORGASBOARD/SMORGASBOARD-2/SMORGASBOARD/
  SMORGASBOARD-2/` exists nested inside the real project directory. **Not
  created by any work this session** — appears to be leftover from Joshua's
  own file management before this project started. `tsconfig.json` has
  `"include": ["src", "vite.config.ts"]` specifically so `tsc` ignores it.
  Flagged to Joshua multiple times; still not cleaned up as of this
  writing. Safe to delete manually via Finder — just don't `git add -A` in
  the meantime, and don't delete it yourself without asking first (it's his
  call, not ours, even though it's very likely safe).
- **Browser preview tool names have shifted mid-session** at least once
  this session (`mcp__Claude_Preview__*` → `mcp__Claude_Browser__*`,
  possibly others). If a previously-working tool name 404s, use `ToolSearch`
  to find the current equivalents rather than assuming the environment is
  broken.

## Open threads / not yet decided

1. **AI palette suggestions** — implement using the dormant
   `AgentConfig`/`@google/genai` scaffold, or delete the dead code? Ask
   Joshua.
2. **Stray duplicate folder cleanup** — Joshua should delete it manually in
   Finder whenever convenient; not urgent, not ours to do unilaterally.
3. **"Andy" usability test** — Joshua referenced a usability test with
   someone named "Andy" as the source of wanting the two-mode split. No
   further detail was ever captured in conversation. If the two-mode
   structure needs to match specific findings from that test (naming,
   grouping, flow), ask him directly — the current implementation is our
   best-effort interpretation of "designers vs. colorblind/low-vision
   users," not a direct transcription of that test's findings.
4. **Mobile / "phone app someday"** — Joshua mentioned this app might
   become a phone app eventually. Some responsive work has been done (nav
   wrapping, Vision Lens side-by-side-to-stacked, Vision Tools no longer
   hidden below `sm:`), but no dedicated mobile-first pass has happened.
   Worth a deliberate look if he brings it up again.
5. **Vision Lens divider drag precision** — the before/after comparison
   slider computes divider position as % of the *container* width, not %
   of the *visible* (potentially letterboxed) image. Only matters for
   unusually wide/short images where letterboxing happens left/right instead
   of top/bottom. Known, minor, not fixed.
6. **Dead extension icons** — the browser extension has no custom icon set;
   Chrome shows a default placeholder. Cosmetic only, extension is fully
   functional.

## Suggested next steps

No specific task was queued when this handoff was written — the last few
turns were incremental refinements to the Vision Mode tab list. Good
candidates if Joshua doesn't have something specific in mind:

- Resolve the AI-suggestions open thread (#1 above) — it's a visible loose
  end (footer text was just corrected to stop lying about it).
- A deliberate mobile-first pass, if the "phone app" ambition is real.
- Revisit Accessibility/Plate Test's positioning now that Plate Test lives
  in both modes — does Accessibility deserve the same treatment, or does it
  stay purely designer-side? (Leans toward the latter per Design Decision
  #3, but Joshua's calls on this have evolved before.)

## How to re-establish context fast in a new session

1. Read this file.
2. Check `git log --oneline -20` in the real project dir for anything that
   happened after this was written.
3. Check memory (should auto-load) for anything reinforcing or updating the
   above.
4. If picking up UI work, start the dev server and actually look at both
   Design Mode and Vision Mode before assuming you know the current state —
   this session included multiple cases where live testing revealed the
   code didn't do what a prior summary claimed.
