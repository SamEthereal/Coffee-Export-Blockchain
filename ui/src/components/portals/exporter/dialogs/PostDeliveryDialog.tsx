import React from 'react';
import {
  PortalDialog,
  GhostButton,
} from '@/components/shared/portal';
import PostDeliveryWorkflowPanel from '@/components/shared/PostDeliveryWorkflowPanel';

export interface PostDeliveryDialogProps {
  open: boolean;
  onClose: () => void;
  selectedShipmentForPostDelivery: any | null;
  onRefresh: () => void;
}

export const PostDeliveryDialog: React.FC<PostDeliveryDialogProps> = ({
  open,
  onClose,
  selectedShipmentForPostDelivery,
  onRefresh,
}) => {
  return (
    <PortalDialog
      brand="EXPORTER"
      open={open}
      onClose={onClose}
      maxWidth="md"
      title="Post-Delivery Workflow Status"
      subtitle={selectedShipmentForPostDelivery ? `Shipment: ${selectedShipmentForPostDelivery.shipmentId}` : undefined}
      actions={
        <GhostButton brand="EXPORTER" onClick={onClose}>
          Close
        </GhostButton>
      }
    >
      {selectedShipmentForPostDelivery && (
        <PostDeliveryWorkflowPanel
          shipmentId={selectedShipmentForPostDelivery.shipmentId}
          userRole="EXPORTER"
          onRefresh={onRefresh}
        />
      )}
    </PortalDialog>
  );
};
