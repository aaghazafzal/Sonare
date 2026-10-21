import { create } from 'zustand';

export type MobileMode = 'portrait' | 'landscape' | null;

// Phones and tablets: narrow screens, or a touch screen held sideways (short but wide).
const QUERY = '(max-width: 900px), (pointer: coarse) and (max-height: 520px)';

function detect(): MobileMode {
  if (typeof window === 'undefined' || !window.matchMedia(QUERY).matches) return null;
  return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
}

export const useMobileStore = create<{ mode: MobileMode }>(() => ({ mode: detect() }));

function sync() {
  const mode = detect();
  if (mode) document.documentElement.dataset.mobile = mode;
  else delete document.documentElement.dataset.mobile;
  if (mode !== useMobileStore.getState().mode) useMobileStore.setState({ mode });
}

/** Call once at startup; keeps `<html data-mobile>` and the store in step with the viewport. */
export function installMobileDetection() {
  sync();
  window.matchMedia(QUERY).addEventListener('change', sync);
  window.addEventListener('resize', sync);
  window.addEventListener('orientationchange', sync);
}

export const useMobile = () => useMobileStore((s) => s.mode);
