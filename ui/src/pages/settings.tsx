// Settings — the home for everything under "Settings" in the account
// menu (avatar → Settings → User Management, System Management).
//
// User Management and System Management used to be tabs on every portal
// tab bar (ECTA 11 tabs, Banks 11, Shipping 11…), which is what made the
// bars crowded and the system feel like seven different products. They
// now live here only, reached from the account menu; the old portal
// `?tab=` deep-links redirect here (see useTabFromQuery `redirects`).
// No workflow, API call or business logic changed — this page only
// re-hosts the existing UserManagement and AuditTrailTable components.
//
// Sections are deep-linkable: /settings (overview),
// /settings?section=users, /settings?section=system.

import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Typography,
} from '@mui/material';
import {
  AccountCircle,
  AdminPanelSettings,
  Assessment,
  Gavel,
  Person,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import UserManagement from '@/components/admin/UserManagement';
import AuditTrailTable from '@/components/portals/AuditTrailTable';
import { canManageUsers, canSeeSystemLinks } from '@/utils/roleGates';

type SectionKey = 'overview' | 'users' | 'system';

const SECTIONS: { key: SectionKey; label: string; icon: React.ReactNode; show: (role?: string) => boolean }[] = [
  { key: 'overview', label: 'Overview', icon: <SettingsIcon fontSize="small" />, show: () => true },
  { key: 'users', label: 'User Management', icon: <Person fontSize="small" />, show: (role) => canManageUsers(role) },
  { key: 'system', label: 'System Management', icon: <AdminPanelSettings fontSize="small" />, show: () => true },
];

function sectionFromQuery(value: unknown): SectionKey {
  return value === 'users' || value === 'system' ? value : 'overview';
}

export default function SettingsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [section, setSection] = useState<SectionKey>('overview');

  useEffect(() => {
    if (!router.isReady) return;
    setSection(sectionFromQuery(router.query.section));
  }, [router.isReady, router.query.section]);

  const goToSection = (key: SectionKey) => {
    setSection(key);
    void router.push(`/settings?section=${key}`, undefined, { shallow: true });
  };

  const showUsers = canManageUsers(user?.role);
  const visibleSections = SECTIONS.filter((s) => s.show(user?.role));
  // A non-admin landing on ?section=users by direct link sees the
  // overview gate message instead of a blank page.
  const effectiveSection: SectionKey =
    section === 'users' && !showUsers ? 'overview' : section;

  return (
    <ProtectedRoute>
      <Head>
        <title>Settings | CECBS</title>
        <meta name="description" content="Account settings, user management and system management." />
      </Head>

      <Box sx={{ minHeight: '100vh', bgcolor: '#f8f5fa', pb: 7 }}>
        <Box sx={{ maxWidth: 1280, mx: 'auto', px: { xs: 2, md: 3 }, pt: { xs: 2, md: 3 } }}>
          <Box sx={{ mb: 3 }}>
            <Typography variant="h4" sx={{ fontWeight: 700, color: '#1a1a1a' }}>
              Settings
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Account, users and system — from the account menu.
            </Typography>
          </Box>

          <Grid container spacing={3} alignItems="flex-start">
            {/* Section navigation — same pattern on every section, so the
                page feels like one place instead of three destinations. */}
            <Grid item xs={12} md={3}>
              <Paper elevation={1} sx={{ borderRadius: 2, overflow: 'hidden', position: { md: 'sticky' }, top: { md: 88 } }}>
                <List disablePadding>
                  {visibleSections.map((s) => (
                    <ListItemButton
                      key={s.key}
                      selected={effectiveSection === s.key}
                      onClick={() => goToSection(s.key)}
                      sx={{
                        py: 1.5,
                        '&.Mui-selected': { bgcolor: 'rgba(155, 48, 183, 0.08)', borderLeft: '3px solid #9b30b7' },
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 40, color: effectiveSection === s.key ? '#9b30b7' : 'text.secondary' }}>
                        {s.icon}
                      </ListItemIcon>
                      <ListItemText
                        primary={s.label}
                        primaryTypographyProps={{ fontSize: '0.95rem', fontWeight: effectiveSection === s.key ? 700 : 500 }}
                      />
                    </ListItemButton>
                  ))}
                </List>
              </Paper>
            </Grid>

            <Grid item xs={12} md={9}>
              {effectiveSection === 'overview' && (
                <Box>
                  {section === 'users' && !showUsers && (
                    <Alert severity="info" sx={{ mb: 3 }}>
                      User Management is available to portal administrators. Your account does not have that access.
                    </Alert>
                  )}
                  <Paper elevation={1} sx={{ borderRadius: 2, p: 3, mb: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                      <AccountCircle sx={{ fontSize: 48, color: '#9b30b7' }} />
                      <Box>
                        <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                          {user?.fullName || user?.username || 'Account holder'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {user?.email || ''}
                        </Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      <Chip label={user?.role || ''} size="small" sx={{ bgcolor: '#9b30b7', color: 'white', fontWeight: 600 }} />
                      <Chip label={user?.organization || ''} size="small" variant="outlined" />
                      {user?.status ? <Chip label={user.status} size="small" variant="outlined" /> : null}
                    </Box>
                  </Paper>

                  <Grid container spacing={3}>
                    {showUsers && (
                      <Grid item xs={12} sm={6}>
                        <Card elevation={1} sx={{ borderRadius: 2, height: '100%' }}>
                          <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                              <Person sx={{ color: '#9b30b7' }} />
                              <Typography variant="h6" sx={{ fontWeight: 700 }}>User Management</Typography>
                            </Box>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                              Create and manage portal users, roles and access — previously a tab on every portal.
                            </Typography>
                            <Button variant="contained" onClick={() => goToSection('users')} sx={{ textTransform: 'none', fontWeight: 600, bgcolor: '#9b30b7', '&:hover': { bgcolor: '#7a2596' } }}>
                              Open User Management
                            </Button>
                          </CardContent>
                        </Card>
                      </Grid>
                    )}
                    <Grid item xs={12} sm={showUsers ? 6 : 12}>
                      <Card elevation={1} sx={{ borderRadius: 2, height: '100%' }}>
                        <CardContent>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <AdminPanelSettings sx={{ color: '#9b30b7' }} />
                            <Typography variant="h6" sx={{ fontWeight: 700 }}>System Management</Typography>
                          </Box>
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            The system audit trail and links to the system areas — previously a tab on every portal.
                          </Typography>
                          <Button variant="contained" onClick={() => goToSection('system')} sx={{ textTransform: 'none', fontWeight: 600, bgcolor: '#9b30b7', '&:hover': { bgcolor: '#7a2596' } }}>
                            Open System Management
                          </Button>
                        </CardContent>
                      </Card>
                    </Grid>
                  </Grid>
                </Box>
              )}

              {effectiveSection === 'users' && (
                <Paper elevation={1} sx={{ borderRadius: 2, p: 3 }}>
                  <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
                    User Management
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Manage portal users, roles and access for your organisation.
                  </Typography>
                  <UserManagement />
                </Paper>
              )}

              {effectiveSection === 'system' && (
                <Box>
                  {canSeeSystemLinks(user?.role) && (
                    <Grid container spacing={3} sx={{ mb: 3 }}>
                      {user?.role === 'ADMIN' && (
                        <Grid item xs={12} sm={6}>
                          <Card elevation={1} sx={{ borderRadius: 2, height: '100%' }}>
                            <CardContent>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                <Assessment sx={{ color: '#9b30b7' }} />
                                <Typography variant="h6" sx={{ fontWeight: 700 }}>Admin Portal</Typography>
                              </Box>
                              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                System overview, analytics, portal access and traceability for super administrators.
                              </Typography>
                              <Button variant="outlined" onClick={() => void router.push('/admin')} sx={{ textTransform: 'none', fontWeight: 600 }}>
                                Open Admin Portal
                              </Button>
                            </CardContent>
                          </Card>
                        </Grid>
                      )}
                      <Grid item xs={12} sm={user?.role === 'ADMIN' ? 6 : 12}>
                        <Card elevation={1} sx={{ borderRadius: 2, height: '100%' }}>
                          <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                              <Gavel sx={{ color: '#9b30b7' }} />
                              <Typography variant="h6" sx={{ fontWeight: 700 }}>Risk Rules</Typography>
                            </Box>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                              The risk rules that drive automated checks across the portals.
                            </Typography>
                            <Button variant="outlined" onClick={() => void router.push('/admin/risk-rules')} sx={{ textTransform: 'none', fontWeight: 600 }}>
                              Open Risk Rules
                            </Button>
                          </CardContent>
                        </Card>
                      </Grid>
                    </Grid>
                  )}
                  <Paper elevation={1} sx={{ borderRadius: 2, p: 3 }}>
                    <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
                      System Management
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                      The system-wide audit trail — every recorded action across all portals.
                    </Typography>
                    <AuditTrailTable
                      title="System Audit Trail — Complete Transaction History"
                      autoRefresh
                      refreshInterval={60000}
                      showStats={false}
                      maxHeight={700}
                    />
                  </Paper>
                </Box>
              )}
            </Grid>
          </Grid>
        </Box>
      </Box>
    </ProtectedRoute>
  );
}
