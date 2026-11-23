import React from 'react';
import {
  Box,
  Grid,
  Typography,
  Chip,
  Alert,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  CurrencyExchange,
  ExpandMore,
} from '@mui/icons-material';
import {
  PortalDialog,
  GhostButton,
  PrimaryButton,
  DangerButton,
  StatusChip,
} from '@/components/shared/portal';
import { apiFetch } from '@/utils/apiClient';
import BlockchainSignatureVerification from '@/components/documents/BlockchainSignatureVerification';

export interface ForexDetailsDialogProps {
  open: boolean;
  onClose: () => void;
  selectedForex: any;
  showError: (title: string, message: string) => void;
  onOpenAllocationDialog: (rate: number, policy: number) => void;
  handleRejectForex: (forexId: string) => Promise<void>;
  onOpenUtilizeDialog: (forex: any) => void;
}

export const ForexDetailsDialog: React.FC<ForexDetailsDialogProps> = ({
  open,
  onClose,
  selectedForex,
  showError,
  onOpenAllocationDialog,
  handleRejectForex,
  onOpenUtilizeDialog,
}) => {
  const chipStatus = (status?: string | null) => (status || 'PENDING') as any;

  return (
    <PortalDialog brand="BANKS" open={open} onClose={() => onClose()} maxWidth="md" title="Forex Allocation Details" icon={<CurrencyExchange />} actions={<>
          <GhostButton brand="BANKS" onClick={() => onClose()}>Close</GhostButton>
          {/* Bank actions on forex: Allocate (REQUESTED), Reject (REQUESTED/CONFIRMED), Utilise (ALLOCATED) */}
          {selectedForex && selectedForex.status === 'REQUESTED' && (
            <>
              <PrimaryButton 
                brand="BANKS"
                onClick={async () => {
                  // Close details dialog and open allocation dialog
                  onClose();
                  
                  // Fetch NBE exchange rate and retention policy
                  setAllocationPolicyReady(false);
                  try {
                    const token = localStorage.getItem('authToken');
                    const currency = String(selectedForex.currency || 'USD').toUpperCase();
                    
                    const [rateResponse, policyResponse] = await Promise.all([
                      apiFetch(`/forex/rates/${encodeURIComponent(currency)}/current`, {
                        method: 'GET',
                        headers: token ? { 'Authorization': `Bearer ${token}` } : undefined,
                      }),
                      apiFetch('/forex/retention-policy/COFFEE', {
                        method: 'GET',
                        headers: token ? { 'Authorization': `Bearer ${token}` } : undefined,
                      }),
                    ]);
                    
                    const [rateResult, policyResult] = await Promise.all([
                      rateResponse.json(),
                      policyResponse.json()
                    ]);
                    
                    const activeRate = Number(rateResult.data?.midRate ?? rateResult.data?.MidRate);
                    const retentionRate = Number(policyResult.data?.retentionRate ?? policyResult.data?.RetentionRate);
                    
                    if (!rateResult.success || !policyResult.success || !Number.isFinite(activeRate) || activeRate <= 0 || !Number.isFinite(retentionRate) || retentionRate < 0) {
                      showError('NBE Ledger Data Required', 'An active exchange rate and COFFEE retention policy are required before forex can be allocated.');
                      return;
                    }
                    
                    // Auto-generate approval reference with timestamp
                    const approvalRef = `FOREX-ALLOC-${Date.now()}`;
                    
                    setAllocationForm({
                      forexId: selectedForex.forexId,
                      lcId: selectedForex.lcId || '',
                      amount: selectedForex.requestedAmount || 0,
                      exchangeRate: activeRate,
                      retentionRate: retentionRate,
                      officer: user?.fullName || user?.username || 'Bank Officer',
                      approvalRef: approvalRef,
                      expiryDate: selectedForex.expiryDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
                    });
                    setAllocationPolicyReady(true);
                  } catch (error) {
                    showError('NBE Ledger Data Required', 'Unable to load the current exchange rate and retention policy.');
                  }
                  
                  setAllocationDialogOpen(true);
                }}
                startIcon={<CheckCircle />}
              >
                Allocate Forex
              </PrimaryButton>
              <DangerButton brand="BANKS"
                onClick={() => handleRejectForex(selectedForex)}
                loadingLabel="Rejecting…"
                ledgerWrite
                color="error"
              >
                Reject
              </DangerButton>
            </>
          )}
          {selectedForex && selectedForex.status === 'CONFIRMED' && (
            <DangerButton brand="BANKS"
              onClick={() => handleRejectForex(selectedForex)}
              loadingLabel="Rejecting…"
              ledgerWrite
              color="error"
            >
              Reject
            </DangerButton>
          )}
          {selectedForex && selectedForex.status === 'ALLOCATED' && (
            <PrimaryButton brand="BANKS" onClick={() => handleUtilizeForex(selectedForex)}
            loadingLabel="Utilising…"
            ledgerWrite
            startIcon={<CheckCircle />}
            >
              Utilise
            </PrimaryButton>
          )}
        </>}>

          {selectedForex && (
            <Box sx={{ pt: 2 }}>
              <Grid container spacing={3}>
                {/* Forex ID & LC Reference */}
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">Forex ID</Typography>
                  <Typography variant="body1" fontWeight={600}>{selectedForex.forexId}</Typography>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">LC Reference</Typography>
                  <Typography variant="body1" fontWeight={600}>{selectedForex.lcId || 'N/A'}</Typography>
                </Grid>

                {/* Exporter & Status */}
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">Exporter ID</Typography>
                  <Typography variant="body1">{selectedForex.exporterId || 'N/A'}</Typography>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">Status</Typography>
                  <StatusChip 
                    label={selectedForex.status || 'PENDING'} 
                    status={chipStatus(selectedForex.status)}
                  />
                </Grid>

                {/* Divider */}
                <Grid item xs={12}>
                  <Divider />
                  <Typography variant="subtitle2" sx={{ mt: 2, mb: 1, color: '#9b30b7' }}>
                    {selectedForex.status === 'REQUESTED' ? 'Requested Allocation' : 'Allocation Breakdown'}
                  </Typography>
                </Grid>

                {/* Amount (Requested or Allocated) */}
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">
                    {selectedForex.status === 'REQUESTED' ? 'Requested Amount' : 'Allocated Amount'}
                  </Typography>
                  <Typography variant="h6" color="primary" fontWeight={700}>
                    ${(selectedForex.status === 'REQUESTED' ? (selectedForex.requestedAmount || 0) : (selectedForex.allocatedAmount || 0)).toLocaleString()} USD
                  </Typography>
                </Grid>

                {/* Exchange Rate */}
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">Exchange Rate</Typography>
                  {selectedForex.status === 'REQUESTED' || !selectedForex.exchangeRate || selectedForex.exchangeRate === 0 ? (
                    <Typography variant="h6" fontWeight={600} color="warning.main">
                      Pending Allocation
                    </Typography>
                  ) : (
                    <Typography variant="h6" fontWeight={600}>
                      {Number(selectedForex.exchangeRate).toFixed(2)} ETB/USD
                    </Typography>
                  )}
                </Grid>

                {/* USD Retention */}
                <Grid item xs={12} md={6}>
                  <Paper sx={{ p: 2, bgcolor: '#f5f5f5', border: '1px solid #e0e0e0' }}>
                    <Typography variant="body2" color="text.secondary">
                      {selectedForex.retentionRate || 0}% USD Retention
                    </Typography>
                    {selectedForex.status === 'REQUESTED' || !selectedForex.retentionRate || selectedForex.retentionRate === 0 ? (
                      <>
                        <Typography variant="h5" fontWeight={700} color="warning.main">
                          Pending Allocation
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Retention rate must match the active NBE policy recorded on the ledger.
                        </Typography>
                      </>
                    ) : (
                      <>
                        <Typography variant="h5" fontWeight={700} color="#1976d2">
                          ${((selectedForex.allocatedAmount || 0) * selectedForex.retentionRate / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Retained in USD account
                        </Typography>
                      </>
                    )}
                  </Paper>
                </Grid>

                {/* ETB Conversion */}
                <Grid item xs={12} md={6}>
                  <Paper sx={{ p: 2, bgcolor: '#f5f5f5', border: '1px solid #e0e0e0' }}>
                    <Typography variant="body2" color="text.secondary">
                      {100 - selectedForex.retentionRate}% ETB Conversion
                    </Typography>
                    {selectedForex.status === 'REQUESTED' || selectedForex.exchangeRate === 0 ? (
                      <>
                        <Typography variant="h5" fontWeight={700} color="warning.main">
                          Pending Allocation
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Conversion amount will be calculated upon allocation
                        </Typography>
                      </>
                    ) : (
                      <>
                        <Typography variant="h5" fontWeight={700} color="#2e7d32">
                          {((selectedForex.allocatedAmount || 0) * (100 - selectedForex.retentionRate) / 100 * selectedForex.exchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Converted to Ethiopian Birr
                        </Typography>
                      </>
                    )}
                  </Paper>
                </Grid>

                {/* Expiry Date */}
                <Grid item xs={12}>
                  <Divider sx={{ my: 1 }} />
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">Expiry Date</Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {selectedForex.expiryDate ? new Date(selectedForex.expiryDate).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    }) : 'N/A'}
                  </Typography>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">Currency</Typography>
                  <Typography variant="body1" fontWeight={600}>{selectedForex.currency || 'USD'}</Typography>
                </Grid>

                {/* Info Alert */}
                {selectedForex.status === 'ALLOCATED' && (
                  <Grid item xs={12}>
                    <Alert severity="success" sx={{ mt: 2 }}>
                      <Typography variant="body2">
                        <strong>Forex Allocated:</strong> This allocation is active and available for the exporter. 
                        The exchange and retention rates shown above are recorded on the ledger.
                      </Typography>
                    </Alert>
                  </Grid>
                )}
                
                {/* Info Alert for REQUESTED */}
                {selectedForex.status === 'REQUESTED' && (
                  <Grid item xs={12}>
                    <Alert severity="info" sx={{ mt: 2 }}>
                      <Typography variant="body2">
                        <strong>Forex Allocation Requested:</strong> This request is awaiting NBE confirmation. The bank can allocate only after NBE confirms it — allocation uses the active NBE exchange rate and the explicitly recorded retention rate.
                      </Typography>
                    </Alert>
                  </Grid>
                )}
              </Grid>

              
{/* EXPERT PATTERN: Progressive Disclosure */}
              <Box sx={{ mt: 3 }}>
                <Divider sx={{ my: 2 }} />
                <Typography variant="h6" gutterBottom>Activity Timeline</Typography>
                {forexDetailsOpen && (
                  <BusinessActivityTimeline entityType="FOREX" entityId={selectedForex.forexId || ''} />
                )}
                <Divider sx={{ my: 3 }} />
                <Accordion>
                  <AccordionSummary expandIcon={<ExpandMore />}>
                    <Typography>🔐 Blockchain Verification</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    {forexDetailsOpen && <BlockchainSignatureVerification entityType="FOREX_ALLOCATION" entityId={selectedForex.forexId || ''} />}
                  </AccordionDetails>
                </Accordion>
              </Box>
            </Box>
          )}
        
      </PortalDialog>
  );
};

export default ForexDetailsDialog;
