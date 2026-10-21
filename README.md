# Sonare — online instruments & studio

Play 106 sampled instruments plus 6 drum kits in the browser, then build full tracks (beats, bass, keys, vocals) in the studio.

## Run

```bash
npm install
npm run dev        # http://localhost:5180
npm run build      # static site in dist/ (deploy to any static host)
```

`npm run dev` / `build` first runs `scripts/build-manifest.mjs`, which scans `Audio/` and writes `src/data/manifest.json`
(instrument family, play surface, note → sample file). The `sonare-samples` plugin in `vite.config.ts` serves `Audio/`
at `/audio/...` in dev and copies only the samples the manifest uses into `dist/audio` on build (~119 MB of the 243 MB).
Drop a new folder into `Audio/` and re-run to add an instrument. Deployment: see [DEPLOY.md](DEPLOY.md).

## What's in it

- **Play** — instrument browser with search; keyboard (61/76/88 keys, 88-key navigator, velocity by touch position,
  glissando, chord mode), guitar/bass/violin necks (real fret spacing, tunings, chord strum), drum kit + pad grid,
  flute with live fingering chart + pan flute, marimba-style mallets. Computer keyboard, mouse/touch and Web MIDI
  (incl. sustain pedal). "Take" recorder sends what you played to the studio as a new track.
- **Studio** — transport with count-in, metronome, loop region, tempo/time signature; tracks for instruments, drums and
  audio/vocals; clips you can move, copy (Alt-drag), trim, split, duplicate; piano roll with velocity lane, marquee
  select, quantize; drum step grid; mic recording with latency correction; audio import (drop a file on an audio lane);
  mixer with EQ, compressor, reverb/delay sends, pan, mute/solo, meters; undo/redo; export the song to WAV; save/open
  session files. Sessions autosave in the browser, recorded audio lives in IndexedDB.
- **Settings** — 8 theme presets plus every colour editable (with contrast checks), 8 UI fonts + 3 mono fonts, scale,
  radius, density, background texture; per-instrument designs (keyboard case/keys/felt/finish, fretboard wood/inlays/
  strings, drum shells/heads/cymbals, flute material, mallet bars) with playable previews; theme export/import.

## Code map

| Path | What |
| --- | --- |
| `src/audio/engine.ts` | Tone.js context, master bus (comp, limiter, reverb/delay buses), `Strip`, sample cache, `Voice` |
| `src/audio/live.ts` | Live playing state, sustain, routing of input to the current instrument / selected track |
| `src/audio/input.ts` | Computer-keyboard map and Web MIDI |
| `src/components/instruments/` | Keyboard, Fretboard, DrumKit/Pads, Flute/PanFlute, Mallets, InstrumentStage |
| `src/studio/` | Project store + undo, playback/recording/bounce, arrangement, piano roll, mixer |
| `src/theme/` | Theme presets, skins, settings store and CSS-variable application |

## Assets

All instrument graphics are drawn in SVG/CSS so they follow the theme and skin settings — no third-party images.
Fonts are self-hosted via Fontsource (SIL OFL). Samples come from the `Audio/` folder; before publishing the site,
confirm each sample set's licence (many look like the CC-BY FluidR3 / tonejs-instruments sets, which need attribution).
