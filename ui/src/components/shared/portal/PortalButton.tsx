// PortalButton — the standard button variants, brand-resolved.
// Every portal previously repeated the same inline sx
// (`bgcolor: BRAND_COLOR`, hover shade, outlined purple, …) per button,
// with occasional typos (#7a2592 vs #7a2692). These four wrappers are the
// only button styles portals should use:
//  - PrimaryButton   contained, flat brand colour, hover brand-dark
//  - SecondaryButton outlined, brand border + text, hover brand tint
//  - DangerButton    contained MUI error (reject / delete)
//  - GhostButton     plain text button (Cancel / Close)
// Loading/success dialog submits keep using the shared AnimatedButton
// (it has spinner + success-check behaviour); its brandColor should be
// the portal brand.
//
// Loading behaviour (smoothness round, 2026-11-13) — identical for all
// four variants, because MUI v5's Button has NO loading prop and the
// old wrappers silently dropped `loading={...}`:
//  - `loading` (explicit) OR an async onClick that returns a promise:
//    the button tracks the promise itself, so call sites need no local
//    loading state for the common case. A synchronous ref guard refuses
//    a second click in the same tick (the API clients also dedupe
//    in-flight mutations — belt and braces, Round 3 Area 2).
//  - While pending: disabled, aria-busy, a spinner as startIcon and the
//    LABEL STAYS VISIBLE (the old AnimatedButton hid the label behind
//    a centred spinner; the old hand-rolled sites each did something
//    different). `loadingLabel` replaces the label, e.g. "Approving…".
//  - After 3 s pending, the real elapsed time is appended ("· 7s") —
//    an honest elapsed indication, never a fake percentage.
//  - `ledgerWrite` marks actions known to write to the chain (allocate,
//    approve, reject, release, settle, issue-permit, …): the button
//    gets a title/aria-label saying the ledger write usually takes a
//    few seconds. Pair it with <LedgerProgress> inside the dialog for
//    the full in-flight note.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { alpha, Button, ButtonProps, CircularProgress } from '@mui/material';
import { getPortalBrand, PortalOrgKey } from './PortalBrand';
import { useElapsedSeconds } from './LedgerProgress';

export type PortalButtonProps = ButtonProps & {
  brand: PortalOrgKey;
  /** Anchor download attribute (MUI's ButtonProps type omits it). */
  download?: boolean | string;
  /**
   * Show the loading state. When omitted, an async onClick is tracked
   * automatically (the button is pending until the returned promise
   * settles). Pass false explicitly only to suppress auto-tracking.
   */
  loading?: boolean;
  /** Label shown while pending instead of the children, e.g. "Approving…". */
  loadingLabel?: string;
  /**
   * True when the action writes to the blockchain ledger (approve /
   * reject / allocate / release / settle / issue-permit / …). Adds the
   * honest "writing to the ledger" hint to the button's title and
   * aria-label while pending.
   */
  ledgerWrite?: boolean;
};

function mergeSx(base: object, sx: ButtonProps['sx']): ButtonProps['sx'] {
  return [base, ...(Array.isArray(sx) ? sx : [sx])] as ButtonProps['sx'];
}

const LEDGER_HINT = 'Writing to the ledger — this usually takes a few seconds';

/**
 * Shared pending-state machine for all portal buttons. Returns the
 * effective pending flag, the elapsed seconds while pending, and a
 * wrapped onClick that tracks an async handler's promise.
 */
