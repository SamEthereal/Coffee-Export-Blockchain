import React from 'react';
import {
  Box,
  Grid,
  Typography,
  Paper,
  Chip,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  Button,
} from '@mui/material';
import {
  Description,
  CheckCircle,
  Cancel,
  Assignment,
  CloudUpload,
  AccessTime,
  Visibility,
} from '@mui/icons-material';
import {
  PortalDialog,
  GhostButton,
  PrimaryButton,
  DangerButton,
} from '@/components/shared/portal';
import { apiFetch, API_BASE_URL } from '@/config/api.config';

export interface DocumentExaminationDialogProps {
  open: boolean;
  onClose: () => void;
  selectedLC: any;
  lcDetailsLoading: boolean;
  handleExamineLCDocuments: (lcId: string, compliant: boolean, notes: string) => Promise<void>;
  handleVerifyDocument: (docId: string, compliant: boolean) => Promise<void>;
  verifyingDocumentId?: string | null;
  onOpenUploadShippingDoc: () => void;
}

export const DocumentExaminationDialog: React.FC<DocumentExaminationDialogProps> = ({
  open,
  onClose,
  selectedLC,
  lcDetailsLoading,
  handleExamineLCDocuments,
  handleVerifyDocument,
  verifyingDocumentId,
  onOpenUploadShippingDoc,
}) => {
  return (
    <PortalDialog brand="BANKS" open={open} onClose={onClose} maxWidth="lg" title={<>Document Examination - LC {selectedLC?.lcId}</>} icon={<Description />} contentSx={{ mt: 2 }} actions={<>
          <GhostButton brand="BANKS"
            onClick={onClose}
          >
            Close
          </GhostButton>
          {selectedLC?.documents?.every((d: any) => ['verified', 'approved', 'compliant'].includes(d.verificationStatus || d.status)) && (
            <PrimaryButton
              brand="BANKS"
              startIcon={<CheckCircle />}
              loadingLabel="Examining…"
              ledgerWrite
              onClick={async () => {
                await handleExamineLCDocuments(selectedLC.lcId, true, '');
                onClose();
              }}
              sx={{ ml: 1 }}
            >
              Mark LC as Compliant & Ready for Payment
            </PrimaryButton>
          )}
        </>}>

          {/* Loading Indicator */}
          {lcDetailsLoading && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
              <CircularProgress size={24} />
              <Typography variant="body2" color="text.secondary">
                Loading complete document package...
              </Typography>
            </Box>
          )}
          
          {selectedLC && (
            <>
              {/* LC Summary */}
              <Alert severity="info" sx={{ mb: 3 }}>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6} md={3}>
                    <Typography variant="caption" color="text.secondary">LC Amount:</Typography>
                    <Typography variant="body1" fontWeight="bold">
                      ${selectedLC.amount?.toLocaleString()} {selectedLC.currency}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Typography variant="caption" color="text.secondary">Exporter:</Typography>
                    <Typography variant="body1" sx={{ wordBreak: 'break-word' }}>{selectedLC.exporterId}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Typography variant="caption" color="text.secondary">Buyer:</Typography>
                    <Typography variant="body1" sx={{ wordBreak: 'break-word' }}>{selectedLC.buyerName || 'N/A'}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Typography variant="caption" color="text.secondary">Status:</Typography>
                    <Typography variant="body1" fontWeight="bold" sx={{ wordBreak: 'break-word' }}>{selectedLC.status}</Typography>
                  </Grid>
                </Grid>
              </Alert>

              {/* Document Checklist */}
              <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Assignment />
                Document Examination - UCP 600 Compliance
              </Typography>
              
              <Alert severity="warning" sx={{ mb: 2 }}>
                <Typography variant="body2" fontWeight={600} gutterBottom>
                  ⚠️ Document Examination Workflow (UCP 600):
                </Typography>
                <Typography variant="body2" component="div">
                  <strong>Pre-Shipment Documents</strong> (CONTRACT, PROFORMA_INVOICE): Examined during LC approval/issuance<br/>
                  <strong>Shipping Documents</strong> (BILL_OF_LADING, COMMERCIAL_INVOICE, PACKING_LIST, etc.): Examined AFTER shipment creation for payment release<br/>
                  <br/>
                  Banks should only examine shipping documents when shipment exists. Pre-shipment documents are verified earlier in the workflow.
                </Typography>
              </Alert>

              {selectedLC.documents && selectedLC.documents.length > 0 ? (
                <Box>
                  {/* Group documents by workflow stage */}
                  {(() => {
                    // Pre-shipment documents (examined during LC approval)
                    const preShipmentTypes = ['CONTRACT', 'LC'];
                    const preShipmentDocs = (selectedLC.documents || []).filter((d: any) => 
                      preShipmentTypes.includes(d.entityType) || 
                      d.documentType === 'PROFORMA_INVOICE'
                    );
                    
                    // Shipping documents (examined for payment release)
                    const shippingTypes = ['SHIPMENT', 'CUSTOMS_DECLARATION'];
                    const shippingDocs = (selectedLC.documents || []).filter((d: any) => 
                      shippingTypes.includes(d.entityType) &&
                      d.documentType !== 'PROFORMA_INVOICE'
                    );
                    
                    return (
                      <>
                        {/* Pre-Shipment Documents Section */}
                        {preShipmentDocs.length > 0 && (
                          <Box sx={{ mb: 4 }}>
                            <Paper sx={{ p: 2, mb: 2, bgcolor: '#f5f5f5', border: '2px dashed #9e9e9e' }}>
                              <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1, color: '#616161', display: 'flex', alignItems: 'center', gap: 1 }}>
                                📋 Pre-Shipment Documents ({preShipmentDocs.length})
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                These documents were examined during LC approval/issuance. They verify contract terms, exporter credentials, and LC requirements before shipment.
                              </Typography>
                            </Paper>
                            {preShipmentDocs.map((doc: any, index: number) => {
                              const entityLabel = doc.entityType === 'LC' ? '📋 LC Document' 
                                                : doc.entityType === 'CONTRACT' ? '📄 Contract Document'
                                                : '📋 Pre-Shipment Document';
                              
                              return (
                    <Card 
                      key={doc.documentId || index} 
                      sx={{ 
                        mb: 2, 
                        border: '2px solid', 
                        borderColor: doc.verificationStatus === 'verified' || doc.status === 'verified' 
                          ? 'success.main' 
                          : doc.verificationStatus === 'rejected' || doc.status === 'rejected' 
                          ? 'error.main' 
                          : 'grey.300',
                        bgcolor: doc.verificationStatus === 'verified' || doc.status === 'verified' 
                          ? 'rgba(76, 175, 80, 0.05)' 
                          : doc.verificationStatus === 'rejected' || doc.status === 'rejected' 
                          ? 'rgba(244, 67, 54, 0.05)' 
                          : 'white'
                      }}
                    >
                      <CardContent>
                        <Grid container spacing={2} alignItems="center">
                          {/* Document Icon & Info */}
                          <Grid item xs={1}>
                            <Box sx={{ 
                              width: 60, 
                              height: 60, 
                              borderRadius: 1, 
                              bgcolor: doc.verificationStatus === 'verified' || doc.status === 'verified' 
                                ? '#4caf50' 
                                : doc.verificationStatus === 'rejected' || doc.status === 'rejected' 
                                ? '#f44336' 
                                : '#ff9800',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'white'
                            }}>
                              <Description sx={{ fontSize: 36 }} />
                            </Box>
                          </Grid>

                          {/* Document Details */}
                          <Grid item xs={5}>
                            <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 0.5 }}>
                              {doc.documentType?.replace(/_/g, ' ') || doc.type?.replace(/_/g, ' ') || 'Document'}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                              📄 File: {doc.fileName || doc.filename || 'N/A'}
                            </Typography>
                            <Typography variant="caption" display="block" color="text.secondary">
                              📅 Uploaded: {doc.uploadedAt || doc.uploaded_at ? new Date(doc.uploadedAt || doc.uploaded_at).toLocaleString() : 'N/A'}
                            </Typography>
                            <Typography variant="caption" display="block" color="text.secondary">
                              👤 By: {doc.uploadedBy || doc.uploaded_by || 'Exporter'}
                            </Typography>
                            {doc.documentId && (
                              <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5, fontFamily: 'monospace', fontSize: '0.7rem' }}>
                                🆔 Doc ID: {doc.documentId}
                              </Typography>
                            )}
                          </Grid>

                          {/* Verification Status */}
                          <Grid item xs={2}>
                            <Chip 
                              label={
                                doc.verificationStatus === 'verified' || doc.status === 'verified' 
                                  ? 'VERIFIED' 
                                  : doc.verificationStatus === 'rejected' || doc.status === 'rejected' 
                                  ? 'REJECTED' 
                                  : 'PENDING'
                              }
                              color={
                                doc.verificationStatus === 'verified' || doc.status === 'verified' 
                                  ? 'success' 
                                  : doc.verificationStatus === 'rejected' || doc.status === 'rejected' 
                                  ? 'error' 
                                  : 'warning'
                              }
                              icon={
                                doc.verificationStatus === 'verified' || doc.status === 'verified' 
                                  ? <CheckCircle /> 
                                  : doc.verificationStatus === 'rejected' || doc.status === 'rejected' 
                                  ? <Cancel /> 
                                  : <AccessTime />
                              }
                              sx={{ fontSize: '0.9rem', px: 1 }}
                            />
                            {doc.verifiedAt && (
                              <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1 }}>
                                {new Date(doc.verifiedAt).toLocaleDateString()}
                              </Typography>
                            )}
                          </Grid>

                          {/* Actions */}
                          <Grid item xs={4}>
                            <Box sx={{ display: 'flex', gap: 1, flexDirection: 'column' }}>
                              <Button
                                size="small"
                                variant="outlined"
                                startIcon={<Visibility />}
                                onClick={async () => {
                                  try {
                                    const apiUrl = API_BASE_URL.replace(/\/api\/v1\/?$/, '');
                                    const token = localStorage.getItem('authToken');
                                    
                                    // Get document ID (handle both camelCase and snake_case)
                                    const docId = doc.documentId || doc.document_id;
                                    
                                    console.log('Viewing document:', docId, 'Full doc object:', doc);
                                    console.log('Token exists:', !!token);
                                    
                                    if (!docId) {
                                      alert('Document ID not found. Cannot view document.');
                                      return;
                                    }
                                    
                                    if (!token) {
                                      alert('Authentication required. Please login again.');
                                      window.location.href = '/login';
                                      return;
                                    }
                                    
                                    // Fetch document with authentication
                                    const response = await fetch(`${apiUrl}/api/v1/documents/${docId}/download`, {
                                      headers: {
                                        'Authorization': `Bearer ${token}`
                                      }
                                    });
                                    
                                    console.log('Response status:', response.status);
                                    
                                    if (!response.ok) {
                                      const errorData: any = await response.json().catch(() => null);
                                      console.log('Error data:', errorData);
                                      
                                      // Handle authentication errors
                                      if (response.status === 401) {
                                        alert('Session expired. Please login again.');
                                        window.location.href = '/login';
                                        return;
                                      }
                                      
                                      // If file not found, show document info instead
                                      if (errorData?.error?.code === 'FILE_NOT_FOUND' || response.status === 404) {
                                        alert(`Document Information:\n\nType: ${doc.documentType || doc.type || 'N/A'}\nFile: ${doc.fileName || doc.filename || 'N/A'}\nUploaded: ${doc.uploadedAt || doc.uploaded_at ? new Date(doc.uploadedAt || doc.uploaded_at).toLocaleString() : 'N/A'}\nStatus: ${doc.verificationStatus || doc.status || 'N/A'}\n\n⚠️ Note: This is a test document. The actual file is not available on the server.`);
                                        return;
                                      }
                                      
                                      throw new (Error as any)(errorData?.error?.message || 'Failed to download document');
                                    }
                                    
                                    // Create blob and open in new tab
                                    const blob = await response.blob();
                                    const blobUrl = URL.createObjectURL(blob);
                                    window.open(blobUrl, '_blank');
                                    
                                    // Clean up blob URL after a delay
                                    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
                                  } catch (error: any) {
                                    console.error('Error viewing document:', error);
                                    alert(`Failed to view document: ${(error as Error)?.message || 'Unknown error'}`);
                                  }
                                }}
                                fullWidth
                                sx={{ 
                                  borderColor: '#1976d2',
                                  color: '#1976d2',
                                  '&:hover': { borderColor: '#115293', bgcolor: 'rgba(25, 118, 210, 0.05)' }
                                }}
                              >
                                View Document
                              </Button>
                              <Box sx={{ display: 'flex', gap: 1 }}>
                                <PrimaryButton brand="BANKS"
                                  size="small"
                                  startIcon={<CheckCircle />}
                                  loading={verifyingDocumentId === doc.documentId}
                                  loadingLabel="Approving…"
                                  ledgerWrite
                                  onClick={() => handleVerifyDocument(doc.documentId, true)}
                                  disabled={doc.verificationStatus === 'verified' || doc.status === 'verified' || verifyingDocumentId === doc.documentId}
                                  sx={{ flex: 1 }}
                                >
                                  Approve
                                </PrimaryButton>
                                <DangerButton brand="BANKS"
                                  size="small"
                                  color="error"
                                  startIcon={<Cancel />}
                                  loading={verifyingDocumentId === doc.documentId}
                                  loadingLabel="Rejecting…"
                                  ledgerWrite
                                  onClick={() => handleVerifyDocument(doc.documentId, false)}
                                  disabled={doc.verificationStatus === 'rejected' || doc.status === 'rejected' || verifyingDocumentId === doc.documentId}
                                  sx={{ flex: 1 }}
                                >
                                  Reject
                                </DangerButton>
                              </Box>
                            </Box>
                          </Grid>

                          {/* Document Notes/Comments */}
                          {doc.verificationNotes && (
                            <Grid item xs={12}>
                              <Alert 
                                severity={
                                  doc.verificationStatus === 'verified' || doc.status === 'verified' 
                                    ? 'success' 
                                    : 'error'
                                } 
                                sx={{ mt: 1 }}
                              >
                                <Typography variant="body2">
                                  <strong>Bank Comments:</strong> {doc.verificationNotes}
                                </Typography>
                              </Alert>
                            </Grid>
                          )}
                        </Grid>
                      </CardContent>
                    </Card>
                              );
                            })}
                          </Box>
                        )}
                        
                        {/* Shipping Documents Section */}
                        {shippingDocs.length > 0 && (
                          <Box sx={{ mb: 4 }}>
                            <Paper sx={{ p: 2, mb: 2, bgcolor: '#e3f2fd', border: '2px solid #1976d2' }}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                <Typography variant="subtitle1" fontWeight="bold" sx={{ color: '#1565c0', display: 'flex', alignItems: 'center', gap: 1 }}>
                                  🚢 Shipping Documents ({shippingDocs.length})
                                </Typography>
                                <PrimaryButton
                                  brand="BANKS"
                                  startIcon={<CloudUpload />}
                                  size="small"
                                  onClick={() => onOpenUploadShippingDoc()}
                                >
                                  Upload Documents
                                </PrimaryButton>
                              </Box>
                              <Typography variant="caption" color="text.secondary">
                                These documents are examined for payment release after shipment creation. They verify actual export performance and compliance with UCP 600 requirements.
                              </Typography>
                            </Paper>
                            {shippingDocs.map((doc: any, index: number) => {
                              const entityLabel = doc.entityType === 'SHIPMENT' ? '🚢 Shipment Document' 
                                                : doc.entityType === 'CUSTOMS_DECLARATION' ? '🛃 Customs Document'
                                                : '🚢 Shipping Document';
                              
                              return (
                    <Card 
                      key={doc.documentId || index} 
                      sx={{ 
                        mb: 2, 
                        border: '2px solid', 
                        borderColor: doc.verificationStatus === 'verified' || doc.status === 'verified' 
                          ? 'success.main' 
                          : doc.verificationStatus === 'rejected' || doc.status === 'rejected' 
                          ? 'error.main' 
                          : '#1976d2',
                        bgcolor: doc.verificationStatus === 'verified' || doc.status === 'verified' 
                          ? 'rgba(76, 175, 80, 0.05)' 
                          : doc.verificationStatus === 'rejected' || doc.status === 'rejected' 
                          ? 'rgba(244, 67, 54, 0.05)' 
                          : 'white'
                      }}
                    >
                      <CardContent>
                        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                          {entityLabel}
                        </Typography>
                        <Grid container spacing={2} alignItems="center">
                          {/* Document Icon & Info */}
                          <Grid item xs={1}>
                            <Box sx={{ 
                              width: 60, 
                              height: 60, 
                              borderRadius: 1, 
                              bgcolor: doc.verificationStatus === 'verified' || doc.status === 'verified' 
                                ? '#4caf50' 
                                : doc.verificationStatus === 'rejected' || doc.status === 'rejected' 
                                ? '#f44336' 
                                : '#ff9800',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'white'
                            }}>
                              <Description sx={{ fontSize: 36 }} />
                            </Box>
                          </Grid>

                          {/* Document Details */}
                          <Grid item xs={5}>
                            <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 0.5 }}>
                              {doc.documentType?.replace(/_/g, ' ') || doc.type?.replace(/_/g, ' ') || 'Document'}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                              📄 File: {doc.fileName || doc.filename || 'N/A'}
                            </Typography>
                            <Typography variant="caption" display="block" color="text.secondary">
                              📅 Uploaded: {doc.uploadedAt || doc.uploaded_at ? new Date(doc.uploadedAt || doc.uploaded_at).toLocaleString() : 'N/A'}
                            </Typography>
                            <Typography variant="caption" display="block" color="text.secondary">
                              👤 By: {doc.uploadedBy || doc.uploaded_by || 'Exporter'}
                            </Typography>
                            {doc.documentId && (
                              <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5, fontFamily: 'monospace', fontSize: '0.7rem' }}>
                                🆔 Doc ID: {doc.documentId}
                              </Typography>
                            )}
                          </Grid>

                          {/* Verification Status */}
                          <Grid item xs={2}>
                            <Chip 
                              label={
                                doc.verificationStatus === 'verified' || doc.status === 'verified' 
                                  ? 'VERIFIED' 
                                  : doc.verificationStatus === 'rejected' || doc.status === 'rejected' 
                                  ? 'REJECTED' 
                                  : 'PENDING'
                              }
                              color={
                                doc.verificationStatus === 'verified' || doc.status === 'verified' 
                                  ? 'success' 
                                  : doc.verificationStatus === 'rejected' || doc.status === 'rejected' 
                                  ? 'error' 
                                  : 'warning'
                              }
                              icon={
                                doc.verificationStatus === 'verified' || doc.status === 'verified' 
                                  ? <CheckCircle /> 
                                  : doc.verificationStatus === 'rejected' || doc.status === 'rejected' 
                                  ? <Cancel /> 
                                  : <AccessTime />
                              }
                              sx={{ fontSize: '0.9rem', px: 1 }}
                            />
                            {doc.verifiedAt && (
                              <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1 }}>
                                {new Date(doc.verifiedAt).toLocaleDateString()}
                              </Typography>
                            )}
                          </Grid>

                          {/* Actions */}
                          <Grid item xs={4}>
                            <Box sx={{ display: 'flex', gap: 1, flexDirection: 'column' }}>
                              <Button
                                size="small"
                                variant="outlined"
                                startIcon={<Visibility />}
                                onClick={async () => {
                                  try {
                                    const apiUrl = API_BASE_URL.replace(/\/api\/v1\/?$/, '');
                                    const token = localStorage.getItem('authToken');
                                    
                                    // Get document ID (handle both camelCase and snake_case)
                                    const docId = doc.documentId || doc.document_id;
                                    
                                    console.log('Viewing document:', docId, 'Full doc object:', doc);
                                    console.log('Token exists:', !!token);
                                    
                                    if (!docId) {
                                      alert('Document ID not found. Cannot view document.');
                                      return;
                                    }
                                    
                                    if (!token) {
                                      alert('Authentication required. Please login again.');
                                      window.location.href = '/login';
                                      return;
                                    }
                                    
                                    // Fetch document with authentication
                                    const response = await fetch(`${apiUrl}/api/v1/documents/${docId}/download`, {
                                      headers: {
                                        'Authorization': `Bearer ${token}`
                                      }
                                    });
                                    
                                    console.log('Response status:', response.status);
                                    
                                    if (!response.ok) {
                                      const errorData: any = await response.json().catch(() => null);
                                      console.log('Error data:', errorData);
                                      
                                      // Handle authentication errors
                                      if (response.status === 401) {
                                        alert('Session expired. Please login again.');
                                        window.location.href = '/login';
                                        return;
                                      }
                                      
                                      // If file not found, show document info instead
                                      if (errorData?.error?.code === 'FILE_NOT_FOUND' || response.status === 404) {
                                        alert(`Document Information:\n\nType: ${doc.documentType || doc.type || 'N/A'}\nFile: ${doc.fileName || doc.filename || 'N/A'}\nUploaded: ${doc.uploadedAt || doc.uploaded_at ? new Date(doc.uploadedAt || doc.uploaded_at).toLocaleString() : 'N/A'}\nStatus: ${doc.verificationStatus || doc.status || 'N/A'}\n\n⚠️ Note: This is a test document. The actual file is not available on the server.`);
                                        return;
                                      }
                                      
                                      throw new (Error as any)(errorData?.error?.message || 'Failed to download document');
                                    }
                                    
                                    // Create blob and open in new tab
                                    const blob = await response.blob();
                                    const blobUrl = URL.createObjectURL(blob);
                                    window.open(blobUrl, '_blank');
                                    
                                    // Clean up blob URL after a delay
                                    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
                                  } catch (error: any) {
                                    console.error('Error viewing document:', error);
                                    alert(`Failed to view document: ${(error as Error)?.message || 'Unknown error'}`);
                                  }
                                }}
                                fullWidth
                                sx={{ 
                                  borderColor: '#1976d2',
                                  color: '#1976d2',
                                  '&:hover': { borderColor: '#115293', bgcolor: 'rgba(25, 118, 210, 0.05)' }
                                }}
                              >
                                View Document
                              </Button>
                              <Box sx={{ display: 'flex', gap: 1 }}>
                                <PrimaryButton brand="BANKS"
                                  size="small"
                                  startIcon={<CheckCircle />}
                                  loading={verifyingDocumentId === doc.documentId}
                                  loadingLabel="Approving…"
                                  ledgerWrite
                                  onClick={() => handleVerifyDocument(doc.documentId, true)}
                                  disabled={doc.verificationStatus === 'verified' || doc.status === 'verified' || verifyingDocumentId === doc.documentId}
                                  sx={{ flex: 1 }}
                                >
                                  Approve
                                </PrimaryButton>
                                <DangerButton brand="BANKS"
                                  size="small"
                                  startIcon={<Cancel />}
                                  loading={verifyingDocumentId === doc.documentId}
                                  loadingLabel="Rejecting…"
                                  ledgerWrite
                                  onClick={() => handleVerifyDocument(doc.documentId, false)}
                                  disabled={doc.verificationStatus === 'rejected' || doc.status === 'rejected' || verifyingDocumentId === doc.documentId}
                                  sx={{ flex: 1 }}
                                >
                                  Reject
                                </DangerButton>
                              </Box>
                            </Box>
                          </Grid>

                          {/* Document Notes/Comments */}
                          {doc.verificationNotes && (
                            <Grid item xs={12}>
                              <Alert 
                                severity={
                                  doc.verificationStatus === 'verified' || doc.status === 'verified' 
                                    ? 'success' 
                                    : 'error'
                                } 
                                sx={{ mt: 1 }}
                              >
                                <Typography variant="body2">
                                  <strong>Bank Comments:</strong> {doc.verificationNotes}
                                </Typography>
                              </Alert>
                            </Grid>
                          )}
                        </Grid>
                      </CardContent>
                    </Card>
                              );
                            })}
                          </Box>
                        )}

                        {/* No shipping documents yet message */}
                        {shippingDocs.length === 0 && preShipmentDocs.length > 0 && (
                          <Alert severity="info" sx={{ mb: 3 }}>
                            <Typography variant="body2" fontWeight={600} gutterBottom>
                              ℹ️ No Shipping Documents Yet
                            </Typography>
                            <Typography variant="body2" gutterBottom>
                              Shipping documents (Bill of Lading, Commercial Invoice, Packing List, etc.) will be submitted after the exporter creates a shipment. 
                              Payment release requires verification of shipping documents against LC terms.
                            </Typography>
                            <Box sx={{ mt: 2 }}>
                              <PrimaryButton
                                brand="BANKS"
                                startIcon={<CloudUpload />}
                                size="small"
                                onClick={() => onOpenUploadShippingDoc()}
                              >
                                Upload Shipping Document
                              </PrimaryButton>
                            </Box>
                          </Alert>
                        )}
                      </>
                    );
                  })()}

                  {/* Overall Examination Summary */}
                  <Card sx={{ mt: 3, bgcolor: '#f5f5f5', border: '2px solid #9b30b7' }}>
                    <CardContent>
                      <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Assignment sx={{ color: '#9b30b7' }} />
                        📊 Examination Summary
                      </Typography>
                      <Grid container spacing={3} sx={{ mt: 1 }}>
                        <Grid item xs={4}>
                          <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'white', borderRadius: 1 }}>
                            <Typography variant="caption" color="text.secondary">Total Documents:</Typography>
                            <Typography variant="h3" color="primary" fontWeight="bold">
                              {selectedLC.documents.length}
                            </Typography>
                          </Box>
                        </Grid>
                        <Grid item xs={4}>
                          <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'white', borderRadius: 1 }}>
                            <Typography variant="caption" color="text.secondary">Verified:</Typography>
                            <Typography variant="h3" color="success.main" fontWeight="bold">
                              {selectedLC.documents.filter((d: any) => d.verificationStatus === 'verified' || d.status === 'verified').length}
                            </Typography>
                          </Box>
                        </Grid>
                        <Grid item xs={4}>
                          <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'white', borderRadius: 1 }}>
                            <Typography variant="caption" color="text.secondary">Pending:</Typography>
                            <Typography variant="h3" color="warning.main" fontWeight="bold">
                              {selectedLC.documents.filter((d: any) => 
                                !d.verificationStatus || d.verificationStatus === 'pending' || 
                                !d.status || d.status === 'pending'
                              ).length}
                            </Typography>
                          </Box>
                        </Grid>
                      </Grid>
                      
                      {selectedLC.documents.every((d: any) => d.verificationStatus === 'verified' || d.status === 'verified') && (
                        <Alert severity="success" sx={{ mt: 2 }}>
                          <Typography variant="body2" fontWeight="bold">
                            ✅ All documents have been verified and comply with LC terms. This LC is ready for payment release.
                          </Typography>
                        </Alert>
                      )}

                      {selectedLC.documents.some((d: any) => d.verificationStatus === 'rejected' || d.status === 'rejected') && (
                        <Alert severity="error" sx={{ mt: 2 }}>
                          <Typography variant="body2" fontWeight="bold">
                            ❌ Some documents have been rejected. Payment cannot be released until all documents are compliant.
                          </Typography>
                        </Alert>
                      )}
                    </CardContent>
                  </Card>
                </Box>
              ) : (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  <Typography variant="body2">
                    No documents have been uploaded for this LC yet. Documents must be submitted before examination can begin.
                  </Typography>
                </Alert>
              )}
            </>
          )}
        
      </PortalDialog>
  );
};

export default DocumentExaminationDialog;
