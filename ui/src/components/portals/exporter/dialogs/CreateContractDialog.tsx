import React from 'react';
import {
  Box,
  Typography,
  Grid,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
  Stack,
  Paper,
  Chip,
  Tooltip,
  IconButton,
  Alert,
} from '@mui/material';
import {
  Description,
  Warning,
  AccountBalance,
  LocalShipping,
  Payment,
  CheckCircle,
  AttachMoney,
  Download,
  Upload,
  Delete,
} from '@mui/icons-material';
import {
  PortalDialog,
  GhostButton,
  PrimaryButton,
  SecondaryButton,
  PortalField,
  getPortalBrand,
} from '@/components/shared/portal';
import BankSelect from '@/components/common/BankSelect';
import PhoneInput from '@/components/common/PhoneInput';
import { ExportContract } from '../../../../types';

export const COFFEE_TYPE_OPTIONS = [
  { value: 'Yirgacheffe Grade 1', label: 'Yirgacheffe Grade 1 - Washed' },
  { value: 'Yirgacheffe Grade 2', label: 'Yirgacheffe Grade 2 - Washed' },
  { value: 'Sidamo Grade 2', label: 'Sidamo Grade 2 - Washed' },
  { value: 'Sidamo Grade 3', label: 'Sidamo Grade 3 - Washed' },
  { value: 'Guji Grade 1', label: 'Guji Grade 1 - Natural' },
  { value: 'Guji Grade 2', label: 'Guji Grade 2 - Natural' },
  { value: 'Limu Grade 2', label: 'Limu Grade 2 - Washed' },
  { value: 'Limu Grade 3', label: 'Limu Grade 3 - Washed' },
  { value: 'Harrar Grade 4', label: 'Harrar Grade 4 - Natural' },
  { value: 'Jimma Grade 5', label: 'Jimma Grade 5 - Washed' },
] as const;

interface CreateContractDialogProps {
  open: boolean;
  onClose: () => void;
  draftContractId: string;
  correctingRejectedContractId: string | null;
  selectedContractForDetail: ExportContract | null;
  isEditMode: boolean;
  isCreatingContract: boolean;
  newContract: any;
  setNewContract: React.Dispatch<React.SetStateAction<any>>;
  contractDocuments: any[];
  setContractDocuments: React.Dispatch<React.SetStateAction<any[]>>;
  handleContractDocumentSelect: (category: string, event: React.ChangeEvent<HTMLInputElement>) => void;
  handleCreateContract: () => void;
  hasActionableRejectionFeedback: (contract: any) => boolean;
  isSupportedCoffeeType: (coffeeType: string) => boolean;
  profile?: any;
}

const brandPrimary = getPortalBrand('EXPORTER').primary;

