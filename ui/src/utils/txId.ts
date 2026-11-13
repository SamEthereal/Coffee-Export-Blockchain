// extractTxId — read a blockchain transaction id out of an API response
// no matter where the API put it.
//
// The API leg is standardising on top-level `txId` AND `.data.txId`;
// older / other endpoints return `blockchainTxId`, `transactionId` or
// the id nested under `.data`. This helper checks every known shape so
// the UI can show the id whenever the API supplied one, and returns
// undefined (never a placeholder) when it did not.
const TX_ID_KEYS = ['txId', 'TxId', 'blockchainTxId', 'transactionId', 'txid'] as const;

function pickTxId(obj: unknown): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const rec = obj as Record<string, unknown>;
  for (const key of TX_ID_KEYS) {
    const v = rec[key];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return undefined;
}

export function extractTxId(response: unknown): string | undefined {
  if (!response || typeof response !== 'object') return undefined;
  const rec = response as Record<string, unknown>;
  // axios response: { data: { txId, ... } } or { data: { data: { txId } } }
  return (
    pickTxId(rec) ??
    pickTxId(rec.data) ??
    pickTxId((rec.data as Record<string, unknown> | undefined)?.data)
  );
}

/** Short, copy-friendly form for display: first 12 chars + ellipsis. */
export function shortTxId(txId: string | undefined | null): string {
  if (!txId) return '';
  return txId.length > 12 ? `${txId.substring(0, 12)}…` : txId;
}
