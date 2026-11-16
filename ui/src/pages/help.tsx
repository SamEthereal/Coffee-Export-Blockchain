// Help & Support — the page the account menu's "Help & Support" item
// used to link to. There was no /help route, so the menu item landed on
// the 404 page. This is a static guide only: portal directory, what each
// portal does, and where to go when stuck. No contact details are
// invented here — users are directed to their portal administrator.

import React from 'react';
import Head from 'next/head';
import {
  Box,
  Card,
  CardContent,
  Grid,
  Paper,
  Typography,
} from '@mui/material';
import { Help as HelpIcon } from '@mui/icons-material';
import ProtectedRoute from '@/components/ProtectedRoute';

const PORTALS: { name: string; path: string; what: string }[] = [
  { name: 'ECTA Portal', path: '/portals/ecta', what: 'Exporter applications and licences, sales contracts, quality control, inspections and export permits.' },
  { name: 'ECX Portal', path: '/portals/ecx', what: 'Coffee lots, warehouse intake, grading, market prices and grading standards.' },
  { name: 'Exporter Portal', path: '/portals/exporter', what: 'Your contracts, forex and banking, shipments, customs, LCs and payments.' },
  { name: 'Banks Portal', path: '/portals/banks', what: 'Letters of credit, forex allocations, document examination, payment release and SWIFT messages.' },
  { name: 'Customs Portal', path: '/portals/customs', what: 'Customs declarations, inspections, clearance and border crossings.' },
  { name: 'NBE Portal', path: '/portals/nbe', what: 'Forex monitoring, LC monitoring, exchange rates, SWIFT monitoring, repatriation and payment release.' },
  { name: 'Shipping Portal', path: '/portals/shipping', what: 'Land transport, port arrival, container stuffing, vessel loading and delivery tracking.' },
];

export default function HelpPage() {
  return (
    <ProtectedRoute>
      <Head>
        <title>Help &amp; Support | CECBS</title>
        <meta name="description" content="Help and support for the Coffee Export Blockchain System." />
      </Head>

      <Box sx={{ minHeight: '100vh', bgcolor: '#f8f5fa', pb: 7 }}>
        <Box sx={{ maxWidth: 1280, mx: 'auto', px: { xs: 2, md: 3 }, pt: { xs: 2, md: 3 } }}>
          <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
            <HelpIcon sx={{ fontSize: 40, color: '#9b30b7' }} />
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 700, color: '#1a1a1a' }}>
                Help &amp; Support
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Ethiopian Coffee Export Consortium Blockchain System (CECBS).
              </Typography>
            </Box>
          </Box>

          <Paper elevation={1} sx={{ borderRadius: 2, p: 3, mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
              Where do I start?
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Sign in and you land on your organisation&apos;s portal. Your portal&apos;s tabs follow the
              export workflow in order — applications, contracts, forex and LC, quality and permits,
              shipping, customs, then payment and settlement. Use the search box in the header to find a
              shipment, contract, LC, lot, payment or application by ID. Your account menu (top right)
              holds your profile, settings, user management and system management.
            </Typography>
          </Paper>

          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
            Portals
          </Typography>
          <Grid container spacing={3} sx={{ mb: 3 }}>
            {PORTALS.map((p) => (
              <Grid item xs={12} sm={6} md={4} key={p.name}>
                <Card elevation={1} sx={{ borderRadius: 2, height: '100%' }}>
                  <CardContent>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{p.name}</Typography>
                    <Typography variant="body2" color="text.secondary">{p.what}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          <Paper elevation={1} sx={{ borderRadius: 2, p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
              Stuck, or something looks wrong?
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Contact your portal administrator — they can manage users and access from Settings →
              User Management in the account menu, and can see the system audit trail under Settings →
              System Management. If a step refuses with a clear error message, that message names the
              exact state the record is in; do not retry the same step — check the record&apos;s current
              status first.
            </Typography>
          </Paper>
        </Box>
      </Box>
    </ProtectedRoute>
  );
}
