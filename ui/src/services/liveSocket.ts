// Ethiopian Coffee Export Consortium Blockchain System (CECBS)
// Shared live-socket client — the ONE WebSocket connection for the
// whole UI (2026-11-19 live-refresh round).
//
// Before this module, the only socket in the UI was a raw inline
// `new WebSocket` inside NotificationCenter (the bell), and no portal
// subscribed to anything — every portal loaded once on mount and only
// re-fetched after the user's own actions. This module extracts the
// bell's connect / subscribe / reconnect / socketConnected logic
// verbatim (same channels, same JWT `?token=` auth, same exponential
// backoff, same 4401 stop) and shares the single connection between
// the bell and all eight portals: subscribers register a notification
// handler, the module fans each incoming `notification` row out to
// every subscriber. A second WebSocket per portal would double the
// server's client count and deliver every notification twice.
//
// URL: `${WS_BASE}/ws/?token=<JWT>` — the API accepts WS upgrades on
// ANY path (api/src/server.ts:501, no `path` option), so /ws/ works in
// dev (ws://localhost:3001/ws/) and, behind nginx, the dedicated
// `location /ws/` in nginx-configs/cecbs-production.conf proxies it
// to the API. The old bell URL (`${WS_BASE}/`) hit the UI server
// behind nginx because WS_BASE strips /api/v1 and `/` routes to
// Next.js — live updates silently failed in production.

import { API_BASE_URL } from '@/config/api.config';

/** One row of the persisted feed — GET /api/v1/notifications. */
export interface LiveNotificationRow {
  id: number;
  title: string;
  message: string;
  type: string;
  entityType: string | null;
  entityId: string | null;
  actionUrl: string | null;
  severity: string;
  role: string | null;
  exporterId: string | null;
  userId: number | null;
  read: boolean;
  createdAt: string;
}

export type LiveNotificationHandler = (row: LiveNotificationRow) => void;
export type SocketConnectedHandler = (connected: boolean) => void;

export interface JwtIdentity {
  userId: string;
  exporterId: string;
  role: string;
}

/**
 * Normalise a users.role value to the canonical base role used as the
 * notifications audience — UI mirror of api/src/utils/notificationRoles.ts.
 * ECTA_ADMIN→ECTA, BANK/BANK_ADMIN→BANKS, NBE_ADMIN→NBE,
 * CUSTOMS_ADMIN→CUSTOMS, SHIPPING_ADMIN→SHIPPING, SUPER_ADMIN→ADMIN.
 * (Moved verbatim from NotificationCenter; it re-exports this.)
 */
export function normalizeNotificationRole(role: string | undefined | null): string | null {
  if (!role) return null;
  const r = String(role).trim().toUpperCase();
  if (r === 'BANK' || r === 'BANK_ADMIN' || r === 'BANK OFFICER' || r === 'FOREX OFFICER') return 'BANKS';
  if (r === 'ECTA_ADMIN') return 'ECTA';
  if (r === 'ECX_ADMIN') return 'ECX';
  if (r === 'NBE_ADMIN' || r === 'NBE OFFICER') return 'NBE';
  if (r === 'CUSTOMS_ADMIN') return 'CUSTOMS';
  if (r === 'SHIPPING_ADMIN') return 'SHIPPING';
  if (r === 'SUPER_ADMIN') return 'ADMIN';
  if (r.endsWith('_ADMIN') || r.endsWith('_OFFICER')) return r.replace(/_(ADMIN|OFFICER)$/, '');
  return r;
}

export function decodeJwtIdentity(): JwtIdentity | null {
  try {
    const token = localStorage.getItem('authToken');
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return {
      userId: String(payload.userId ?? payload.sub ?? ''),
      exporterId: String(payload.exporterId ?? payload.username ?? payload.sub ?? ''),
      role: String(payload.role ?? ''),
    };
  } catch {
    return null;
  }
}

/**
 * Channels for one identity — exactly as NotificationCenter built
 * them (:499–514). ADMIN subscribes to every role channel except the
 * EXPORTER channel (never — it would leak all exporter rows);
 * exporters get only their own user/exporter channels.
 */
export function buildNotificationChannels(role: string, identity: JwtIdentity): string[] {
  const channels: string[] = [];
  if (role === 'ADMIN') {
    for (const r of ['ECTA', 'ECX', 'NBE', 'BANKS', 'CUSTOMS', 'SHIPPING']) {
      channels.push(`notifications:${r}`);
    }
  } else if (role !== 'EXPORTER') {
    channels.push(`notifications:${role}`);
  }
  channels.push(`notifications:user:${identity.userId}`);
  if (identity.exporterId) channels.push(`notifications:exporter:${identity.exporterId}`);
  return channels;
}

