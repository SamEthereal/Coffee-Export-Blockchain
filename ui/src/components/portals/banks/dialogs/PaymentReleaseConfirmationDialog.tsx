import React, { useState } from 'react';
import {
  Box,
  Typography,
  Alert,
  Divider,
} from '@mui/material';
import {
  Payment,
} from '@mui/icons-material';
import {
  PortalDialog,
  GhostButton,
  PrimaryButton,
} from '@/components/shared/portal';

export interface PaymentReleaseConfirmationDialogProps {
  open: boolean;
  onClose: () => void;
  paymentConfirmData: any;
  handleReleasePayment: (lcId: string, amount: number, currency: string) => Promise<void>;
}

export const PaymentReleaseConfirmationDialog: React.FC<PaymentReleaseConfirmationDialogProps> = ({
  open,
  onClose,
  paymentConfirmData,
  handleReleasePayment,
}) => {
  const [paymentReleasing, setPaymentReleasing] = useState(false);

  return (
    <PortalDialog
        brand="BANKS"
        open={open}
        onClose={() => {
          onClose();
        }}
        maxWidth="sm"
        title="Release Payment Confirmation"
        icon={<Payment />}
        actions={
          <Box sx={{ display: 'flex', gap: 2, width: '100%', justifyContent: 'flex-end' }}>
            <GhostButton
              brand="BANKS"
              onClick={() => {
                onClose();
              }}
            >
              Cancel
            </GhostButton>
            <PrimaryButton
              brand="BANKS"
              startIcon={<Payment />}
              disabled={paymentReleasing}
              onClick={async () => {
                if (paymentConfirmData && !paymentReleasing) {
                  setPaymentReleasing(true);
                  try {
                    await handleReleasePayment(
                      paymentConfirmData.lcId,
                      paymentConfirmData.amount,
                      paymentConfirmData.currency
                    );
                    // Only close dialog after successful payment
                    onClose();
                  } catch (error) {
                    // Keep dialog open on error so user sees the error message
                    console.error('[PAYMENT] Release failed:', error);
                  } finally {
                    setPaymentReleasing(false);
                  }
                }
              }}
            >
              {paymentReleasing ? 'Releasing Payment...' : 'Confirm Release'}
            </PrimaryButton>
          </Box>
        }
      >
        <Box sx={{ py: 2 }}>
          {paymentConfirmData && (
            <>
              <Alert severity="warning" sx={{ mb: 3 }}>
                <Typography variant="body2" fontWeight="bold" gutterBottom>
                  You are about to release payment for this Letter of Credit
                </Typography>
                <Typography variant="body2">
                  This action will initiate a SWIFT payment to the beneficiary bank and create an immutable blockchain signature.
                </Typography>
              </Alert>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box>
                  <Typography variant="body2" color="text.secondary">LC Number</Typography>
                  <Typography variant="body1" fontWeight="bold" color="primary">
                    {paymentConfirmData.lcId}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="body2" color="text.secondary">Exporter / Beneficiary</Typography>
                  <Typography variant="body1" fontWeight="medium">
                    {paymentConfirmData.exporterId}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="body2" color="text.secondary">Payment Amount</Typography>
                  <Typography variant="h5" color="success.main" fontWeight="bold">
                    ${paymentConfirmData.amount?.toLocaleString()} {paymentConfirmData.currency}
                  </Typography>
                </Box>

                <Divider sx={{ my: 1 }} />

                <Box sx={{ bgcolor: 'grey.50', p: 2, borderRadius: 1, border: '1px solid', borderColor: 'grey.300' }}>
                  <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                    <strong>What happens next:</strong>
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 2 }}>
                    • SWIFT MT103 payment message will be generated
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 2 }}>
                    • Payment will be sent to beneficiary's bank
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 2 }}>
                    • Blockchain record will be created (immutable)
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 2 }}>
                    • LC status will change to PAYMENT_RELEASED
                  </Typography>
                </Box>
              </Box>
            </>
          )}
        </Box>
      </PortalDialog>
  );
};

export default PaymentReleaseConfirmationDialog;
