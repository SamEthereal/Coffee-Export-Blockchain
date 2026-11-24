import React from 'react';
import {
  Typography,
  Grid,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  AttachMoney,
} from '@mui/icons-material';
import {
  PortalDialog,
  GhostButton,
  AnimatedButton,
  PortalField,
  getPortalBrand,
} from '@/components/shared/portal';

export interface PaymentSettlementDialogProps {
  open: boolean;
  onClose: () => void;
  selectedShipmentForPayment: any | null;
  contracts: any[];
  forexStatuses: any[];
  lcStatuses: any[];
  isInitiatingPayment: boolean;
  paymentForm: any;
  setPaymentForm: React.Dispatch<React.SetStateAction<any>>;
  handleInitiatePayment: () => void;
}

const brandPrimary = getPortalBrand('EXPORTER').primary;

export const PaymentSettlementDialog: React.FC<PaymentSettlementDialogProps> = ({
  open,
  onClose,
  selectedShipmentForPayment,
  contracts,
  forexStatuses,
  lcStatuses,
  isInitiatingPayment,
  paymentForm,
  setPaymentForm,
  handleInitiatePayment,
}) => {
  return (
    <PortalDialog brand='EXPORTER'
      open={open}
      onClose={onClose}
      maxWidth="md"
    
  icon={<AttachMoney />}
  title="💰 Initiate Payment Settlement"
  actions={<>
        <GhostButton brand='EXPORTER' onClick={onClose}>
          Cancel
        </GhostButton>
        <AnimatedButton
          variant="contained"
          brandColor={brandPrimary}
          disabled={
            isInitiatingPayment ||
            !paymentForm.beneficiaryName ||
            !paymentForm.beneficiaryAccount ||
            !paymentForm.beneficiaryBank ||
            !paymentForm.beneficiaryBankBIC ||
            // Validation fix (2026-11-13): gate on a valid BIC shape too —
            // the chaincode accepts only 8- or 11-character SWIFT/BICs.
            !/^[A-Za-z]{6}[A-Za-z0-9]{2}([A-Za-z0-9]{3})?$/.test(paymentForm.beneficiaryBankBIC.trim()) ||
            !forexStatuses.some((fx) => fx.contractId === selectedShipmentForPayment?.contractId && ['ALLOCATED', 'UTILIZED'].includes(String(fx.status).toUpperCase()) && Number(fx.exchangeRate) > 0 && Number.isFinite(Number(fx.retentionRate)))
          }
          loading={isInitiatingPayment}
          loadingLabel="Processing…"
          ledgerWrite
          onClick={handleInitiatePayment}
        >
          Submit to Bank
        </AnimatedButton>
      
  </>}
>
        {selectedShipmentForPayment && (
          <>
            <Alert severity="success" sx={{ mb: 3, mt: 2 }}>
              <Typography variant="body2" fontWeight="bold" gutterBottom>
                Final Step — Payment Settlement (Step 11 of 11)
              </Typography>
              <Typography variant="body2">
                Shipment: <strong>{selectedShipmentForPayment.shipmentId}</strong> • Status: <strong>{selectedShipmentForPayment.status}</strong>
                <br />
                {selectedShipmentForPayment.status === 'DELIVERED'
                  ? 'Coffee successfully delivered — ready to receive payment'
                  : 'Payment settlement can be initiated once the LC is issued and forex is allocated (see the checks below)'}
              </Typography>
            </Alert>

            {(() => {
              const selectedContract = contracts.find(c => c.contractId === selectedShipmentForPayment.contractId);
              const selectedForex = forexStatuses.find(fx => fx.contractId === selectedShipmentForPayment.contractId);
              const selectedLC = lcStatuses.find(lc => lc.contractId === selectedShipmentForPayment.contractId);
              
              if (!selectedLC) {
                return (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    <strong>No Letter of Credit Found</strong>
                    <br />
                    Cannot initiate payment without an active Letter of Credit for this contract.
                  </Alert>
                );
              }

              if (!selectedForex || Number(selectedForex.exchangeRate) <= 0 || !Number.isFinite(Number(selectedForex.retentionRate))) {
                return (
                  <Alert severity="warning" sx={{ mb: 2 }}>
                    No ledger-backed forex rate and retention record is available for this contract. The bank must complete the forex allocation before payment can be submitted.
                  </Alert>
                );
              }

              const amountUSD = selectedContract ? (selectedShipmentForPayment.quantity * selectedContract.pricePerKg) : 0;
              const exchangeRate = Number(selectedForex.exchangeRate);
              const retentionRate = Number(selectedForex.retentionRate);
              const amountETB = amountUSD * exchangeRate;
              const retainedETB = (amountETB * retentionRate) / 100;
              // Chaincode settle math (payment.go): the exporter receives
              // the CONVERTED amount — amountETB − retainedETB — not the
              // retained portion, which NBE holds in FCY.
              const receivedETB = amountETB - retainedETB;

              return (
                <>
                  <Alert severity="info" sx={{ mb: 3 }}>
                    <Typography variant="body2" fontWeight="bold" gutterBottom>
                      Payment Calculation
                    </Typography>
                    <Typography variant="body2">
                      Contract Value: <strong>${amountUSD.toLocaleString()} {selectedContract?.currency || 'USD'}</strong>
                      <br />
                      NBE Exchange Rate: <strong>{exchangeRate} ETB/USD</strong>
                      <br />
                      Amount in ETB: <strong>{amountETB.toLocaleString()} ETB</strong>
                      <br />
                      NBE Retention Rate: <strong>{retentionRate}%</strong> — retained in FCY: <strong>{retainedETB.toLocaleString()} ETB</strong>
                      <br />
                      <strong>You will receive: {receivedETB.toLocaleString()} ETB</strong>
                    </Typography>
                  </Alert>

                  <Typography variant="h6" gutterBottom>
                    Payment & Beneficiary Details
                  </Typography>

                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth>
                        <InputLabel>Payment Method</InputLabel>
                        <Select
                          value={paymentForm.paymentMethod}
                          label="Payment Method"
                          onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}
                        >
                          <MenuItem value="LC">Letter of Credit (LC)</MenuItem>
                          <MenuItem value="TT_POST">Telegraphic Transfer - Post Shipment</MenuItem>
                          <MenuItem value="CAD">Cash Against Documents (CAD)</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <PortalField
                        fullWidth
                        label="LC Reference"
                        value={selectedLC?.lcId || ''}
                        disabled
                        helperText="Linked Letter of Credit"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <PortalField
                        fullWidth
                        required
                        label="Beneficiary Name"
                        value={paymentForm.beneficiaryName}
                        onChange={(e) => setPaymentForm({ ...paymentForm, beneficiaryName: e.target.value })}
                        helperText="Your company name (as registered)"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <PortalField
                        fullWidth
                        required
                        label="Beneficiary Account Number"
                        value={paymentForm.beneficiaryAccount}
                        onChange={(e) => setPaymentForm({ ...paymentForm, beneficiaryAccount: e.target.value.replace(/\D/g, '').slice(0, 17) })}
                        helperText={(() => { const c = validateBankAccount(paymentForm.beneficiaryBank, paymentForm.beneficiaryAccount); return paymentForm.beneficiaryAccount.length > 0 && !c.valid ? (c.error || '') : bankAccountHelperText(paymentForm.beneficiaryBank); })()}
                        error={paymentForm.beneficiaryAccount.length > 0 && !validateBankAccount(paymentForm.beneficiaryBank, paymentForm.beneficiaryAccount).valid}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <PortalField
                        fullWidth
                        required
                        label="Beneficiary Bank"
                        value={paymentForm.beneficiaryBank}
                        onChange={(e) => setPaymentForm({ ...paymentForm, beneficiaryBank: e.target.value })}
                        helperText="Your bank (advising bank)"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <PortalField
                        fullWidth
                        required
                        label="Bank SWIFT/BIC Code"
                        value={paymentForm.beneficiaryBankBIC}
                        onChange={(e) => setPaymentForm({ ...paymentForm, beneficiaryBankBIC: e.target.value })}
                        placeholder="e.g., CBEBIETAAAA"
                        // Validation fix (2026-11-13): name the format the
                        // ledger enforces — the old text said only 'SWIFT
                        // code for international transfer' and any string
                        // passed the form.
                        helperText="8- or 11-character SWIFT/BIC (e.g. CBEBIETAAAA)"
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <PortalField
                        fullWidth
                        multiline
                        rows={3}
                        label="SWIFT Payment Instructions"
                        value={paymentForm.swiftInstructions}
                        onChange={(e) => setPaymentForm({ ...paymentForm, swiftInstructions: e.target.value })}
                        placeholder="Any special instructions for the paying bank..."
                        helperText="Optional - additional payment instructions"
                      />
                    </Grid>
                  </Grid>

                  <Alert severity="warning" sx={{ mt: 3 }}>
                    <Typography variant="body2">
                      <strong>Required Documents (must be submitted to bank):</strong>
                      <br />
                      ✅ Bill of Lading (B/L)
                      <br />
                      ✅ Commercial Invoice
                      <br />
                      ✅ Packing List
                      <br />
                      ✅ ECTA Export Permit
                      <br />
                      ✅ ICO Certificate of Origin
                      <br />
                      ✅ Insurance Certificate
                      <br />
                      ✅ Customs Clearance Certificate
                    </Typography>
                  </Alert>

                  <Alert severity="success" sx={{ mt: 2 }}>
                    <Typography variant="body2">
                      <strong>After payment initiation:</strong>
                      <br />
                      1. Bank verifies all shipping documents
                      <br />
                      2. SWIFT MT700/MT760 sent to buyer's bank
                      <br />
                      3. Buyer's bank releases payment
                      <br />
                      4. NBE processes forex conversion (at official rate: {exchangeRate} ETB/USD)
                      <br />
                      5. Funds credited to your account (3-5 business days)
                      <br />
                      6. <strong>Export cycle complete! 🎉</strong>
                    </Typography>
                  </Alert>
                </>
              );
            })()}
          </>
        )}
      </PortalDialog>
  );
};
