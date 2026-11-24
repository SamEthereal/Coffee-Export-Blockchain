import React from 'react';
import {
  Grid,
  Typography,
  Alert,
  MenuItem,
} from '@mui/material';
import {
  AttachMoney,
} from '@mui/icons-material';
import {
  PortalDialog,
  GhostButton,
  PrimaryButton,
  PortalField,
} from '@/components/shared/portal';

export interface ForexRequestDialogProps {
  open: boolean;
  onClose: () => void;
  forexRequestForm: any;
  setForexRequestForm: React.Dispatch<React.SetStateAction<any>>;
  handleRequestForex: () => Promise<void>;
  isRequestingForex: boolean;
  approvedContracts: any[];
  lcStatuses: any[];
}

export const ForexRequestDialog: React.FC<ForexRequestDialogProps> = ({
  open,
  onClose,
  forexRequestForm,
  setForexRequestForm,
  handleRequestForex,
  isRequestingForex,
  approvedContracts,
  lcStatuses,
}) => {
  return (
    <PortalDialog brand='EXPORTER'
      open={open}
      onClose={() => onClose()}
      maxWidth="md"
      icon={<AttachMoney />}
      title="Request Forex Allocation"
      subtitle="File a foreign-exchange allocation request for one of your contracts"
      actions={<>
        <GhostButton brand='EXPORTER' onClick={() => onClose()}>
          Cancel
        </GhostButton>
        <PrimaryButton brand='EXPORTER'
          onClick={handleRequestForex}
          loading={isRequestingForex}
          loadingLabel="Submitting…"
          ledgerWrite
          disabled={isRequestingForex || !forexRequestForm.contractId || !forexRequestForm.amount}
        >
          Submit Forex Request
        </PrimaryButton>
      </>}
    >
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Alert severity="info">
            <Typography variant="body2">
              <strong>Forex Request Process:</strong> NBE reviews the request, confirms it, and the bank allocates the foreign exchange under the active NBE retention policy. Linking an issued LC is optional here — the bank links it at allocation time if you leave it blank.
            </Typography>
          </Alert>
        </Grid>
        <Grid item xs={12} sm={6}>
          <PortalField
            fullWidth
            select
            label="Contract"
            value={forexRequestForm.contractId}
            onChange={(e) => {
              const c = contracts.find((x) => x.contractId === e.target.value);
              setForexRequestForm({
                ...forexRequestForm,
                contractId: e.target.value,
                amount: c?.totalValue ? String(c.totalValue) : forexRequestForm.amount,
                currency: c?.currency || forexRequestForm.currency,
              });
            }}
            required
            helperText="The sales contract this forex is for"
          >
            {contracts.map((c) => (
              <MenuItem key={c.contractId} value={c.contractId}>
                {c.contractId} — {c.buyerName || c.buyerId} (${Number(c.totalValue || 0).toLocaleString()} {c.currency})
              </MenuItem>
            ))}
          </PortalField>
        </Grid>
        <Grid item xs={12} sm={6}>
          <PortalField
            fullWidth
            select
            label="Letter of Credit (optional)"
            value={forexRequestForm.lcId}
            onChange={(e) => setForexRequestForm({ ...forexRequestForm, lcId: e.target.value })}
            helperText="Link an issued LC now, or leave blank"
          >
            <MenuItem value="">None yet</MenuItem>
            {lcStatuses.map((lc) => (
              <MenuItem key={lc.lcId} value={lc.lcId}>
                {lc.lcId} ({lc.status})
              </MenuItem>
            ))}
          </PortalField>
        </Grid>
        <Grid item xs={12} sm={6}>
          <PortalField
            fullWidth
            label="Amount"
            type="number"
            value={forexRequestForm.amount}
            onChange={(e) => setForexRequestForm({ ...forexRequestForm, amount: e.target.value })}
            required
            InputProps={{
              startAdornment: <Typography sx={{ mr: 1 }}>$</Typography>,
            }}
            helperText="Defaults to the contract total value"
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <PortalField
            fullWidth
            select
            label="Currency"
            value={forexRequestForm.currency}
            onChange={(e) => setForexRequestForm({ ...forexRequestForm, currency: e.target.value })}
            required
          >
            <MenuItem value="USD">USD</MenuItem>
            <MenuItem value="EUR">EUR</MenuItem>
            <MenuItem value="GBP">GBP</MenuItem>
          </PortalField>
        </Grid>
      </Grid>
    </PortalDialog>
  );
};

export default ForexRequestDialog;
