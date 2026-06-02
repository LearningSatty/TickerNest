/**
 * Top loading bar (NProgress-style).
 *
 * Drives off TanStack Query's global "is anything fetching?" signal so we
 * don't have to thread loading state through every component.  Shows when
 * any query/mutation is in-flight; hides smoothly when none remain.
 *
 * Behaviour:
 *   • Appears within ~120ms of a fetch starting (avoids flicker on cache hits).
 *   • Animates the width to ~85% during the fetch (indeterminate progress).
 *   • Snaps to 100%, then fades out, when fetches finish.
 */
import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

export default function LoadingBar() {
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  const active = fetching + mutating > 0;

  const [visible, setVisible] = useState(false);
  const [pct, setPct] = useState(0);
  const showTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);
  const tickTimer = useRef<number | null>(null);

  useEffect(() => {
    if (active) {
      // Cancel any pending hide; if not visible yet, schedule a delayed show.
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      if (!visible && !showTimer.current) {
        showTimer.current = window.setTimeout(() => {
          showTimer.current = null;
          setVisible(true);
          setPct(15);
        }, 120);
      }
    } else {
      // Cancel a pending show if the request resolved before we showed it.
      if (showTimer.current) {
        clearTimeout(showTimer.current);
        showTimer.current = null;
      }
      if (visible) {
        setPct(100);
        hideTimer.current = window.setTimeout(() => {
          setVisible(false);
          setPct(0);
        }, 220);
      }
    }
    return () => {
      // intentionally don't clear timers here — fall through to the next run
    };
  }, [active, visible]);

  // Slow easing toward 85% while visible (indeterminate progress feel).
  useEffect(() => {
    if (!visible) {
      if (tickTimer.current) {
        clearInterval(tickTimer.current);
        tickTimer.current = null;
      }
      return;
    }
    tickTimer.current = window.setInterval(() => {
      setPct((p) => (p < 85 ? p + Math.max(0.5, (85 - p) * 0.07) : p));
    }, 200);
    return () => {
      if (tickTimer.current) {
        clearInterval(tickTimer.current);
        tickTimer.current = null;
      }
    };
  }, [visible]);

  return (
    <div
      aria-hidden
      className="fixed top-0 left-0 right-0 z-[9999] pointer-events-none h-0.5"
    >
      <div
        className="h-full bg-accent transition-[width,opacity] ease-out"
        style={{
          width: `${pct}%`,
          opacity: visible ? 1 : 0,
          transitionDuration: visible ? '300ms' : '220ms',
          boxShadow: '0 0 8px var(--tw-shadow-color, currentColor)',
        }}
      />
    </div>
  );
}
