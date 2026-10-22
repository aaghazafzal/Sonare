/**
 * Touch long-press for context menus. iOS never fires `contextmenu`, Android fires it on long-press,
 * so components call down/move/up from their pointer handlers and check `touch` in onContextMenu.
 */
export function createLongPress(delay = 450) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let start = { x: 0, y: 0 };
  let fired = false;
  let lastType = 'mouse';
  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return {
    down(e: { pointerType: string; clientX: number; clientY: number }, fire: (x: number, y: number) => void) {
      lastType = e.pointerType;
      fired = false;
      clear();
      if (e.pointerType !== 'touch') return;
      start = { x: e.clientX, y: e.clientY };
      timer = setTimeout(() => {
        timer = null;
        fired = true;
        navigator.vibrate?.(12);
        fire(start.x, start.y);
      }, delay);
    },
    move(e: { clientX: number; clientY: number }) {
      if (timer && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) clear();
    },
    up: clear,
    /** remember what kind of pointer pressed (call for every button, not just the primary) */
    track(e: { pointerType: string }) {
      lastType = e.pointerType;
    },
    /** true once the press turned into a long-press (ignore the click / drag that follows) */
    get fired() {
      return fired;
    },
    /** the last press came from a finger */
    get touch() {
      return lastType === 'touch';
    },
  };
}

/** Keep a context menu fully on screen. */
export function menuPosition(x: number, y: number, w = 230, h = 220) {
  return { left: Math.max(8, Math.min(x, window.innerWidth - w - 8)), top: Math.max(8, Math.min(y, window.innerHeight - h - 8)) };
}
