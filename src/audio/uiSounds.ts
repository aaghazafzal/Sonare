import * as Tone from 'tone';
import { useSettings } from '../theme/settings';

/**
 * Soft "tock" for interface buttons. It goes straight to the speakers, not through the master bus,
 * so it never ends up in recordings or WAV exports.
 */
let buffer: AudioBuffer | null = null;

function makeClick(ctx: BaseAudioContext) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 0.045);
  const b = ctx.createBuffer(1, len, sr);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const body = Math.sin(2 * Math.PI * 1850 * t) * 0.5 + Math.sin(2 * Math.PI * 760 * t) * 0.4;
    const tick = (Math.random() * 2 - 1) * 0.3 * Math.exp(-t * 900);
    d[i] = (body * Math.exp(-t * 170) + tick) * Math.min(1, t * 4000);
  }
  return b;
}

export function playUiClick() {
  if (!useSettings.getState().uiSounds) return;
  const raw = Tone.getContext().rawContext as unknown as AudioContext;
  if (raw.state !== 'running') return;
  buffer ??= makeClick(raw);
  const src = raw.createBufferSource();
  src.buffer = buffer;
  const gain = raw.createGain();
  gain.gain.value = 0.16;
  src.connect(gain);
  gain.connect(raw.destination);
  src.start();
}

// instrument surfaces make their own sound
const SILENT = '.kb, .fretboard, .drumkit, .mallets, .pads, .wind-notes, .panflute, .pr-grid, .cr-steps, .pl-lane, .ruler, [data-silent]';
const CLICKABLE = 'button, [role="tab"], [role="switch"], select, a[href], .bp-scroller-row';

export function installUiSounds() {
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement | null;
    const el = t?.closest<HTMLElement>(CLICKABLE);
    if (!el || t?.closest(SILENT) || (el as HTMLButtonElement).disabled) return;
    playUiClick();
  };
  window.addEventListener('pointerdown', onDown, true);
  return () => window.removeEventListener('pointerdown', onDown, true);
}
