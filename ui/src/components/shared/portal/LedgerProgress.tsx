// useElapsedSeconds + LedgerProgress — honest in-flight feedback for
// ledger writes.
//
// A chain write costs ~2.3–2.7 s on a good day and 10–19 s on the slow
// paths (forex allocate, repatriation, set-rate, issue-permit, rejects).
// The UI used to show nothing at all while that happened. This module
// gives every long action the same truthful feedback: a spinner, a
// message that says the ledger write is happening, and the REAL elapsed
// time in seconds. There is deliberately no percentage and no progress
// bar: the API reports no intermediate state, so any percentage would
// be a lie. Elapsed seconds are a fact, not a forecast.
import React, { useEffect, useState } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';

/** Seconds since `active` became true, ticking once a second. 0 when idle. */
export function useElapsedSeconds(active: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }
    const startedAt = Date.now();
    setElapsed(0);
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [active]);
  return elapsed;
}

export const LEDGER_WRITE_MESSAGE =
  'Writing to the ledger — this usually takes a few seconds.';

/**
 * Inline in-flight note for dialogs and panels that run a ledger write.
 * Render it while the request is pending; hide it when it settles.
 * `elapsed` comes from useElapsedSeconds(pending) — pass it in so the
 * number stays in sync with the button showing the same wait.
 */
export const LedgerProgress: React.FC<{
  /** Override for actions whose wait is known to be longer. */
  message?: string;
  elapsed?: number;
}> = ({ message = LEDGER_WRITE_MESSAGE, elapsed = 0 }) => (
  <Box
    role="status"
    aria-live="polite"
    sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1 }}
  >
    <CircularProgress size={18} />
    <Typography variant="body2" color="text.secondary">
      {message}
      {elapsed > 0 ? ` (${elapsed}s elapsed)` : ''}
    </Typography>
  </Box>
);

export default LedgerProgress;
