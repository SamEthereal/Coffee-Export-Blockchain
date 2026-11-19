// Ethiopian Coffee Export Consortium Blockchain System (CECBS)
// Live-refresh hooks (2026-11-19 live-refresh round).
//
// `useLiveNotifications` subscribes a component to the ONE shared
// socket in services/liveSocket.ts (the bell's connection — no second
// WebSocket per portal) and reports its liveness.
//
// `usePortalLiveRefresh` is the shared portal mechanism: every portal
// passes its loader as `refetch` plus an `isRelevant` predicate over
// notification rows, and the hook
//   1. schedules a debounced (~500 ms trailing) + delayed (~1.75 s,
//      mirror-lag) refetch when a relevant notification arrives,
//      coalescing bursts (one workflow step can emit several rows)
//      and running at most one refetch per kind per burst;
//   2. re-fetches once on a real reconnect (false → true after having
//      been live once — the client missed everything while down; the
//      initial connect is skipped because the mount load just ran);
//   3. polls the full loader every 30 s ONLY while the socket is down
//      AND the document is visible, stopping the moment the socket is
//      live. The poll is the only cover for actions that emit no
//      notification at all, so it stays even with a working socket
//      behind it — it just never runs while the socket is up.
// Refetches use exactly the same endpoints and token as the initial
// load (the loader itself does the fetching); this hook adds no
// endpoints and no auth of its own.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getSocketConnected,
  subscribeLiveNotification,
  subscribeSocketConnected,
  type LiveNotificationRow,
} from '@/services/liveSocket';

export type { LiveNotificationRow };

export const LIVE_REFRESH_DEBOUNCE_MS = 500;
export const LIVE_REFRESH_DELAY_MS = 1750;
export const LIVE_REFRESH_POLL_MS = 30000;

/**
 * Subscribe to live notification rows on the shared socket.
 * Returns `{ socketConnected }` — true only after the server confirms
 * the subscription (same meaning as the bell's `socketConnected`).
 */
export function useLiveNotifications(
  onNotification?: (row: LiveNotificationRow) => void,
): { socketConnected: boolean } {
  const [socketConnected, setSocketConnected] = useState<boolean>(() => getSocketConnected());
  const handlerRef = useRef(onNotification);
  handlerRef.current = onNotification;

  useEffect(() => {
    const unsubConnected = subscribeSocketConnected(setSocketConnected);
    const unsubNotification = subscribeLiveNotification((row) => {
      handlerRef.current?.(row);
    });
    return () => {
      unsubConnected();
      unsubNotification();
    };
  }, []);

  return { socketConnected };
}

export interface PortalLiveRefreshOptions {
  /** Full-loader reload (the portal's own loader). */
  refetch: () => void | Promise<void>;
  /** Which notification rows should trigger a refetch. Default: all. */
  isRelevant?: (row: LiveNotificationRow) => boolean;
  /**
   * Targeted refetch for one row (e.g. Banks SWIFT: re-fetch just the
   * SWIFT list until the notified message converges, instead of the
   * whole portal). Returns null to fall back to the default refetch.
   * `key` dedupes within a burst — one run per key per burst.
   */
  resolveRefetch?: (row: LiveNotificationRow) => {
    key: string;
    run: () => void | Promise<void>;
  } | null;
  /** Trailing debounce for bursts. Default 500 ms. */
  debounceMs?: number;
  /** Mirror-lag delay after the debounce before refetching. Default 1750 ms. */
  delayMs?: number;
  /** Poll interval while the socket is down. Default 30000 ms. */
  pollMs?: number;
}

/**
 * Wire one portal (or the Admin portal's combined reload) to live
 * updates. Returns `{ socketConnected }` for the caller's own use.
 */
export function usePortalLiveRefresh(options: PortalLiveRefreshOptions): {
  socketConnected: boolean;
} {
  const debounceMs = options.debounceMs ?? LIVE_REFRESH_DEBOUNCE_MS;
  const delayMs = options.delayMs ?? LIVE_REFRESH_DELAY_MS;
  const pollMs = options.pollMs ?? LIVE_REFRESH_POLL_MS;

  const refetchRef = useRef(options.refetch);
  refetchRef.current = options.refetch;
  const isRelevantRef = useRef(options.isRelevant);
  isRelevantRef.current = options.isRelevant;
  const resolveRefetchRef = useRef(options.resolveRefetch);
  resolveRefetchRef.current = options.resolveRefetch;

  const mountedRef = useRef(true);
  const pendingRef = useRef(new Map<string, () => void | Promise<void>>());
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const everConnectedRef = useRef(false);
  const prevConnectedRef = useRef(false);

  const scheduleRefetch = useCallback(
    (row: LiveNotificationRow) => {
      if (isRelevantRef.current && !isRelevantRef.current(row)) return;
      const targeted = resolveRefetchRef.current?.(row);
      if (targeted) {
        pendingRef.current.set(targeted.key, targeted.run);
      } else {
        pendingRef.current.set('full', () => refetchRef.current());
      }
      // Trailing debounce: a burst restarts the wait, so one burst
      // triggers at most one refetch per kind.
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        if (delayTimerRef.current) clearTimeout(delayTimerRef.current);
        delayTimerRef.current = setTimeout(() => {
          const jobs = [...pendingRef.current.values()];
          pendingRef.current.clear();
          if (!mountedRef.current || jobs.length === 0) return;
          void (async () => {
            for (const job of jobs) {
              if (!mountedRef.current) return;
              try {
                await job();
              } catch {
                // A failed live refetch must never break the portal;
                // the next notification or poll retry covers it.
              }
            }
          })();
        }, delayMs);
      }, debounceMs);
    },
    [debounceMs, delayMs],
  );

  const { socketConnected } = useLiveNotifications(scheduleRefetch);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (delayTimerRef.current) clearTimeout(delayTimerRef.current);
      pendingRef.current.clear();
    };
  }, []);

  // One immediate reload on a real reconnect — the client missed
  // everything while down. The initial connect is skipped (the mount
  // load just ran); only a drop after having been live triggers it.
  useEffect(() => {
    if (socketConnected) {
      if (everConnectedRef.current && !prevConnectedRef.current) {
        void refetchRef.current();
      }
      everConnectedRef.current = true;
    }
    prevConnectedRef.current = socketConnected;
  }, [socketConnected]);

  // Polling fallback: 30 s full-loader poll ONLY while the socket is
  // down AND the document is visible. Stops the moment the socket is
  // live (effect cleanup on socketConnected change).
  useEffect(() => {
    if (socketConnected) return;
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (!mountedRef.current) return;
      void refetchRef.current();
    }, pollMs);
    return () => clearInterval(interval);
  }, [socketConnected, pollMs]);

  return { socketConnected };
}
