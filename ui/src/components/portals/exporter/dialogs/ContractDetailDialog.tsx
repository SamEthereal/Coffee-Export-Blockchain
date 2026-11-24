import React from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Alert,
  Tooltip,
  Divider,
} from '@mui/material';
import {
  Description,
  Add,
  AccountBalance,
  Warning,
  CheckCircle,
  Business,
  FlightTakeoff,
  Category,
  Assessment,
  LocalShipping,
  VerifiedUser,
  Assignment,
} from '@mui/icons-material';
import {
  PortalDialog,
  GhostButton,
  PrimaryButton,
  SecondaryButton,
  DangerButton,
  getPortalBrand,
} from '@/components/shared/portal';
import { ExportContract } from '../../../../types';
import { DocumentManagementPanel } from '@/components/documents';
import BlockchainSignatureVerification from '@/components/documents/BlockchainSignatureVerification';

export interface ContractDetailDialogProps {
  open: boolean;
  onClose: () => void;
  selectedContractForDetail: ExportContract | null;
  profile: any;
  forexStatuses: any[];
  lcStatuses: any[];
  isContractApproved: (contract: ExportContract) => boolean;
  hasActionableRejectionFeedback: (contract: any) => boolean;
  handleCorrectRejectedContract: (contract: ExportContract) => void;
  handleCreateShipmentForContract: (contract: ExportContract) => void;
  handleRequestLCForContract: (contract: ExportContract) => void;
}

const brandPrimary = getPortalBrand('EXPORTER').primary;

