import React from 'react';
import {
  Box,
  Grid,
  Typography,
  Card,
  CardContent,
  Chip,
  Alert,
  Divider,
} from '@mui/material';
import {
  CheckCircle,
  Description,
} from '@mui/icons-material';
import {
  SecondaryButton,
} from '@/components/shared/portal';
import PostDeliveryWorkflowPanel from '@/components/shared/PostDeliveryWorkflowPanel';

export interface LCSettlementsTabProps {
  deliveredShipments: any[];
  letterOfCredits: any[];
  permitForContract: (contractId: string) => any;
  handleIssueExportPermit: (shipment: any) => Promise<void>;
  loadBankingData: () => Promise<void>;
}

export const LCSettlementsTab: React.FC<LCSettlementsTabProps> = ({
  deliveredShipments,
  letterOfCredits,
  permitForContract,
  handleIssueExportPermit,
  loadBankingData,
}) => {
  return (
    <Box>
      <Typography variant="h5" gutterBottom sx={{ color: '#9b30b7', fontWeight: 700 }}>
        💰 LC Settlement Tracking
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Track LC settlement and payment processing for delivered shipments.
      </Typography>
      
      {deliveredShipments.length === 0 ? (
        <Alert severity="info">
          No delivered shipments requiring LC settlement at this time.
        </Alert>
      ) : (
        <Grid container spacing={3}>
          {deliveredShipments.map((shipment: any) => {
            const shipmentId = shipment.shipmentId || shipment.shipmentID;
            const contractId = shipment.contractId || shipment.contractID;
            const lc = letterOfCredits.find(l => l.contractId === contractId);
            const existingPermit = permitForContract(contractId);

            return (
              <Grid item xs={12} key={shipmentId}>
                <Card sx={{ boxShadow: 3 }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Box>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                          {shipmentId}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Contract: {contractId} {lc && `| LC: ${lc.lcId}`}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        {existingPermit ? (
                          <Chip
                            label={`Permit Issued (${existingPermit.permitId})`}
                            color="success"
                            icon={<CheckCircle />}
                          />
                        ) : (
                          <SecondaryButton brand="BANKS"
                            size="small"
                            startIcon={<Description />}
                            loadingLabel="Issuing permit…"
                            ledgerWrite
                            onClick={() => handleIssueExportPermit(shipment)}
                            sx={{ textTransform: 'none' }}
                          >
                            Issue Export Permit
                          </SecondaryButton>
                        )}
                        <Chip
                          label="Delivered"
                          color="success"
                          icon={<CheckCircle />}
                        />
                      </Box>
                    </Box>
                    
                    <Divider sx={{ my: 2 }} />
                    
                    <PostDeliveryWorkflowPanel
                      shipmentId={shipmentId}
                      userRole="BANK"
                      onRefresh={() => {
                        loadBankingData();
                      }}
                    />
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Box>
  );
};

export default LCSettlementsTab;
