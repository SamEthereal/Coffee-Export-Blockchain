// portalTabNames — the single source of truth for resolving a `?tab=`
// deep-link value to a real tab index, PER PORTAL.
//
// Why this exists: notification rows (and old emails / copied links)
// store action URLs such as `/portals/banks?tab=swift-messages` or
// `/portals/exporter?tab=contracts`. Both tab parsers
// (useTabFromQuery and the Banks inline parser) used to do
// `parseInt(raw, 10)`, so every named value became NaN and the portal
// silently landed on tab 0 — the wrong destination for ~6,000 of the
// ~6,344 stored notification rows (live PG count, 2026-11-19).
//
// A name means a DIFFERENT index in each portal (e.g. `contracts` is
// ECTA 2, Exporter 1, Banks 0, NBE 1), so the map is keyed by the
// portal slug taken from the URL path (`/portals/<slug>`), which is
// the portal context the stored URL already carries — no URL-build
// change was needed on the API side. Names that have no tab of that
// name in a portal are mapped to the tab the event's entity actually
// lives on, following the precedent in NotificationCenter's
// resolveNotificationDestination entity table:
//   - ECTA `shipments` -> 3 Quality Control (shipments are inspected there)
//   - ECTA `permits`   -> 6 Pre-shipment Inspection
//   - Exporter `quality` / `permits` -> 3 Shipments (per-shipment)
//   - Banks `contracts` -> 0 Payment Methods (lists all LCs; no contracts tab)
//   - NBE `contracts`   -> 1 LC Monitoring (closest home for contract/LC rows)
//   - Customs `customs` / `permits` -> 0 Submitted (declarations list)
//   - Shipping `shipments` -> 0 Clearance (customs-cleared shipments awaiting transport)
// Slugs are the tab labels in kebab-case (Banks child `id`s where they
// exist, e.g. `swift-messages`), plus the short names the API actually
// emits (`contracts`, `quality`, `shipments`, `customs`, `payments`,
// `permits`, `swift-messages`). Matching is case-insensitive and
// treats `_` / spaces as `-`. A name that matches nothing resolves to
// null — callers fall back to the portal default (tab 0) honestly,
// never to a wrong tab.

export type PortalSlug = 'ecta' | 'ecx' | 'exporter' | 'nbe' | 'banks' | 'customs' | 'shipping';

export const PORTAL_TAB_NAMES: Record<PortalSlug, Record<string, number>> = {
  ecta: {
    'pending-applications': 0, applications: 0,
    'approved-exporters': 1, exporters: 1,
    'sales-contracts': 2, contracts: 2,
    'quality-control': 3, quality: 3, shipments: 3,
    'license-renewals': 4, renewals: 4,
    analytics: 5,
    'pre-shipment-inspection': 6, permits: 6,
    'post-delivery-audits': 9, audits: 9,
    'phytosanitary-certificates': 10, phytosanitary: 10,
    // 7 (User Management) and 8 (Audit Trail) are RESERVED redirects to
    // Settings — they intentionally have no name mapping here.
  },
  ecx: {
    'coffee-lots': 0, lots: 0,
    'market-prices': 1, prices: 1,
    'grading-standards': 2, grading: 2,
  },
  exporter: {
    dashboard: 0,
    contracts: 1,
    'forex-banking': 2, forex: 2, banking: 2,
    shipments: 3, quality: 3, permits: 3,
    customs: 4,
    'lc-payments': 5, payments: 5, lc: 5,
    reports: 6,
  },
  nbe: {
    'forex-monitoring': 0, forex: 0,
    'lc-monitoring': 1, contracts: 1, lc: 1,
    'exchange-rates': 2, rates: 2,
    'swift-monitoring': 3, swift: 3, 'swift-messages': 3,
    'forex-repatriation': 4, repatriation: 4,
    'policy-compliance': 5, compliance: 5, policy: 5,
    analytics: 6,
    'payment-release': 9, payments: 9,
  },
  banks: {
    'payment-methods': 0, contracts: 0,
    'forex-allocations': 1, forex: 1,
    'document-examination': 2, examination: 2, documents: 2,
    'payment-release': 3, payments: 3,
    'swift-messages': 4, swift: 4,
    'lc-settlements': 5, settlements: 5,
    analytics: 6,
    'lc-discrepancies': 9, discrepancies: 9,
    // 7 (User Management), 8 (Audit Trail) and 10 (All LCs, removed)
    // intentionally have no name mapping — numeric handling of those
    // lives in the Banks portal itself.
  },
  customs: {
    submitted: 0, customs: 0, declarations: 0, permits: 0,
    inspecting: 1, inspection: 1,
    'under-review': 2, review: 2,
    cleared: 3,
    rejected: 4,
    'border-crossing': 5,
  },
  shipping: {
    clearance: 0, shipments: 0,
    'land-transport': 1,
    'port-arrival': 2,
    'container-stuffing': 3,
    'vessel-loading': 4,
    departed: 5,
    'in-transit': 6, transit: 6,
    'destination-arrived': 7,
    delivered: 8,
    'pre-shipping': 9,
  },
};

/** Normalise a raw `?tab=` value for name lookup. */
export function normalizeTabName(raw: string): string {
  return raw.trim().toLowerCase().replace(/[_\s]+/g, '-').replace(/-+/g, '-');
}

/**
 * Resolve one `?tab=` value for a portal to a tab index.
 * Numeric values pass through; named values look up the portal's map.
 * Returns null when the value names no tab in this portal — the caller
 * keeps the portal default (tab 0) and must NOT guess another tab.
 */
export function resolvePortalTabIndex(portal: string, raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const value = String(raw).trim();
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  const map = PORTAL_TAB_NAMES[portal as PortalSlug];
  if (!map) return null;
  const hit = map[normalizeTabName(value)];
  return typeof hit === 'number' ? hit : null;
}

/** Portal slug from a `/portals/<slug>` path, or null. */
export function portalSlugFromPath(pathname: string): PortalSlug | null {
  const m = pathname.match(/^\/portals\/([a-z]+)/);
  if (!m) return null;
  const slug = m[1] as PortalSlug;
  return slug in PORTAL_TAB_NAMES ? slug : null;
}

/**
 * Rewrite a portal deep-link carrying a NAMED `?tab=` to the numeric
 * index it resolves to in that portal (other query params preserved).
 * Returns the rewritten URL, or null when the URL has no `?tab=`, the
 * tab is already numeric, or the name resolves to no tab in that
 * portal (caller falls back to its entity table / default instead of
 * landing on a wrong tab).
 */
export function resolvePortalTabUrl(actionUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(actionUrl, 'http://localhost');
  } catch {
    return null;
  }
  const portal = portalSlugFromPath(url.pathname);
  if (!portal) return null;
  const raw = url.searchParams.get('tab');
  if (raw === null || /^\d+$/.test(raw)) return null;
  const index = resolvePortalTabIndex(portal, raw);
  if (index === null) return null;
  url.searchParams.set('tab', String(index));
  return url.pathname + url.search;
}

export default resolvePortalTabIndex;
