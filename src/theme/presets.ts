export interface ThemeColors {
  bg: string;
  panel: string;
  panelAlt: string;
  inset: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  primary: string;
  onPrimary: string;
  secondary: string;
  onSecondary: string;
  highlight: string;
  danger: string;
  success: string;
}

export const COLOR_FIELDS: { key: keyof ThemeColors; label: string; hint: string; group: string }[] = [
  { key: 'bg', label: 'Background', hint: 'Page behind everything', group: 'Surfaces' },
  { key: 'panel', label: 'Panel', hint: 'Cards, bars, sidebars', group: 'Surfaces' },
  { key: 'panelAlt', label: 'Panel raised', hint: 'Buttons, inputs, headers', group: 'Surfaces' },
  { key: 'inset', label: 'Inset well', hint: 'Timeline, editors, meters', group: 'Surfaces' },
  { key: 'border', label: 'Border', hint: 'Dividers and outlines', group: 'Surfaces' },
  { key: 'borderStrong', label: 'Border strong', hint: 'Focused / hovered outlines', group: 'Surfaces' },
  { key: 'text', label: 'Text', hint: 'Primary text', group: 'Text' },
  { key: 'textMuted', label: 'Text muted', hint: 'Labels and secondary text', group: 'Text' },
  { key: 'textFaint', label: 'Text faint', hint: 'Hints, disabled, grid labels', group: 'Text' },
  { key: 'primary', label: 'Primary', hint: 'Main actions, selection, playhead', group: 'Accents' },
  { key: 'onPrimary', label: 'On primary', hint: 'Text on primary', group: 'Accents' },
  { key: 'secondary', label: 'Secondary', hint: 'Secondary accents, toggles', group: 'Accents' },
  { key: 'onSecondary', label: 'On secondary', hint: 'Text on secondary', group: 'Accents' },
  { key: 'highlight', label: 'Note highlight', hint: 'Played notes and active pads', group: 'Accents' },
  { key: 'danger', label: 'Record / danger', hint: 'Record arm, delete', group: 'Status' },
  { key: 'success', label: 'Success / meter', hint: 'Meters, confirmations', group: 'Status' },
];