const WS_BASE = API_BASE_URL.replace(/^http/, 'ws').replace(/\/api\/v1\/?$/, '');
/** Dedicated WS path — proxied to the API by nginx `location /ws/`. */
export const LIVE_SOCKET_PATH = '/ws/';

// --- Singleton state -------------------------------------------------------

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let connected = false;
let connecting = false;

const notificationListeners = new Set<LiveNotificationHandler>();
const connectedListeners = new Set<SocketConnectedHandler>();

function setConnected(value: boolean): void {
  if (connected === value) return;
  connected = value;
  for (const fn of [...connectedListeners]) {
    try {
      fn(value);
    } catch {
      // A listener must never break delivery to the others.
    }
  }
}

function dispatchNotification(row: LiveNotificationRow): void {
  for (const fn of [...notificationListeners]) {
    try {
      fn(row);
    } catch {
      // A listener must never break delivery to the others.
    }
  }
}

function connectSocket(): void {
  if (typeof window === 'undefined' || connecting || ws) return;
  const identity = decodeJwtIdentity();
  const token = localStorage.getItem('authToken');
  if (!token || !identity || !identity.userId) return;

  const role = normalizeNotificationRole(identity.role) || 'ECTA';
  const channels = buildNotificationChannels(role, identity);

  let socket: WebSocket;
  connecting = true;
  try {
    socket = new WebSocket(`${WS_BASE}${LIVE_SOCKET_PATH}?token=${encodeURIComponent(token)}`);
  } catch (err) {
    // Socket construction itself failed (e.g. WS blocked): stay in
    // polling-fallback mode rather than crashing the caller.
    console.warn('WebSocket unavailable, using polling fallback:', err);
    connecting = false;
    setConnected(false);
    return;
  }
  ws = socket;
  connecting = false;

  socket.onopen = () => {
    reconnectAttempt = 0;
    socket.send(JSON.stringify({ type: 'subscribe', channels }));
  };
  socket.onmessage = (event) => {
    let msg: any;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    if (msg.type === 'subscription_confirmed') {
      setConnected(true);
      return;
    }
    if (msg.type === 'connection') {
      // Welcome message; connected once the subscription confirms.
      return;
    }
    if (msg.type === 'notification') {
      // Live shape: { type:'notification', data: <row> }; accept
      // `notification:` defensively.
      const row: LiveNotificationRow | undefined = msg.data ?? msg.notification;
      if (!row || typeof row.id !== 'number') return;
      dispatchNotification(row);
    }
  };
  socket.onclose = (event) => {
    setConnected(false);
    if (ws === socket) ws = null;
    // 4401 = unauthenticated (bad/expired token): do not retry.
    // No subscribers left (every consumer unmounted): do not retry.
    if (event.code === 4401) return;
    if (notificationListeners.size === 0 && connectedListeners.size === 0) return;
    const delay = Math.min(30000, 1000 * 2 ** reconnectAttempt);
    reconnectAttempt += 1;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectSocket, delay);
  };
  socket.onerror = () => {
    // onclose follows and schedules the reconnect.
  };
}

/**
 * Make sure the shared socket is (re)connecting. Idempotent — safe to
 * call from every subscriber's mount effect.
 */
export function ensureLiveSocket(): void {
  if (ws || connecting) return;
  connectSocket();
}

/** Current liveness, for the initial React state. */
export function getSocketConnected(): boolean {
  return connected;
}

/**
 * Subscribe to live `notification` rows. The returned function
 * unsubscribes. The shared socket stays up while anyone is
 * subscribed; the bell is mounted on every portal, so in practice
 * it stays up for the whole session.
 */
export function subscribeLiveNotification(fn: LiveNotificationHandler): () => void {
  notificationListeners.add(fn);
  ensureLiveSocket();
  return () => {
    notificationListeners.delete(fn);
  };
}

/**
 * Subscribe to socket liveness. The handler is invoked immediately
 * with the current value, then on every change.
 */
export function subscribeSocketConnected(fn: SocketConnectedHandler): () => void {
  connectedListeners.add(fn);
  try {
    fn(connected);
  } catch {
    // Ignore listener errors on the immediate call.
  }
  ensureLiveSocket();
  return () => {
    connectedListeners.delete(fn);
  };
}
