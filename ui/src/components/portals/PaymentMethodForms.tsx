import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Grid,
  Typography,
  Alert,
} from '@mui/material';
import { bankAccountHelperText, validateBankAccount, validateBIC } from '@/utils/fieldValidation';

interface PaymentMethodFormsProps {
  open: boolean;
  type: 'cad' | 'advance' | 'consignment' | null;
  selectedContract: any;
  onClose: () => void;
  onSubmit: (type: string, data: any) => Promise<void>;
}

export const PaymentMethodForms: React.FC<PaymentMethodFormsProps> = ({
  open,
  type,
  selectedContract,
  onClose,
  onSubmit,
}) => {
  const [cadForm, setCadForm] = React.useState({
    drawerName: '',
    draweeName: '',
    draweeAddress: '',
    paymentTerm: 'SIGHT',
    acceptanceDays: '',
    collectingBank: '',
    collectingBankBIC: '',
    remittingBank: 'Commercial Bank of Ethiopia',
    remittingBankBIC: 'CBETETAA',
    instructions: 'Present documents directly to drawee. Protest if unpaid.',
  });

  const [advanceForm, setAdvanceForm] = React.useState({
    creditAdviceNumber: '',
    payingBank: '',
    payingBankBIC: '',
    swiftReference: '',
    beneficiaryAccount: '',
    amount: '',
  });

  const [consignmentForm, setConsignmentForm] = React.useState({
    commodityType: 'FRUITS',
    description: '',
    buyerName: '',
    buyerAddress: '',
    permitAmount: '',
  });

  React.useEffect(() => {
    if (selectedContract && type) {
      if (type === 'cad') {
        setCadForm(prev => ({
          ...prev,
          drawerName: selectedContract.exporterId,
          draweeName: selectedContract.buyerName,
          draweeAddress: selectedContract.buyerCountry,
          remittingBank: selectedContract.exporterBank || 'Commercial Bank of Ethiopia',
        }));
      } else if (type === 'advance') {
        setAdvanceForm(prev => ({
          ...prev,
          amount: selectedContract.totalValue?.toString() || '',
        }));
      }
    }
  }, [selectedContract, type]);

  const handleSubmit = async () => {
    if (type === 'cad') {
      // Prepare CAD data for API
      const cadData = {
        ...cadForm,
        contractID: selectedContract?.contractId || '',
        exporterID: selectedContract?.exporterId || '',
        amount: selectedContract?.totalValue || 0,
        currency: selectedContract?.currency || 'USD',
        documents: ['B/L', 'Invoice', 'Packing List', 'Certificate of Origin'], // Default required documents
      };
      await onSubmit('cad', cadData);
    } else if (type === 'advance') {
      // Prepare advance payment data
      const advanceData = {
        ...advanceForm,
        contractID: selectedContract?.contractId || '',
        exporterID: selectedContract?.exporterId || '',
      };
      await onSubmit('advance', advanceData);
    } else if (type === 'consignment') {
      // Prepare consignment data
      const consignmentData = {
        ...consignmentForm,
        exporterID: selectedContract?.exporterId || '',
      };
      await onSubmit('consignment', consignmentData);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      {/* Documentary Collection Form */}
      {type === 'cad' && (
        <>
          <DialogTitle>Send Documentary Collection (CAD)</DialogTitle>
          <DialogContent>
            <Alert severity="info" sx={{ mb: 2 }}>
              CBE Section 3.2.ii: Cash Against Documents - Documents sent through bank for payment on presentation
            </Alert>

            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Drawer (Exporter)"
                  value={cadForm.drawerName}
                  onChange={(e) => setCadForm({ ...cadForm, drawerName: e.target.value })}
                  required
                  error={!cadForm.drawerName.trim()}
                  helperText={!cadForm.drawerName.trim() ? 'Drawer name is required — the API rejects a collection without it.' : undefined}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Drawee (Importer)"
                  value={cadForm.draweeName}
                  onChange={(e) => setCadForm({ ...cadForm, draweeName: e.target.value })}
                  required
                  error={!cadForm.draweeName.trim()}
                  helperText={!cadForm.draweeName.trim() ? 'Drawee name is required — the API rejects a collection without it.' : undefined}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Drawee Address"
                  value={cadForm.draweeAddress}
                  onChange={(e) => setCadForm({ ...cadForm, draweeAddress: e.target.value })}
                  multiline
                  rows={2}
                  required
                  error={!cadForm.draweeAddress.trim()}
                  helperText={!cadForm.draweeAddress.trim() ? 'Drawee address is required — the API rejects a collection without it.' : undefined}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  select
                  label="Payment Term"
                  value={cadForm.paymentTerm}
                  onChange={(e) => setCadForm({ ...cadForm, paymentTerm: e.target.value })}
                >
                  <MenuItem value="SIGHT">Sight (Payment on Presentation)</MenuItem>
                  <MenuItem value="ACCEPTANCE">Acceptance (Deferred Payment)</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Acceptance Days (if applicable)"
                  type="number"
                  value={cadForm.acceptanceDays}
                  onChange={(e) => setCadForm({ ...cadForm, acceptanceDays: e.target.value })}
                  disabled={cadForm.paymentTerm === 'SIGHT'}
                  helperText={cadForm.paymentTerm === 'ACCEPTANCE' ? 'Required for ACCEPTANCE — the ledger rejects an acceptance collection with 0 days' : 'Days for acceptance (e.g., 60, 90)'}
                  error={cadForm.paymentTerm === 'ACCEPTANCE' && !(Number(cadForm.acceptanceDays) > 0)}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Collecting Bank (Foreign)"
                  value={cadForm.collectingBank}
                  onChange={(e) => setCadForm({ ...cadForm, collectingBank: e.target.value })}
                  required
                  helperText="Foreign bank collecting payment"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Collecting Bank BIC/SWIFT"
                  value={cadForm.collectingBankBIC}
                  onChange={(e) => setCadForm({ ...cadForm, collectingBankBIC: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11) })}
                  required
                  helperText="8 or 11 characters, e.g. DEUTDEFF"
                  error={cadForm.collectingBankBIC.length > 0 && !validateBIC(cadForm.collectingBankBIC, 'Collecting bank BIC').valid}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Remitting Bank (Ethiopian)"
                  value={cadForm.remittingBank}
                  onChange={(e) => setCadForm({ ...cadForm, remittingBank: e.target.value })}
                  required
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Remitting Bank BIC/SWIFT"
                  value={cadForm.remittingBankBIC}
                  onChange={(e) => setCadForm({ ...cadForm, remittingBankBIC: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11) })}
                  required
                  helperText="8 or 11 characters, e.g. CBETETAA (CBE)"
                  error={cadForm.remittingBankBIC.length > 0 && !validateBIC(cadForm.remittingBankBIC, 'Remitting bank BIC').valid}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Collection Instructions"
                  value={cadForm.instructions}
                  onChange={(e) => setCadForm({ ...cadForm, instructions: e.target.value })}
                  multiline
                  rows={3}
                  helperText="Instructions for collecting bank"
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>Cancel</Button>
            <Button 
              variant="contained" 
              onClick={handleSubmit}
              disabled={!cadForm.drawerName.trim() || !cadForm.draweeName.trim() || !cadForm.draweeAddress.trim() || !cadForm.collectingBank || !validateBIC(cadForm.collectingBankBIC, 'Collecting bank BIC').valid || !validateBIC(cadForm.remittingBankBIC, 'Remitting bank BIC').valid || (cadForm.paymentTerm === 'ACCEPTANCE' && !(Number(cadForm.acceptanceDays) > 0))}
            >
              Send Collection
            </Button>
          </DialogActions>
        </>
      )}

      {/* Advance Payment Form */}
      {type === 'advance' && (
        <>
          <DialogTitle>Record Advance Payment Receipt</DialogTitle>
          <DialogContent>
            <Alert severity="info" sx={{ mb: 2 }}>
              CBE Section 3.2.iii: Advance Payment - Payment received before shipment. Export permit issued after receipt.
            </Alert>

            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Amount Received"
                  type="number"
                  value={advanceForm.amount}
                  onChange={(e) => setAdvanceForm({ ...advanceForm, amount: e.target.value })}
                  helperText={advanceForm.amount !== '' && !(Number(advanceForm.amount) > 0) ? 'Amount received must be greater than 0.' : 'Amount received in USD — this is the amount recorded, not the contract total.'}
                  error={advanceForm.amount !== '' && !(Number(advanceForm.amount) > 0)}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Credit Advice Number"
                  value={advanceForm.creditAdviceNumber}
                  onChange={(e) => setAdvanceForm({ ...advanceForm, creditAdviceNumber: e.target.value })}
                  helperText="Bank credit advice reference"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Paying Bank (Foreign)"
                  value={advanceForm.payingBank}
                  onChange={(e) => setAdvanceForm({ ...advanceForm, payingBank: e.target.value })}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Paying Bank BIC/SWIFT"
                  value={advanceForm.payingBankBIC}
                  onChange={(e) => setAdvanceForm({ ...advanceForm, payingBankBIC: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11) })}
                  helperText="8 or 11 characters, e.g. CBETETAA"
                  error={advanceForm.payingBankBIC.length > 0 && !validateBIC(advanceForm.payingBankBIC, 'Paying bank BIC').valid}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="SWIFT Reference"
                  value={advanceForm.swiftReference}
                  onChange={(e) => setAdvanceForm({ ...advanceForm, swiftReference: e.target.value })}
                  helperText="SWIFT MT103 reference"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Beneficiary Account *"
                  required
                  value={advanceForm.beneficiaryAccount}
                  onChange={(e) => setAdvanceForm({ ...advanceForm, beneficiaryAccount: e.target.value.replace(/\D/g, '').slice(0, 17) })}
                  helperText={(() => { if (!advanceForm.beneficiaryAccount) return 'Required — the API rejects an advance payment with a blank beneficiary account.'; const c = validateBankAccount(selectedContract?.exporterBank, advanceForm.beneficiaryAccount); return c.valid ? bankAccountHelperText(selectedContract?.exporterBank) : (c.error || ''); })()}
                  error={!advanceForm.beneficiaryAccount || !validateBankAccount(selectedContract?.exporterBank, advanceForm.beneficiaryAccount).valid}
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={!validateBankAccount(selectedContract?.exporterBank, advanceForm.beneficiaryAccount).valid || !advanceForm.payingBank || !validateBIC(advanceForm.payingBankBIC, 'Paying bank BIC').valid || !advanceForm.swiftReference || !(Number(advanceForm.amount || selectedContract?.totalValue) > 0)}
            >
              Record Payment & Issue Permit
            </Button>
          </DialogActions>
        </>
      )}

      {/* Consignment Form */}
      {type === 'consignment' && (
        <>
          <DialogTitle>Issue Consignment Export Permit</DialogTitle>
          <DialogContent>
            <Alert severity="warning" sx={{ mb: 2 }}>
              CBE Section 3.2.iv: Consignment sales - LIMITED to Fruits, Flowers, and Meat only. Payment received after sale abroad.
            </Alert>

            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  select
                  label="Commodity Type"
                  value={consignmentForm.commodityType}
                  onChange={(e) => setConsignmentForm({ ...consignmentForm, commodityType: e.target.value })}
                >
                  <MenuItem value="FRUITS">Fruits</MenuItem>
                  <MenuItem value="FLOWERS">Flowers</MenuItem>
                  <MenuItem value="MEAT">Meat</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Estimated Value (USD)"
                  type="number"
                  value={consignmentForm.permitAmount}
                  onChange={(e) => setConsignmentForm({ ...consignmentForm, permitAmount: e.target.value })}
                  helperText={consignmentForm.permitAmount !== '' && !(Number(consignmentForm.permitAmount) > 0) ? 'Permit amount must be greater than 0 — the ledger rejects 0 or negative amounts.' : undefined}
                  error={consignmentForm.permitAmount !== '' && !(Number(consignmentForm.permitAmount) > 0)}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Commodity Description"
                  value={consignmentForm.description}
                  onChange={(e) => setConsignmentForm({ ...consignmentForm, description: e.target.value })}
                  multiline
                  rows={2}
                  required
                  error={!consignmentForm.description.trim()}
                  helperText={!consignmentForm.description.trim() ? 'Description is required — the API rejects a consignment without it.' : 'Detailed description of goods'}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Buyer/Agent Name"
                  value={consignmentForm.buyerName}
                  onChange={(e) => setConsignmentForm({ ...consignmentForm, buyerName: e.target.value })}
                  required
                  error={!consignmentForm.buyerName.trim()}
                  helperText={!consignmentForm.buyerName.trim() ? 'Buyer name is required — the API rejects a consignment without it.' : undefined}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Buyer Address"
                  value={consignmentForm.buyerAddress}
                  onChange={(e) => setConsignmentForm({ ...consignmentForm, buyerAddress: e.target.value })}
                  multiline
                  required
                  error={!consignmentForm.buyerAddress.trim()}
                  helperText={!consignmentForm.buyerAddress.trim() ? 'Buyer address is required — the API rejects a consignment without it.' : undefined}
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="contained" onClick={handleSubmit} disabled={!consignmentForm.description.trim() || !consignmentForm.buyerName.trim() || !consignmentForm.buyerAddress.trim() || !(Number(consignmentForm.permitAmount || selectedContract?.totalValue) > 0)}>
              Issue Consignment Permit
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
};
