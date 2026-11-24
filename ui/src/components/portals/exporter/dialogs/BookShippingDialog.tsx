import React from 'react';
import {
  Typography,
  Grid,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  LocalShipping,
} from '@mui/icons-material';
import {
  PortalDialog,
  GhostButton,
  AnimatedButton,
  PortalField,
  getPortalBrand,
} from '@/components/shared/portal';

export interface BookShippingDialogProps {
  open: boolean;
  onClose: () => void;
  selectedShipmentForShipping: any | null;
  isBookingShipping: boolean;
  shippingForm: any;
  setShippingForm: React.Dispatch<React.SetStateAction<any>>;
  handleBookShipping: () => void;
}

const brandPrimary = getPortalBrand('EXPORTER').primary;

export const BookShippingDialog: React.FC<BookShippingDialogProps> = ({
  open,
  onClose,
  selectedShipmentForShipping,
  isBookingShipping,
  shippingForm,
  setShippingForm,
  handleBookShipping,
}) => {
  return (
    <PortalDialog brand='EXPORTER'
      open={open}
      onClose={onClose}
      maxWidth="md"
    
  icon={<LocalShipping />}
  title="🚢 Book Shipping & Container"
  actions={<>
        <GhostButton brand='EXPORTER' onClick={onClose}>
          Cancel
        </GhostButton>
        <AnimatedButton
          variant="contained"
          brandColor={brandPrimary}
          disabled={isBookingShipping || !shippingForm.portOfDischarge || !shippingForm.estimatedDeparture}
          loading={isBookingShipping}
          loadingLabel="Booking…"
          ledgerWrite
          onClick={handleBookShipping}
        >
          Confirm Booking
        </AnimatedButton>
      
  </>}
>
        {selectedShipmentForShipping && (
          <>
            <Alert severity="info" sx={{ mb: 3, mt: 2 }}>
              <Typography variant="body2" fontWeight="bold" gutterBottom>
                Shipping & Logistics Booking — Step 10 of 11
              </Typography>
              <Typography variant="body2">
                Shipment: <strong>{selectedShipmentForShipping.shipmentId}</strong> • Quantity: <strong>{selectedShipmentForShipping.quantity ? Number(selectedShipmentForShipping.quantity).toLocaleString() : '0'} kg</strong>
                <br />
                Delivered — post-delivery freight booking. The shipment stays DELIVERED; the FREIGHT_BOOKED move applies only to shipments still in CREATED or CUSTOMS_CLEARED.
              </Typography>
            </Alert>

            <Typography variant="h6" gutterBottom>
              Container & Shipping Details
            </Typography>

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth required>
                  <InputLabel>Shipping Line</InputLabel>
                  <Select
                    value={shippingForm.shippingLine}
                    label="Shipping Line"
                    onChange={(e) => setShippingForm({ ...shippingForm, shippingLine: e.target.value })}
                  >
                    <MenuItem value="Maersk Line">Maersk Line</MenuItem>
                    <MenuItem value="MSC">Mediterranean Shipping Company (MSC)</MenuItem>
                    <MenuItem value="CMA CGM">CMA CGM</MenuItem>
                    <MenuItem value="COSCO Shipping">COSCO Shipping</MenuItem>
                    <MenuItem value="Hapag-Lloyd">Hapag-Lloyd</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth required>
                  <InputLabel>Container Type</InputLabel>
                  <Select
                    value={shippingForm.containerType}
                    label="Container Type"
                    onChange={(e) => setShippingForm({ ...shippingForm, containerType: e.target.value })}
                  >
                    <MenuItem value="DRY">Dry Container (20ft/40ft)</MenuItem>
                    <MenuItem value="REEFER">Refrigerated Container</MenuItem>
                    <MenuItem value="OPEN_TOP">Open Top Container</MenuItem>
                  </Select>
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 2, mt: 0.5 }}>
                    Most coffee exports use dry containers with proper ventilation
                  </Typography>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <PortalField
                  fullWidth
                  label="Port of Loading"
                  value={shippingForm.portOfLoading}
                  onChange={(e) => setShippingForm({ ...shippingForm, portOfLoading: e.target.value })}
                  helperText="Ethiopian coffee typically ships from Djibouti"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <PortalField
                  fullWidth
                  required
                  label="Port of Discharge"
                  value={shippingForm.portOfDischarge}
                  onChange={(e) => setShippingForm({ ...shippingForm, portOfDischarge: e.target.value })}
                  helperText="Destination port in buyer's country"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <PortalField
                  fullWidth
                  label="Vessel Name (Optional)"
                  value={shippingForm.vesselName}
                  onChange={(e) => setShippingForm({ ...shippingForm, vesselName: e.target.value })}
                  helperText="Will be assigned by shipping line if not specified"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <PortalField
                  fullWidth
                  required
                  type="date"
                  label="Estimated Departure Date"
                  value={shippingForm.estimatedDeparture}
                  onChange={(e) => setShippingForm({ ...shippingForm, estimatedDeparture: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  helperText="Coordinate with shipping line schedule"
                />
              </Grid>
              <Grid item xs={12}>
                <PortalField
                  fullWidth
                  multiline
                  rows={3}
                  label="Special Instructions"
                  value={shippingForm.specialInstructions}
                  onChange={(e) => setShippingForm({ ...shippingForm, specialInstructions: e.target.value })}
                  placeholder="e.g., Handle with care, temperature control requirements..."
                  helperText="Any special handling or shipping requirements"
                />
              </Grid>
            </Grid>

            <Alert severity="success" sx={{ mt: 3 }}>
              <Typography variant="body2">
                <strong>What happens after booking:</strong>
                <br />
                1. Booking recorded against this shipment
                <br />
                2. Bill of Lading (B/L) issued by the shipping line after customs clearance
                <br />
                3. This post-delivery booking leaves the shipment DELIVERED; a booking made while the shipment is CREATED or CUSTOMS_CLEARED moves it to FREIGHT_BOOKED, from which land transport can start
                <br />
                4. Proceed to Payment Settlement
              </Typography>
            </Alert>
          </>
        )}
      </PortalDialog>
  );
};
