/** Two-finger pinch zoom for the playlist and piano roll on touch screens. */

const touches = new Set<number>();
let installed = false;
function track() {
  if (installed) return;
  installed = true;
  const down = (e: PointerEvent) => e.pointerType === 'touch' && touches.add(e.pointerId);
  const up = (e: PointerEvent) => touches.delete(e.pointerId);
  window.addEventListener('pointerdown', down, true);
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', up, true);
}

/** True while a second finger is down — taps then shouldn't draw notes or clips. */
export const multiTouch = () => touches.size > 1;

/**
 * Calls `zoom(factor)` as two fingers spread or pinch on `scroller`, keeping the point between the fingers
 * where it was. `onStart` lets the editor undo what the first finger's tap just drew.
 */
export function attachPinch(scroller: HTMLElement, zoom: (factor: number) => number | void, onStart?: () => void) {
  track();
  let d0 = 0;
  const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const start = (e: TouchEvent) => {
    if (e.touches.length !== 2) return;
    d0 = dist(e.touches);
    onStart?.();
  };
  const move = (e: TouchEvent) => {
    if (e.touches.length !== 2 || !d0) return;
    e.preventDefault();
    const d = dist(e.touches);
    const f = d / d0;
    if (Math.abs(f - 1) < 0.02) return;
    d0 = d;
    const r = scroller.getBoundingClientRect();
    const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left;
    const before = scroller.scrollLeft;
    // the editor may clamp the zoom; it returns the factor it really applied
    const applied = zoom(f) ?? f;
    requestAnimationFrame(() => {
      scroller.scrollLeft = (before + cx) * applied - cx;
    });
  };
  const end = (e: TouchEvent) => {
    if (e.touches.length < 2) d0 = 0;
  };
  scroller.addEventListener('touchstart', start, { passive: true });
  scroller.addEventListener('touchmove', move, { passive: false });
  scroller.addEventListener('touchend', end);
  scroller.addEventListener('touchcancel', end);
  return () => {
    scroller.removeEventListener('touchstart', start);
    scroller.removeEventListener('touchmove', move);
    scroller.removeEventListener('touchend', end);
    scroller.removeEventListener('touchcancel', end);
  };
}
