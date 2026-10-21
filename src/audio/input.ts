import { create } from 'zustand';
import { noteOff, noteOn, setSustain, useLive, liveTargetIsKit } from './live';
import { useSettings, type KeymapMode } from '../theme/settings';
import { REAL, type Keymap } from '../lib/keymaps';

/** Two-row "tracker" layout: bottom row starts at C3, top row at C4. */
const CLASSIC: Keymap = [
  ['KeyZ', 0], ['KeyS', 1], ['KeyX', 2], ['KeyD', 3], ['KeyC', 4], ['KeyV', 5], ['KeyG', 6], ['KeyB', 7],
  ['KeyH', 8], ['KeyN', 9], ['KeyJ', 10], ['KeyM', 11], ['Comma', 12], ['KeyL', 13], ['Period', 14],
  ['Semicolon', 15], ['Slash', 16],
  ['KeyQ', 12], ['Digit2', 13], ['KeyW', 14], ['Digit3', 15], ['KeyE', 16], ['KeyR', 17], ['Digit5', 18],
  ['KeyT', 19], ['Digit6', 20], ['KeyY', 21], ['Digit7', 22], ['KeyU', 23], ['KeyI', 24], ['Digit9', 25],
  ['KeyO', 26], ['Digit0', 27], ['KeyP', 28], ['BracketLeft', 29], ['Equal', 30], ['BracketRight', 31],
];

/** Five-octave layout (1…0, Q…P, A…L, Z…M = white keys C2–C7); hold Shift for the black key above. */
const FULL_WHITES = [
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0',
  'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP',
  'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL',
  'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM',
];
const WHITE_STEPS = [0, 2, 4, 5, 7, 9, 11];
const FULL: Keymap = FULL_WHITES.map((code, i) => [code, -12 + Math.floor(i / 7) * 12 + WHITE_STEPS[i % 7]]);
const SHIFTED: Record<string, string> = {
  Digit1: '!', Digit2: '@', Digit3: '#', Digit4: '$', Digit5: '%', Digit6: '^', Digit7: '&', Digit8: '*', Digit9: '(', Digit0: ')',
};
const hasSharp = (offset: number) => [0, 2, 5, 7, 9].includes(((offset % 12) + 12) % 12);

/** Keys that keep their own job and can't be bound to notes. */
export const RESERVED_CODES = new Set(['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Escape', 'Backspace', 'Delete', 'Tab', 'Enter']);

export function keymapFor(mode: KeymapMode): Keymap {
  if (mode === 'classic') return CLASSIC;
  if (mode === 'full') return FULL;
  if (mode === 'custom') return Object.entries(useSettings.getState().customKeys);
  return REAL;
}

export const PIANO_BASE = 48;

export const DRUM_KEYS: Record<string, number> = {
  KeyX: 36, KeyB: 36, KeyC: 38, KeyN: 38, KeyV: 37, KeyF: 42, KeyJ: 42, KeyG: 46, KeyD: 44,
  KeyT: 48, KeyY: 45, KeyH: 41, KeyR: 49, KeyU: 49, KeyI: 51,
};

const CODE_CHARS: Record<string, string> = {
  Comma: ',', Period: '.', Semicolon: ';', Slash: '/', Quote: "'", BracketLeft: '[', BracketRight: ']',
  Equal: '=', Minus: '-', Backquote: '`', Backslash: '\\',
};
export const codeLabel = (code: string) =>
  CODE_CHARS[code] ?? code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'num ').toLowerCase();

/** midi -> computer key label for the current octave shift and keymap (first mapping wins). */
export function pianoKeyLabels(octave: number, mode: KeymapMode = useSettings.getState().keymap): Map<number, string> {
  const out = new Map<number, string>();
  for (const [code, off] of keymapFor(mode)) {
    const midi = PIANO_BASE + octave * 12 + off;
    if (!out.has(midi)) out.set(midi, codeLabel(code));
    if (mode === 'full' && hasSharp(off) && !out.has(midi + 1)) out.set(midi + 1, SHIFTED[code] ?? codeLabel(code).toUpperCase());
  }
  return out;
}

/** Lowest and highest note the computer keyboard reaches. */
export function mappedRange(octave: number, mode: KeymapMode = useSettings.getState().keymap): [number, number] {
  const offs = keymapFor(mode).map(([, o]) => o);
  const base = PIANO_BASE + octave * 12;
  if (!offs.length) return [base, base + 24];
  return [base + Math.min(...offs), base + Math.max(...offs) + (mode === 'full' ? 1 : 0)];
}

