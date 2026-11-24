import React from 'react';
import {
  Box,
  Grid,
  Typography,
  Paper,
  Chip,
  Alert,
  CircularProgress,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
  Tooltip,
} from '@mui/material';
import {
  Description,
  CheckCircle,
  Cancel,
  AccountBalance,
  CloudUpload,
  VerifiedUser,
  Timeline,
  AttachMoney,
  LocalShipping,
  Assessment,
  Security,
  Warning,
  Info,
} from '@mui/icons-material';
import {
  PortalDialog,
  GhostButton,
  PrimaryButton,
  SecondaryButton,
  DangerButton,
  StatusChip,
} from '@/components/shared/portal';
import { apiFetch } from '@/config/api.config';
import { DocumentManagementPanel } from '@/components/documents';
import BlockchainSignatureVerification from '@/components/documents/BlockchainSignatureVerification';
import BusinessActivityTimeline from '@/components/documents/BusinessActivityTimeline';
import ExporterHistoricalTrend from '@/components/shared/ExporterHistoricalTrend';

export interface LCDetailsDialogProps {
  open: boolean;
  onClose: () => void;
  selectedLC: any;
  lcDetailsLoading: boolean;
  handleApproveLC: (lcId: string, exporterId?: string) => Promise<void>;
  handleRejectLC: (lcId: string) => Promise<void>;
  loadBankingData: () => Promise<void>;
  showSuccess: (title: string, message: string) => void;
  showError: (title: string, message: string, details?: any) => void;
  onOpenUploadDocuments: (entityId: string, entityType: string) => void;
  onOpenAmendLC: (form: any) => void;
  shipments?: any[];
}

