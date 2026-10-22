import type { AutoParam } from '../audio/engine';

export const AUTO_PARAMS: { id: AutoParam; label: string }[] = [
  { id: 'volume', label: 'Volume' },
  { id: 'pan', label: 'Pan' },
  { id: 'reverb', label: 'Reverb send' },
  { id: 'delay', label: 'Delay send' },
  { id: 'cutoff', label: 'Filter cutoff' },
];

/** Normalised 0..1 curve value -> the parameter's own unit. */
export function autoValue(param: AutoParam, v: number): number {
  const x = Math.max(0, Math.min(1, v));
  switch (param) {
    case 'volume':
      return x <= 0.001 ? -80 : -40 + x * 46;
    case 'pan':
      return x * 2 - 1;
    case 'reverb':
    case 'delay':
      return x;
    case 'cutoff':
      return 40 * Math.pow(18000 / 40, x);
  }
}

/** The parameter's unit -> normalised 0..1 (for starting a curve at the current setting). */
export function autoNormal(param: AutoParam, value: number): number {
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  switch (param) {
    case 'volume':
      return clamp((value + 40) / 46);
    case 'pan':
      return clamp((value + 1) / 2);
    case 'reverb':
    case 'delay':
      return clamp(value);
    case 'cutoff':
      return clamp(Math.log(value / 40) / Math.log(18000 / 40));
  }
}

export function autoLabel(param: AutoParam, v: number): string {
  const val = autoValue(param, v);
  switch (param) {
    case 'volume':
      return val <= -79 ? '-∞ dB' : `${val > 0 ? '+' : ''}${val.toFixed(1)} dB`;
    case 'pan':
      return Math.abs(val) < 0.02 ? 'Centre' : val < 0 ? `L ${Math.round(-val * 100)}` : `R ${Math.round(val * 100)}`;
    case 'reverb':
    case 'delay':
      return `${Math.round(val * 100)}%`;
    case 'cutoff':
      return val >= 1000 ? `${(val / 1000).toFixed(1)} kHz` : `${Math.round(val)} Hz`;
  }
}
