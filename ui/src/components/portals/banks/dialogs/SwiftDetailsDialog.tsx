import React from 'react';
import {
  Box,
  Grid,
  Typography,
  Paper,
  Chip,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  VerifiedUser,
  Security,
  Timeline,
} from '@mui/icons-material';
import {
  PortalDialog,
  PrimaryButton,
} from '@/components/shared/portal';

export interface SwiftDetailsDialogProps {
  open: boolean;
  onClose: () => void;
  selectedSwiftMessage: any;
  swiftLedgerProofLoading: boolean;
  swiftLedgerProof: any;
}

export const SwiftDetailsDialog: React.FC<SwiftDetailsDialogProps> = ({
  open,
  onClose,
  selectedSwiftMessage,
  swiftLedgerProofLoading,
  swiftLedgerProof,
}) => {
  return (
    <PortalDialog
      brand="BANKS"
      open={open}
      onClose={onClose}
      maxWidth="lg"
      title="SWIFT Message Details"
      icon={<VerifiedUser />}
      contentSx={{ mt: 2 }}
      actions={
        <PrimaryButton brand="BANKS" onClick={onClose}>
          Close
        </PrimaryButton>
      }
    >
      {selectedSwiftMessage && (
        <>
          <Box sx={{ mb: 3 }}>
            {swiftLedgerProofLoading ? (
              <Alert severity="info" icon={<CircularProgress size={18} />}>
                Reading the SWIFT message history from Fabric and checking each committed transaction.
              </Alert>
            ) : !swiftLedgerProof?.events?.length ? (
              <Alert severity="warning" icon={<Security />}>
                {swiftLedgerProof?.error || 'No committed Fabric history was found for this SWIFT message. This record is not marked blockchain verified.'}
              </Alert>
            ) : (
              <>
                <Alert severity={swiftLedgerProof.verified ? 'success' : 'warning'} icon={<Security />} sx={{ mb: 2 }}>
                  <strong>{swiftLedgerProof.verified ? 'Ledger history and transaction signatures verified' : 'Ledger history found; full cryptographic verification did not pass'}</strong>
                  <br />Channel: <code>{swiftLedgerProof.channelId}</code> · {swiftLedgerProof.events.length} committed history event(s)
                </Alert>
                <Grid container spacing={1.5}>
                  {swiftLedgerProof.events.map((event: any, index: number) => {
                    const transaction = event.transaction;
                    return (
                      <Grid item xs={12} key={event.txId || index}>
                        <Paper variant="outlined" sx={{ p: 1.5 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'center', mb: 1 }}>
                            <Typography variant="subtitle2">Ledger event {index + 1}</Typography>
                            <Chip
                              size="small"
                              label={transaction?.validationStatus || 'PROOF UNAVAILABLE'}
                              color={transaction?.validationStatus === 'VALID' ? 'success' : 'warning'}
                            />
                          </Box>
                          <Typography variant="caption" color="text.secondary">Transaction ID</Typography>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', overflowWrap: 'anywhere', mb: 1 }}>
                            {event.txId || 'Unavailable'}
                          </Typography>
                          <Grid container spacing={1}>
                            <Grid item xs={6}>
                              <Typography variant="caption" color="text.secondary">Block</Typography>
                              <Typography variant="body2">{transaction?.blockNumber ?? 'Unavailable'}</Typography>
                            </Grid>
                            <Grid item xs={6}>
                              <Typography variant="caption" color="text.secondary">Function</Typography>
                              <Typography variant="body2">{transaction?.chaincodeFunction || 'Unavailable'}</Typography>
                            </Grid>
                            <Grid item xs={12}>
                              <Typography variant="caption" color="text.secondary">Block hash</Typography>
                              <Typography variant="body2" sx={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }}>
                                {transaction?.blockHash || 'Unavailable'}
                              </Typography>
                            </Grid>
                            <Grid item xs={12}>
                              <Typography variant="caption" color="text.secondary">Creator</Typography>
                              <Typography variant="body2">
                                {transaction?.creator?.identity || 'Unavailable'} · {transaction?.creator?.mspId || 'MSP unavailable'}
                                {' · signature '}{transaction?.creator?.signatureValid === true ? 'valid' : 'not verified'}
                                {' · CA trust '}{transaction?.creator?.certificateTrustStatus || 'unavailable'}
                              </Typography>
                            </Grid>
                            <Grid item xs={12}>
                              <Typography variant="caption" color="text.secondary">Endorsers ({transaction?.endorsers?.length || 0})</Typography>
                              {(transaction?.endorsers || []).map((endorser: any, endorserIndex: number) => (
                                <Typography variant="body2" key={`${endorser.mspId}-${endorserIndex}`}>
                                  {endorser.mspId} · signature {endorser.signatureValid === true ? 'valid' : 'not verified'}
                                  {' · CA trust '}{endorser.certificateTrustStatus || 'unavailable'}
                                </Typography>
                              ))}
                            </Grid>
                          </Grid>
                        </Paper>
                      </Grid>
                    );
                  })}
                </Grid>
              </>
            )}
          </Box>

          <Grid container spacing={3}>
            {/* Basic Information */}
            <Grid item xs={12}>
              <Typography variant="h6" sx={{ borderBottom: '2px solid #9b30b7', pb: 1, mb: 2 }}>
                Basic Information
              </Typography>
            </Grid>
            
            <Grid item xs={6}>
              <Typography variant="body2" color="text.secondary">Message ID</Typography>
              <Typography variant="body1" fontWeight="bold">{selectedSwiftMessage.messageId}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="body2" color="text.secondary">Message Type</Typography>
              <Typography variant="body1" fontWeight="bold">{selectedSwiftMessage.messageType}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="body2" color="text.secondary">SWIFT Reference</Typography>
              <Typography variant="body1">{selectedSwiftMessage.swiftReference || 'N/A'}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="body2" color="text.secondary">Status</Typography>
              <Chip 
                label={selectedSwiftMessage.status || 'UNKNOWN'}
                color={selectedSwiftMessage.status === 'SENT' ? 'success' : selectedSwiftMessage.status === 'DRAFT' ? 'warning' : 'default'}
                size="small"
              />
            </Grid>

            {/* Bank Information */}
            <Grid item xs={12}>
              <Typography variant="h6" sx={{ borderBottom: '2px solid #9b30b7', pb: 1, mb: 2, mt: 2 }}>
                Bank Information
              </Typography>
            </Grid>
            
            <Grid item xs={6}>
              <Typography variant="body2" color="text.secondary">Sender BIC</Typography>
              <Typography variant="body1">{selectedSwiftMessage.senderBic || 'N/A'}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="body2" color="text.secondary">Receiver BIC</Typography>
              <Typography variant="body1">{selectedSwiftMessage.receiverBic || 'N/A'}</Typography>
            </Grid>

            {/* LC & Trade Information */}
            <Grid item xs={12}>
              <Typography variant="h6" sx={{ borderBottom: '2px solid #9b30b7', pb: 1, mb: 2, mt: 2 }}>
                Letter of Credit & Trade Details
              </Typography>
            </Grid>

            <Grid item xs={6}>
              <Typography variant="body2" color="text.secondary">Linked LC Number</Typography>
              <Typography variant="body1" fontWeight="bold" color="primary">
                {selectedSwiftMessage.linkedLcId || selectedSwiftMessage.lcNumber || 'N/A'}
              </Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="body2" color="text.secondary">Amount</Typography>
              <Typography variant="h6" color="primary">
                ${(selectedSwiftMessage.amount || selectedSwiftMessage.lcAmount || 0).toLocaleString()} {selectedSwiftMessage.currency || selectedSwiftMessage.lcCurrency || 'USD'}
              </Typography>
            </Grid>
            
            <Grid item xs={6}>
              <Typography variant="body2" color="text.secondary">Beneficiary</Typography>
              <Typography variant="body1">{selectedSwiftMessage.beneficiary || 'N/A'}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="body2" color="text.secondary">Applicant</Typography>
              <Typography variant="body1">{selectedSwiftMessage.lcApplicant || 'N/A'}</Typography>
            </Grid>

            {/* Shipment Details */}
            {(selectedSwiftMessage.loadingPort || selectedSwiftMessage.dischargePort) && (
              <>
                <Grid item xs={12}>
                  <Typography variant="h6" sx={{ borderBottom: '2px solid #9b30b7', pb: 1, mb: 2, mt: 2 }}>
                    Shipment Details
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Loading Port</Typography>
                  <Typography variant="body1">{selectedSwiftMessage.loadingPort || 'N/A'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Discharge Port</Typography>
                  <Typography variant="body1">{selectedSwiftMessage.dischargePort || 'N/A'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Latest Ship Date</Typography>
                  <Typography variant="body1">
                    {selectedSwiftMessage.latestShipDate ? new Date(selectedSwiftMessage.latestShipDate).toLocaleDateString() : 'N/A'}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">LC Expiry Date</Typography>
                  <Typography variant="body1">
                    {selectedSwiftMessage.lcExpiryDate ? new Date(selectedSwiftMessage.lcExpiryDate).toLocaleDateString() : 'N/A'}
                  </Typography>
                </Grid>
              </>
            )}

            {/* Timeline */}
            <Grid item xs={12}>
              <Typography variant="h6" sx={{ borderBottom: '2px solid #9b30b7', pb: 1, mb: 2, mt: 2 }}>
                <Timeline sx={{ fontSize: 20, verticalAlign: 'middle', mr: 1 }} />
                Transaction Timeline
              </Typography>
            </Grid>
            
            <Grid item xs={12}>
              <Box sx={{ pl: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2, gap: 2 }}>
                  <Box sx={{ width: 40, height: 40, borderRadius: '50%', bgcolor: '#4caf50', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>1</Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body1" fontWeight="bold">Message Created</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {selectedSwiftMessage.createdAt ? new Date(selectedSwiftMessage.createdAt).toLocaleString() : 'N/A'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      By: {selectedSwiftMessage.createdBy || 'Unavailable'}
                    </Typography>
                  </Box>
                </Box>

                {selectedSwiftMessage.sentDate && selectedSwiftMessage.sentDate !== '0001-01-01T00:00:00Z' && (
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2, gap: 2 }}>
                    <Box sx={{ width: 40, height: 40, borderRadius: '50%', bgcolor: '#2196f3', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>2</Box>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body1" fontWeight="bold">Sent to SWIFT Network</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {new Date(selectedSwiftMessage.sentDate).toLocaleString()}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Sender: {selectedSwiftMessage.senderBic} → {selectedSwiftMessage.receiverBic}
                      </Typography>
                    </Box>
                  </Box>
                )}

                {selectedSwiftMessage.processedDate && (
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2, gap: 2 }}>
                    <Box sx={{ width: 40, height: 40, borderRadius: '50%', bgcolor: '#ff9800', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>3</Box>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body1" fontWeight="bold">Processed</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {new Date(selectedSwiftMessage.processedDate).toLocaleString()}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Processed by: {selectedSwiftMessage.processedBy || 'Unavailable'}
                      </Typography>
                    </Box>
                  </Box>
                )}

                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                  <Box sx={{ width: 40, height: 40, borderRadius: '50%', bgcolor: selectedSwiftMessage.status === 'DRAFT' ? '#9e9e9e' : '#4caf50', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
                    {selectedSwiftMessage.status === 'DRAFT' ? '!' : '✓'}
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body1" fontWeight="bold">Current Status: {selectedSwiftMessage.status}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Last Updated: {selectedSwiftMessage.updatedAt ? new Date(selectedSwiftMessage.updatedAt).toLocaleString() : 'N/A'}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </Grid>

            {/* Application record metadata */}
            <Grid item xs={12}>
              <Typography variant="h6" sx={{ borderBottom: '2px solid #9b30b7', pb: 1, mb: 2, mt: 2 }}>
                <Security sx={{ fontSize: 20, verticalAlign: 'middle', mr: 1 }} />
                Record Metadata
              </Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="body2" color="text.secondary">SWIFT Message ID</Typography>
              <Typography variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {selectedSwiftMessage.messageId}
              </Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="body2" color="text.secondary">Application Authenticated</Typography>
              <Chip 
                label={selectedSwiftMessage.authenticated ? 'Yes' : 'Pending'} 
                color={selectedSwiftMessage.authenticated ? 'success' : 'warning'}
                size="small"
              />
            </Grid>
          </Grid>
        </>
      )}
    </PortalDialog>
  );
};

export default SwiftDetailsDialog;
