// useTabFromQuery — honour a `?tab=<index>` deep-link, on load AND on
// same-page client-side navigation.
//
// Global search results and notification "View" actions link to
// `/portals/<org>?tab=<index>`; portals keep their active tab in local
// state and previously ignored the query string, so every search link
// landed on tab 0. Call this in a portal with the tab indices visible
// for the current role:
//
//   useTabFromQuery(setTabValue, visibleTabs.map((t) => t.index));
//
// It waits until the visible list is non-empty (roles load async — on
// first render the list can be empty and the requested tab would look
// invalid), then applies the param if it names a visible tab and ignores
// it otherwise (out-of-range / non-numeric / invisible tab leaves the
// portal on its default tab; never a crash, never a blank page).
//
// It re-applies whenever `?tab=` CHANGES — a search click or notification
// View does a client-side `router.push` to the same portal page (no
// remount), so a mount-only hook would ignore the new param and leave
// the old tab selected. The last-applied value is remembered so a
// repeated navigation to the same tab is a no-op, and in-portal tab
// clicks (which do not change the query string) are untouched. Banks is
// the exception: its tabs are a parent/child hierarchy, so it maps
// `?tab=` to parent+child inline instead of using this hook.
//
// `redirects` maps a removed tab index to a URL: User Management and
// Audit Trail moved out of every portal tab bar into the account menu
// (Settings → /settings?section=users | system), so an old deep-link
// such as /portals/ecta?tab=7 still lands on the same function instead
// of silently opening the wrong tab. A redirected index is applied once
// via router.replace and never selects a tab.
//
//   useTabFromQuery(setTabValue, visible, {
//     7: '/settings?section=users',
//     8: '/settings?section=system',
//   });

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/router';

export function useTabFromQuery(
  setTab: (index: number) => void,
  visibleIndices: number[],
  redirects?: Record<number, string>,
): void {
  const router = useRouter();
  const appliedTab = useRef<number | null>(null);

  // Re-run when the visible set resolves (roles load async) or when the
  // `?tab=` query value changes (same-page client-side navigation).
  const visibleKey = visibleIndices.join(',');
  const redirectKey = redirects
    ? Object.keys(redirects)
        .sort()
        .map((k) => `${k}=${redirects[Number(k)]}`)
        .join(',')
    : '';

  useEffect(() => {
    if (visibleIndices.length === 0) return;
    if (!router.isReady) return;
    const raw = router.query.tab;
    if (typeof raw !== 'string') return;
    const index = parseInt(raw, 10);
    if (Number.isNaN(index)) return;
    if (appliedTab.current === index) return;
    // A moved tab keeps its old deep-link working: redirect to the new
    // home under Settings instead of selecting a (now different) tab.
    const redirect = redirects?.[index];
    if (redirect) {
      appliedTab.current = index;
      void router.replace(redirect);
      return;
    }
    if (!visibleIndices.includes(index)) return;
    appliedTab.current = index;
    setTab(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey, redirectKey, router.query.tab, router.isReady]);
}

export default useTabFromQuery;
