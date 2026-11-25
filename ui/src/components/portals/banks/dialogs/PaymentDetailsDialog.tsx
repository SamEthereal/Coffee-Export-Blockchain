import React from 'react';
import {
  Box,
  Grid,
  Typography,
  Chip,
  Alert,
  Button,
  Divider,
} from '@mui/material';
import {
  Payment,
  Assignment,
} from '@mui/icons-material';
import {
  PortalDialog,
  GhostButton,
  PrimaryButton,
  StatusChip,
} from '@/components/shared/portal';
import BlockchainSignatureVerification from '@/components/documents/BlockchainSignatureVerification';

export interface PaymentDetailsDialogProps {
  open: boolean;
  onClose: () => void;
  selectedPayment: any;
  onViewAuditTrail: (entityType: string, entityId: string) => void;
  onOpenSettle: (payment: any) => void;
}

export const PaymentDetailsDialog: React.FC<PaymentDetailsDialogProps> = ({
  open,
  onClose,
  selectedPayment: selectedPaymentForDetails,
  onViewAuditTrail,
  onOpenSettle,
}) => {
  const chipStatus = (status?: string | null) => (status || 'PENDING') as any;

  return (
    <PortalDialog brand="BANKS" open={open} onClose={() => onClose()} maxWidth="md" title="Payment Details" icon={<Payment />} actions={<>
          <Button
            variant="outlined"
            size="small"
            startIcon={<Assignment />}
            onClick={() => {
              onViewAuditTrail('PAYMENT', selectedPaymentForDetails?.paymentId || '');
            }}
            sx={{ textTransform: 'none', mr: 'auto' }}
          >
            View Audit Trail
          </Button>
          <GhostButton brand="BANKS" onClick={() => onClose()}>Close</GhostButton>
          {selectedPaymentForDetails && ['VERIFIED', 'SWIFT_RECEIVED'].includes(String(selectedPaymentForDetails.status || '').toUpperCase()) && (
            <PrimaryButton brand="BANKS"
              variant="contained"
              onClick={() => {
                onOpenSettle(selectedPaymentForDetails);
              }}
              sx={{ textTransform: 'none' }}
            >
              Settle Payment
            </PrimaryButton>
          )}
        </>}>

          {selectedPaymentForDetails && (
            <Box sx={{ pt: 2 }}>
              <Grid container spacing={3}>
                {/* Payment ID & Contract Reference */}
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">Payment ID</Typography>
                  <Typography variant="body1" fontWeight={600}>{selectedPaymentForDetails.paymentId}</Typography>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">Contract ID</Typography>
                  <Typography variant="body1" fontWeight={600}>{selectedPaymentForDetails.contractId || 'N/A'}</Typography>
                </Grid>

                {/* Exporter & Status */}
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">Exporter ID</Typography>
                  <Typography variant="body1">{selectedPaymentForDetails.exporterId || 'N/A'}</Typography>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">Status</Typography>
                  <StatusChip 
                    label={selectedPaymentForDetails.status || 'PENDING'} 
                    status={selectedPaymentForDetails.status} 
                  />
                </Grid>

                {/* Divider */}
                <Grid item xs={12}>
                  <Divider />
                  <Typography variant="subtitle2" sx={{ mt: 2, mb: 1, color: '#9b30b7' }}>
                    Payment Information
                  </Typography>
                </Grid>

                {/* Amount */}
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">Amount</Typography>
                  <Typography variant="h6" color="primary" fontWeight={700}>
                    {(selectedPaymentForDetails.currency || 'USD')} {(selectedPaymentForDetails.amount || 0).toLocaleString()}
                  </Typography>
                </Grid>

                {/* Credit Advice Number */}
                {selectedPaymentForDetails.creditAdviceNumber && (
                  <Grid item xs={12} md={6}>
                    <Typography variant="body2" color="text.secondary">Credit Advice Number</Typography>
                    <Typography variant="body1" fontWeight={600} sx={{ fontFamily: 'monospace' }}>
                      {selectedPaymentForDetails.creditAdviceNumber}
                    </Typography>
                  </Grid>
                )}

                {/* SWIFT Reference */}
                {selectedPaymentForDetails.swiftReference && (
                  <Grid item xs={12} md={6}>
                    <Typography variant="body2" color="text.secondary">SWIFT Reference</Typography>
                    <Typography variant="body1" fontWeight={600} sx={{ fontFamily: 'monospace' }}>
                      {selectedPaymentForDetails.swiftReference}
                    </Typography>
                  </Grid>
                )}

                {/* Divider */}
                <Grid item xs={12}>
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="subtitle2" sx={{ mb: 1, color: '#9b30b7' }}>
                    Banking Details
                  </Typography>
                </Grid>

                {/* Receiving Bank */}
                {selectedPaymentForDetails.receivingBank && (
                  <Grid item xs={12} md={6}>
                    <Typography variant="body2" color="text.secondary">Receiving Bank</Typography>
                    <Typography variant="body1" fontWeight={600}>{selectedPaymentForDetails.receivingBank}</Typography>
                    {selectedPaymentForDetails.receivingBankBIC && (
                      <Typography variant="caption" color="text.secondary">
                        BIC: {selectedPaymentForDetails.receivingBankBIC}
                      </Typography>
                    )}
                  </Grid>
                )}

                {/* Paying Bank */}
                {selectedPaymentForDetails.payingBank && (
                  <Grid item xs={12} md={6}>
                    <Typography variant="body2" color="text.secondary">Paying Bank</Typography>
                    <Typography variant="body1" fontWeight={600}>{selectedPaymentForDetails.payingBank}</Typography>
                    {selectedPaymentForDetails.payingBankBIC && (
                      <Typography variant="caption" color="text.secondary">
                        BIC: {selectedPaymentForDetails.payingBankBIC}
                      </Typography>
                    )}
                  </Grid>
                )}

                {/* Beneficiary */}
                {selectedPaymentForDetails.beneficiaryName && (
                  <Grid item xs={12}>
                    <Typography variant="body2" color="text.secondary">Beneficiary</Typography>
                    <Typography variant="body1" fontWeight={600}>{selectedPaymentForDetails.beneficiaryName}</Typography>
                    {selectedPaymentForDetails.beneficiaryAccount && (
                      <Typography variant="caption" color="text.secondary">
                        Account: {selectedPaymentForDetails.beneficiaryAccount}
                      </Typography>
                    )}
                  </Grid>
                )}

                {/* Dates */}
                <Grid item xs={12}>
                  <Divider sx={{ my: 1 }} />
                </Grid>
                
                {selectedPaymentForDetails.receivedDate && (
                  <Grid item xs={12} md={6}>
                    <Typography variant="body2" color="text.secondary">Received Date</Typography>
                    <Typography variant="body1" fontWeight={600}>
                      {new Date(selectedPaymentForDetails.receivedDate).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </Typography>
                  </Grid>
                )}

                {selectedPaymentForDetails.settlementDate && (
                  <Grid item xs={12} md={6}>
                    <Typography variant="body2" color="text.secondary">Settlement Date</Typography>
                    <Typography variant="body1" fontWeight={600}>
                      {new Date(selectedPaymentForDetails.settlementDate).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </Typography>
                  </Grid>
                )}

                {/* Remarks */}
                {selectedPaymentForDetails.remarks && (
                  <Grid item xs={12}>
                    <Alert severity="info">
                      <Typography variant="body2">
                        <strong>Remarks:</strong> {selectedPaymentForDetails.remarks}
                      </Typography>
                    </Alert>
                  </Grid>
                )}
              </Grid>

              {/* Blockchain Verification - Component handles all messaging */}
              <Box sx={{ mt: 3 }}>
                <BlockchainSignatureVerification
                  entityType="PAYMENT"
                  entityId={selectedPaymentForDetails.paymentId || ''}
                />
              </Box>
            </Box>
          )}
        
      </PortalDialog>
  );
};

export default PaymentDetailsDialog;