export const CreateContractDialog: React.FC<CreateContractDialogProps> = ({
  open,
  onClose,
  draftContractId,
  correctingRejectedContractId,
  selectedContractForDetail,
  isEditMode,
  isCreatingContract,
  newContract,
  setNewContract,
  contractDocuments,
  setContractDocuments,
  handleContractDocumentSelect,
  handleCreateContract,
  hasActionableRejectionFeedback,
  isSupportedCoffeeType,
  profile,
}) => {
  return (
        <PortalDialog brand='EXPORTER' 
          open={open} 
          onClose={onClose}
          maxWidth="lg"
        
  icon={<Description />}
  title={draftContractId && !correctingRejectedContractId ? 'Edit Contract' : correctingRejectedContractId ? 'Register Corrected Contract' : 'Register New Sales Contract'}
  subtitle={draftContractId && !correctingRejectedContractId
                    ? `Editing Contract ${draftContractId} - Update buyer details, shipping preferences, or additional notes`
                    : correctingRejectedContractId
                    ? `Correct the rejected details below. This creates a new contract linked to ${correctingRejectedContractId}.`
                    : 'Complete all required fields to register your export contract'}
  actions={<>
            <GhostButton brand='EXPORTER' onClick={onClose} size="large">
              Cancel
            </GhostButton>
            <PrimaryButton brand='EXPORTER' 
              onClick={handleCreateContract}
              loading={isCreatingContract}
              loadingLabel={isEditMode ? 'Updating…' : 'Registering…'}
              ledgerWrite
              disabled={isCreatingContract || !newContract.buyerCompany || !newContract.buyerCountry ||
                        !newContract.buyerBank || !newContract.exporterBank ||
                        !newContract.buyerEmail || !newContract.coffeeType || !newContract.quantity ||
                        !newContract.pricePerKg || !newContract.portOfDestination || !newContract.deliveryDate ||
                        // Validation fix (2026-11-13): the payment method
                        // and a positive quantity were enforced only in the
                        // submit handler, so the button looked submittable
                        // while the handler refused the click.
                        !newContract.paymentMethod || parseFloat(newContract.quantity) <= 0 ||
                        (parseFloat(newContract.pricePerKg) < 5.0) || contractDocuments.some((doc) => doc.status !== 'success')}
              size="large"
              sx={{ minWidth: 150 }}
            >
              {isEditMode ? 'Update Contract' : 'Register Contract'}
            </PrimaryButton>
          
  </>}
>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Alert severity="info" icon={<Warning />}>
                  <Typography variant="body2">
                    {correctingRejectedContractId ? (
                      <>
                        <strong>Correction:</strong> The rejected contract remains in the audit history. Submitting this form registers a replacement and records which rejection it corrects. Minimum FOB price: $5.00/kg
                        <Box sx={{ mt: 1 }}>
                          Tip: if you only need ECTA to re-review the same contract (same ID), use the <strong>Resubmit</strong> button on the rejected row instead of registering a replacement.
                        </Box>
                        {selectedContractForDetail?.rejectionReason && (
                          <Box sx={{ mt: 1 }}>
                            <strong>ECTA feedback:</strong> {selectedContractForDetail.rejectionReason}
                          </Box>
                        )}
                        {!hasActionableRejectionFeedback(selectedContractForDetail?.rejectionReason) && (
                          <Box sx={{ mt: 1 }}>
                            This feedback does not identify the field and exact change required. Ask ECTA for clarification before submitting a replacement; the portal cannot infer the rejected field.
                          </Box>
                        )}
                      </>
                    ) : (
                      <><strong>Important:</strong> All contracts must comply with ECTA regulations and will be subject to NBE approval for forex allocation. Minimum FOB price: $5.00/kg</>
                    )}
                  </Typography>
                </Alert>
              </Grid>

              {/* Buyer Information Section */}
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1, color: brandPrimary }}>
                  <AccountBalance /> Buyer Information
                </Typography>
                <Divider sx={{ mb: 2 }} />
              </Grid>

              <Grid item xs={12} sm={6}>
                <PortalField
                  fullWidth
                  label="Contact Person Name"
                  value={newContract.buyerName}
                  onChange={(e) => setNewContract({...newContract, buyerName: e.target.value})}
                  required
                  helperText="Full name of buyer representative"
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <PortalField
                  fullWidth
                  label="Company Name"
                  value={newContract.buyerCompany}
                  onChange={(e) => setNewContract({...newContract, buyerCompany: e.target.value})}
                  required
                  helperText="Registered company name"
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <FormControl fullWidth required>
                  <InputLabel>Buyer Country</InputLabel>
                  <Select
                    value={newContract.buyerCountry}
                    label="Buyer Country"
                    onChange={(e) => setNewContract({...newContract, buyerCountry: e.target.value})}
                  >
                    <MenuItem value="Germany">Germany</MenuItem>
                    <MenuItem value="United States">United States</MenuItem>
                    <MenuItem value="Japan">Japan</MenuItem>
                    <MenuItem value="Saudi Arabia">Saudi Arabia</MenuItem>
                    <MenuItem value="Belgium">Belgium</MenuItem>
                    <MenuItem value="Italy">Italy</MenuItem>
                    <MenuItem value="South Korea">South Korea</MenuItem>
                    <MenuItem value="France">France</MenuItem>
                    <MenuItem value="United Kingdom">United Kingdom</MenuItem>
                    <MenuItem value="Netherlands">Netherlands</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6}>
                <BankSelect
                  value={newContract.buyerBank}
                  onChange={(value) => setNewContract({...newContract, buyerBank: value})}
                  label="Buyer's Bank (Issuing Bank)"
                  helperText="Bank that will open the LC (must be different from exporter's bank)"
                  type="international"
                  excludeBank={newContract.exporterBank}
                  required
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <BankSelect
                  value={newContract.exporterBank}
                  onChange={(value) => setNewContract({...newContract, exporterBank: value})}
                  label="Exporter's Bank (Advising Bank)"
                  helperText={
                    profile?.bankName && newContract.exporterBank === profile.bankName
                      ? `✅ Pre-filled from your registered bank`
                      : "Your Ethiopian bank that will receive the LC"
                  }
                  type="ethiopian"
                  excludeBank={newContract.buyerBank}
                  required
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <PortalField
                  fullWidth
                  label="Email Address"
                  type="email"
                  value={newContract.buyerEmail}
                  onChange={(e) => setNewContract({...newContract, buyerEmail: e.target.value})}
                  required
                  helperText="Business email for communication"
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <PhoneInput
                  label="Phone Number"
                  value={newContract.buyerPhone}
                  onChange={(v) => setNewContract({ ...newContract, buyerPhone: v })}
                />
              </Grid>

              {/* Coffee Specification Section */}
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1, color: brandPrimary, mt: 2 }}>
                  <LocalShipping /> Coffee Specification
                </Typography>
                <Divider sx={{ mb: 2 }} />
              </Grid>

              <Grid item xs={12} sm={6}>
                <FormControl fullWidth required>
                  <InputLabel>Coffee Type</InputLabel>
                  <Select
                    value={newContract.coffeeType}
                    label="Coffee Type"
                    onChange={(e) => setNewContract({...newContract, coffeeType: e.target.value})}
                  >
                    {newContract.coffeeType && !isSupportedCoffeeType(newContract.coffeeType) && (
                      <MenuItem value={newContract.coffeeType}>
                        Existing value: {newContract.coffeeType}
                      </MenuItem>
                    )}
                    {COFFEE_TYPE_OPTIONS.map((option) => (
                      <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                    ))}
                  </Select>
                  {newContract.coffeeType && !isSupportedCoffeeType(newContract.coffeeType) && (
                    <FormHelperText>
                      This saved value is not in the current coffee list. Select the correct grade to replace it.
                    </FormHelperText>
                  )}
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6}>
                <PortalField
                  fullWidth
                  label="Quantity (kg)"
                  type="number"
                  value={newContract.quantity}
                  onChange={(e) => setNewContract({...newContract, quantity: e.target.value})}
                  required
                  InputProps={{ inputProps: { min: 1000, step: 100 } }}
                  // Validation fix (2026-11-13): no 1,000 kg minimum exists
                  // anywhere — the API/chaincode rule is > 0 kg (max
                  // 10,000,000 kg). The old helper text invented a rule
                  // and a 500 kg contract would have succeeded.
                  helperText="Must be greater than 0 kg (max 10,000,000 kg)"
                />
              </Grid>

              <Grid item xs={12} sm={4}>
                <PortalField
                  fullWidth
                  label="Price per kg (USD)"
                  type="number"
                  value={newContract.pricePerKg}
                  onChange={(e) => setNewContract({...newContract, pricePerKg: e.target.value})}
                  required
                  InputProps={{ inputProps: { min: 5.0, step: 0.01 } }}
                  helperText="Minimum: $5.00/kg FOB"
                  error={!!(newContract.pricePerKg && parseFloat(newContract.pricePerKg) < 5.0)}
                />
              </Grid>

              <Grid item xs={12} sm={4}>
                <FormControl fullWidth required>
                  <InputLabel>Currency</InputLabel>
                  <Select
                    value={newContract.currency}
                    label="Currency"
                    onChange={(e) => setNewContract({...newContract, currency: e.target.value})}
                  >
                    <MenuItem value="USD">USD - US Dollar</MenuItem>
                    <MenuItem value="EUR">EUR - Euro</MenuItem>
                    <MenuItem value="GBP">GBP - British Pound</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={4}>
                <FormControl fullWidth required>
                  <InputLabel>Incoterm</InputLabel>
                  <Select
                    value={newContract.incoterm}
                    label="Incoterm"
                    onChange={(e) => setNewContract({...newContract, incoterm: e.target.value})}
                  >
                    <MenuItem value="FOB">FOB - Free On Board</MenuItem>
                    <MenuItem value="CIF">CIF - Cost, Insurance & Freight</MenuItem>
                    <MenuItem value="CFR">CFR - Cost and Freight</MenuItem>
                    <MenuItem value="EXW">EXW - Ex Works</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              {/* Payment Method Section */}
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1, color: brandPrimary, mt: 2 }}>
                  <Payment /> Payment Method
                </Typography>
                <Divider sx={{ mb: 2 }} />
              </Grid>

              <Grid item xs={12}>
                <FormControl fullWidth required>
                  <InputLabel>Payment Method</InputLabel>
                  <Select
                    value={newContract.paymentMethod}
                    label="Payment Method"
                    onChange={(e) => setNewContract({...newContract, paymentMethod: e.target.value})}
                  >
                    <MenuItem value="">
                      <Typography variant="body2" color="text.secondary">Select a payment method</Typography>
                    </MenuItem>
                    <MenuItem value="LC">
                      <Box>
                        <Typography variant="body1" fontWeight="bold">LC - Letter of Credit</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Bank guaranteed payment | Lowest risk | UCP 600 compliant
                        </Typography>
                      </Box>
                    </MenuItem>
                    <MenuItem value="CAD">
                      <Box>
                        <Typography variant="body1" fontWeight="bold">CAD - Cash Against Documents</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Payment through banks, no guarantee | Medium risk | URC 522
                        </Typography>
                      </Box>
                    </MenuItem>
                    <MenuItem value="TT_ADVANCE">
                      <Box>
                        <Typography variant="body1" fontWeight="bold">TT Advance - Telegraphic Transfer (Advance)</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Partial payment before shipment | Low risk
                        </Typography>
                      </Box>
                    </MenuItem>
                    <MenuItem value="TT_POST">
                      <Box>
                        <Typography variant="body1" fontWeight="bold">TT Post - Telegraphic Transfer (Post-shipment)</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Payment after shipment | High risk | Direct transfer
                        </Typography>
                      </Box>
                    </MenuItem>
                    <MenuItem value="ADVANCE">
                      <Box>
                        <Typography variant="body1" fontWeight="bold">ADVANCE - Advance Payment</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Full/partial payment before production | Lowest risk
                        </Typography>
                      </Box>
                    </MenuItem>
                  </Select>
                  <FormHelperText>
                    {!newContract.paymentMethod && 'Payment method is required — choose how the buyer will pay'}
                    {newContract.paymentMethod === 'LC' && '✓ Recommended: Bank guarantee ensures payment security'}
                    {newContract.paymentMethod === 'CAD' && '⚠️ Medium risk: Documents released only after payment'}
                    {newContract.paymentMethod === 'TT_ADVANCE' && '✓ Low risk: Advance payment reduces exporter risk'}
                    {newContract.paymentMethod === 'TT_POST' && '⚠️ High risk: Payment depends on buyer trust'}
                    {newContract.paymentMethod === 'ADVANCE' && '✓ Lowest risk: Payment received before work begins'}
                  </FormHelperText>
                </FormControl>
              </Grid>

              {/* Shipping Details Section */}
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1, color: brandPrimary, mt: 2 }}>
                  <LocalShipping /> Shipping Details
                </Typography>
                <Divider sx={{ mb: 2 }} />
              </Grid>

              <Grid item xs={12} sm={6}>
                <FormControl fullWidth required>
                  <InputLabel>Port of Loading</InputLabel>
                  <Select
                    value={newContract.portOfLoading}
                    label="Port of Loading"
                    onChange={(e) => setNewContract({...newContract, portOfLoading: e.target.value})}
                  >
                    <MenuItem value="Djibouti">Djibouti Port</MenuItem>
                    <MenuItem value="Berbera">Berbera Port (Somaliland)</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6}>
                <PortalField
                  fullWidth
                  label="Port of Destination"
                  value={newContract.portOfDestination}
                  onChange={(e) => setNewContract({...newContract, portOfDestination: e.target.value})}
                  required
                  placeholder="e.g., Hamburg, Rotterdam"
                  helperText="Final destination port"
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <PortalField
                  fullWidth
                  label="Expected Delivery Date"
                  type="date"
                  value={newContract.deliveryDate}
                  onChange={(e) => setNewContract({...newContract, deliveryDate: e.target.value})}
                  required
                  InputLabelProps={{ shrink: true }}
                  helperText="Estimated shipment date"
                />
              </Grid>

              {/* Certifications Section */}
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1, color: brandPrimary, mt: 2 }}>
                  <CheckCircle /> Certifications & Compliance
                </Typography>
                <Divider sx={{ mb: 2 }} />
              </Grid>

              <Grid item xs={12} sm={4}>
                <FormControl fullWidth required>
                  <InputLabel>EUDR Required</InputLabel>
                  <Select
                    value={newContract.eudrRequired ? 'yes' : 'no'}
                    label="EUDR Required"
                    onChange={(e) => setNewContract({...newContract, eudrRequired: e.target.value === 'yes'})}
                  >
                    <MenuItem value="yes">Yes - EU Market (Required)</MenuItem>
                    <MenuItem value="no">No - Non-EU Market</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={4}>
                <FormControl fullWidth>
                  <InputLabel>Organic Certified</InputLabel>
                  <Select
                    value={newContract.organicCertified ? 'yes' : 'no'}
                    label="Organic Certified"
                    onChange={(e) => setNewContract({...newContract, organicCertified: e.target.value === 'yes'})}
                  >
                    <MenuItem value="yes">Yes - Organic Certified</MenuItem>
                    <MenuItem value="no">No</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={4}>
                <FormControl fullWidth>
                  <InputLabel>Fair Trade Certified</InputLabel>
                  <Select
                    value={newContract.fairTradeCertified ? 'yes' : 'no'}
                    label="Fair Trade Certified"
                    onChange={(e) => setNewContract({...newContract, fairTradeCertified: e.target.value === 'yes'})}
                  >
                    <MenuItem value="yes">Yes - Fair Trade</MenuItem>
                    <MenuItem value="no">No</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12}>
                <PortalField
                  fullWidth
                  label="Special Instructions"
                  multiline
                  rows={3}
                  value={newContract.specialInstructions}
                  onChange={(e) => setNewContract({...newContract, specialInstructions: e.target.value})}
                  placeholder="Any special packaging, quality requirements, or shipping instructions..."
                  helperText="Optional - Additional contract terms or requirements"
                />
              </Grid>

              {/* Contract Summary */}
              {newContract.quantity && newContract.pricePerKg && (
                <Grid item xs={12}>
                  <Alert severity="success" icon={<AttachMoney />}>
                    <Typography variant="h6" gutterBottom>Contract Summary</Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={6} sm={3}>
                        <Typography variant="caption" color="text.secondary">Quantity</Typography>
                        <Typography variant="body1" fontWeight="bold">{parseFloat(newContract.quantity).toLocaleString()} kg</Typography>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Typography variant="caption" color="text.secondary">Price/kg</Typography>
                        <Typography variant="body1" fontWeight="bold">{newContract.currency} {parseFloat(newContract.pricePerKg).toFixed(2)}</Typography>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Typography variant="caption" color="text.secondary">Total Value</Typography>
                        <Typography variant="body1" fontWeight="bold" color="primary">
                          {newContract.currency} {(parseFloat(newContract.quantity) * parseFloat(newContract.pricePerKg)).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                        </Typography>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Typography variant="caption" color="text.secondary">Incoterm</Typography>
                        <Typography variant="body1" fontWeight="bold">{newContract.incoterm}</Typography>
                      </Grid>
                    </Grid>
                  </Alert>
                </Grid>
              )}

              {/* Supporting Documents Section */}
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1, color: brandPrimary, mt: 2 }}>
                  <Description /> Supporting Documents
                </Typography>
                <Divider sx={{ mb: 2 }} />
              </Grid>

              <Grid item xs={12}>
                <Alert severity="info" sx={{ mb: 2 }}>
                  <Typography variant="body2">
                    <strong>Recommended Documents (to support contract):</strong> Sample quality certificates, sales agreement/proforma invoice, 
                    organic/fair trade certificates (if applicable), EUDR due diligence statement (for EU buyers)
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                    📋 Required Documents for Export Approval
                  </Typography>
                  <Typography variant="caption" component="div">
                    Upload these documents before submitting your contract:
                  </Typography>
                  <Typography variant="caption" component="ul" sx={{ mt: 0.5, mb: 0, pl: 2 }}>
                    <li><strong>Quality Certificate</strong> - Coffee quality inspection report</li>
                    <li><strong>Certificate of Origin</strong> - Proof of Ethiopian origin</li>
                    <li><strong>Export Permit</strong> - ECTA export authorization</li>
                  </Typography>
                  <Box sx={{ mt: 1.5, pt: 1, borderTop: '1px dashed rgba(0,0,0,0.12)' }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                      📥 Download Sample Templates:
                    </Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap">
                      <SecondaryButton brand="EXPORTER"
                        size="small"
                        startIcon={<Download />}
                        href="/samples/Quality_Certificate_Sample.md"
                        download
                        sx={{ fontSize: '0.7rem', py: 0.25, px: 1 }}
                      >
                        Quality Certificate
                      </SecondaryButton>
                      <SecondaryButton brand="EXPORTER"
                        size="small"
                        startIcon={<Download />}
                        href="/samples/Certificate_of_Origin_Sample.md"
                        download
                        sx={{ fontSize: '0.7rem', py: 0.25, px: 1 }}
                      >
                        Certificate of Origin
                      </SecondaryButton>
                      <SecondaryButton brand="EXPORTER"
                        size="small"
                        startIcon={<Download />}
                        href="/samples/Export_Permit_Sample.md"
                        download
                        sx={{ fontSize: '0.7rem', py: 0.25, px: 1 }}
                      >
                        Export Permit
                      </SecondaryButton>
                    </Stack>
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    <strong>Note:</strong> Export documents (Bill of Lading, Commercial Invoice, etc.) are created LATER when you register the actual shipment, not now.
                  </Typography>
                </Alert>

                {[
                  { value: 'QUALITY_CERTIFICATE', label: 'Quality / Sample Certificate', required: true, note: 'Required by ECTA' },
                  { value: 'CERTIFICATE_OF_ORIGIN', label: 'Certificate of Origin', required: true, note: 'Required by ECTA' },
                  { value: 'EXPORT_PERMIT', label: 'Export Permit', required: true, note: 'Required by ECTA' },
                  { value: 'PROFORMA_INVOICE', label: 'Sales Agreement / Proforma Invoice' },
                  { value: 'SALES_CONTRACT', label: 'Signed Sales Contract' },
                  { value: 'PURCHASE_ORDER', label: 'Buyer Purchase Order' },
                  { value: 'ORGANIC_CERTIFICATE', label: 'Organic Certificate' },
                  { value: 'FAIR_TRADE_CERTIFICATE', label: 'Fair Trade Certificate' },
                  { value: 'EUDR_STATEMENT', label: 'EUDR Due Diligence Statement' },
                ].map((documentType) => {
                  const documentsForType = contractDocuments.filter((doc) => doc.category === documentType.value);
                  return (
                    <Paper key={documentType.value} variant="outlined" sx={{ p: 1.5, mb: 1, bgcolor: documentType.required ? '#fff8e1' : 'grey.50', borderColor: documentType.required ? 'warning.light' : 'divider' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={600}>
                            {documentType.label}
                            {documentType.required && <Chip label="REQUIRED" size="small" color="warning" sx={{ ml: 1, height: 20, fontSize: '0.65rem' }} />}
                          </Typography>
                          {documentsForType.length === 0 && (
                            <Typography variant="caption" color={documentType.required ? 'warning.dark' : 'text.secondary'}>
                              {documentType.required ? (documentType.note || 'Required for ECTA approval') : 'Optional supporting document'}
                            </Typography>
                          )}
                        </Box>
                        <SecondaryButton brand='EXPORTER' component="label" size="small" startIcon={<Upload />}>
                          Upload
                          <input
                            hidden
                            type="file"
                            multiple
                            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                            onChange={(event) => handleContractDocumentSelect(documentType.value, event)}
                          />
                        </SecondaryButton>
                      </Box>
                      {documentsForType.map((doc) => (
                        <Box key={doc.localId} sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Description fontSize="small" sx={{ color: doc.status === 'success' ? 'success.main' : doc.status === 'error' ? 'error.main' : 'text.disabled' }} />
                          <Typography variant="caption" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {doc.file.name} · {(doc.file.size / 1024).toFixed(1)} KB
                          </Typography>
                          <Chip
                            size="small"
                            label={doc.status === 'success' ? 'Uploaded' : doc.status === 'error' ? 'Upload failed' : 'Uploading…'}
                            color={doc.status === 'success' ? 'success' : doc.status === 'error' ? 'error' : 'default'}
                          />
                          {doc.status === 'error' && (
                            <Tooltip title={doc.error || 'Remove this failed upload and try again'}>
                              <IconButton size="small" color="error" onClick={() => setContractDocuments((current) => current.filter((item) => item.localId !== doc.localId))}>
                                <Delete fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      ))}
                    </Paper>
                  );
                })}
              </Grid>
            </Grid>
          </PortalDialog>
  );
};
