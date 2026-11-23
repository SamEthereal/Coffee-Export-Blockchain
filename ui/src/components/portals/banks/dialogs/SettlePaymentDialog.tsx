import React from 'react';
import {
  Box,
  Grid,
} from '@mui/material';
import {
  PortalDialog,
  GhostButton,
  PrimaryButton,
  PortalField,
} from '@/components/shared/portal';
import { validateBIC } from '@/utils/fieldValidation';

export interface SettlePaymentDialogProps {
  open: boolean;
  onClose: () => void;
  selectedPayment: any;
  settleForm: any;
  setSettleForm: React.Dispatch<React.SetStateAction<any>>;
  handleSettlePayment: () => Promise<void>;
  settling: boolean;
}

export const SettlePaymentDialog: React.FC<SettlePaymentDialogProps> = ({
  open,
  onClose,
  selectedPayment: selectedPaymentForDetails,
  settleForm,
  setSettleForm,
  handleSettlePayment,
  settling,
}) => {
  return (
    <PortalDialog brand="BANKS" open={open} onClose={() => onClose()} maxWidth="sm" title={<>Settle Payment {selectedPaymentForDetails?.paymentId ? `— ${selectedPaymentForDetails.paymentId}` : ''}</>} actions={<>
          <GhostButton brand="BANKS" onClick={() => onClose()}>Cancel</GhostButton>
          <PrimaryButton brand="BANKS"
            variant="contained"
            onClick={handleSettlePayment}
            loading={settling}
            loadingLabel="Settling…"
            ledgerWrite
            disabled={settling || !(Number(settleForm.exchangeRate) > 0) || !(Number(settleForm.retentionRate) > 0) || !(Number(settleForm.retentionRate) <= 100) || !settleForm.payingBank || !validateBIC(settleForm.payingBankBIC, 'Paying bank BIC').valid || !settleForm.swiftReference || !settleForm.nbeApprovalRef}
          >
            Settle Payment
          </PrimaryButton>
        </>}>

          <Box sx={{ pt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <PortalField
                  label="Exchange Rate (ETB/USD) *"
                  type="number"
                  value={settleForm.exchangeRate}
                  onChange={(e) => setSettleForm({ ...settleForm, exchangeRate: e.target.value })}
                  fullWidth
                  required
                  error={settleForm.exchangeRate !== '' && !(Number(settleForm.exchangeRate) > 0)}
                  helperText={settleForm.exchangeRate !== '' && !(Number(settleForm.exchangeRate) > 0) ? 'Rate must be greater than 0 — a 0 rate is rejected, never settled at a default rate.' : 'Use the live NBE rate; 0 is not accepted.'}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <PortalField
                  label="Retention Rate (%) *"
                  type="number"
                  value={settleForm.retentionRate}
                  onChange={(e) => setSettleForm({ ...settleForm, retentionRate: e.target.value })}
                  fullWidth
                  required
                  error={settleForm.retentionRate !== '' && !(Number(settleForm.retentionRate) > 0 && Number(settleForm.retentionRate) <= 100)}
                  helperText={settleForm.retentionRate !== '' && !(Number(settleForm.retentionRate) > 0 && Number(settleForm.retentionRate) <= 100) ? 'Retention must be greater than 0 and at most 100.' : undefined}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <PortalField
                  label="Paying Bank *"
                  value={settleForm.payingBank}
                  onChange={(e) => setSettleForm({ ...settleForm, payingBank: e.target.value })}
                  fullWidth
                  required
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <PortalField
                  label="Paying Bank BIC *"
                  value={settleForm.payingBankBIC}
                  onChange={(e) => setSettleForm({ ...settleForm, payingBankBIC: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11) })}
                  fullWidth
                  required
                  helperText="8 or 11 characters, e.g. CBETETAA"
                  error={settleForm.payingBankBIC.length > 0 && !validateBIC(settleForm.payingBankBIC, 'Paying bank BIC').valid}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <PortalField
                  label="SWIFT Reference *"
                  value={settleForm.swiftReference}
                  onChange={(e) => setSettleForm({ ...settleForm, swiftReference: e.target.value })}
                  fullWidth
                  required
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <PortalField
                  label="NBE Approval Reference *"
                  value={settleForm.nbeApprovalRef}
                  onChange={(e) => setSettleForm({ ...settleForm, nbeApprovalRef: e.target.value })}
                  fullWidth
                  required
                />
              </Grid>
            </Grid>
          </Box>
        
      </PortalDialog>
  );
};

export default SettlePaymentDialog;
