import { create } from 'zustand';

/** "Add to home screen": Chrome/Edge/Android give us a prompt event; iPhone needs Share → Add to Home Screen. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const standalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

export const usePwa = create<{ canInstall: boolean; installed: boolean; ios: boolean }>(() => ({
  canInstall: false,
  installed: standalone(),
  ios: typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent),
}));

let deferred: InstallPromptEvent | null = null;

export function installPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    usePwa.setState({ canInstall: true });
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    usePwa.setState({ canInstall: false, installed: true });
  });
  // the service worker only exists in production builds
  if (import.meta.env.PROD) void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}

export async function promptInstall() {
  if (!deferred) return false;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  usePwa.setState({ canInstall: false });
  return outcome === 'accepted';
}
