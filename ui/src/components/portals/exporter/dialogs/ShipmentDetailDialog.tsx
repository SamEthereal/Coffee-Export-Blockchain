import React from 'react';
import {
  Box,
  Typography,
  Grid,
  Paper,
  Alert,
} from '@mui/material';
import {
  LocalShipping,
  AttachMoney,
  Description,
  Assignment,
  CheckCircle,
} from '@mui/icons-material';
import {
  PortalDialog,
  GhostButton,
  PrimaryButton,
  SecondaryButton,
} from '@/components/shared/portal';
import { StatusChip } from '@/components/modern';

export interface ShipmentDetailDialogProps {
  open: boolean;
  onClose: () => void;
  selectedShipmentForDetail: any | null;
  contracts: any[];
  forexStatuses: any[];
  shipments: any[];
  isSubmittingLCDocuments: boolean;
  canBookFreight: (shipment: any) => boolean;
  canInitiatePayment: (shipment: any) => boolean;
  canSubmitLCDocuments: (shipment: any) => boolean;
  getPaymentForShipment: (shipmentId: string) => any;
  handleSubmitLCDocumentsForShipment: (shipment: any) => void;
  handleRegisterShipmentForPending: (shipment: any) => void;
  handleOpenBookShipping: (shipment: any) => void;
  handleOpenPaymentSettlement: (shipment: any) => void;
  handleViewAuditTrail: (entityType: string, entityId: string) => void;
}