export interface ThemePreset {
  id: string;
  name: string;
  note: string;
  colors: ThemeColors;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'graphite',
    name: 'Graphite',
    note: 'Dark studio, amber accent',
    colors: {
      bg: '#0f1012', panel: '#17181b', panelAlt: '#202125', inset: '#0b0c0d', border: '#2a2b30',
      borderStrong: '#3c3e45', text: '#ebe7df', textMuted: '#a19d95', textFaint: '#6a6760',
      primary: '#e3a043', onPrimary: '#1c1306', secondary: '#7fb0a6', onSecondary: '#0d1715',
      highlight: '#e3a043', danger: '#e5534b', success: '#6dbb8a',
    },
  },
  {
    id: 'ivory',
    name: 'Ivory',
    note: 'Warm paper, oxblood ink',
    colors: {
      bg: '#ece7dc', panel: '#f6f2ea', panelAlt: '#fffdf8', inset: '#e1dacb', border: '#d3cbb9',
      borderStrong: '#b4ab97', text: '#211e19', textMuted: '#625c50', textFaint: '#958d7d',
      primary: '#9c3b28', onPrimary: '#fff7f0', secondary: '#2f5f63', onSecondary: '#f2fbfb',
      highlight: '#c2532f', danger: '#b8322a', success: '#3f7f52',
    },
  },
  {
    id: 'console',
    name: 'Console',
    note: 'Mixing desk, phosphor green',
    colors: {
      bg: '#0c0f0e', panel: '#131816', panelAlt: '#1b211f', inset: '#080a09', border: '#252d2a',
      borderStrong: '#36413c', text: '#dfe8e2', textMuted: '#93a19a', textFaint: '#5d6964',
      primary: '#93d16f', onPrimary: '#0b1606', secondary: '#d8b35c', onSecondary: '#191206',
      highlight: '#93d16f', danger: '#e05a4f', success: '#93d16f',
    },
  },
  {
    id: 'walnut',
    name: 'Walnut',
    note: 'Warm wood and brass',
    colors: {
      bg: '#15100c', panel: '#1e1712', panelAlt: '#2a2019', inset: '#100c09', border: '#36291f',
      borderStrong: '#4d3b2d', text: '#f0e4d4', textMuted: '#b39e86', textFaint: '#7a6855',
      primary: '#d6a557', onPrimary: '#1d1307', secondary: '#c0694c', onSecondary: '#1b0b05',
      highlight: '#e1b56a', danger: '#d9534a', success: '#8cb36b',
    },
  },
  {
    id: 'slate',
    name: 'Slate',
    note: 'Cool blue-grey, ice accent',
    colors: {
      bg: '#11151a', panel: '#171c22', panelAlt: '#1f262e', inset: '#0c0f13', border: '#28313b',
      borderStrong: '#3a4653', text: '#e3e9ef', textMuted: '#97a5b3', textFaint: '#616e7b',
      primary: '#5eb4dc', onPrimary: '#06131a', secondary: '#e2925a', onSecondary: '#1d0e04',
      highlight: '#5eb4dc', danger: '#e45f5a', success: '#62c095',
    },
  },
  {
    id: 'paper',
    name: 'Paper',
    note: 'Clean light, monochrome',
    colors: {
      bg: '#f4f4f2', panel: '#ffffff', panelAlt: '#f7f7f5', inset: '#ebebe8', border: '#dddcd8',
      borderStrong: '#b9b8b3', text: '#141414', textMuted: '#5c5b57', textFaint: '#9a9994',
      primary: '#151515', onPrimary: '#ffffff', secondary: '#d24e1a', onSecondary: '#ffffff',
      highlight: '#d24e1a', danger: '#cc2f26', success: '#2f8a4f',
    },
  },
  {
    id: 'stage',
    name: 'Stage',
    note: 'Black and red, like a stage piano',
    colors: {
      bg: '#0b0b0b', panel: '#141414', panelAlt: '#1d1d1d', inset: '#070707', border: '#2a2a2a',
      borderStrong: '#404040', text: '#f2f2f2', textMuted: '#a6a6a6', textFaint: '#6b6b6b',
      primary: '#d8352a', onPrimary: '#ffffff', secondary: '#e8e8e8', onSecondary: '#111111',
      highlight: '#ff5a4a', danger: '#ff4b3e', success: '#62c28a',
    },
  },
  {
    id: 'contrast',
    name: 'High contrast',
    note: 'Maximum legibility',
    colors: {
      bg: '#000000', panel: '#0a0a0a', panelAlt: '#161616', inset: '#000000', border: '#5a5a5a',
      borderStrong: '#ffffff', text: '#ffffff', textMuted: '#e0e0e0', textFaint: '#b0b0b0',
      primary: '#ffd60a', onPrimary: '#000000', secondary: '#4cc9f0', onSecondary: '#000000',
      highlight: '#ffd60a', danger: '#ff4d4d', success: '#4dff88',
    },
  },
];

