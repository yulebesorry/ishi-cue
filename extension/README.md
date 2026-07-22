# ISHI Q — Vision Assist (browser extension)

Recolors every website for your color vision. The same daltonization engine
as the ISHI Q app (Machado et al. 2009, linear-RGB), collapsed into a single
`feColorMatrix` and applied to each page's document root.

## Load it (Chrome / Edge / Brave / Arc)

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select this `extension/` folder
4. Pin "ISHI Q — Vision Assist" and click it to set your vision type,
   severity, and correction strength

Settings sync via `chrome.storage.sync`, apply to all tabs (and iframes)
immediately, and persist across restarts. Use the per-site checkbox in the
popup to disable the filter on color-critical sites (photo editing, proofing).

## Tips

- Run the **Calibrate** screening in the ISHI Q app first, then copy your
  type and severity into the popup.
- **Strength** past 100% overdrives the correction — useful for severe
  deficiencies, at the cost of natural-looking hues.
- The filter shifts how colors *look*, not what pages *are* — screenshots and
  downloads keep their true colors.

## Firefox

Manifest V3 works in Firefox 109+ (`about:debugging` → This Firefox →
Load Temporary Add-on → select `manifest.json`).