export const LCDetailsDialog: React.FC<LCDetailsDialogProps> = ({
  open,
  onClose,
  selectedLC,
  lcDetailsLoading,
  handleApproveLC,
  handleRejectLC,
  loadBankingData,
  showSuccess,
  showError,
  onOpenUploadDocuments,
  onOpenAmendLC,
  shipments = [],
}) => {
  const chipStatus = (status?: string | null) => (status || 'PENDING') as any;

  return (
    <PortalDialog brand="BANKS" open={open} onClose={onClose} maxWidth="md" title={<>Letter of Credit Details
          {lcDetailsLoading && (
            <CircularProgress size={20} sx={{ ml: 2, verticalAlign: 'middle' }} />
          )}</>} icon={<Description />} actions={<>
          <GhostButton brand="BANKS" onClick={onClose}>Close</GhostButton>
          {/* REQUESTED status: Show Approve and Reject buttons */}
          {selectedLC && selectedLC.status === 'REQUESTED' && (
            <>
              <PrimaryButton brand="BANKS"
                startIcon={<CheckCircle />}
                loadingLabel="Approving…"
                ledgerWrite
                onClick={() => handleApproveLC(selectedLC.lcId, selectedLC.exporterId)}
              >
                Approve LC
              </PrimaryButton>
              <DangerButton brand="BANKS"
                startIcon={<Cancel />}
                loadingLabel="Rejecting…"
                ledgerWrite
                onClick={() => handleRejectLC(selectedLC.lcId)}
              >
                Reject LC
              </DangerButton>
            </>
          )}
          {/* APPROVED status: Show Issue button */}
          {selectedLC && selectedLC.status === 'APPROVED' && (
            <PrimaryButton brand="BANKS"
              startIcon={<AccountBalance />}
              loadingLabel="Issuing…"
              ledgerWrite
              onClick={async () => {
                try {
                  const token = localStorage.getItem('authToken');
                  const response = await apiFetch(`/banking/lc/${selectedLC.lcId}/issue`, {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${token}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ 
                      terms: selectedLC.terms || 'Standard UCP 600 terms and conditions apply' 
                    }),
                  });
                  const result = await response.json();
                  if (result.success) {
                    showSuccess('LC Issued', `LC ${selectedLC.lcId} has been issued successfully`);
                    loadBankingData();
                    onClose();
                  } else {
                    showError('LC Issue Failed', result.error?.message || 'Failed to issue LC');
                  }
                } catch (error: any) {
                  showError('Network Error', 'Failed to issue LC', error.message);
                }
              }}
            >
              Issue LC
            </PrimaryButton>
          )}
          {selectedLC && selectedLC.status === 'ISSUED' && (
            <>
              <Button
                variant="outlined"
                color="secondary"
                startIcon={<CloudUpload />}
                onClick={() => {
                  setUploadEntityId(selectedLC.lcId);
                  setUploadEntityType('LC');
                  setDocumentUploadDialogOpen(true);
                }}
              >
                Upload Documents
              </Button>
              <SecondaryButton brand="BANKS"
                sx={{ fontWeight: 600 }}
                onClick={() => {
                  setDialogType('lcAmend');
                  setAmendmentForm({
                    amendmentReason: '',
                    newAmount: selectedLC.amount.toString(),
                    newExpiryDate: selectedLC.expiryDate,
                    newTerms: '',
                  });
                }}
              >
                Amend LC
              </SecondaryButton>
            </>
          )}
        </>}>

          {selectedLC && (
            <Box sx={{ pt: 2, position: 'relative' }}>
              {lcDetailsLoading && (
                <Box sx={{ 
                  position: 'absolute', 
                  top: 0, 
                  left: 0, 
                  right: 0, 
                  bottom: 0, 
                  bgcolor: 'rgba(255,255,255,0.7)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  zIndex: 1
                }}>
                  <CircularProgress />
                </Box>
              )}
              <Grid container spacing={3}>
                {/* LC Information */}
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="black" gutterBottom>
                    LC Information
                  </Typography>
                  <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
                    <Grid container spacing={2}>
                      <Grid item xs={12} md={6}>
                        <Typography variant="body2" color="black">LC ID</Typography>
                        <Typography variant="body1" fontWeight={600}>{selectedLC.lcId}</Typography>
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <Typography variant="body2" color="black">Status</Typography>
                        <StatusChip 
                          label={selectedLC.status} 
                          status={chipStatus(selectedLC.status)}
                        />
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <Typography variant="body2" color="black">Contract Reference</Typography>
                        <Typography variant="body1">{selectedLC.contractId}</Typography>
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <Typography variant="body2" color="black">Exporter ID</Typography>
                        <Typography variant="body1">{selectedLC.exporterId}</Typography>
                      </Grid>
                      
                      {/* ✅ Actor tracking: WHO performed actions */}
                      {selectedLC.approvedByMsp && (
                        <Grid item xs={12} md={6}>
                          <Typography variant="body2" color="black">Approved By</Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                            <Chip 
                              label={selectedLC.approvedByMsp}
                              size="small"
                              color={selectedLC.approvedByMsp === 'BanksMSP' ? 'success' : selectedLC.approvedByMsp === 'ECTAMSP' ? 'warning' : 'default'}
                              sx={{ fontWeight: 600 }}
                            />
                            <Typography variant="caption" color="text.secondary">
                              {selectedLC.approvedByMsp === 'BanksMSP' ? '(Bank)' : 
                               selectedLC.approvedByMsp === 'ECTAMSP' ? '(ECTA - unusual)' :
                               selectedLC.approvedByMsp === 'ExportersMSP' ? '(Exporter - error)' : ''}
                            </Typography>
                          </Box>
                        </Grid>
                      )}
                      
                      {selectedLC.issuedByMsp && (
                        <Grid item xs={12} md={6}>
                          <Typography variant="body2" color="black">Issued By</Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                            <Chip 
                              label={selectedLC.issuedByMsp}
                              size="small"
                              color={selectedLC.issuedByMsp === 'BanksMSP' ? 'success' : 'warning'}
                              sx={{ fontWeight: 600 }}
                            />
                            <Typography variant="caption" color="text.secondary">
                              {selectedLC.issuedByMsp === 'BanksMSP' ? '(Bank)' : '(Unusual)'}
                            </Typography>
                          </Box>
                        </Grid>
                      )}
                    </Grid>
                  </Paper>
                </Grid>

                {/* Banking Details */}
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="black" gutterBottom>
                    Banking Details
                  </Typography>
                  <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
                    <Grid container spacing={2}>
                      <Grid item xs={12} md={6}>
                        <Typography variant="body2" color="black">Issuing Bank (Buyer's Bank)</Typography>
                        <Typography variant="body1" fontWeight={600}>
                          {selectedLC.issuingBank || 'N/A'}
                        </Typography>
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <Typography variant="body2" color="black">Advising Bank (Exporter's Bank)</Typography>
                        <Typography variant="body1" fontWeight={600}>
                          {selectedLC.advisingBank || selectedLC.bankName || 'N/A'}
                        </Typography>
                      </Grid>
                    </Grid>
                  </Paper>
                </Grid>

                {/* Financial Details */}
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="black" gutterBottom>
                    Financial Details
                  </Typography>
                  <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
                    <Grid container spacing={2}>
                      <Grid item xs={12} md={6}>
                        <Typography variant="body2" color="black">LC Amount</Typography>
                        <Typography variant="h6" color="black" fontWeight={600}>
                          ${selectedLC.amount.toLocaleString()} {selectedLC.currency}
                        </Typography>
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <Typography variant="body2" color="black">Currency</Typography>
                        <Typography variant="body1">{selectedLC.currency}</Typography>
                      </Grid>
                    </Grid>
                  </Paper>
                </Grid>

                {/* Shipment & Transport */}
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="black" gutterBottom>
                    Shipment & Transport
                  </Typography>
                  <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
                    <Grid container spacing={2}>
                      <Grid item xs={12} md={6}>
                        <Typography variant="body2" color="black">Transport Mode</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                          {selectedLC.transportMode === 'AIR' ? (
                            <>
                              <FlightTakeoff color="secondary" />
                              <Typography variant="body1">Air Freight</Typography>
                              <Chip label="1-3 days transit" size="small" color="secondary" />
                            </>
                          ) : (
                            <>
                              <DirectionsBoat sx={{ color: '#9b30b7' }} />
                              <Typography variant="body1">Sea Freight</Typography>
                              <Chip 
                                label="25-35 days transit" 
                                size="small" 
                                sx={{ bgcolor: '#9b30b7', color: '#fff', fontWeight: 600 }}
                              />
                            </>
                          )}
                        </Box>
                      </Grid>
                    </Grid>
                    {selectedLC.transportMode === 'AIR' && (
                      <Alert severity="info" sx={{ mt: 2 }}>
                        <Typography variant="body2">
                          <strong>Faster Payment Realization:</strong> Air freight shipments reach buyers faster,
                          enabling quicker document presentation and payment settlement (typically 3-7 days vs 30-40 days for sea freight).
                        </Typography>
                      </Alert>
                    )}
                  </Paper>
                </Grid>

                {/* Timeline */}
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="black" gutterBottom>
                    Timeline
                  </Typography>
                  <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
                    <Grid container spacing={2}>
                      <Grid item xs={12} md={6}>
                        <Typography variant="body2" color="black">Request Date</Typography>
                        <Typography variant="body1">
                          {selectedLC.requestDate ? new Date(selectedLC.requestDate).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          }) : 'N/A'}
                        </Typography>
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <Typography variant="body2" color="black">Expiry Date</Typography>
                        <Typography variant="body1" fontWeight={600}>
                          {(() => {
                            console.log('[BANKS] Expiry Date Debug:', {
                              expiryDate: selectedLC.expiryDate,
                              ExpiryDate: (selectedLC as any).ExpiryDate,
                              expiry_date: (selectedLC as any).expiry_date,
                              allKeys: Object.keys(selectedLC).filter(k => k.toLowerCase().includes('expiry'))
                            });
                            return selectedLC.expiryDate ? new Date(selectedLC.expiryDate).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            }) : 'N/A';
                          })()}
                        </Typography>
                      </Grid>
                      <Grid item xs={12}>
                        <Typography variant="body2" color="black">Days Remaining</Typography>
                        <Typography variant="body1">
                          {selectedLC.expiryDate ? Math.max(0, Math.ceil((new Date(selectedLC.expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))) : 'N/A'} days
                        </Typography>
                      </Grid>
                    </Grid>
                  </Paper>
                </Grid>

                {/* Recent Shipments Section */}
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="black" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <LocalShipping />
                    Recent Shipments
                  </Typography>
                  <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
                    {selectedLC.relatedShipments && selectedLC.relatedShipments.length > 0 ? (
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell><strong>Shipment ID</strong></TableCell>
                              <TableCell><strong>Status</strong></TableCell>
                              <TableCell><strong>Transport</strong></TableCell>
                              <TableCell><strong>Date</strong></TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {selectedLC.relatedShipments.slice(0, 5).map((shipment: any) => {
                              // Normalize status - handle various field names
                              const shipmentStatus = (
                                shipment.status || 
                                shipment.Status || 
                                shipment.shipmentStatus || 
                                'UNKNOWN'
                              ).toUpperCase();
                              
                              const statusColors: Record<string, any> = {
                                'CREATED': 'default',
                                'PENDING': 'default',
                                'QUALITY_CONTROL': 'info',
                                'APPROVED': 'warning',
                                'REQUESTED': 'warning',
                                'SHIPPED': 'info',
                                'IN_TRANSIT': 'info',
                                'DELIVERED': 'success',
                                'CUSTOMS_CLEARED': 'success',
                                'UNKNOWN': 'error'
                              };
                              
                              return (
                                <TableRow key={shipment.shipmentId || shipment.id}>
                                  <TableCell>
                                    <Typography variant="body2" fontWeight={600}>
                                      {shipment.shipmentId || shipment.id || 'N/A'}
                                    </Typography>
                                  </TableCell>
                                  <TableCell>
                                    <Chip 
                                      label={shipmentStatus.replace(/_/g, ' ')} 
                                      size="small"
                                      color={statusColors[shipmentStatus] || 'default'}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="body2">
                                      {shipment.transportMode === 'AIR' ? '✈️ Air' : 
                                       shipment.transportMode === 'SEA' ? '🚢 Sea' : 
                                       shipment.transportMode || 'In Transit'}
                                    </Typography>
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="body2">
                                      {shipment.actualDeparture ? 
                                        new Date(shipment.actualDeparture).toLocaleDateString() : 
                                        shipment.estimatedDeparture ? 
                                        new Date(shipment.estimatedDeparture).toLocaleDateString() :
                                        shipment.createdAt ? 
                                        new Date(shipment.createdAt).toLocaleDateString() : 
                                        'N/A'}
                                    </Typography>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    ) : (
                      <Alert severity="info">
                        No shipments recorded for this LC yet. Shipments will appear here once the exporter creates them.
                      </Alert>
                    )}
                  </Paper>
                </Grid>

                {/* Document Compliance Check */}
                {documentChecklist && (
                  <Grid item xs={12}>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      ✅ Document Compliance Check
                    </Typography>
                    
                    {/* Validation Summary */}
                    <Alert 
                      severity={
                        documentChecklist.validation?.canApprove || documentChecklist.validation?.canIssue
                          ? 'success' 
                          : 'warning'
                      }
                      sx={{ mb: 2 }}
                      icon={
                        documentChecklist.validation?.canApprove || documentChecklist.validation?.canIssue
                          ? <CheckCircle />
                          : <Warning />
                      }
                    >
                      <Typography variant="body2" fontWeight={600}>
                        {documentChecklist.validation?.canApprove || documentChecklist.validation?.canIssue
                          ? `✅ All requirements met for ${documentChecklist.currentStage}`
                          : `⚠️ ${documentChecklist.validation?.missingDocuments?.length || documentChecklist.validation?.missingRequirements?.length || 0} requirement(s) not met`
                        }
                      </Typography>
                      {documentChecklist.validation?.reason && (
                        <Typography variant="body2" sx={{ mt: 0.5 }}>
                          {documentChecklist.validation.reason}
                        </Typography>
                      )}
                    </Alert>

                    {/* Current Stage Badge */}
                    <Box sx={{ mb: 2 }}>
                      <Chip 
                        label={`Current Stage: ${documentChecklist.currentStage}`}
                        color={
                          documentChecklist.currentStage === 'APPROVAL' ? 'warning' :
                          documentChecklist.currentStage === 'ISSUANCE' ? 'info' :
                          'success'
                        }
                        sx={{ fontWeight: 600 }}
                      />
                    </Box>

                    {/* Requirements Checklist Table */}
                    <TableContainer component={Paper}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell width="40%"><strong>Requirement</strong></TableCell>
                            <TableCell width="20%"><strong>Category</strong></TableCell>
                            <TableCell width="15%"><strong>Required</strong></TableCell>
                            <TableCell width="25%"><strong>Status</strong></TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {documentChecklist.checklist?.requirements?.map((req: any, index: number) => (
                            <TableRow 
                              key={req.documentType + index}
                              sx={{ 
                                bgcolor: req.status === 'MISSING' && req.required ? 'error.lighter' : 'transparent'
                              }}
                            >
                              <TableCell>
                                <Box>
                                  <Typography variant="body2" fontWeight={600}>
                                    {(req.documentType || req.type || 'Document').replace(/_/g, ' ')}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    {req.description}
                                  </Typography>
                                  {req.fileName && (
                                    <Typography variant="caption" display="block" color="success.main" sx={{ mt: 0.5 }}>
                                      📄 {req.fileName}
                                    </Typography>
                                  )}
                                </Box>
                              </TableCell>
                              <TableCell>
                                <Chip 
                                  label={req.category} 
                                  size="small"
                                  variant="outlined"
                                  sx={{ fontSize: '0.7rem' }}
                                />
                              </TableCell>
                              <TableCell>
                                {req.required ? (
                                  <Chip label="Required" size="small" color="error" />
                                ) : (
                                  <Chip label="Optional" size="small" color="default" />
                                )}
                              </TableCell>
                              <TableCell>
                                <Chip 
                                  label={req.status}
                                  size="small"
                                  color={
                                    req.status === 'AVAILABLE' ? 'success' :
                                    req.status === 'MISSING' ? 'error' : 
                                    'default'
                                  }
                                  icon={
                                    req.status === 'AVAILABLE' ? <CheckCircle sx={{ fontSize: 16 }} /> :
                                    req.status === 'MISSING' ? <Close sx={{ fontSize: 16 }} /> :
                                    undefined
                                  }
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>

                    {/* Additional Validation Details */}
                    {documentChecklist.validation?.validationDetails && (
                      <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
                        <Typography variant="caption" fontWeight={600} display="block" gutterBottom>
                          Validation Details:
                        </Typography>
                        <Grid container spacing={1}>
                          {documentChecklist.validation.validationDetails.contractStatus && (
                            <Grid item xs={6}>
                              <Typography variant="caption">
                                Contract Status: <strong>{documentChecklist.validation.validationDetails.contractStatus}</strong>
                              </Typography>
                            </Grid>
                          )}
                          {documentChecklist.validation.validationDetails.exporterLicenseStatus && (
                            <Grid item xs={6}>
                              <Typography variant="caption">
                                License Status: <strong>{documentChecklist.validation.validationDetails.exporterLicenseStatus}</strong>
                              </Typography>
                            </Grid>
                          )}
                          {documentChecklist.validation.validationDetails.requiredCount !== undefined && (
                            <Grid item xs={6}>
                              <Typography variant="caption">
                                Required Documents: <strong>{documentChecklist.validation.validationDetails.requiredCount}</strong>
                              </Typography>
                            </Grid>
                          )}
                          {documentChecklist.validation.validationDetails.availableCount !== undefined && (
                            <Grid item xs={6}>
                              <Typography variant="caption">
                                Available Documents: <strong>{documentChecklist.validation.validationDetails.availableCount}</strong>
                              </Typography>
                            </Grid>
                          )}
                        </Grid>
                      </Box>
                    )}
                  </Grid>
                )}

                {/* Exporter Historical Trend - Show before approval */}
                {selectedLC.status === 'REQUESTED' && selectedLC.exporterId && (
                  <Grid item xs={12}>
                    <Divider sx={{ my: 2 }} />
                    <ExporterHistoricalTrend
                      exporterId={selectedLC.exporterId}
                      contractId={selectedLC.contractId}
                    />
                  </Grid>
                )}

                {/* Workflow Status */}
                <Grid item xs={12}>
                  <Alert severity={selectedLC.status === 'ISSUED' ? 'success' : 'info'}>
                    {selectedLC.status === 'ISSUED' ? (
                      <>
                        <strong>LC Active:</strong> This Letter of Credit has been issued and is active. 
                        Bank should now allocate forex for this LC. After forex allocation and NBE monitoring, exporter can proceed with shipment.
                      </>
                    ) : selectedLC.status === 'APPROVED' ? (
                      <>
                        <strong>LC Approved:</strong> This Letter of Credit has been approved and is ready for issuance.
                      </>
                    ) : (
                      <>
                        <strong>LC Pending:</strong> This Letter of Credit is awaiting approval from the issuing bank.
                      </>
                    )}
                  </Alert>
                </Grid>

                {/* LC Documents Management */}
                <Grid item xs={12}>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    📄 Available Documents for Review
                  </Typography>
                  
                  {selectedLC.documents && selectedLC.documents.length > 0 ? (
                    <TableContainer component={Paper} sx={{ mt: 2 }}>
                      <Table>
                        <TableHead>
                          <TableRow>
                            <TableCell><strong>Document Type</strong></TableCell>
                            <TableCell><strong>File Name</strong></TableCell>
                            <TableCell><strong>Uploaded</strong></TableCell>
                            <TableCell><strong>Status</strong></TableCell>
                            <TableCell align="right"><strong>Actions</strong></TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {selectedLC.documents.map((doc: any) => (
                            <TableRow key={doc.documentId}>
                              <TableCell>
                                <Chip 
                                  label={(doc.documentType || doc.type || 'Document').replace(/_/g, ' ')} 
                                  size="small" 
                                  color="primary" 
                                  variant="outlined"
                                />
                              </TableCell>
                              <TableCell>{doc.fileName || doc.filename || 'N/A'}</TableCell>
                              <TableCell>
                                {doc.uploadedAt || doc.uploaded_at ? new Date(doc.uploadedAt || doc.uploaded_at).toLocaleDateString() : 'N/A'}
                              </TableCell>
                              <TableCell>
                                <Chip 
                                  label={doc.status || doc.verificationStatus || 'Active'} 
                                  size="small" 
                                  color={doc.status === 'verified' || doc.verificationStatus === 'verified' ? 'success' : 'default'}
                                />
                              </TableCell>
                              <TableCell align="right">
                                <Tooltip title="View Document">
                                  <IconButton
                                    size="small"
                                    onClick={() => {
                                      window.open(
                                        `${API_BASE_URL}/documents/${doc.documentId}/view?token=${localStorage.getItem('authToken')}`,
                                        '_blank'
                                      );
                                    }}
                                  >
                                    <VisibilityIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Download">
                                  <IconButton
                                    size="small"
                                    onClick={() => {
                                      window.open(
                                        `${API_BASE_URL}/documents/${doc.documentId}/download?token=${localStorage.getItem('authToken')}`,
                                        '_blank'
                                      );
                                    }}
                                  >
                                    <DownloadIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  ) : (
                    <Alert severity="info" sx={{ mt: 2 }}>
                      No documents available for this LC yet.
                    </Alert>
                  )}
                  
                  {/* Supporting Documents Section */}
                  <Box sx={{ mt: 2 }}>
                    <Alert severity="info" sx={{ mb: 2 }}>
                      <Typography variant="body2">
                        <strong>Note:</strong> For final payment release, UCP 600 requires these critical documents: 
                        Commercial Invoice, Bill of Lading, and Packing List. Supporting documents (Certificate of Origin, 
                        Quality Certificate, Insurance Certificate, Export Permit, etc.) must be signed by ECTA, Customs, 
                        and Shipping authorities at their respective portals before LC document examination.
                      </Typography>
                    </Alert>
                  </Box>
                </Grid>

                {/* Next Steps */}
                {selectedLC.status === 'ISSUED' && (
                  <Grid item xs={12}>
                    <Paper sx={{ p: 2, bgcolor: 'primary.50', border: '1px solid', borderColor: 'primary.200' }}>
                      <Typography variant="subtitle2" gutterBottom>
                        <TrendingUp sx={{ mr: 1, verticalAlign: 'middle' }} />
                        Next Steps in Export Process:
                      </Typography>
                      <Typography variant="body2" component="div">
                        1. <strong>Bank Forex Allocation:</strong> Bank allocates foreign exchange using the active NBE retention policy recorded on the ledger<br />
                        2. <strong>Quality Inspection:</strong> ECTA conducts quality inspection and issues export permit<br />
                        3. <strong>Shipment Preparation:</strong> Exporter prepares shipment with required documents<br />
                        4. <strong>Document Submission:</strong> Exporter submits shipping documents to bank<br />
                        5. <strong>Payment Release:</strong> Bank verifies documents and releases payment via SWIFT
                      </Typography>
                    </Paper>
                  </Grid>
                )}

                {/* Blockchain Verification - Component handles all messaging */}
                <Grid item xs={12}>
                  <Divider sx={{ my: 2 }} />
                  
                  {/* Business Activity Timeline - Shows WHO did WHAT */}
                  <BusinessActivityTimeline
                    entityType="LC"
                    entityId={selectedLC.lcId}
                  />
                  
                  <Divider sx={{ my: 3 }} />
                  
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    🔐 Cryptographic Signatures & Blockchain Verification
                  </Typography>
                  <BlockchainSignatureVerification
                    entityType="LETTER_OF_CREDIT"
                    entityId={selectedLC.lcId}
                  />
                </Grid>
              </Grid>
            </Box>
          )}
        
      </PortalDialog>
  );
};

export default LCDetailsDialog;