export function drumKeyLabels(): Map<number, string> {
  const out = new Map<number, string>();
  for (const [code, midi] of Object.entries(DRUM_KEYS)) if (!out.has(midi)) out.set(midi, codeLabel(code).toUpperCase());
  return out;
}

const pressed = new Map<string, number>();
let spaceIsSustain = true;
/** Studio takes Space for play/stop. */
export function setSpaceSustain(on: boolean) {
  spaceIsSustain = on;
}

let bindCapture: ((code: string) => void) | null = null;
/** While set, key presses go to the keybind editor instead of playing notes. */
export function setBindCapture(fn: ((code: string) => void) | null) {
  bindCapture = fn;
}

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

function onKeyDown(e: KeyboardEvent) {
  if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e)) return;
  if (bindCapture) {
    if (e.repeat) return;
    e.preventDefault();
    bindCapture(e.code);
    return;
  }
  if (e.code === 'Space' && spaceIsSustain) {
    e.preventDefault();
    if (!e.repeat) setSustain(true);
    return;
  }
  if (e.repeat) {
    if (pressed.has(e.code)) e.preventDefault();
    return;
  }
  const live = useLive.getState();
  if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
    const octave = Math.max(-3, Math.min(3, live.octave + (e.code === 'ArrowLeft' ? -1 : 1)));
    live.set({ octave });
    e.preventDefault();
    return;
  }
  if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
    const velocity = Math.max(0.1, Math.min(1, live.velocity + (e.code === 'ArrowUp' ? 0.1 : -0.1)));
    live.set({ velocity: Math.round(velocity * 100) / 100 });
    e.preventDefault();
    return;
  }
  let midi: number | undefined;
  if (liveTargetIsKit()) midi = DRUM_KEYS[e.code];
  else {
    const mode = useSettings.getState().keymap;
    const off = new Map(keymapFor(mode)).get(e.code);
    if (off !== undefined) midi = PIANO_BASE + live.octave * 12 + off + (mode === 'full' && e.shiftKey && hasSharp(off) ? 1 : 0);
  }
  if (midi === undefined) return;
  e.preventDefault();
  pressed.set(e.code, midi);
  noteOn(midi);
}

function onKeyUp(e: KeyboardEvent) {
  if (e.code === 'Space' && spaceIsSustain) {
    setSustain(false);
    return;
  }
  const midi = pressed.get(e.code);
  if (midi === undefined) return;
  pressed.delete(e.code);
  noteOff(midi);
}

function onBlur() {
  pressed.forEach((m) => noteOff(m));
  pressed.clear();
  setSustain(false);
}

export function installKeyboardInput() {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
  };
}

/* -------------------------------------------------------------- Web MIDI */

interface MidiState {
  supported: boolean;
  enabled: boolean;
  devices: string[];
  lastNote: number | null;
  error: string | null;
}
export const useMidi = create<MidiState>(() => ({
  supported: typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator,
  enabled: false,
  devices: [],
  lastNote: null,
  error: null,
}));

let access: MIDIAccess | null = null;

function handleMessage(ev: MIDIMessageEvent) {
  const data = ev.data;
  if (!data || data.length < 2) return;
  const status = data[0] & 0xf0;
  const d1 = data[1];
  const d2 = data[2] ?? 0;
  if (status === 0x90 && d2 > 0) {
    noteOn(d1, d2 / 127);
    useMidi.setState({ lastNote: d1 });
  } else if (status === 0x80 || (status === 0x90 && d2 === 0)) {
    noteOff(d1);
  } else if (status === 0xb0 && d1 === 64) {
    setSustain(d2 >= 64);
  }
}

function bindInputs() {
  if (!access) return;
  const names: string[] = [];
  access.inputs.forEach((input) => {
    input.onmidimessage = handleMessage;
    names.push(input.name ?? 'MIDI input');
  });
  useMidi.setState({ devices: names });
}

export async function enableMidi() {
  if (!useMidi.getState().supported) return;
  try {
    access = await navigator.requestMIDIAccess();
    access.onstatechange = bindInputs;
    bindInputs();
    useMidi.setState({ enabled: true, error: null });
  } catch (err) {
    useMidi.setState({ enabled: false, error: err instanceof Error ? err.message : 'MIDI access was denied' });
  }
}