function useButtonPending(
  externalLoading: boolean | undefined,
  onClick: ButtonProps['onClick'],
) {
  const [internalLoading, setInternalLoading] = useState(false);
  const busyRef = useRef(false);
  const pending = externalLoading ?? internalLoading;
  const elapsed = useElapsedSeconds(pending);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (!onClick || busyRef.current) return;
      let result: unknown;
      try {
        result = (onClick as (e: React.MouseEvent<HTMLButtonElement>) => unknown)(event);
      } catch (err) {
        // A synchronously throwing handler must not leave the ref guard
        // set: without this the button would refuse every later click
        // (busyRef never clears) even though nothing is pending.
        busyRef.current = false;
        throw err;
      }
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        busyRef.current = true;
        setInternalLoading(true);
        (result as Promise<unknown>).then(
          () => {
            setInternalLoading(false);
            busyRef.current = false;
          },
          () => {
            setInternalLoading(false);
            busyRef.current = false;
          },
        );
      }
    },
    [onClick],
  );

  return { pending, elapsed, handleClick };
}

type VariantProps = PortalButtonProps & {
  variant: 'contained' | 'outlined' | 'text';
  color?: ButtonProps['color'];
  baseSx: object;
};

const PortalButtonBase: React.FC<VariantProps> = ({
  brand: _brand,
  loading: externalLoading,
  loadingLabel,
  ledgerWrite,
  onClick,
  disabled,
  startIcon,
  children,
  sx,
  title,
  variant,
  color,
  baseSx,
  ...props
}) => {
  const { pending, elapsed, handleClick } = useButtonPending(externalLoading, onClick);
  const label = pending && loadingLabel ? loadingLabel : children;
  const hint = ledgerWrite ? LEDGER_HINT : undefined;

  return (
    <Button
      variant={variant}
      color={color}
      {...props}
      onClick={handleClick}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      aria-label={pending && ledgerWrite ? `${typeof children === 'string' ? children : 'Working'} — ${LEDGER_HINT.toLowerCase()}` : undefined}
      title={pending && hint ? hint : title}
      startIcon={
        pending ? <CircularProgress size={18} color="inherit" /> : startIcon
      }
      sx={mergeSx(baseSx, sx)}
    >
      {label}
      {pending && elapsed >= 3 ? (
        <span style={{ marginLeft: 6, opacity: 0.85 }}>· {elapsed}s</span>
      ) : null}
    </Button>
  );
};

export const PrimaryButton: React.FC<PortalButtonProps> = ({ brand, sx, ...props }) => {
  const b = getPortalBrand(brand);
  return (
    <PortalButtonBase
      brand={brand}
      variant="contained"
      baseSx={{
        bgcolor: b.primary,
        '&:hover': { bgcolor: b.dark },
        '&.Mui-disabled': {
          bgcolor: 'rgba(0, 0, 0, 0.12)',
          color: 'rgba(0, 0, 0, 0.26)',
        },
        textTransform: 'none',
        fontWeight: 600,
      }}
      sx={sx}
      {...props}
    />
  );
};

export const SecondaryButton: React.FC<PortalButtonProps> = ({ brand, sx, ...props }) => {
  const b = getPortalBrand(brand);
  return (
    <PortalButtonBase
      brand={brand}
      variant="outlined"
      baseSx={{
        borderColor: b.primary,
        color: b.primary,
        '&:hover': { borderColor: b.dark, bgcolor: alpha(b.primary, 0.05) },
        '&.Mui-disabled': {
          borderColor: 'rgba(0, 0, 0, 0.12)',
          color: 'rgba(0, 0, 0, 0.26)',
        },
        textTransform: 'none',
        fontWeight: 600,
      }}
      sx={sx}
      {...props}
    />
  );
};

export const DangerButton: React.FC<PortalButtonProps> = ({ brand, sx, ...props }) => (
  <PortalButtonBase
    brand={brand}
    variant="contained"
    color="error"
    baseSx={{ textTransform: 'none', fontWeight: 600 }}
    sx={sx}
    {...props}
  />
);

export const GhostButton: React.FC<PortalButtonProps> = ({ brand, sx, ...props }) => (
  <PortalButtonBase
    brand={brand}
    variant="text"
    baseSx={{ textTransform: 'none', fontWeight: 600 }}
    sx={sx}
    {...props}
  />
);
