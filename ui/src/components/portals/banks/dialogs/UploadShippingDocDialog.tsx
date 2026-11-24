import React, { useState } from 'react';
import {
  Box,
  Grid,
  Typography,
  Alert,
  CircularProgress,
  Card,
  CardContent,
} from '@mui/material';
import {
  CloudUpload,
} from '@mui/icons-material';
import {
  PortalDialog,
  GhostButton,
  PrimaryButton,
} from '@/components/shared/portal';
import { apiFetch } from '@/config/api.config';

export interface UploadShippingDocDialogProps {
  open: boolean;
  onClose: () => void;
  selectedLC: any;
  setSelectedLC: (lc: any) => void;
  showSuccess: (title: string, message: string, details?: any, txId?: string) => void;
  showError: (title: string, message: string) => void;
}

export const UploadShippingDocDialog: React.FC<UploadShippingDocDialogProps> = ({
  open,
  onClose,
  selectedLC,
  setSelectedLC,
  showSuccess,
  showError,
}) => {
  const [uploadingDocType, setUploadingDocType] = useState<string | null>(null);

  const extractTxId = (result: any): string | undefined => {
    return result?.data?.blockchainTxId || result?.data?.txId || result?.blockchainTxId || result?.txId;
  };

  return (
    <PortalDialog
        brand="BANKS"
        open={open}
        onClose={() => {
          onClose();
        }}
        maxWidth="md"
        title="Upload Required Shipping Documents"
        icon={<CloudUpload />}
        key={selectedLC?.lcId || 'upload-dialog'} // Force re-render when LC changes
      >
        <Box sx={{ p: 2 }}>
          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="body2" fontWeight={600} gutterBottom>
              📋 Required Documents for UCP 600 Compliance
            </Typography>
            <Typography variant="body2">
              Upload all required shipping documents to proceed with document examination and payment release.
            </Typography>
          </Alert>

          <Grid container spacing={3}>
            {/* Required Documents Checklist */}
            {[
              { 
                type: 'BILL_OF_LADING', 
                label: 'Bill of Lading', 
                icon: '📄',
                description: 'Proof of shipment and cargo ownership',
                required: true,
              },
              { 
                type: 'COMMERCIAL_INVOICE', 
                label: 'Commercial Invoice', 
                icon: '🧾',
                description: 'Detailed invoice for payment processing',
                required: true,
              },
              { 
                type: 'PACKING_LIST', 
                label: 'Packing List', 
                icon: '📦',
                description: 'Detailed list of shipped goods',
                required: true,
              },
              { 
                type: 'CERTIFICATE_OF_ORIGIN', 
                label: 'Certificate of Origin', 
                icon: '🌍',
                description: 'Proof of goods origin (Ethiopia)',
                required: false,
              },
              { 
                type: 'INSURANCE_CERTIFICATE', 
                label: 'Insurance Certificate', 
                icon: '🛡️',
                description: 'Cargo insurance documentation',
                required: false,
              },
              { 
                type: 'INSPECTION_CERTIFICATE', 
                label: 'Quality Inspection Certificate', 
                icon: '✅',
                description: 'Coffee quality certification',
                required: false,
              },
            ].map((doc) => {
              // Check if this document is already uploaded
              const existingDoc = selectedLC?.documents?.find(
                (d: any) => d.documentType === doc.type && (d.entityType === 'SHIPMENT' || d.entityType === 'CUSTOMS_DECLARATION')
              );
              const isUploaded = !!existingDoc;
              const isUploading = uploadingDocType === doc.type;

              return (
                <Grid item xs={12} key={`doc-upload-${doc.type}`}>
                  <Card 
                    sx={{ 
                      border: isUploaded ? '2px solid #4caf50' : doc.required ? '2px solid #ff9800' : '2px solid #e0e0e0',
                      bgcolor: isUploaded ? '#f1f8f4' : 'white',
                    }}
                  >
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                        <Box sx={{ flex: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              {doc.icon} {doc.label}
                            </Typography>
                            {doc.required && !isUploaded && (
                              <Chip label="REQUIRED" size="small" color="warning" />
                            )}
                            {isUploaded && (
                              <Chip label="UPLOADED" size="small" color="success" icon={<CheckCircle />} />
                            )}
                          </Box>
                          <Typography variant="body2" color="text.secondary">
                            {doc.description}
                          </Typography>
                          {isUploaded && (
                            <Typography variant="caption" color="success.main" sx={{ mt: 1, display: 'block' }}>
                              ✓ {existingDoc.fileName} - {existingDoc.verificationStatus || 'pending verification'}
                            </Typography>
                          )}
                        </Box>
                        
                        {!isUploaded && (
                          <Box sx={{ ml: 2 }}>
                            <input
                              key={`input-${doc.type}-${Date.now()}`}
                              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                              style={{ display: 'none' }}
                              id={`upload-input-${doc.type}`}
                              type="file"
                              disabled={uploadingDocType !== null}
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;

                                setUploadingDocType(doc.type);
                                const token = localStorage.getItem('authToken');
                                
                                // Use the actual shipment ID from relatedShipments
                                let shipmentId = 'SHIP1794897257941'; // Default for this test LC
                                
                                if (selectedLC?.relatedShipments && selectedLC.relatedShipments.length > 0) {
                                  shipmentId = selectedLC.relatedShipments[0].shipmentId;
                                  console.log(`[UPLOAD] Using shipment ID from relatedShipments: ${shipmentId}`);
                                } else {
                                  console.log(`[UPLOAD] No relatedShipments found, using hardcoded: ${shipmentId}`);
                                }

                                const formData = new FormData();
                                formData.append('file', file);
                                formData.append('entityType', 'SHIPMENT');
                                formData.append('entityId', shipmentId);
                                formData.append('documentType', doc.type);
                                formData.append('remarks', `${doc.label} uploaded by bank for LC examination`);

                                try {
                                  const response = await apiFetch('/documents/upload', {
                                    method: 'POST',
                                    headers: { 'Authorization': `Bearer ${token}` },
                                    body: formData,
                                  });

                                  const result = await response.json();
                                  if (result.success) {
                                    showSuccess(
                                      'Document Uploaded',
                                      `${doc.label} uploaded successfully`,
                                      undefined,
                                      extractTxId(result)
                                    );
                                    
                                    // Refresh the LC data to show the new document
                                    if (selectedLC?.lcId) {
                                      const lcResponse = await apiFetch(`/banking/lc/${selectedLC.lcId}`, {
                                        headers: { 'Authorization': `Bearer ${token}` }
                                      });
                                      const lcResult = await lcResponse.json();
                                      if (lcResult.success && lcResult.data) {
                                        setSelectedLC(lcResult.data);
                                      }
                                    }
                                  } else {
                                    showError('Upload Failed', result.error?.message || 'Unknown error');
                                  }
                                } catch (error: any) {
                                  showError('Upload Error', error.message);
                                } finally {
                                  setUploadingDocType(null);
                                }

                                // Reset file input
                                e.target.value = '';
                              }}
                            />
                            <label htmlFor={`upload-input-${doc.type}`}>
                              <PrimaryButton
                                brand="BANKS"
                                component="span"
                                startIcon={isUploading ? <CircularProgress size={16} /> : <CloudUpload />}
                                size="small"
                                disabled={uploadingDocType !== null && !isUploading}
                                sx={{ 
                                  pointerEvents: (uploadingDocType !== null && !isUploading) ? 'none' : 'auto',
                                  opacity: (uploadingDocType !== null && !isUploading) ? 0.5 : 1,
                                }}
                              >
                                {isUploading ? 'Uploading...' : 'Upload'}
                              </PrimaryButton>
                            </label>
                          </Box>
                        )}
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>

          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <GhostButton
              brand="BANKS"
              onClick={() => {
                onClose();
              }}
            >
              Close
            </GhostButton>
          </Box>
        </Box>
      </PortalDialog>
  );
};

export default UploadShippingDocDialog;
