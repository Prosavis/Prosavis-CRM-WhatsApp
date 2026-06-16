import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';

export interface UseLongPressOptions {
  delay?: number;
  onLongPress: () => void;
}

export interface LongPressHandlers {
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
  onPointerLeave: (e: ReactPointerEvent) => void;
  onPointerCancel: (e: ReactPointerEvent) => void;
  /** Returns true if the click should be suppressed (long-press just fired). */
  shouldSuppressClick: () => boolean;
}

export function useLongPress({ delay = 500, onLongPress }: UseLongPressOptions): LongPressHandlers {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPressRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      didLongPressRef.current = false;
      pointerIdRef.current = e.pointerId;
      clearTimer();
      timerRef.current = setTimeout(() => {
        didLongPressRef.current = true;
        onLongPress();
      }, delay);
    },
    [clearTimer, delay, onLongPress],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent) => {
      if (pointerIdRef.current !== null && e.pointerId !== pointerIdRef.current) return;
      clearTimer();
      pointerIdRef.current = null;
    },
    [clearTimer],
  );

  const onPointerLeave = useCallback(
    (e: ReactPointerEvent) => {
      if (pointerIdRef.current !== null && e.pointerId !== pointerIdRef.current) return;
      clearTimer();
      pointerIdRef.current = null;
    },
    [clearTimer],
  );

  const onPointerCancel = useCallback(
    (e: ReactPointerEvent) => {
      if (pointerIdRef.current !== null && e.pointerId !== pointerIdRef.current) return;
      clearTimer();
      pointerIdRef.current = null;
      didLongPressRef.current = false;
    },
    [clearTimer],
  );

  const shouldSuppressClick = useCallback(() => {
    if (didLongPressRef.current) {
      didLongPressRef.current = false;
      return true;
    }
    return false;
  }, []);

  return {
    onPointerDown,
    onPointerUp,
    onPointerLeave,
    onPointerCancel,
    shouldSuppressClick,
  };
}
