// Ethiopian Coffee Export Consortium Blockchain System (CECBS)
// Header organisation logo — one consistent, professional lockup for
// every portal.
//
// Lockup rules (logo-fix round, 2026-11-16):
//  1. ONE consistent image height (default 40px), natural width. Every
//     logo is rendered at the same height and takes the width its own
//     aspect ratio needs — wide marks (NBE 3.51:1) and square ones
//     (Customs 1.06:1) are never forced into the same fixed box.
//  2. Quiet white chip. All six logo files have opaque white
//     backgrounds (verified: the PNGs carry no alpha channel, the
//     JPEGs are RGB), so the mark cannot sit directly on the green
//     header. The chip is plain white with a small radius — no coloured
//     border, no drop shadow, no hover zoom. A brand mark is not a
//     button.
//  3. The old "professional" variant did the opposite: a fixed 120x40
//     box with 10px padding and a 3px border left only a 14px-tall
//     slot for the image, so every logo rendered as a 14px-tall speck
//     (Customs: 15px wide) inside a big white pill. That is what this
//     replaces.
//  4. No asset is redrawn, replaced or re-encoded — the marks are
//     used as supplied. At 40px tall the sources (402-738px wide)
//     downscale 3-8x and stay crisp.
//  5. Roles with no logo file (ADMIN) get the same white chip with the
//     coffee mark in the organisation colour — visible on white, unlike
//     the old purple-on-purple icon on the purple admin header.

import React from 'react';
import { Box } from '@mui/material';
import { Coffee } from '@mui/icons-material';
import { organizationColors } from '@/theme/organizationThemes';

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

export default function OrganizationLogo({ role, height = 40 }: Props) {
  const src = logoMap[role];
  const colors = organizationColors[role as keyof typeof organizationColors] || organizationColors.DEFAULT;

  return (
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
          alt={`${role} Logo`}
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
  );
}
