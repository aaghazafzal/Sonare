/** Offsets are semitones from C3 (MIDI 48) before the octave shift. */
export type Keymap = [string, number][];

/** Piano-shaped layout: Q…P then Z…/ are white keys C3–A5, the keys just above them are the black keys. */
export const REAL: Keymap = [
  ['KeyQ', 0], ['Digit2', 1], ['KeyW', 2], ['Digit3', 3], ['KeyE', 4], ['KeyR', 5], ['Digit5', 6], ['KeyT', 7],
  ['Digit6', 8], ['KeyY', 9], ['Digit7', 10], ['KeyU', 11], ['KeyI', 12], ['Digit9', 13], ['KeyO', 14],
  ['Digit0', 15], ['KeyP', 16], ['KeyZ', 17], ['KeyS', 18], ['KeyX', 19], ['KeyD', 20], ['KeyC', 21],
  ['KeyF', 22], ['KeyV', 23], ['KeyB', 24], ['KeyH', 25], ['KeyN', 26], ['KeyJ', 27], ['KeyM', 28],
  ['Comma', 29], ['KeyL', 30], ['Period', 31], ['Semicolon', 32], ['Slash', 33], ['Quote', 34],
];

export const DEFAULT_CUSTOM_KEYS: Record<string, number> = Object.fromEntries(REAL);
