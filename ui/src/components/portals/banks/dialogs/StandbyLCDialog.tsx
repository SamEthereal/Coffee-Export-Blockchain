import React from 'react';
import {
  Box,
  Grid,
  Typography,
  Alert,
  MenuItem,
} from '@mui/material';
import {
  PortalDialog,
  GhostButton,
  PrimaryButton,
  PortalField,
} from '@/components/shared/portal';

export interface StandbyLCDialogProps {
  open: boolean;
  onClose: () => void;
  standbyForm: any;
  setStandbyForm: React.Dispatch<React.SetStateAction<any>>;
  handleIssueStandbyLC: () => Promise<void>;
  issuingStandby: boolean;
  standbyResult: any;
  standbyError: string | null;
  contracts: any[];
}

export const StandbyLCDialog: React.FC<StandbyLCDialogProps> = ({
  open,
  onClose,
  standbyForm,
  setStandbyForm,
  handleIssueStandbyLC,
  issuingStandby,
  standbyResult,
  standbyError,
  contracts,
}) => {
  return (
    <PortalDialog brand="BANKS" open={open} onClose={() => onClose()} maxWidth="md" title="Issue Standby Letter of Credit" actions={<>
        <GhostButton brand="BANKS" onClick={() => onClose()}>Cancel</GhostButton>
        <PrimaryButton brand="BANKS"
          variant="contained"
          onClick={handleIssueStandbyLC}
          loading={issuingStandby}
          loadingLabel="Issuing…"
          ledgerWrite
          disabled={issuingStandby || !standbyForm.standbyLCNumber.trim() || !standbyForm.contractId || !(Number(standbyForm.amount) > 0) || !standbyForm.currency.trim() || !standbyForm.expiryDate || !standbyForm.type || !standbyForm.purpose.trim() || !standbyForm.beneficiary.trim() || !standbyForm.applicant.trim()}
        >
          Issue Standby LC
        </PrimaryButton>
      </>}>
        <Box sx={{ pt: 2 }}>
          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="body2">
              <strong>Standby LC (UCP 600 / ISP98):</strong> a bank guarantee — performance, advance payment, bid bond or financial — issued against an ECTA-approved contract. The guarantee is written to the ledger first; the issue is confirmed only when the ledger transaction succeeds.
            </Typography>
          </Alert>
          {standbyResult && (
            <Alert severity="success" sx={{ mb: 3 }}>
              <Typography variant="body2">
                <strong>Issued:</strong> {standbyResult.standbyLCNumber} ({standbyResult.standbyLCId}) — status ISSUED.
              </Typography>
              <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                <strong>Ledger txId:</strong> {standbyResult.txId}
              </Typography>
            </Alert>
          )}
          {standbyError && (
            <Alert severity="error" sx={{ mb: 3 }}>
              <Typography variant="body2">
                <strong>Issue failed:</strong> {standbyError}
              </Typography>
            </Alert>
          )}
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <PortalField
                label="Standby LC Number *"
                value={standbyForm.standbyLCNumber}
                onChange={(e) => setStandbyForm({ ...standbyForm, standbyLCNumber: e.target.value })}
                fullWidth
                required
                helperText="Must be unique — a duplicate number is rejected with 409."
              />
            </Grid>
            <Grid item xs={12} md={6}>
              {contracts.length > 0 ? (
                <PortalField
                  label="Contract *"
                  select
                  value={standbyForm.contractId}
                  onChange={(e) => {
                    const selected = contracts.find(c => c.contractId === e.target.value);
                    setStandbyForm(prev => ({
                      ...prev,
                      contractId: e.target.value,
                      beneficiary: selected?.exporterId || prev.beneficiary,
                      applicant: selected?.exporterId || prev.applicant,
                    }));
                  }}
                  fullWidth
                  required
                  helperText="Only ECTA-approved contracts can carry a standby LC."
                >
                  {contracts.map((c) => (
                    <MenuItem key={c.contractId} value={c.contractId}>
                      {c.contractId} — {c.exporterId} ({c.totalValue?.toLocaleString()} {c.currency})
                    </MenuItem>
                  ))}
                </PortalField>
              ) : (
                <PortalField
                  label="Contract ID *"
                  value={standbyForm.contractId}
                  onChange={(e) => setStandbyForm({ ...standbyForm, contractId: e.target.value })}
                  fullWidth
                  required
                  helperText="Contract must exist and be APPROVED or COMPLETED."
                />
              )}
            </Grid>
            <Grid item xs={12} md={6}>
              <PortalField
                label="Amount *"
                type="number"
                value={standbyForm.amount}
                onChange={(e) => setStandbyForm({ ...standbyForm, amount: e.target.value })}
                fullWidth
                required
                error={standbyForm.amount !== '' && !(Number(standbyForm.amount) > 0)}
                helperText={standbyForm.amount !== '' && !(Number(standbyForm.amount) > 0) ? 'Amount must be greater than 0.' : undefined}
                inputProps={{ step: '0.01', min: 0 }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <PortalField
                label="Currency *"
                value={standbyForm.currency}
                onChange={(e) => setStandbyForm({ ...standbyForm, currency: e.target.value })}
                fullWidth
                required
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <PortalField
                label="Expiry Date *"
                type="date"
                value={standbyForm.expiryDate}
                onChange={(e) => setStandbyForm({ ...standbyForm, expiryDate: e.target.value })}
                fullWidth
                required
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <PortalField
                label="Type *"
                select
                value={standbyForm.type}
                onChange={(e) => setStandbyForm({ ...standbyForm, type: e.target.value })}
                fullWidth
                required
              >
                <MenuItem value="PERFORMANCE">Performance Guarantee</MenuItem>
                <MenuItem value="ADVANCE_PAYMENT">Advance Payment Guarantee</MenuItem>
                <MenuItem value="BID_BOND">Bid Bond</MenuItem>
                <MenuItem value="FINANCIAL">Financial Guarantee</MenuItem>
              </PortalField>
            </Grid>
            <Grid item xs={12}>
              <PortalField
                label="Purpose *"
                value={standbyForm.purpose}
                onChange={(e) => setStandbyForm({ ...standbyForm, purpose: e.target.value })}
                fullWidth
                required
                placeholder="e.g. Performance guarantee for coffee export contract"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <PortalField
                label="Beneficiary *"
                value={standbyForm.beneficiary}
                onChange={(e) => setStandbyForm({ ...standbyForm, beneficiary: e.target.value })}
                fullWidth
                required
                helperText="Defaults to the selected contract's exporter."
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <PortalField
                label="Applicant *"
                value={standbyForm.applicant}
                onChange={(e) => setStandbyForm({ ...standbyForm, applicant: e.target.value })}
                fullWidth
                required
              />
            </Grid>
            <Grid item xs={12}>
              <PortalField
                label="Terms"
                value={standbyForm.terms}
                onChange={(e) => setStandbyForm({ ...standbyForm, terms: e.target.value })}
                fullWidth
                multiline
                rows={2}
                placeholder="Payable on first written demand with beneficiary statement"
                helperText="Optional — defaults to payable on first written demand."
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <PortalField
                label="Issuing Bank"
                value={standbyForm.issuingBank}
                onChange={(e) => setStandbyForm({ ...standbyForm, issuingBank: e.target.value })}
                fullWidth
                helperText="Optional — defaults to the contract's buyer bank."
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <PortalField
                label="Advising Bank"
                value={standbyForm.advisingBank}
                onChange={(e) => setStandbyForm({ ...standbyForm, advisingBank: e.target.value })}
                fullWidth
                helperText="Optional — defaults to the contract's exporter bank."
              />
            </Grid>
          </Grid>
        </Box>
      </PortalDialog>
  );
};

export default StandbyLCDialog;