export const ContractDetailDialog: React.FC<ContractDetailDialogProps> = ({
  open,
  onClose,
  selectedContractForDetail,
  profile,
  forexStatuses,
  lcStatuses,
  isContractApproved,
  hasActionableRejectionFeedback,
  handleCorrectRejectedContract,
  handleCreateShipmentForContract,
  handleRequestLCForContract,
}) => {
  return (
    <PortalDialog brand='EXPORTER'
      open={open}
      onClose={onClose}
      maxWidth="md"
      PaperProps={{
        sx: {
          borderRadius: 2,
          boxShadow: 24,
        }
      }}
    
  icon={<Description />}
  title="Contract Details"
  subtitle={selectedContractForDetail?.contractId}
  actions={<>
        <GhostButton brand='EXPORTER' onClick={onClose}>
          Close
        </GhostButton>
        {(() => {
          // Only show "Create Shipment" button if contract has forex allocated
          if (selectedContractForDetail) {
            const hasForex = forexStatuses.some(f =>
              f.contractId === selectedContractForDetail.contractId &&
              f.status === 'ALLOCATED'
            );
            // Approval auto-creates the LC, so an approved contract with
            // no forex allocated yet ALREADY has one — the API rejects a
            // second request with 409 DUPLICATE_LC. The LC-existence
            // check is any LC for the contract (same rule as the API's
            // duplicate check), not just an issued one.
            const existingLC = lcStatuses.find(lc =>
              lc.contractId === selectedContractForDetail.contractId
            );

            if (hasForex) {
              return (
                <PrimaryButton brand='EXPORTER'
                  startIcon={<Add />}
                  onClick={() => handleCreateShipmentForContract(selectedContractForDetail)}>
                  Create Shipment
                </PrimaryButton>
              );
            } else if (existingLC) {
              // Never offer "Request LC" once one exists: show the
              // existing LC instead, disabled, with its real status.
              // REQUESTED means the auto-created LC is awaiting the
              // bank; ISSUED and later means it is already issued.
              return (
                <Tooltip title={`LC ${existingLC.lcId} is already ${existingLC.status} for this contract. Approval creates the LC automatically — a second request is rejected by the bank (DUPLICATE_LC). Track it in the "Forex & Banking" tab.`}>
                  <span>
                    <SecondaryButton brand='EXPORTER'
                      startIcon={<AccountBalance />}
                      disabled
                    >
                      {existingLC.status === 'REQUESTED' ? 'LC already requested' : 'LC already issued'}
                    </SecondaryButton>
                  </span>
                </Tooltip>
              );
            } else if (isContractApproved(selectedContractForDetail)) {
              // APPROVED and no LC yet: the only state in which a manual
              // LC request can succeed. (Approval normally auto-creates
              // the LC, so this is a defensive path for the rare case the
              // auto-created LC is missing.) Offer the request.
              return (
                <SecondaryButton brand='EXPORTER'
                  startIcon={<AccountBalance />}
                  onClick={() => handleRequestLCForContract(selectedContractForDetail)}>
                  Request LC
                </SecondaryButton>
              );
            } else {
              // Not APPROVED yet: the chaincode rejects an LC request for
              // any non-APPROVED contract (400 LC_REQUEST_FAILED), and
              // approval auto-creates the LC, so a button here could only
              // ever fail. Show a plain note instead of offering it.
              return (
                <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
                  LC is created automatically when the contract is approved.
                </Typography>
              );
            }
          }
          return null;
        })()}
      
  </>}
>
        {selectedContractForDetail && (
          <Box>
            {/* Status Banner */}
            <Alert 
              severity={selectedContractForDetail.status === 'REJECTED'
                ? 'error'
                : isContractApproved(selectedContractForDetail)
                  ? 'success'
                  : 'info'}
              icon={selectedContractForDetail.status === 'REJECTED' ? <Warning /> : <CheckCircle />}
              sx={{ mb: 3 }}
            >
              <Typography variant="body2" fontWeight={600}>
                Contract Status: {selectedContractForDetail.status}
              </Typography>
              <Typography variant="caption">
                {selectedContractForDetail.status === 'APPROVED' && (hasIssuedLC(selectedContractForDetail.contractId) ? 'Approved by ECTA - LC issued, ready for export' : 'Approved by ECTA - Ready for shipment creation')}
              </Typography>
              {selectedContractForDetail.status === 'REJECTED' && (
                <Box sx={{ mt: 1 }}>
                    <Typography variant="body2" fontWeight={600}>ECTA feedback</Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                      {selectedContractForDetail.rejectionReason || 'No rejection reason was recorded. Contact ECTA for details.'}
                    </Typography>
                    {!hasActionableRejectionFeedback(selectedContractForDetail.rejectionReason) && (
                      <Alert severity="warning" sx={{ mt: 1 }}>
                        ECTA's note does not identify which field to change or what value is required. Ask ECTA for a specific correction before registering a replacement; do not guess.
                      </Alert>
                    )}
                    {(selectedContractForDetail.rejectedBy || selectedContractForDetail.rejectionDate) && (
                      <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                        {selectedContractForDetail.rejectedBy ? `Rejected by ${selectedContractForDetail.rejectedBy}` : ''}
                        {selectedContractForDetail.rejectedBy && selectedContractForDetail.rejectionDate ? ' · ' : ''}
                        {selectedContractForDetail.rejectionDate
                          ? new Date(selectedContractForDetail.rejectionDate).toLocaleDateString()
                          : ''}
                      </Typography>
                    )}
                    <DangerButton brand='EXPORTER'
                      size="small"
                      sx={{ mt: 1.5 }}
                      onClick={() => handleCorrectRejectedContract(selectedContractForDetail)}
                    >
                      Correct details and register replacement
                    </DangerButton>
                </Box>
              )}
            </Alert>

            {/* Main Contract Information */}
            <Card variant="outlined" sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="overline" color="text.secondary" gutterBottom>
                  Buyer Information
                </Typography>
                <Grid container spacing={2} sx={{ mt: 1 }}>
                  <Grid item xs={12} sm={6}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <Business fontSize="small" color="primary" />
                      <Box>
                        <Typography variant="caption" color="text.secondary">Buyer Name</Typography>
                        <Typography variant="body1" fontWeight={600}>
                          {selectedContractForDetail.buyerName}
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <FlightTakeoff fontSize="small" color="primary" />
                      <Box>
                        <Typography variant="caption" color="text.secondary">Destination</Typography>
                        <Typography variant="body1" fontWeight={600}>
                          {selectedContractForDetail.buyerCountry}
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>

            {/* Coffee & Quantity Details */}
            <Card variant="outlined" sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="overline" color="text.secondary" gutterBottom>
                  Coffee Details
                </Typography>
                <Grid container spacing={2} sx={{ mt: 1 }}>
                  <Grid item xs={12} sm={4}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <Category fontSize="small" sx={{ color: '#8B4513' }} />
                      <Box>
                        <Typography variant="caption" color="text.secondary">Coffee Type</Typography>
                        <Typography variant="body1" fontWeight={600}>
                          {selectedContractForDetail.coffeeType}
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <Assessment fontSize="small" color="secondary" />
                      <Box>
                        <Typography variant="caption" color="text.secondary">Quantity</Typography>
                        <Typography variant="body1" fontWeight={600}>
                          {Number(selectedContractForDetail.quantity).toLocaleString()} kg
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <LocalShipping fontSize="small" color="action" />
                      <Box>
                        <Typography variant="caption" color="text.secondary">Number of Bags</Typography>
                        <Typography variant="body1" fontWeight={600}>
                          {Math.ceil(selectedContractForDetail.quantity / 60)} bags (60kg each)
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>

            {/* Financial Details */}
            <Card variant="outlined" sx={{ mb: 2, bgcolor: 'success.50' }}>
              <CardContent>
                <Typography variant="overline" color="text.secondary" gutterBottom>
                  Financial Information
                </Typography>
                <Grid container spacing={2} sx={{ mt: 1 }}>
                  <Grid item xs={12} sm={4}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Price per kg</Typography>
                      <Typography variant="h6" color="success.main" fontWeight={700}>
                        ${selectedContractForDetail.pricePerKg.toFixed(2)}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Currency</Typography>
                      <Typography variant="h6" fontWeight={700}>
                        {selectedContractForDetail.currency}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Total Contract Value</Typography>
                      <Typography variant="h5" color="primary.main" fontWeight={700}>
                        ${Number(selectedContractForDetail.totalValue).toLocaleString()}
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>

            {/* Timeline & Dates */}
            <Card variant="outlined">
              <CardContent>
                <Typography variant="overline" color="text.secondary" gutterBottom>
                  Timeline & References
                </Typography>
                <Grid container spacing={2} sx={{ mt: 1 }}>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary">Registration Date</Typography>
                    <Typography variant="body1" fontWeight={600}>
                      {selectedContractForDetail.registrationDate 
                        ? new Date(selectedContractForDetail.registrationDate).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })
                        : 'N/A'}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary">NBE Reference Number</Typography>
                    <Typography variant="body1" fontWeight={600}>
                      {selectedContractForDetail.nbeReferenceNumber || 'Pending'}
                    </Typography>
                  </Grid>
                  {selectedContractForDetail.supersedesContractId && (
                    <Grid item xs={12}>
                      <Typography variant="caption" color="text.secondary">Replacement for rejected contract</Typography>
                      <Typography variant="body1" fontWeight={600}>
                        {selectedContractForDetail.supersedesContractId}
                      </Typography>
                    </Grid>
                  )}
                </Grid>
              </CardContent>
            </Card>

            {/* Signed Documents Section - Real documents with signatures */}
            {isContractApproved(selectedContractForDetail) && (
              <Card variant="outlined" sx={{ mt: 2 }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <VerifiedUser color="success" />
                      <Typography variant="overline" color="text.secondary">
                        Cryptographically Signed Documents
                      </Typography>
                    </Box>
                  </Box>
                  
                  {/* Blockchain Verification - Component handles all messaging */}
                  <Typography variant="h6" gutterBottom sx={{ mt: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <VerifiedUser color="primary" />
                    Cryptographic Signatures & Blockchain Verification
                  </Typography>
                  
                  <BlockchainSignatureVerification
                    entityType="CONTRACT"
                    entityId={selectedContractForDetail.contractId}
                  />
                  
                  <Divider sx={{ my: 3 }} />
                  
                  {/* Document Management Panel for Downloads */}
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Description />
                    Contract Documents
                  </Typography>
                  
                  <DocumentManagementPanel
                    entityType="CONTRACT"
                    entityId={selectedContractForDetail.contractId}
                    title=""
                    allowUpload={false}
                    allowSign={false}
                    showSignatureTracker={false}
                  />
                  
                  <Divider sx={{ my: 2 }} />
                  
                  <Alert severity="info" icon={<Description />}>
                    <Typography variant="body2" fontWeight={600} gutterBottom>
                      How to Verify Authenticity
                    </Typography>
                    <Typography variant="caption" component="div">
                      • Expand each signature accordion above to see X.509 certificate details<br/>
                      • Copy blockchain transaction ID for independent verification<br/>
                      • Download PDFs below to see visual signature stamps<br/>
                      • Verify certificate fingerprint matches signer's public key
                    </Typography>
                  </Alert>
                </CardContent>
              </Card>
            )}

            {/* Next Steps - Dynamic based on forex status */}
            <Alert 
              severity={(() => {
                if (selectedContractForDetail) {
                  const hasForex = forexStatuses.some(f => 
                    f.contractId === selectedContractForDetail.contractId && 
                    f.status === 'ALLOCATED'
                  );
                  return hasForex ? 'success' : 'info';
                }
                return 'info';
              })()} 
              icon={<Assignment />} 
              sx={{ mt: 3 }}
            >
              <Typography variant="body2" fontWeight={600} gutterBottom>
                Next Steps
              </Typography>
              <Typography variant="caption">
                {(() => {
                  if (selectedContractForDetail) {
                    const hasForex = forexStatuses.some(f => 
                      f.contractId === selectedContractForDetail.contractId && 
                      f.status === 'ALLOCATED'
                    );
                    
                    if (hasForex) {
                      return (
                        <>
                          ✅ <strong>Ready to proceed!</strong> Click the <strong>"Create Shipment"</strong> button below to register shipment details and initiate the export workflow (quality inspection → export permit → customs clearance).
                        </>
                      );
                    } else if (!isContractApproved(selectedContractForDetail)) {
                      return (
                        <>
                          ⏳ <strong>Awaiting ECTA Approval:</strong> This contract must be approved by ECTA before a Letter of Credit can be created. The LC is created automatically when the contract is approved.
                        </>
                      );
                    } else {
                      return (
                        <>
                          ⏳ <strong>LC Required First:</strong> Go to <strong>"My Contracts"</strong> tab and click <strong>"Request LC"</strong> button. After the bank issues the LC and allocates forex, you can return to create a shipment.
                        </>
                      );
                    }
                  }
                  return 'Review contract details above and proceed to next steps.';
                })()}
              </Typography>
            </Alert>
          </Box>
        )}
      </PortalDialog>
  );
};
