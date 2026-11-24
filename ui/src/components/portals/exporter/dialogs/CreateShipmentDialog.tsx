import React from 'react';
import {
  Box,
  Typography,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Divider,
  Paper,
  Alert,
} from '@mui/material';
import {
  LocalShipping,
  Description,
} from '@mui/icons-material';
import {
  PortalDialog,
  GhostButton,
  AnimatedButton,
  PortalField,
} from '../common';
import { DocumentManagementPanel } from '@/components/documents';

export interface CreateShipmentDialogProps {
  open: boolean;
  onClose: () => void;
  contracts: any[];
  forexStatuses: any[];
  isCreatingShipment: boolean;
  newShipment: any;
  setNewShipment: React.Dispatch<React.SetStateAction<any>>;
  selectedShipmentForexRate: number;
  applyContractToShipment: (contract: any, forexRate?: number) => void;
  handleCreateShipment: () => void;
  isContractApproved: (contract: any) => boolean;
}

export const CreateShipmentDialog: React.FC<CreateShipmentDialogProps> = ({
  open,
  onClose,
  contracts,
  forexStatuses,
  isCreatingShipment,
  newShipment,
  setNewShipment,
  selectedShipmentForexRate,
  applyContractToShipment,
  handleCreateShipment,
  isContractApproved,
}) => {
  return (
    <PortalDialog brand='EXPORTER' 
      open={open} 
      onClose={onClose}
      maxWidth="md"
    
  icon={<LocalShipping />}
  title="Create New Shipment"
  actions={<>
        <GhostButton brand='EXPORTER' onClick={onClose}>
          Cancel
        </GhostButton>
        <AnimatedButton
          variant="contained"
          loading={isCreatingShipment}
          loadingLabel="Creating…"
          ledgerWrite
          onClick={handleCreateShipment}
          disabled={
            isCreatingShipment || 
            !newShipment.contractId || 
            !newShipment.quantity || 
            !newShipment.origin || 
            !newShipment.grade ||
            !newShipment.icoNumber ||
            (shipmentFieldValidation.ecxLotRequired && !newShipment.ecxLotNumber) ||
            (shipmentFieldValidation.unionApprovalRequired && !newShipment.unionApprovalReference) ||
            (shipmentFieldValidation.bondReferenceRequired && !newShipment.bondReference) ||
            // DUPLICATE PREVENTION: Disable if shipment already exists for this contract
            Boolean(newShipment.contractId && shipments.some(s => s.contractId === newShipment.contractId))
          }
          brandColor={brandPrimary}
        >
          Create Shipment
        </AnimatedButton>
      
  </>}
>
        <Alert severity="info" sx={{ mb: 2, mt: 2 }}>
          <Typography variant="body2" fontWeight="bold" gutterBottom>
            Ethiopian Coffee Export — Shipment Registration
          </Typography>
          <Typography variant="body2">
            You are at <strong>Step 6 of 10</strong> in the export process. Before registering this shipment you must have:
          </Typography>
          <Box component="ol" sx={{ m: 0, pl: 2, mt: 0.5 }}>
            <Typography component="li" variant="body2">✅ ECTA export license (active)</Typography>
            <Typography component="li" variant="body2">✅ Sales contract registered and NBE-approved</Typography>
            <Typography component="li" variant="body2">✅ Letter of Credit issued by buyer&apos;s bank</Typography>
            <Typography component="li" variant="body2">✅ Forex allocation approved by NBE</Typography>
            <Typography component="li" variant="body2">✅ Coffee procured from ECX/origin warehouse (ECX Lot Number in hand)</Typography>
          </Box>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            After this step: ECTA quality inspection → Export permit → Customs declaration → Shipping → Payment settlement
          </Typography>
        </Alert>

        {/* Show forex allocation info for the selected contract */}
        {newShipment.contractId && (() => {
          const forex = forexStatuses.find(f => f.contractId === newShipment.contractId && f.status === 'ALLOCATED');
          if (!forex) return null;
          return (
            <Alert severity="success" sx={{ mb: 2 }}>
              <strong>✅ Forex Allocated for this Contract</strong>
              <br />
              Amount: <strong>${forex.allocatedAmount.toLocaleString()} {forex.currency}</strong> &bull;
              Rate: <strong>{forex.exchangeRate} ETB/USD</strong> &bull;
              Retention: <strong>{forex.retentionRate}%</strong>
              <br />
              <em>Exchange rate auto-applied to shipment value calculation.</em>
            </Alert>
          );
        })()}

        {/* Duplicate warning for contracts that already have shipments */}
        {newShipment.contractId && (() => {
          const existingShipment = shipments.find(s => s.contractId === newShipment.contractId);
          if (!existingShipment) return null;
          return (
            <Alert severity="error" sx={{ mb: 2 }}>
              <strong>⚠️ Shipment Already Exists</strong>
              <br />
              This contract already has a registered shipment: <strong>{existingShipment.shipmentId}</strong>
              <br />
              Status: <strong>{existingShipment.status}</strong>
              <br />
              <em>Each contract can only have one shipment. Please select a different contract or view the existing shipment in the Shipments tab.</em>
            </Alert>
          );
        })()}

        {/* Warning when no contracts with forex available */}
        {(() => {
          const contractsWithForex = contracts
            .filter(c => isContractApproved(c))
            .filter(c => forexStatuses.some(f => f.contractId === c.contractId && f.status === 'ALLOCATED'));
          
          if (contractsWithForex.length > 0) return null;
          
          return (
            <Alert severity="warning" sx={{ mb: 2 }}>
              <Typography variant="body2" fontWeight={600} gutterBottom>
                ⚠️ No Contracts with Forex Allocation Available
              </Typography>
              <Typography variant="body2">
                To create a shipment, you must first request a Letter of Credit (LC) for your approved contract. 
                The bank will issue the LC and allocate forex per NBE export regulations.
              </Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>
                <strong>Next Steps:</strong>
              </Typography>
              <Typography variant="body2" component="div">
                1. Go to <strong>"My Contracts"</strong> tab<br />
                2. Find your approved contract<br />
                3. Click <strong>"Request LC"</strong> button<br />
                4. After bank processes your LC, return here to create shipment
              </Typography>
            </Alert>
          );
        })()}

        <Grid container spacing={2}>
          <Grid item xs={12}>
            <FormControl fullWidth required>
              <InputLabel>Select Approved Contract</InputLabel>
              <Select
                value={newShipment.contractId}
                label="Select Approved Contract"
                onChange={(e) => {
                  const selectedContract = contracts.find(c => c.contractId === e.target.value);
                  // Get real forex rate from allocated forex for this contract
                  const matchedForex = forexStatuses.find(
                    f => f.contractId === e.target.value && f.status === 'ALLOCATED'
                  );
                  applyContractToShipment(selectedContract, matchedForex?.exchangeRate);
                }}
              >
                {contracts
                  .filter(c => isContractApproved(c))
                  .map((contract) => {
                    const forex = forexStatuses.find(f => f.contractId === contract.contractId && f.status === 'ALLOCATED');
                    const hasForex = !!forex;
                    return (
                      <MenuItem
                        key={contract.contractId}
                        value={contract.contractId}
                        disabled={!hasForex}
                        sx={{ opacity: hasForex ? 1 : 0.5 }}
                      >
                        {hasForex ? '✅' : '⏳'} {contract.contractId} — {contract.coffeeType} ({contract.quantity.toLocaleString()} kg) → {contract.buyerCountry}
                        {!hasForex && ' (awaiting forex allocation)'}
                      </MenuItem>
                    );
                  })}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={6}>
            <PortalField
              fullWidth
              label="Quantity (kg)"
              type="number"
              value={newShipment.quantity}
              onChange={(e) => setNewShipment({...newShipment, quantity: e.target.value})}
              required
              helperText={(() => {
                const q = parseFloat(newShipment.quantity);
                const contract = contracts.find(c => c.contractId === newShipment.contractId);
                if (contract && !isNaN(q) && q > 0) {
                  const valueUSD = (q * contract.pricePerKg).toLocaleString(undefined, { maximumFractionDigits: 2 });
                  const valueETB = (q * contract.pricePerKg * selectedShipmentForexRate).toLocaleString(undefined, { maximumFractionDigits: 0 });
                  return `Value: $${valueUSD} USD = ${valueETB} ETB`;
                }
                return 'Must not exceed contract quantity';
              })()}
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <FormControl fullWidth required>
              <InputLabel>Origin Region</InputLabel>
              <Select
                value={newShipment.origin}
                label="Origin Region"
                onChange={(e) => setNewShipment({...newShipment, origin: e.target.value})}
              >
                <MenuItem value="Yirgacheffe">Yirgacheffe</MenuItem>
                <MenuItem value="Sidamo">Sidamo</MenuItem>
                <MenuItem value="Guji">Guji</MenuItem>
                <MenuItem value="Limu">Limu</MenuItem>
                <MenuItem value="Harrar">Harrar</MenuItem>
                <MenuItem value="Jimma">Jimma</MenuItem>
                <MenuItem value="Kaffa">Kaffa</MenuItem>
                <MenuItem value="Illubabor">Illubabor</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={6}>
            <FormControl fullWidth required>
              <InputLabel>Coffee Grade (ECX Assigned)</InputLabel>
              <Select
                value={newShipment.grade}
                label="Coffee Grade (ECX Assigned)"
                onChange={(e) => setNewShipment({...newShipment, grade: e.target.value})}
              >
                <MenuItem value="Grade 1">Grade 1 — Specialty (≤3 defects, score ≥80)</MenuItem>
                <MenuItem value="Grade 2">Grade 2 — Premium (≤12 defects, score ≥80)</MenuItem>
                <MenuItem value="Grade 3">Grade 3 — Exchange (≤25 defects, score ≥75)</MenuItem>
                <MenuItem value="Grade 4">Grade 4 — Commercial (≤45 defects)</MenuItem>
                <MenuItem value="Grade 5">Grade 5 — Commercial (≤100 defects)</MenuItem>
              </Select>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, ml: 1 }}>
                As assigned by ECX warehouse grader — must match your warehouse receipt
              </Typography>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={6}>
            <PortalField
              fullWidth
              label="ICO Number"
              value={newShipment.icoNumber}
              onChange={(e) => setNewShipment({...newShipment, icoNumber: e.target.value})}
              required={shipmentFieldValidation.icoRequired}
              placeholder="ET-XXXX-XXXXX"
              helperText={
                shipmentFieldValidation.icoRequired
                  ? 'Your ICO shipment mark — format: country code + exporter code + serial (e.g. ET-1234-00001)'
                  : 'Optional for non-ICO export channels'
              }
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <PortalField
              fullWidth
              label="ECX Lot Number"
              value={newShipment.ecxLotNumber}
              onChange={(e) => setNewShipment({...newShipment, ecxLotNumber: e.target.value})}
              required={shipmentFieldValidation.ecxLotRequired}
              placeholder="ECX-2026-XXXXX"
              helperText={
                shipmentFieldValidation.ecxLotRequired
                  ? 'Warehouse receipt lot number from ECX — required for ECX channel shipments.'
                  : 'Only required when exporting through ECX.'
              }
              disabled={!shipmentFieldValidation.ecxLotRequired}
            />
          </Grid>

          {shipmentFieldValidation.unionApprovalRequired && (
            <Grid item xs={12} sm={6}>
              <PortalField
                fullWidth
                label="Union Approval Reference"
                value={newShipment.unionApprovalReference}
                onChange={(e) => setNewShipment({...newShipment, unionApprovalReference: e.target.value})}
                required
                placeholder="UNION-APPROVAL-12345"
                helperText="Required for Union/Cooperative channel shipments."
              />
            </Grid>
          )}

          {shipmentFieldValidation.bondReferenceRequired && (
            <Grid item xs={12} sm={6}>
              <PortalField
                fullWidth
                label="Bond Reference"
                value={newShipment.bondReference}
                onChange={(e) => setNewShipment({...newShipment, bondReference: e.target.value})}
                required
                placeholder="BOND-REF-2026-001"
                helperText="Required for Direct Export channel shipments."
              />
            </Grid>
          )}

          <Grid item xs={12} sm={6}>
            <FormControl fullWidth required>
              <InputLabel>Export Channel</InputLabel>
              <Select
                value={newShipment.channel}
                label="Export Channel"
                onChange={(e) => {
                  const selectedChannel = e.target.value;
                  setNewShipment({
                    ...newShipment,
                    channel: selectedChannel,
                    bondReference: selectedChannel === 'Direct Export' ? newShipment.bondReference : '',
                    unionApprovalReference: selectedChannel === 'Union' ? newShipment.unionApprovalReference : '',
                    // Leg2 #16: no auto-generated lot number on ECX
                    // channel select (see applyContractToShipment).
                  });
                }}
              >
                <MenuItem value="Direct Export">Direct Export</MenuItem>
                <MenuItem value="ECX">ECX (Ethiopian Commodity Exchange)</MenuItem>
                <MenuItem value="Union">Union/Cooperative</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12}>
            <PortalField
              fullWidth
              label="Destination"
              value={newShipment.destination}
              onChange={(e) => setNewShipment({...newShipment, destination: e.target.value})}
              required
              disabled
              helperText="Auto-filled from contract"
            />
          </Grid>

          <Grid item xs={12}>
            <FormControlLabel
              control={
                <Switch
                  checked={newShipment.eudrCompliant}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewShipment({...newShipment, eudrCompliant: e.target.checked})}
                  color="primary"
                />
              }
              label="EUDR Compliant (Required for EU destinations)"
            />
          </Grid>

          {/* Shipment Documents Section */}
          <Grid item xs={12}>
            <Divider sx={{ my: 2 }} />
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Description /> Shipping Documents
            </Typography>
          </Grid>

          <Grid item xs={12}>
            {/* Show existing contract documents with DocumentManagementPanel */}
            {(() => {
              const selectedContract = contracts.find(c => c.contractId === newShipment.contractId);
              if (selectedContract && selectedContract.contractId) {
                return (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Description /> Contract Documents (From Blockchain)
                    </Typography>
                    <Paper elevation={0} sx={{ p: 2, border: '1px solid #e0e0e0' }}>
                      <DocumentManagementPanel
                        entityType="CONTRACT"
                        entityId={selectedContract.contractId}
                        title=""
                        allowUpload={false}
                        allowSign={false}
                        showSignatureTracker={false}
                      />
                    </Paper>
                  </Box>
                );
              }
              return null;
            })()}
            
            <Alert severity="success" sx={{ mb: 2 }}>
              <Typography variant="body2">
                <strong>✓ Contract Documents Loaded from Blockchain</strong>
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                All contract documents are automatically attached to this shipment. Additional shipping documents 
                (B/L, Packing List, Certificates) will be added after shipment registration.
              </Typography>
            </Alert>
          </Grid>
        </Grid>
      </PortalDialog>
  );
};
