// Ethiopian Coffee Export Consortium Blockchain System (CECBS)
// Header organisation lockup — transparent emblem + organisation name +
// portal subtitle, mirroring the CBE "INTERNET BANKING" reference lockup
// (emblem left, bold org name, subtitle line below the name).
//
// Lockup rules (logo-transparent round, 2026-11-16; supersedes the
// white-chip rules from the logo/logo-lockup rounds):
//  1. NO white chip. The emblem sits DIRECTLY on the header background.
//     The six logo files have opaque white backgrounds, so each was
//     processed into a transparent-background emblem asset
//     (ui/public/logo/<name>-mark.png — originals untouched):
//     cropped to the emblem (the embedded text is redundant — the
//     white org-name/subtitle text next to the emblem carries the
//     name), white converted to alpha with edge cleanup, and only
//     where the emblem's own colours would vanish on its header
//     were parts recoloured to white:
//       cbe/ecta/nbe — gold emblem, no recolour (gold reads on
//         purple/green/brown).
//       ecx — ring kept green/yellow; the black "ECX" + Amharic
//         inside the ring recoloured white (black would vanish on
//         blue). Recolour confined to the tight text box so the
//         green arrow was not whitened.
//       customx — blue hands/coin recoloured white (blue-on-blue
//         was invisible); yellow sun rays kept.
//       shipping — dark-green wheel recoloured white (green-on-teal
//         was invisible); yellow/red waves kept.
//     Admin has no logo file — the fallback coffee icon is white,
//     directly on the purple admin header.
//  2. The name + subtitle sit DIRECTLY on the header background next
//     to the emblem (unchanged from the lockup round). Header
//     background colours are NOT changed.
//  3. Text colour is white on every portal — the same treatment as
//     the centre header title. Measured contrast (white vs the actual
//     gradient behind the text, sampled from live screenshots at
//     1440x900): ECTA 5.35, ECX 6.64, Exporter 6.05, Banks 6.13,
//     Customs 6.81, NBE 7.66, Shipping 6.64, Admin 6.00 — all above
//     WCAG AA 4.5:1. The subtitle is full white too, not faded.
//     Both lines carry a subtle dark shadow (same idea as the centre
//     title) to lift them off the gradient.
//  4. The name is never truncated. The text column shows at lg
//     (1200px) and up; below lg only the emblem shows, so the centre
//     title is never crushed at narrow widths. The centre title
//     (flex:1, ellipsis) absorbs any squeeze at desktop widths.
//  5. Organisation names come from PortalBrand (ORG_NAMES) — never
//     invented. Roles with no org entry (ADMIN) get the system name
//     CECBS + "Admin Portal".

import React from 'react';
import { Box, Typography } from '@mui/material';
import { Coffee } from '@mui/icons-material';
import { PORTAL_BRANDS } from '@/components/shared/portal/PortalBrand';

type Props = {
  role: string;
  /** Rendered height of the emblem itself (px). Default 40. */
  height?: number;
};

// Transparent-background emblem assets (processed from the originals in
// ui/public/logo/ — see the header comment; originals are untouched).
const logoMap: Record<string, string> = {
  BANKS: '/logo/cbe-mark.png',
  NBE: '/logo/nbe-mark.png',
  ECTA: '/logo/ecta-mark.png',
  ECX: '/logo/ecx-mark.png',
  CUSTOMS: '/logo/customx-mark.png',
  SHIPPING: '/logo/shipping-mark.png',
  EXPORTER: '/logo/ecta-mark.png', // Exporters use ECTA logo
};

// Gap between the emblem and the text column.
const TEXT_GAP = 12;

// Roles with no organisation entry (ADMIN) get the system name.
const FALLBACK_BRAND = { orgName: 'CECBS', portalName: 'Admin Portal' };

// Roles are org keys ('ECTA', 'BANKS', ...) but some users carry the
// display role ('ECTA Portal Administrator'); normalise both to the key.
function orgKey(role: string): string {
  return role.replace(/ Portal Administrator$/, '');
}

export default function OrganizationLogo({ role, height = 40 }: Props) {
  const key = orgKey(role);
  const src = logoMap[key];
  const brand =
    (PORTAL_BRANDS as Record<string, { orgName: string; portalName: string }>)[key] || FALLBACK_BRAND;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: `${TEXT_GAP}px`,
        flexShrink: 0,
      }}
    >
      {/* Emblem directly on the header background — no chip, no
          background, no border, no shadow. The asset itself is
          transparent (white converted to alpha), so the header colour
          shows through around the mark. */}
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          height: `${height}px`,
        }}
      >
        {src ? (
          <Box
            component="img"
            src={src}
            alt={`${key} Logo`}
            sx={{
              height: `${height}px`,
              width: 'auto',
              // Safety cap so an unexpectedly wide mark can never crowd
              // the header title; the cropped emblems are 32–47px wide
              // at 40px tall, far below it.
              maxWidth: '180px',
              objectFit: 'contain',
              display: 'block',
            }}
          />
        ) : (
          // Admin fallback: white coffee icon, directly on the header
          // (the old purple icon vanished on the purple admin header).
          <Coffee sx={{ fontSize: height, color: '#ffffff' }} />
        )}
      </Box>

      {/* Name + subtitle, directly on the header background. Shown at
          lg (1200px) and up; below that only the emblem shows so the
          centre title is never crushed. The name is never truncated. */}
      <Box
        sx={{
          display: { xs: 'none', lg: 'flex' },
          flexDirection: 'column',
          justifyContent: 'center',
          flexShrink: 0,
          minWidth: 0,
        }}
      >
        <Typography
          component="span"
          sx={{
            fontSize: '15px',
            fontWeight: 700,
            lineHeight: 1.25,
            color: '#ffffff',
            whiteSpace: 'nowrap',
            textShadow: '0 1px 3px rgba(0, 0, 0, 0.4)',
          }}
        >
          {brand.orgName}
        </Typography>
        <Typography
          component="span"
          sx={{
            fontSize: '11px',
            fontWeight: 600,
            lineHeight: 1.3,
            letterSpacing: '1px',
            textTransform: 'uppercase',
            color: '#ffffff',
            whiteSpace: 'nowrap',
            textShadow: '0 1px 3px rgba(0, 0, 0, 0.4)',
          }}
        >
          {brand.portalName}
        </Typography>
      </Box>
    </Box>
  );
}
