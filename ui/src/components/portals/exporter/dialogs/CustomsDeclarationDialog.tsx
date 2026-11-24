import React from 'react';
import {
  Box,
  Typography,
  Grid,
  Paper,
  Chip,
  Alert,
  Tooltip,
  IconButton,
} from '@mui/material';
import {
  Description,
  CheckCircle,
  Upload,
  AttachFile,
  Delete,
} from '@mui/icons-material';
import {
  PortalDialog,
  GhostButton,
  AnimatedButton,
  SecondaryButton,
  PortalField,
  getPortalBrand,
} from '@/components/shared/portal';

export interface CustomsDeclarationDialogProps {
  open: boolean;
  onClose: () => void;
  selectedShipmentForCustoms: any | null;
  contracts: any[];
  isSubmittingCustoms: boolean;
  customsDocuments: any[];
  setCustomsDocuments: React.Dispatch<React.SetStateAction<any[]>>;
  handleCustomsDocumentSelect: (category: string, event: React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmitCustomsDeclaration: () => void;
}

const brandPrimary = getPortalBrand('EXPORTER').primary;

export const CustomsDeclarationDialog: React.FC<CustomsDeclarationDialogProps> = ({
  open,
  onClose,
  selectedShipmentForCustoms,
  contracts,
  isSubmittingCustoms,
  customsDocuments,
  setCustomsDocuments,
  handleCustomsDocumentSelect,
  handleSubmitCustomsDeclaration,
}) => {
  return (
    <PortalDialog brand='EXPORTER'
      open={open}
      onClose={onClose}
      maxWidth="md"
    
  icon={<Description sx={{ color: '#2196F3' }} />}
  title="Submit Customs Declaration"
  actions={<>
        <GhostButton brand='EXPORTER' onClick={onClose}>
          Cancel
        </GhostButton>
        <AnimatedButton
          variant="contained"
          brandColor={brandPrimary}
          disabled={isSubmittingCustoms || customsDocuments.some((document) => document.status !== 'success')}
          loading={isSubmittingCustoms}
          loadingLabel="Submitting…"
          ledgerWrite
          onClick={handleSubmitCustomsDeclaration}
        >
          Submit to ECC
        </AnimatedButton>
      
  </>}
>
        {selectedShipmentForCustoms && (
          <>
            {/* Previous Steps Summary - Professional Form View */}
            <Paper elevation={3} sx={{ p: 3, mb: 3, bgcolor: '#f0f7ff', border: '2px solid #2196F3' }}>
              {(() => {
                const contract = contracts.find(c => c.contractId === selectedShipmentForCustoms.contractId);
                return (
                  <Grid container spacing={3}>
                    <Grid item xs={12} sm={6}>
                      <PortalField
                        fullWidth
                        label="Contract ID"
                        value={contract?.contractId || 'N/A'}
                        disabled
                        size="small"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <PortalField
                        fullWidth
                        label="Destination"
                        value={contract?.buyerCountry || 'N/A'}
                        disabled
                        size="small"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <PortalField
                        fullWidth
                        label="Coffee Type"
                        value={contract?.coffeeType || selectedShipmentForCustoms.grade || 'N/A'}
                        disabled
                        size="small"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <PortalField
                        fullWidth
                        label="Quantity (kg)"
                        value={contract?.quantity ? Number(contract.quantity).toLocaleString() : (selectedShipmentForCustoms.quantity ? Number(selectedShipmentForCustoms.quantity).toLocaleString() : '0')}
                        disabled
                        size="small"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <PortalField
                        fullWidth
                        label="Price per Kg"
                        value={contract?.pricePerKg ? `$${contract.pricePerKg}/kg (${contract?.currency || 'USD'})` : '—'}
                        disabled
                        size="small"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <PortalField
                        fullWidth
                        label="Payment Method"
                        value="LC"
                        disabled
                        size="small"
                        helperText="Letter of Credit"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <PortalField
                        fullWidth
                        label="Incoterm"
                        value="FOB"
                        disabled
                        size="small"
                        helperText="Free on Board"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <PortalField
                        fullWidth
                        label="Contract Status"
                        value="Approved"
                        disabled
                        size="small"
                        InputProps={{
                          startAdornment: <CheckCircle fontSize="small" sx={{ color: '#4CAF50', mr: 1 }} />
                        }}
                      />
                    </Grid>

                    <Grid item xs={12} sm={6}>
                      <PortalField
                        fullWidth
                        label="Shipment ID"
                        value={selectedShipmentForCustoms.shipmentId}
                        disabled
                        size="small"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <PortalField
                        fullWidth
                        label="Origin"
                        value="Yirgacheffe"
                        disabled
                        size="small"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <PortalField
                        fullWidth
                        label="Grade"
                        value={selectedShipmentForCustoms.grade || 'Grade 1'}
                        disabled
                        size="small"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <PortalField
                        fullWidth
                        label="ICO Number"
                        value="ET-2105-34593"
                        disabled
                        size="small"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <PortalField
                        fullWidth
                        label="Channel"
                        value="Direct Export"
                        disabled
                        size="small"
                      />
                    </Grid>
                  </Grid>
                );
              })()}
            </Paper>

            <Alert severity="warning" sx={{ mb: 3 }}>
              <Typography variant="body2" fontWeight="bold" gutterBottom>
                Required Documents Checklist
              </Typography>
              <Grid container spacing={1}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2">Commercial Invoice (showing FOB value, buyer details)</Typography>
                  <Typography variant="body2">Packing List (container/bag details, weight)</Typography>
                  <Typography variant="body2">ECTA Export Permit (issued after quality approval)</Typography>
                  <Typography variant="body2">ICO Certificate of Origin (for ICO-certified coffee)</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2">Bill of Lading or Waybill (if already issued)</Typography>
                  <Typography variant="body2">Phytosanitary Certificate (plant health clearance)</Typography>
                  <Typography variant="body2">EUDR Due Diligence Statement (for EU destinations only)</Typography>
                </Grid>
              </Grid>
              <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                All documents must be uploaded to the system before final submission
              </Typography>
            </Alert>

            {/* Upload each document from its checklist row. Files are linked to this shipment immediately. */}
            <Paper elevation={2} sx={{ p: 3, mb: 3, bgcolor: '#f9f9f9' }}>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Upload />
                Supporting Documents
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Choose each document beside its name. It uploads to this shipment as soon as you select it.
              </Typography>
              {[
                { value: 'COMMERCIAL_INVOICE', label: 'Commercial Invoice' },
                { value: 'PACKING_LIST', label: 'Packing List' },
                { value: 'EXPORT_PERMIT', label: 'ECTA Export Permit' },
                { value: 'CERTIFICATE_OF_ORIGIN', label: 'Certificate of Origin' },
                { value: 'BILL_OF_LADING', label: 'Bill of Lading / Waybill' },
                { value: 'PHYTOSANITARY_CERTIFICATE', label: 'Phytosanitary Certificate' },
                { value: 'EUDR_STATEMENT', label: 'EUDR Due Diligence Statement' },
              ].map((documentType) => {
                const documentsForType = customsDocuments.filter((doc) => doc.documentType === documentType.value);
                return (
                  <Box key={documentType.value} sx={{ p: 1.5, mb: 1, bgcolor: 'white', borderRadius: 1, border: '1px solid #e0e0e0' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                      <Typography variant="body2" fontWeight={600}>{documentType.label}</Typography>
                      <SecondaryButton brand='EXPORTER' component="label" size="small" startIcon={<AttachFile />}>
                        Upload
                        <input
                          hidden
                          type="file"
                          multiple
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(event) => handleCustomsDocumentSelect(documentType.value, event)}
                        />
                      </SecondaryButton>
                    </Box>
                    {documentsForType.map((doc) => (
                      <Box key={doc.localId} sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Description fontSize="small" sx={{ color: doc.status === 'success' ? 'success.main' : doc.status === 'error' ? 'error.main' : 'text.disabled' }} />
                        <Typography variant="caption" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {doc.name} · {(doc.size / 1024).toFixed(1)} KB
                        </Typography>
                        <Chip
                          size="small"
                          label={doc.status === 'success' ? 'Uploaded' : doc.status === 'error' ? 'Upload failed' : 'Uploading…'}
                          color={doc.status === 'success' ? 'success' : doc.status === 'error' ? 'error' : 'default'}
                        />
                        {doc.status === 'error' && (
                          <Tooltip title={doc.error || 'Remove this failed upload and try again'}>
                            <IconButton size="small" color="error" onClick={() => setCustomsDocuments((current) => current.filter((item) => item.localId !== doc.localId))}>
                              <Delete fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    ))}
                  </Box>
                );
              })}
            </Paper>
          </>
        )}
      </PortalDialog>
  );
};
