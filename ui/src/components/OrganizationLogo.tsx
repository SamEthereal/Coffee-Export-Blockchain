// Ethiopian Coffee Export Consortium Blockchain System (CECBS)
// Header organisation lockup — emblem + organisation name + portal
// subtitle, mirroring the CBE "INTERNET BANKING" reference lockup
// (emblem left, bold org name, subtitle line below the name).
//
// Lockup rules (logo-lockup round, 2026-11-16):
//  1. Emblem stays in the quiet white chip from the logo round (40px
//     tall image, natural width, 8px radius, no border/shadow/hover):
//     all six logo files have opaque white backgrounds (verified: the
//     PNGs carry no alpha channel, the JPEGs are RGB), so the mark
//     cannot sit directly on a coloured header.
//  2. The name + subtitle sit DIRECTLY on the header background next
//     to the chip (as in the reference, where the name sits on the
//     page background). Header background colours are NOT changed.
//  3. Text colour is white on every portal — the same treatment as
//     the centre header title, which is already white on all headers.
//     Measured contrast (white vs the actual gradient behind the
//     text, sampled from live screenshots at 1440x900):
//     ECTA 5.09, ECX 6.60, Exporter 6.00, Banks 6.00, Customs 6.67,
//     NBE 7.54, Shipping 6.46, Admin 6.00 — all above WCAG AA 4.5:1.
//     The subtitle is full white too, not faded: at 0.8 opacity it
//     measured 3.85 on ECTA and 4.41 on Banks/Exporter/Admin — below
//     AA — so the hierarchy comes from size/weight/spacing, not from
//     fading. Both lines carry a subtle dark shadow (same idea as the
//     centre title) to lift them off the gradient.
//  4. The name is never truncated. The text column shows at lg
//     (1200px) and up; below lg only the chip shows, so the centre
//     title is never crushed at narrow widths. The centre title
//     (flex:1, ellipsis) absorbs any squeeze at desktop widths.
//  5. No asset is redrawn, replaced or re-encoded — the marks are
//     used as supplied. Organisation names come from PortalBrand
//     (ORG_NAMES) — never invented. Roles with no org entry (ADMIN)
//     get the system name CECBS + "Admin Portal".

import React from 'react';
import { Box, Typography } from '@mui/material';
import { Coffee } from '@mui/icons-material';
import { organizationColors } from '@/theme/organizationThemes';
import { PORTAL_BRANDS } from '@/components/shared/portal/PortalBrand';

type Props = {
  role: string;
  /** Rendered height of the logo image itself (px). Default 40. */
  height?: number;
};

const logoMap: Record<string, string> = {
  BANKS: '/logo/cbe.png',
  NBE: '/logo/nbe.jpg',
  ECTA: '/logo/ecta.png',
  ECX: '/logo/ecx.jpg',
  CUSTOMS: '/logo/customx.png',
  SHIPPING: '/logo/shipping.png',
  EXPORTER: '/logo/ecta.png', // Exporters use ECTA logo
};

// Vertical padding inside the chip; chip height = image height + 8.
const CHIP_PADDING_Y = 4;
const CHIP_PADDING_X = 10;

// Gap between the chip and the text column.
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
  const colors = organizationColors[key as keyof typeof organizationColors] || organizationColors.DEFAULT;
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
      {/* Emblem in its quiet white chip (unchanged from the logo round). */}
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          backgroundColor: '#ffffff',
          borderRadius: '8px',
          border: 'none',
          boxShadow: 'none',
          height: `${height + CHIP_PADDING_Y * 2}px`,
          padding: `${CHIP_PADDING_Y}px ${CHIP_PADDING_X}px`,
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
              // the header title; no current logo comes near it (widest
              // is NBE at 3.51:1 -> ~140px at 40px tall).
              maxWidth: '180px',
              objectFit: 'contain',
              display: 'block',
            }}
          />
        ) : (
          <Coffee sx={{ fontSize: height, color: colors.primary }} />
        )}
      </Box>

      {/* Name + subtitle, directly on the header background. Shown at
          lg (1200px) and up; below that only the chip shows so the
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
