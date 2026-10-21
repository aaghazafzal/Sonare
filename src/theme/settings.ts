import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEFAULT_SKINS,
  MONO_FONTS,
  THEME_PRESETS,
  UI_FONTS,
  type SkinSet,
  type ThemeColors,
} from './presets';
import { DEFAULT_CUSTOM_KEYS } from '../lib/keymaps';

export type Texture = 'none' | 'grain' | 'weave' | 'lines';
export type LabelMode = 'none' | 'c' | 'all' | 'keys';
export type KeymapMode = 'real' | 'full' | 'classic' | 'custom';
export type NoteNaming = 'off' | 'cde' | 'solfege';
export type PlayLayout = 'big' | 'workspace';

export interface Settings {
  presetId: string; // 'custom' once any colour is edited
  colors: ThemeColors;
  uiFont: string;
  monoFont: string;
  headingWeight: number;
  radius: number;
  scale: number;
  density: 'compact' | 'regular' | 'comfortable';
  texture: Texture;
  reduceMotion: boolean;
  skins: SkinSet;
  keyboardLabels: LabelMode;
  keyboardKeys: 49 | 61 | 76 | 88;
  showMinimap: boolean;
  guitarLabels: boolean;
  leftHanded: boolean;
  guitarFrets: number;
  recordOffsetMs: number;
  inputMonitoring: boolean;
  keymap: KeymapMode;
  customKeys: Record<string, number>;
  playLayout: PlayLayout;
  bigLabels: NoteNaming;
  bigKeycaps: boolean;
  bigVisible: 'focus' | 'max';
  bigToolbar: boolean;
  uiSounds: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  presetId: 'graphite',
  colors: THEME_PRESETS[0].colors,
  uiFont: 'instrument',
  monoFont: 'jetbrains',
  headingWeight: 600,
  radius: 6,
  scale: 1,
  density: 'regular',
  texture: 'grain',
  reduceMotion: false,
  skins: DEFAULT_SKINS,
  keyboardLabels: 'c',
  keyboardKeys: 61,
  showMinimap: true,
  guitarLabels: true,
  leftHanded: false,
  guitarFrets: 15,
  recordOffsetMs: 0,
  inputMonitoring: false,
  keymap: 'real',
  customKeys: DEFAULT_CUSTOM_KEYS,
  playLayout: 'big',
  bigLabels: 'cde',
  bigKeycaps: true,
  bigVisible: 'focus',
  bigToolbar: false,
  uiSounds: true,
}; 

interface SettingsStore extends Settings {
  update: (p: Partial<Settings>) => void;
  setColor: (k: keyof ThemeColors, v: string) => void;
  applyPreset: (id: string) => void;
  setSkin: <K extends keyof SkinSet>(k: K, v: Partial<SkinSet[K]>) => void;
  reset: () => void;
  importJson: (json: string) => boolean;
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_SETTINGS,
      update: (p) => set(p),
      setColor: (k, v) => set((s) => ({ colors: { ...s.colors, [k]: v }, presetId: 'custom' })),
      applyPreset: (id) => {
        const p = THEME_PRESETS.find((t) => t.id === id);
        if (p) set({ presetId: id, colors: { ...p.colors } });
      },
      setSkin: (k, v) => set((s) => ({ skins: { ...s.skins, [k]: { ...s.skins[k], ...v } } })),
      reset: () => set({ ...DEFAULT_SETTINGS }),
      importJson: (json) => {
        try {
          const data = JSON.parse(json);
          if (!data || typeof data !== 'object' || !data.colors) return false;
          const cur = get();
          set({
            ...data,
            colors: { ...cur.colors, ...data.colors },
            skins: {
              keyboard: { ...cur.skins.keyboard, ...data.skins?.keyboard },
              guitar: { ...cur.skins.guitar, ...data.skins?.guitar },
              drums: { ...cur.skins.drums, ...data.skins?.drums },
              wind: { ...cur.skins.wind, ...data.skins?.wind },
              mallets: { ...cur.skins.mallets, ...data.skins?.mallets },
            },
          });
          return true;
        } catch {
          return false;
        }
      },
    }),
    {
      name: 'sonare.settings',
      version: 1,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Settings>;
        return {
          ...current,
          ...p,
          colors: { ...current.colors, ...p.colors },
          skins: {
            keyboard: { ...current.skins.keyboard, ...p.skins?.keyboard },
            guitar: { ...current.skins.guitar, ...p.skins?.guitar },
            drums: { ...current.skins.drums, ...p.skins?.drums },
            wind: { ...current.skins.wind, ...p.skins?.wind },
            mallets: { ...current.skins.mallets, ...p.skins?.mallets },
          },
        };
      },
    },
  ),
);

export function exportSettings(): string {
  const s = useSettings.getState();
  const out: Partial<Settings> = {};
  (Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]).forEach((k) => {
    (out as Record<string, unknown>)[k] = s[k];
  });
  return JSON.stringify(out, null, 2);
}

/* ------------------------------------------------------------- applying */

function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrastRatio(a: string, b: string) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
export const rgbTriplet = (hex: string) => hexToRgb(hex).join(' ');

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());

export function applySettings(s: Settings) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(s.colors)) {
    root.style.setProperty(`--${kebab(k)}`, v);
    root.style.setProperty(`--${kebab(k)}-rgb`, rgbTriplet(v));
  }
  const dark = luminance(s.colors.bg) < 0.2;
  root.style.colorScheme = dark ? 'dark' : 'light';
  root.dataset.scheme = dark ? 'dark' : 'light';
  root.dataset.texture = s.texture;
  root.dataset.density = s.density;
  root.dataset.motion = s.reduceMotion ? 'reduced' : 'full';
  root.style.setProperty('--font-ui', UI_FONTS.find((f) => f.id === s.uiFont)?.stack ?? UI_FONTS[0].stack);
  root.style.setProperty('--font-mono', MONO_FONTS.find((f) => f.id === s.monoFont)?.stack ?? MONO_FONTS[0].stack);
  root.style.setProperty('--heading-weight', String(s.headingWeight));
  root.style.setProperty('--radius', `${s.radius}px`);
  root.style.setProperty('--radius-sm', `${Math.max(0, Math.round(s.radius * 0.6))}px`);
  root.style.setProperty('--radius-lg', `${Math.round(s.radius * 1.5)}px`);
  root.style.fontSize = `${14 * s.scale}px`;
}