export const UI_FONTS: { id: string; label: string; stack: string }[] = [
  { id: 'instrument', label: 'Instrument Sans', stack: "'Instrument Sans Variable', system-ui, sans-serif" },
  { id: 'plex', label: 'IBM Plex Sans', stack: "'IBM Plex Sans Variable', system-ui, sans-serif" },
  { id: 'manrope', label: 'Manrope', stack: "'Manrope Variable', system-ui, sans-serif" },
  { id: 'dmsans', label: 'DM Sans', stack: "'DM Sans Variable', system-ui, sans-serif" },
  { id: 'grotesk', label: 'Space Grotesk', stack: "'Space Grotesk Variable', system-ui, sans-serif" },
  { id: 'work', label: 'Work Sans', stack: "'Work Sans Variable', system-ui, sans-serif" },
  { id: 'fraunces', label: 'Fraunces (serif)', stack: "'Fraunces Variable', Georgia, serif" },
  { id: 'system', label: 'System default', stack: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
];

export const MONO_FONTS: { id: string; label: string; stack: string }[] = [
  { id: 'jetbrains', label: 'JetBrains Mono', stack: "'JetBrains Mono Variable', ui-monospace, monospace" },
  { id: 'plexmono', label: 'IBM Plex Mono', stack: "'IBM Plex Mono', ui-monospace, monospace" },
  { id: 'system', label: 'System mono', stack: "ui-monospace, 'Cascadia Mono', Consolas, monospace" },
];

/* ------------------------------------------------------------------ skins */

export interface KeyboardSkin {
  caseColor: string;
  caseFinish: 'gloss' | 'matte' | 'wood' | 'metal';
  whiteKey: string;
  blackKey: string;
  pressed: string;
  label: string;
  felt: string;
  keyDepth: number;
}
export interface GuitarSkin {
  wood: string;
  grain: number;
  inlay: 'dots' | 'blocks' | 'none';
  inlayColor: string;
  fret: string;
  string: string;
  nut: string;
  pressed: string;
  binding: string;
}
export interface DrumSkin {
  shell: string;
  finish: 'gloss' | 'sparkle' | 'wood' | 'matte';
  hardware: string;
  head: string;
  cymbal: string;
  pad: string;
}
export interface WindSkin {
  body: string;
  finish: 'metal' | 'wood';
  keys: string;
  pressed: string;
}
export interface MalletSkin {
  bar: string;
  finish: 'wood' | 'metal';
  frame: string;
  resonator: string;
  pressed: string;
}

export interface SkinSet {
  keyboard: KeyboardSkin;
  guitar: GuitarSkin;
  drums: DrumSkin;
  wind: WindSkin;
  mallets: MalletSkin;
}

export const KEYBOARD_SKINS: { id: string; name: string; skin: KeyboardSkin }[] = [
  { id: 'concert', name: 'Concert ebony', skin: { caseColor: '#0d0d0e', caseFinish: 'gloss', whiteKey: '#f7f4ec', blackKey: '#141414', pressed: '#e3a043', label: '#8a857a', felt: '#7a1f1f', keyDepth: 0.7 } },
  { id: 'studio', name: 'Studio matte', skin: { caseColor: '#2a2b2e', caseFinish: 'matte', whiteKey: '#f2f2f0', blackKey: '#1d1e20', pressed: '#5eb4dc', label: '#8d8f93', felt: '#3a3b40', keyDepth: 0.45 } },
  { id: 'walnut', name: 'Walnut upright', skin: { caseColor: '#5a3620', caseFinish: 'wood', whiteKey: '#f3ead7', blackKey: '#1a120c', pressed: '#d6a557', label: '#9a8b70', felt: '#6b1d1d', keyDepth: 0.75 } },
  { id: 'stage', name: 'Stage red', skin: { caseColor: '#b8261d', caseFinish: 'matte', whiteKey: '#fafafa', blackKey: '#121212', pressed: '#ff5a4a', label: '#8b8b8b', felt: '#1a1a1a', keyDepth: 0.4 } },
  { id: 'vintage', name: 'Vintage ivory', skin: { caseColor: '#d9cfbb', caseFinish: 'matte', whiteKey: '#efe3c8', blackKey: '#2b2219', pressed: '#a8582f', label: '#9b8c6f', felt: '#5d3b26', keyDepth: 0.6 } },
  { id: 'silver', name: 'Brushed silver', skin: { caseColor: '#9ea3a8', caseFinish: 'metal', whiteKey: '#fbfbfb', blackKey: '#202226', pressed: '#3d8bd4', label: '#8f949a', felt: '#2b2d31', keyDepth: 0.5 } },
  { id: 'inverted', name: 'Inverted', skin: { caseColor: '#f2efe8', caseFinish: 'matte', whiteKey: '#1b1b1c', blackKey: '#f3f0e8', pressed: '#d24e1a', label: '#77746d', felt: '#c9c3b5', keyDepth: 0.5 } },
];

export const GUITAR_SKINS: { id: string; name: string; skin: GuitarSkin }[] = [
  { id: 'rosewood', name: 'Rosewood', skin: { wood: '#4a2a1b', grain: 0.55, inlay: 'dots', inlayColor: '#e9e2d0', fret: '#c9c6bd', string: '#c8b48a', nut: '#efe8d6', pressed: '#e3a043', binding: '#e9e2d0' } },
  { id: 'maple', name: 'Maple', skin: { wood: '#d9b77e', grain: 0.4, inlay: 'dots', inlayColor: '#1b1712', fret: '#a9a69e', string: '#b9bcc0', nut: '#f4efe2', pressed: '#c0432c', binding: '#2b241b' } },
  { id: 'ebony', name: 'Ebony', skin: { wood: '#1a1716', grain: 0.25, inlay: 'blocks', inlayColor: '#d9dde0', fret: '#d2d0c8', string: '#d0d3d6', nut: '#e9e4d6', pressed: '#5eb4dc', binding: '#e6e1d3' } },
  { id: 'pau', name: 'Pau ferro', skin: { wood: '#6b432b', grain: 0.6, inlay: 'dots', inlayColor: '#efe6cf', fret: '#c5c2b8', string: '#c2a36f', nut: '#ede4cf', pressed: '#93d16f', binding: '#ede4cf' } },
  { id: 'roasted', name: 'Roasted maple', skin: { wood: '#9a6233', grain: 0.5, inlay: 'blocks', inlayColor: '#141110', fret: '#bdbab0', string: '#c3c6c9', nut: '#1b1715', pressed: '#e5534b', binding: '#141110' } },
];

export const DRUM_SKINS: { id: string; name: string; skin: DrumSkin }[] = [
  { id: 'piano-black', name: 'Piano black', skin: { shell: '#141416', finish: 'gloss', hardware: '#c9ccd1', head: '#efece4', cymbal: '#c79a4a', pad: '#26272b' } },
  { id: 'oxblood', name: 'Oxblood', skin: { shell: '#5e1416', finish: 'sparkle', hardware: '#c9ccd1', head: '#f1eee6', cymbal: '#c79a4a', pad: '#3a1416' } },
  { id: 'natural', name: 'Natural maple', skin: { shell: '#b98a53', finish: 'wood', hardware: '#cfd2d6', head: '#f3efe4', cymbal: '#cfa452', pad: '#4a3a2a' } },
  { id: 'midnight', name: 'Midnight blue', skin: { shell: '#17284a', finish: 'sparkle', hardware: '#1d1d1f', head: '#1b1b1d', cymbal: '#8a7a55', pad: '#1a2438' } },
  { id: 'white', name: 'Arctic white', skin: { shell: '#e9e7e2', finish: 'gloss', hardware: '#c9ccd1', head: '#f6f4ee', cymbal: '#c79a4a', pad: '#d6d3cc' } },
];

export const WIND_SKINS: { id: string; name: string; skin: WindSkin }[] = [
  { id: 'silver', name: 'Silver', skin: { body: '#c6cacf', finish: 'metal', keys: '#e7eaee', pressed: '#e3a043' } },
  { id: 'gold', name: 'Gold', skin: { body: '#c9a14e', finish: 'metal', keys: '#e8cd8c', pressed: '#5a3214' } },
  { id: 'rosewood', name: 'Rosewood', skin: { body: '#5b2f1e', finish: 'wood', keys: '#d6c7a8', pressed: '#e3a043' } },
  { id: 'bamboo', name: 'Bamboo', skin: { body: '#c9ad6b', finish: 'wood', keys: '#3a2c18', pressed: '#7a3e1c' } },
  { id: 'black', name: 'Black resin', skin: { body: '#1d1d1f', finish: 'metal', keys: '#bfc3c8', pressed: '#5eb4dc' } },
];

export const MALLET_SKINS: { id: string; name: string; skin: MalletSkin }[] = [
  { id: 'rosewood', name: 'Rosewood bars', skin: { bar: '#7a3f25', finish: 'wood', frame: '#2a1d15', resonator: '#b8a27c', pressed: '#e3a043' } },
  { id: 'padauk', name: 'Padauk', skin: { bar: '#a64b2a', finish: 'wood', frame: '#1c1714', resonator: '#9a9a9a', pressed: '#f2d27a' } },
  { id: 'aluminum', name: 'Aluminium (vibes)', skin: { bar: '#b9bec4', finish: 'metal', frame: '#1e1f22', resonator: '#c9a14e', pressed: '#5eb4dc' } },
  { id: 'gold', name: 'Gold bars', skin: { bar: '#c8a24f', finish: 'metal', frame: '#141414', resonator: '#6d6f73', pressed: '#e5534b' } },
  { id: 'synthetic', name: 'Synthetic', skin: { bar: '#2f3a44', finish: 'wood', frame: '#0f1214', resonator: '#4a5560', pressed: '#93d16f' } },
];

export const DEFAULT_SKINS: SkinSet = {
  keyboard: KEYBOARD_SKINS[0].skin,
  guitar: GUITAR_SKINS[0].skin,
  drums: DRUM_SKINS[0].skin,
  wind: WIND_SKINS[0].skin,
  mallets: MALLET_SKINS[0].skin,
};
