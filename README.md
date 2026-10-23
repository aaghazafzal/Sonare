# Sonare — online instruments & studio

Play 106 sampled instruments plus 6 drum kits in the browser, then build full tracks (beats, bass, keys, vocals) in the studio.

A product of [Univora](https://www.univora.site) — support and requests go to <https://www.univora.site/support>. Not open source.

## Run

```bash
npm install
npm run dev        # http://localhost:5180
npm run build      # static site in dist/ (deploy to any static host)
```

`npm run dev` / `build` first runs `scripts/build-manifest.mjs`, which scans `Audio/` and writes `src/data/manifest.json`
(instrument family, play surface, note → sample file). The `sonare-samples` plugin in `vite.config.ts` serves `Audio/`
at `/audio/...` in dev and copies only the samples the manifest uses (plus their `.m4a` copies) into `dist/audio` on build (~200 MB).
Drop a new folder into `Audio/` and re-run to add an instrument, then `npm run convert-samples` (needs ffmpeg) to make the `.m4a` copies Safari/iOS use instead of `.ogg`. Deployment: see [DEPLOY.md](DEPLOY.md).

## What's in it

- **Home** — landing page built from the app's own parts: a playable piano with a falling-notes demo, every instrument
  family to hear, the song list, a step sequencer you can play, live theme switching and a "new project" dialog.
- **Play** — instrument browser with search; keyboard (61/76/88 keys, 88-key navigator, velocity by touch position,
  glissando, chord mode), guitar/bass/violin necks (real fret spacing, tunings, chord strum), drum kit + pad grid,
  flute with live fingering chart + pan flute, marimba-style mallets. Computer keyboard, mouse/touch and Web MIDI
  (incl. sustain pedal). "Take" recorder sends what you played to the studio as a new track.
- **Studio** (FL Studio-style) — PAT/SONG modes, channel rack step sequencer with step velocity and swing,
  patterns, playlist with pattern, audio and automation clips, piano roll with scale highlight / scale lock and ghost
  notes, mixer with EQ, compressor, sends and up to any number of insert effects per channel (filter, distortion,
  bitcrusher, chorus, phaser, tremolo, ping-pong delay, reverb, stereo width, limiter), automation of volume, pan,
  sends and filter cutoff (plus master fades), mic recording, audio and MIDI import, export to WAV / MP3 / zipped stems
  (rendered offline, faster than real time) and MIDI, autosaved projects list and session files that carry recordings.
- **Learn songs** — 10 public-domain melodies (Twinkle to Für Elise, some with both hands). Notes fall onto the keys;
  *Watch* plays the song, *Wait* stops until you press the lit keys, *Play* keeps time and scores you. Practise one hand
  while the other is played for you, at 30–130 % speed. In the Big piano (Songs tile) and on phones (cap button).
- **Phones** — the studio shows one full-screen view at a time (Playlist / Rack / Roll / Mixer / Play / Browse) with a
  menu sheet; pinch with two fingers to zoom the playlist and piano roll, hold a note to delete it.
- **Installable app (PWA)** — "Install app" in Settings → Interface (or Share → Add to Home Screen on iPhone). The app
  shell works offline and every sample you have played is cached for offline use.
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
| `src/learn/` | Song library, lesson engine (watch / wait / play, scoring) and the falling-notes view |
| `src/pages/HomePage.tsx` | Landing page |
| `src/pages/InfoPages.tsx` | Privacy policy, terms of use and the in-app 404 page (`public/404.html` is the static one) |
| `src/components/Logo.tsx` | The Sonare mark — same geometry as `public/favicon.svg` and the icons from `scripts/make-images.py` |
| `src/lib/pwa.ts` | Install prompt and service-worker registration |

## Assets

All instrument graphics are drawn in SVG/CSS so they follow the theme and skin settings — no third-party images. App
icons and the social image are drawn by `scripts/make-images.py`.
Fonts are self-hosted via Fontsource (SIL OFL). The instrument samples in `Audio/` are Univora's own recordings.

## Deploy

Hosted on Cloudflare Pages at <https://sonare.website> — see [DEPLOY.md](DEPLOY.md). Headers live in `public/_headers`
(mirrored in `vercel.json`).