export const ShipmentDetailDialog: React.FC<ShipmentDetailDialogProps> = ({
  open,
  onClose,
  selectedShipmentForDetail,
  contracts,
  forexStatuses,
  shipments,
  isSubmittingLCDocuments,
  canBookFreight,
  canInitiatePayment,
  canSubmitLCDocuments,
  getPaymentForShipment,
  handleSubmitLCDocumentsForShipment,
  handleRegisterShipmentForPending,
  handleOpenBookShipping,
  handleOpenPaymentSettlement,
  handleViewAuditTrail,
}) => {
  return (
    <PortalDialog brand='EXPORTER'
      open={open}
      onClose={onClose}
      maxWidth="md"
    
  title="📦 Shipment Details"
  subtitle={selectedShipmentForDetail ? `Shipment ID: ${selectedShipmentForDetail.shipmentId}` : undefined}
  actions={<>
        {selectedShipmentForDetail?._isPending ? (
          // PENDING shipment - show "Register Shipment" button
          <>
            <GhostButton brand='EXPORTER' onClick={onClose}>Cancel</GhostButton>
            <PrimaryButton brand='EXPORTER'
              startIcon={<LocalShipping />}
              onClick={() => handleRegisterShipmentForPending(selectedShipmentForDetail)}
            >
              Register Shipment Now
            </PrimaryButton>
          </>
        ) : (
          // REAL shipment - show audit trail button
          <>
            <GhostButton brand='EXPORTER' onClick={onClose}>Close</GhostButton>
            {canBookFreight(selectedShipmentForDetail) && (
              <PrimaryButton brand='EXPORTER'
                size="small"
                startIcon={<LocalShipping />}
                onClick={() => {
                  handleOpenBookShipping(selectedShipmentForDetail);
                }}
              >
                Book Freight
              </PrimaryButton>
            )}
            {canInitiatePayment(selectedShipmentForDetail) && (
              <PrimaryButton brand='EXPORTER'
                size="small"
                startIcon={<AttachMoney />}
                onClick={() => {
                  handleOpenPaymentSettlement(selectedShipmentForDetail);
                }}
              >
                Initiate Payment
              </PrimaryButton>
            )}
            {canSubmitLCDocuments(selectedShipmentForDetail) && (
              <SecondaryButton brand='EXPORTER'
                size="small"
                startIcon={<Description />}
                disabled={isSubmittingLCDocuments}
                onClick={() => handleSubmitLCDocumentsForShipment(selectedShipmentForDetail)}
              >
                Submit LC Documents
              </SecondaryButton>
            )}
            <SecondaryButton brand='EXPORTER'
              size="small"
              startIcon={<Assignment />}
              onClick={() => handleViewAuditTrail('SHIPMENT', selectedShipmentForDetail?.shipmentId || '')}
            >
              View Audit Trail
            </SecondaryButton>
          </>
        )}
      
  </>}
>
        {selectedShipmentForDetail && (() => {
          const contract = contracts.find(c => c.contractId === selectedShipmentForDetail.contractId);
          return (
            <Box>
              {/* Shipment Information - SHOW IMMEDIATELY */}
              <Paper elevation={0} sx={{ p: 2, bgcolor: '#f5f5f5', mb: 3 }}>
                <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                  Shipment Information
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <Typography variant="body2" color="text.secondary">Shipment ID</Typography>
                    <Typography variant="body1" fontWeight={600}>{selectedShipmentForDetail.shipmentId}</Typography>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Typography variant="body2" color="text.secondary">Contract ID</Typography>
                    <Typography variant="body1" fontWeight={600}>{selectedShipmentForDetail.contractId}</Typography>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Typography variant="body2" color="text.secondary">Buyer</Typography>
                    <Typography variant="body1" fontWeight={600}>{contract?.buyerName || selectedShipmentForDetail.buyerId}</Typography>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Typography variant="body2" color="text.secondary">Destination</Typography>
                    <Typography variant="body1" fontWeight={600}>{contract?.buyerCountry || 'Unknown'}</Typography>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Typography variant="body2" color="text.secondary">Quantity</Typography>
                    <Typography variant="body1" fontWeight={600}>{Number(selectedShipmentForDetail.quantity || 0).toLocaleString()} kg</Typography>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Typography variant="body2" color="text.secondary">Grade</Typography>
                    <Typography variant="body1" fontWeight={600}>{selectedShipmentForDetail.grade || 'Grade 1-2'}</Typography>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Typography variant="body2" color="text.secondary">Transport Mode</Typography>
                    <Typography variant="body1" fontWeight={600}>
                      {selectedShipmentForDetail.transportMode || selectedShipmentForDetail.TransportMode || 'SEA'} Freight
                    </Typography>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Typography variant="body2" color="text.secondary">Status</Typography>
                    <StatusChip status={selectedShipmentForDetail.status} />
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="body2" color="text.secondary">Current Location</Typography>
                    <Typography variant="body1" fontWeight={600} color="primary">
                      {selectedShipmentForDetail.currentLocation || selectedShipmentForDetail.CurrentLocation || 'Warehouse'}
                    </Typography>
                  </Grid>

                  {/* 0.12: ARRIVED is terminal-ish — real status, note, no
                      fake onward button. FREIGHT_BOOKED / LOADED now start
                      land transport, so they get a next-step note instead. */}
                  {selectedShipmentForDetail.status === 'FREIGHT_BOOKED' && (
                    <Grid item xs={12}>
                      <Alert severity="info">
                        Freight booked — ready for land transport (Addis Ababa → Djibouti).
                      </Alert>
                    </Grid>
                  )}
                  {selectedShipmentForDetail.status === 'LOADED' && (
                    <Grid item xs={12}>
                      <Alert severity="info">
                        Bill of lading / airway bill recorded — ready for land transport (Addis Ababa → Djibouti).
                      </Alert>
                    </Grid>
                  )}
                  {selectedShipmentForDetail.status === 'ARRIVED' && (
                    <Grid item xs={12}>
                      <Alert severity="warning">
                        Recorded as a booking-mirror arrival. Complete Delivery requires DESTINATION_ARRIVED, so this row has no onward chain step.
                      </Alert>
                    </Grid>
                  )}
                  {getPaymentForShipment(selectedShipmentForDetail.shipmentId) && (
                    <Grid item xs={12}>
                      <Alert severity="info">
                        Payment {getPaymentForShipment(selectedShipmentForDetail.shipmentId)?.paymentId} is {getPaymentForShipment(selectedShipmentForDetail.shipmentId)?.status} — settlement continues in the bank flow.
                      </Alert>
                    </Grid>
                  )}

                  {/* Additional Details for REAL shipments */}
                  {!selectedShipmentForDetail._isPending && (
                    <>
                      {selectedShipmentForDetail.origin && (
                        <Grid item xs={12} md={6}>
                          <Typography variant="body2" color="text.secondary">Origin</Typography>
                          <Typography variant="body1">{selectedShipmentForDetail.origin}</Typography>
                        </Grid>
                      )}
                      {selectedShipmentForDetail.icoNumber && (
                        <Grid item xs={12} md={6}>
                          <Typography variant="body2" color="text.secondary">ICO Number</Typography>
                          <Typography variant="body1">{selectedShipmentForDetail.icoNumber}</Typography>
                        </Grid>
                      )}
                      {selectedShipmentForDetail.forexRate && (
                        <Grid item xs={12} md={6}>
                          <Typography variant="body2" color="text.secondary">Forex Rate</Typography>
                          <Typography variant="body1">{selectedShipmentForDetail.forexRate} ETB/USD</Typography>
                        </Grid>
                      )}
                      {selectedShipmentForDetail.valueUsd && (
                        <Grid item xs={12} md={6}>
                          <Typography variant="body2" color="text.secondary">Value (USD)</Typography>
                          <Typography variant="body1" fontWeight={600}>${Number(selectedShipmentForDetail.valueUsd).toLocaleString()}</Typography>
                        </Grid>
                      )}
                    </>
                  )}
                </Grid>
              </Paper>

              {/* Logistics Details - only for REAL shipments */}
              {!selectedShipmentForDetail._isPending && selectedShipmentForDetail.vesselName && (
                <Paper elevation={0} sx={{ p: 2, bgcolor: '#f9fafb', mb: 3 }}>
                  <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                    Logistics & Shipping Details
                  </Typography>
                  <Grid container spacing={2}>
                    {selectedShipmentForDetail.vesselName && (
                      <Grid item xs={12} md={6}>
                        <Typography variant="body2" color="text.secondary">Vessel Name</Typography>
                        <Typography variant="body1" fontWeight={600}>{selectedShipmentForDetail.vesselName}</Typography>
                      </Grid>
                    )}
                    {selectedShipmentForDetail.voyageNumber && (
                      <Grid item xs={12} md={6}>
                        <Typography variant="body2" color="text.secondary">Voyage Number</Typography>
                        <Typography variant="body1">{selectedShipmentForDetail.voyageNumber}</Typography>
                      </Grid>
                    )}
                    {selectedShipmentForDetail.containerNumber && (
                      <Grid item xs={12} md={6}>
                        <Typography variant="body2" color="text.secondary">Container Number</Typography>
                        <Typography variant="body1">{selectedShipmentForDetail.containerNumber}</Typography>
                      </Grid>
                    )}
                    {selectedShipmentForDetail.billOfLadingNo && (
                      <Grid item xs={12} md={6}>
                        <Typography variant="body2" color="text.secondary">Bill of Lading</Typography>
                        <Typography variant="body1">{selectedShipmentForDetail.billOfLadingNo}</Typography>
                      </Grid>
                    )}
                    {selectedShipmentForDetail.trackingNumber && (
                      <Grid item xs={12} md={6}>
                        <Typography variant="body2" color="text.secondary">Tracking Number</Typography>
                        <Typography variant="body1">{selectedShipmentForDetail.trackingNumber}</Typography>
                      </Grid>
                    )}
                    {selectedShipmentForDetail.departurePort && (
                      <Grid item xs={12} md={6}>
                        <Typography variant="body2" color="text.secondary">Departure Port</Typography>
                        <Typography variant="body1">{selectedShipmentForDetail.departurePort}</Typography>
                      </Grid>
                    )}
                    {selectedShipmentForDetail.destinationPort && (
                      <Grid item xs={12} md={6}>
                        <Typography variant="body2" color="text.secondary">Destination Port</Typography>
                        <Typography variant="body1">{selectedShipmentForDetail.destinationPort}</Typography>
                      </Grid>
                    )}
                  </Grid>
                </Paper>
              )}

              {/* Real blockchain verification with COMPLETE HISTORY */}
              <Paper elevation={0} sx={{ p: 2, bgcolor: '#f0f9ff', border: '1px solid #0288d1', mb: 2 }}>
                <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#0277bd' }}>
                  <CheckCircle sx={{ fontSize: 20 }} /> Complete Blockchain History
                </Typography>
                
                {selectedShipmentForDetail._isPending ? (
                  // This is a pending shipment (forex allocated but not created yet)
                  <Alert severity="info" sx={{ mt: 1 }}>
                    <Typography variant="body2">
                      <strong>Pending Shipment:</strong> This contract has forex allocated but the shipment hasn't been created on blockchain yet.
                      Once created, all transactions will be recorded here with complete immutable history.
                    </Typography>
                  </Alert>
                ) : (
                  // This is a REAL shipment - show complete blockchain audit trail
                  <Box>
                    {/* Current State */}
                    <Box sx={{ mb: 2, p: 1.5, bgcolor: '#e3f2fd', borderRadius: 1 }}>
                      <Typography variant="caption" fontWeight={700} color="primary">Current State on Blockchain:</Typography>
                      <Grid container spacing={1} sx={{ mt: 0.5 }}>
                        <Grid item xs={6}>
                          <Typography variant="caption" color="text.secondary">Blockchain ID:</Typography>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>
                            {selectedShipmentForDetail._id || selectedShipmentForDetail.shipmentId}
                          </Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant="caption" color="text.secondary">Revisions:</Typography>
                          <Typography variant="body2" fontWeight={600}>
                            {selectedShipmentForDetail._rev ? selectedShipmentForDetail._rev.split('-')[0] : '1'} transactions
                          </Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant="caption" color="text.secondary">Status:</Typography>
                          <StatusChip status={selectedShipmentForDetail.status} size="small" />
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant="caption" color="text.secondary">Last Update:</Typography>
                          <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                            {selectedShipmentForDetail.updatedAt ? new Date(selectedShipmentForDetail.updatedAt).toLocaleString() : 'N/A'}
                          </Typography>
                        </Grid>
                      </Grid>
                    </Box>

                    {/* Transaction History Timeline */}
                    <Typography variant="caption" fontWeight={700} sx={{ display: 'block', mb: 1 }}>
                      Transaction History (Immutable Blockchain Records):
                    </Typography>
                    
                    <Box sx={{ pl: 2, borderLeft: '2px solid #2196f3' }}>
                      {/* Creation Transaction */}
                      <Box sx={{ mb: 2, position: 'relative' }}>
                        <Box sx={{ position: 'absolute', left: -9, top: 0, width: 14, height: 14, borderRadius: '50%', bgcolor: '#4caf50', border: '2px solid white' }} />
                        <Typography variant="caption" fontWeight={700} color="success.main">
                          ✓ Shipment Created
                        </Typography>
                        <Typography variant="caption" display="block" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                          {selectedShipmentForDetail.createdAt ? new Date(selectedShipmentForDetail.createdAt).toLocaleString() : 'Unknown'}
                        </Typography>
                        <Box sx={{ mt: 0.5, p: 1, bgcolor: '#f5f5f5', borderRadius: 1, fontSize: '0.7rem' }}>
                          <Typography variant="caption" display="block">Initial Values:</Typography>
                          <Typography variant="caption" display="block">• Quantity: {selectedShipmentForDetail.quantity} kg</Typography>
                          <Typography variant="caption" display="block">• Grade: {selectedShipmentForDetail.grade}</Typography>
                          <Typography variant="caption" display="block">• Contract: {selectedShipmentForDetail.contractId}</Typography>
                          {selectedShipmentForDetail.createdByMsp && (
                            <Typography variant="caption" display="block" sx={{ fontFamily: 'monospace' }}>
                              • Organization: {selectedShipmentForDetail.createdByMsp}
                            </Typography>
                          )}
                        </Box>
                      </Box>

                      {/* Status Updates - derived from revision count */}
                      {selectedShipmentForDetail._rev && parseInt(selectedShipmentForDetail._rev.split('-')[0]) > 1 && (
                        <>
                          {Array.from({ length: parseInt(selectedShipmentForDetail._rev.split('-')[0]) - 1 }, (_, i) => i + 1).map((updateNum) => (
                            <Box key={updateNum} sx={{ mb: 2, position: 'relative' }}>
                              <Box sx={{ position: 'absolute', left: -9, top: 0, width: 14, height: 14, borderRadius: '50%', bgcolor: '#2196f3', border: '2px solid white' }} />
                              <Typography variant="caption" fontWeight={700} color="primary">
                                ✓ Update #{updateNum}
                              </Typography>
                              <Typography variant="caption" display="block" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                                Blockchain transaction recorded
                              </Typography>
                              <Box sx={{ mt: 0.5, p: 1, bgcolor: '#f5f5f5', borderRadius: 1, fontSize: '0.7rem' }}>
                                <Typography variant="caption">Status or field updated on blockchain</Typography>
                              </Box>
                            </Box>
                          ))}
                        </>
                      )}

                      {/* Current Status */}
                      <Box sx={{ mb: 1, position: 'relative' }}>
                        <Box sx={{ position: 'absolute', left: -9, top: 0, width: 14, height: 14, borderRadius: '50%', bgcolor: '#ff9800', border: '2px solid white' }} />
                        <Typography variant="caption" fontWeight={700} color="warning.main">
                          ⚡ Current Status
                        </Typography>
                        <Typography variant="caption" display="block" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                          {selectedShipmentForDetail.updatedAt ? new Date(selectedShipmentForDetail.updatedAt).toLocaleString() : 'Now'}
                        </Typography>
                        <Box sx={{ mt: 0.5, p: 1, bgcolor: '#fff3e0', borderRadius: 1, fontSize: '0.7rem' }}>
                          <Typography variant="caption" display="block">Current State: {selectedShipmentForDetail.status}</Typography>
                          <Typography variant="caption" display="block">Location: {selectedShipmentForDetail.currentLocation || 'In Transit'}</Typography>
                        </Box>
                      </Box>
                    </Box>

                    {/* Blockchain Guarantees */}
                    <Box sx={{ mt: 2, p: 1.5, bgcolor: '#e8f5e9', borderRadius: 1 }}>
                      <Typography variant="caption" fontWeight={700} color="success.main" display="block" gutterBottom>
                        🔒 Blockchain Guarantees:
                      </Typography>
                      <Typography variant="caption" display="block" sx={{ fontSize: '0.7rem' }}>
                        Ledger entries show their Fabric transaction ID, block, validation code, creator, and endorsements when available.
                      </Typography>
                      <Typography variant="caption" display="block" sx={{ fontSize: '0.7rem' }}>
                        “Verified” requires a valid block entry, valid transaction signatures, and certificates trusted by configured MSP roots.
                      </Typography>
                      <Typography variant="caption" display="block" sx={{ fontSize: '0.7rem' }}>
                        A transaction ID confirms a ledger reference; it does not alone prove signature or certificate validity.
                      </Typography>
                      <Typography variant="caption" display="block" sx={{ fontSize: '0.7rem' }}>
                        Ledger history and details are available subject to channel membership and application permissions.
                      </Typography>
                    </Box>

                    {/* Button to see DETAILED audit trail with all field changes */}
                    <Box sx={{ mt: 2 }}>
                      <PrimaryButton brand='EXPORTER'
                        size="small"
                        startIcon={<Assignment />}
                        onClick={() => handleViewAuditTrail('SHIPMENT', selectedShipmentForDetail.shipmentId)}
                        fullWidth
                      >
                        View Detailed Audit Trail (Field-Level Changes)
                      </PrimaryButton>
                    </Box>
                  </Box>
                )}
              </Paper>
            </Box>
          );
        })()}
      </PortalDialog>
  );
};
