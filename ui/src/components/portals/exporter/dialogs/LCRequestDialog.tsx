import React from 'react';
import {
  Grid,
  Typography,
  Alert,
  MenuItem,
  Divider,
} from '@mui/material';
import {
  AccountBalance,
} from '@mui/icons-material';
import {
  PortalDialog,
  GhostButton,
  PrimaryButton,
  PortalField,
} from '@/components/shared/portal';

export interface LCRequestDialogProps {
  open: boolean;
  onClose: () => void;
  selectedContract: any;
  lcRequestForm: any;
  setLcRequestForm: React.Dispatch<React.SetStateAction<any>>;
  handleRequestLC: () => Promise<void>;
  isRequestingLC: boolean;
}

export const LCRequestDialog: React.FC<LCRequestDialogProps> = ({
  open,
  onClose,
  selectedContract: selectedContractForLC,
  lcRequestForm,
  setLcRequestForm,
  handleRequestLC,
  isRequestingLC,
}) => {
  return (
    <PortalDialog brand='EXPORTER' 
      open={open} 
      onClose={() => {
        onClose();
      }}
      maxWidth="md"
      PaperProps={{
        sx: {
          borderRadius: 2,
          boxShadow: 24,
        }
      }}
    
  icon={<AccountBalance />}
  title="Request Letter of Credit"
  subtitle={selectedContractForLC ? `Contract: ${selectedContractForLC.contractId}` : undefined}
  actions={<>
        <GhostButton brand='EXPORTER' onClick={() => {
          onClose();
        }}>
          Cancel
        </GhostButton>
        <PrimaryButton brand='EXPORTER'
          onClick={handleRequestLC}
          loading={isRequestingLC}
          loadingLabel="Submitting…"
          ledgerWrite
          disabled={isRequestingLC || !lcRequestForm.issuingBank?.trim() || !lcRequestForm.advisingBank || !lcRequestForm.beneficiaryName ||
            // Validation fix (2026-11-13): a cleared day count used to
            // leave the button enabled while the handler threw on
            // Invalid Date — gate on positive day counts too.
            !parseInt(lcRequestForm.expiryDays, 10) || parseInt(lcRequestForm.expiryDays, 10) <= 0 ||
            !parseInt(lcRequestForm.latestShipmentDays, 10) || parseInt(lcRequestForm.latestShipmentDays, 10) <= 0}
        >
          Submit LC Request
        </PrimaryButton>
      
  </>}
>
        {selectedContractForLC ? (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Alert severity="info" icon={<AccountBalance />}>
                <Typography variant="body2">
                  <strong>LC Request Process:</strong> Your bank will review this LC request, approve it, and issue the LC (MT700 SWIFT message) to the buyer's bank. Once issued, forex will be allocated for your export.
                </Typography>
              </Alert>
            </Grid>

            {/* Contract Summary */}
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom sx={{ color: '#9b30b7' }}>
                Contract Summary
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Buyer</Typography>
                  <Typography variant="body2">{selectedContractForLC.buyerName}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Country</Typography>
                  <Typography variant="body2">{selectedContractForLC.buyerCountry}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Coffee Type</Typography>
                  <Typography variant="body2">{selectedContractForLC.coffeeType}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Quantity</Typography>
                  <Typography variant="body2">{Number(selectedContractForLC.quantity).toLocaleString()} kg</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Total Value</Typography>
                  <Typography variant="body2" fontWeight="bold">
                    ${Number(selectedContractForLC.totalValue).toLocaleString()} {selectedContractForLC.currency}
                  </Typography>
                </Grid>
              </Grid>
            </Grid>

            {/* LC Details */}
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom sx={{ color: '#9b30b7' }}>
                LC Details
              </Typography>
              <Divider sx={{ mb: 2 }} />
            </Grid>

            <Grid item xs={12} sm={6}>
              <PortalField
                fullWidth
                label="Issuing Bank (Buyer's Bank)"
                value={lcRequestForm.issuingBank}
                onChange={(e) => setLcRequestForm({ ...lcRequestForm, issuingBank: e.target.value })}
                required
                helperText="Buyer's bank that will open the LC — pre-filled from the contract, editable"
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <PortalField
                fullWidth
                label="Advising Bank (Your Bank)"
                value={lcRequestForm.advisingBank}
                onChange={(e) => setLcRequestForm({ ...lcRequestForm, advisingBank: e.target.value })}
                required
                helperText="Your Ethiopian bank that will advise the LC"
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <PortalField
                fullWidth
                label="Beneficiary Name"
                value={lcRequestForm.beneficiaryName}
                onChange={(e) => setLcRequestForm({ ...lcRequestForm, beneficiaryName: e.target.value })}
                required
                helperText="Your company name as beneficiary"
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <PortalField
                fullWidth
                label="LC Amount"
                type="number"
                value={lcRequestForm.amount}
                onChange={(e) => setLcRequestForm({ ...lcRequestForm, amount: e.target.value })}
                required
                InputProps={{
                  startAdornment: <Typography sx={{ mr: 1 }}>$</Typography>,
                }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <PortalField
                fullWidth
                select
                label="Currency"
                value={lcRequestForm.currency}
                onChange={(e) => setLcRequestForm({ ...lcRequestForm, currency: e.target.value })}
                required
              >
                <MenuItem value="USD">USD</MenuItem>
                <MenuItem value="EUR">EUR</MenuItem>
                <MenuItem value="GBP">GBP</MenuItem>
              </PortalField>
            </Grid>

            <Grid item xs={12} sm={6}>
              <PortalField
                fullWidth
                label="LC Validity (Days)"
                type="number"
                value={lcRequestForm.expiryDays}
                onChange={(e) => setLcRequestForm({ ...lcRequestForm, expiryDays: e.target.value })}
                required
                helperText="Days from today"
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <PortalField
                fullWidth
                label="Latest Shipment (Days)"
                type="number"
                value={lcRequestForm.latestShipmentDays}
                onChange={(e) => setLcRequestForm({ ...lcRequestForm, latestShipmentDays: e.target.value })}
                required
                helperText="Days from LC issuance"
              />
            </Grid>

            {/* Shipping Details */}
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom sx={{ color: '#9b30b7', mt: 2 }}>
                Shipping Terms
              </Typography>
              <Divider sx={{ mb: 2 }} />
            </Grid>

            <Grid item xs={12} sm={6}>
              <PortalField
                fullWidth
                select
                label="Transport Mode"
                value={lcRequestForm.transportMode}
                onChange={(e) => setLcRequestForm({ ...lcRequestForm, transportMode: e.target.value as 'SEA' | 'AIR' })}
                required
              >
                <MenuItem value="SEA">Sea Freight</MenuItem>
                <MenuItem value="AIR">Air Freight</MenuItem>
              </PortalField>
            </Grid>

            <Grid item xs={12} sm={6}>
              <PortalField
                fullWidth
                label="Port of Loading"
                value={lcRequestForm.portOfLoading}
                onChange={(e) => setLcRequestForm({ ...lcRequestForm, portOfLoading: e.target.value })}
                required
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <PortalField
                fullWidth
                label="Port of Discharge"
                value={lcRequestForm.portOfDischarge}
                onChange={(e) => setLcRequestForm({ ...lcRequestForm, portOfDischarge: e.target.value })}
                required
                helperText="Destination port"
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <PortalField
                fullWidth
                select
                label="Payment Terms"
                value={lcRequestForm.paymentTerms}
                onChange={(e) => setLcRequestForm({ ...lcRequestForm, paymentTerms: e.target.value })}
                required
              >
                <MenuItem value="Sight LC">Sight LC (Immediate Payment)</MenuItem>
                <MenuItem value="Usance LC 30 days">Usance LC - 30 days</MenuItem>
                <MenuItem value="Usance LC 60 days">Usance LC - 60 days</MenuItem>
                <MenuItem value="Usance LC 90 days">Usance LC - 90 days</MenuItem>
              </PortalField>
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={lcRequestForm.partialShipment}
                    onChange={(e) => setLcRequestForm({ ...lcRequestForm, partialShipment: e.target.checked })}
                  />
                }
                label="Allow Partial Shipment"
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={lcRequestForm.transhipment}
                    onChange={(e) => setLcRequestForm({ ...lcRequestForm, transhipment: e.target.checked })}
                  />
                }
                label="Allow Transhipment"
              />
            </Grid>

            <Grid item xs={12}>
              <PortalField
                fullWidth
                multiline
                rows={3}
                label="Special Instructions"
                value={lcRequestForm.specialInstructions}
                onChange={(e) => setLcRequestForm({ ...lcRequestForm, specialInstructions: e.target.value })}
                placeholder="Enter any special terms or conditions for this LC..."
              />
            </Grid>
          </Grid>
        ) : (
          <Alert severity="warning">
            <Typography variant="body2">
              No contract selected. Please close this dialog and try again.
            </Typography>
          </Alert>
        )}
      </PortalDialog>
  );
};

export default LCRequestDialog;
