import { useSyncExternalStore } from 'react';

/**
 * Tiny store for the shared thumbnail canvas: how many live thumbnails are
 * mounted (the canvas only exists while > 0) and whether rendering is
 * paused (e.g. while the creature sheet covers the page).
 */
const state = { count: 0, paused: false };
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
let snapshot = { ...state };

export const thumbs = {
  register() {
    state.count += 1;
    snapshot = { ...state };
    emit();
    return () => {
      state.count -= 1;
      snapshot = { ...state };
      emit();
    };
  },
  pause(v: boolean) {
    if (state.paused === v) return;
    state.paused = v;
    snapshot = { ...state };
    emit();
  },
};

export function useThumbs() {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => snapshot,
    () => snapshot,
  );
}
