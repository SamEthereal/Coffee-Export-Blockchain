package main

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// ==================== COURIER TRACKING STRUCTURE ====================
// Document courier dispatch for a shipment (DHL, FedEx, UPS, ...).
//
// The API's status endpoint (GET /api/v1/courier/:shipmentID/status)
// reads the SHIPMENT struct directly — courierCompany,
// courierTracking, documentsSentDate, documentsReceivedDate — and
// derives DELIVERED / IN_TRANSIT / NOT_SENT from the two dates. The
// Send/Receive functions below therefore MUST write those four fields
// onto the shipment (they already exist on CoffeeShipment).
//
// The shipment has no fields for the documents list, recipient,
// recipient address, receivedBy, condition, or status history, so
// those live in a separate courier record keyed
// COURIER_<shipmentID> (one record per shipment — documents are sent
// once). The status updates stored here do NOT surface in the API's
// status GET, which reads only the shipment dates; that is the API's
// existing behaviour, and the updates are stored anyway so the data
// is not lost.
//
// No `omitempty` anywhere: the contractapi response schema requires
// every field, and nil slices serialize as JSON null (SWIFT validate
// fix, commit fb8cc605), so slices are always initialised to [].

type CourierStatusUpdate struct {
	Status     string `json:"status"`
	Location   string `json:"location"`
	UpdateTime string `json:"updateTime"`
	Notes      string `json:"notes"`
}

type CourierRecord struct {
	ShipmentID       string                `json:"shipmentId"`
	CourierCompany   string                `json:"courierCompany"`
	TrackingNumber   string                `json:"trackingNumber"`
	Documents        []string              `json:"documents"`
	Recipient        string                `json:"recipient"`
	RecipientAddress string                `json:"recipientAddress"`
	SentDate         string                `json:"sentDate"`
	ReceivedDate     string                `json:"receivedDate"`
	ReceivedBy       string                `json:"receivedBy"`
	Condition        string                `json:"condition"`
	Status           string                `json:"status"` // SENT, DELIVERED, or a caller-supplied update status
	Location         string                `json:"location"`
	LastUpdateTime   string                `json:"lastUpdateTime"`
	Notes            string                `json:"notes"`
	StatusHistory    []CourierStatusUpdate `json:"statusHistory"`
	CreatedAt        time.Time             `json:"createdAt"`
	UpdatedAt        time.Time             `json:"updatedAt"`
}

// ==================== COURIER FUNCTIONS ====================

// SendDocumentsByCourier - Record document courier dispatch for a
// shipment. Called by POST /api/v1/courier/:shipmentID/send with
// (shipmentID, courierCompany, trackingNumber, documentsJSON,
// recipient, recipientAddress, sentDate).
//
// Guards (house pattern, cf. the border-crossing fix): the shipment
// must exist, and documents must not already have been sent for it —
// a second send is an error, not an overwrite.
func (c *CoffeeContract) SendDocumentsByCourier(ctx contractapi.TransactionContextInterface,
	shipmentID, courierCompany, trackingNumber, documentsJSON,
	recipient, recipientAddress, sentDate string) error {

	if err := ValidateID(shipmentID, "shipmentID"); err != nil {
		return fmt.Errorf("SendDocumentsByCourier: %w", err)
	}
	if err := ValidateRequiredString(courierCompany, "courierCompany", MaxStringLen); err != nil {
		return fmt.Errorf("SendDocumentsByCourier: %w", err)
	}
	if err := ValidateRequiredString(trackingNumber, "trackingNumber", MaxStringLen); err != nil {
		return fmt.Errorf("SendDocumentsByCourier: %w", err)
	}
	if err := ValidateString(recipient, "recipient", MaxStringLen); err != nil {
		return fmt.Errorf("SendDocumentsByCourier: %w", err)
	}
	if err := ValidateString(recipientAddress, "recipientAddress", MaxStringLen); err != nil {
		return fmt.Errorf("SendDocumentsByCourier: %w", err)
	}

	// documents: JSON array of document IDs/names; "" means none.
	documents := []string{}
	if documentsJSON != "" && documentsJSON != "[]" {
		if err := json.Unmarshal([]byte(documentsJSON), &documents); err != nil {
			return fmt.Errorf("SendDocumentsByCourier: documents must be a JSON array of strings: %w", err)
		}
		if documents == nil {
			documents = []string{}
		}
	}

	ledgerNow, err := ledgerTransactionTime(ctx)
	if err != nil {
		return fmt.Errorf("SendDocumentsByCourier: failed to read Fabric transaction timestamp: %w", err)
	}

	// sentDate: the API defaults it to now (RFC3339); a direct Fabric
	// caller passing "" gets the same default. A supplied value must
	// be a valid date.
	if sentDate == "" {
		sentDate = ledgerNow.Format(time.RFC3339)
	} else if err := ValidateDate(sentDate); err != nil {
		return fmt.Errorf("SendDocumentsByCourier: %w", err)
	}

	// GUARD: the shipment must exist.
	shipment, err := c.ReadShipment(ctx, shipmentID)
	if err != nil {
		return fmt.Errorf("SendDocumentsByCourier: %w", err)
	}

	// GUARD: documents must not already have been sent for this shipment.
	existing, err := ctx.GetStub().GetState("COURIER_" + shipmentID)
	if err != nil {
		return fmt.Errorf("SendDocumentsByCourier: failed to read courier record: %w", err)
	}
	if existing != nil {
		return fmt.Errorf("SendDocumentsByCourier: documents for shipment %s have already been sent (tracking %s)", shipmentID, trackingNumber)
	}

	record := &CourierRecord{
		ShipmentID:       shipmentID,
		CourierCompany:   courierCompany,
		TrackingNumber:   trackingNumber,
		Documents:        documents,
		Recipient:        recipient,
		RecipientAddress: recipientAddress,
		SentDate:         sentDate,
		Status:           "SENT",
		LastUpdateTime:   sentDate,
		StatusHistory: []CourierStatusUpdate{
			{Status: "SENT", Location: "", UpdateTime: sentDate, Notes: ""},
		},
		CreatedAt: ledgerNow,
		UpdatedAt: ledgerNow,
	}

	recordJSON, err := json.Marshal(record)
	if err != nil {
		return fmt.Errorf("SendDocumentsByCourier: failed to marshal: %w", err)
	}
	if err := ctx.GetStub().PutState("COURIER_"+shipmentID, recordJSON); err != nil {
		return fmt.Errorf("SendDocumentsByCourier: failed to put state: %w", err)
	}

	// The API status GET reads these four shipment fields directly —
	// write them onto the shipment so GET /:shipmentID/status works.
	shipment.CourierCompany = courierCompany
	shipment.CourierTracking = trackingNumber
	shipment.DocumentsSentDate = sentDate
	shipment.UpdatedAt = ledgerNow
	normalizeShipmentSlices(shipment)
	shipmentJSON, err := json.Marshal(shipment)
	if err != nil {
		return fmt.Errorf("SendDocumentsByCourier: failed to marshal shipment: %w", err)
	}
	if err := ctx.GetStub().PutState("SHIPMENT_"+shipmentID, shipmentJSON); err != nil {
		return fmt.Errorf("SendDocumentsByCourier: failed to update shipment: %w", err)
	}

	changes := []FieldChange{
		{FieldName: "courierCompany", OldValue: "", NewValue: courierCompany, DataType: "string"},
		{FieldName: "courierTracking", OldValue: "", NewValue: trackingNumber, DataType: "string"},
		{FieldName: "documentsSentDate", OldValue: "", NewValue: sentDate, DataType: "date"},
	}
	compliance := ComplianceMetadata{
		ECTACompliance: true,
		EUDRCompliance: true,
		ICOCompliance:  true,
		ComplianceNote: fmt.Sprintf("Documents sent via %s (tracking %s) to %s", courierCompany, trackingNumber, recipient),
	}
	if err := c.CreateAuditLog(ctx, "SEND", "SHIPMENT", shipmentID, "", "DOCUMENTS_SENT",
		changes, fmt.Sprintf("Documents sent via %s: %s", courierCompany, trackingNumber), compliance); err != nil {
		return fmt.Errorf("SendDocumentsByCourier: failed to create audit log: %w", err)
	}

	fmt.Printf("✅ Documents sent via %s: %s for shipment %s\n", courierCompany, trackingNumber, shipmentID)
	return nil
}

// ConfirmDocumentReceipt - Record document receipt by the buyer.
// Called by POST /api/v1/courier/:shipmentID/receive with
// (shipmentID, receivedDate, receivedBy, condition, notes).
//
// Guards: the shipment must exist, and documents must have been sent
// first — receiving documents that were never sent is an error.
func (c *CoffeeContract) ConfirmDocumentReceipt(ctx contractapi.TransactionContextInterface,
	shipmentID, receivedDate, receivedBy, condition, notes string) error {

	if err := ValidateID(shipmentID, "shipmentID"); err != nil {
		return fmt.Errorf("ConfirmDocumentReceipt: %w", err)
	}
	if err := ValidateRequiredString(receivedBy, "receivedBy", MaxStringLen); err != nil {
		return fmt.Errorf("ConfirmDocumentReceipt: %w", err)
	}
	if err := ValidateString(condition, "condition", MaxStringLen); err != nil {
		return fmt.Errorf("ConfirmDocumentReceipt: %w", err)
	}
	if err := ValidateString(notes, "notes", MaxStringLen); err != nil {
		return fmt.Errorf("ConfirmDocumentReceipt: %w", err)
	}
	if err := ValidateDate(receivedDate); err != nil {
		return fmt.Errorf("ConfirmDocumentReceipt: %w", err)
	}

	// GUARD: the shipment must exist.
	shipment, err := c.ReadShipment(ctx, shipmentID)
	if err != nil {
		return fmt.Errorf("ConfirmDocumentReceipt: %w", err)
	}

	// GUARD: documents must have been sent before they can be received.
	record, err := c.readCourierRecord(ctx, shipmentID)
	if err != nil {
		return fmt.Errorf("ConfirmDocumentReceipt: %w", err)
	}
	if record.DocumentsReceivedDateAlreadySet() {
		return fmt.Errorf("ConfirmDocumentReceipt: documents for shipment %s have already been received", shipmentID)
	}

	ledgerNow, err := ledgerTransactionTime(ctx)
	if err != nil {
		return fmt.Errorf("ConfirmDocumentReceipt: failed to read Fabric transaction timestamp: %w", err)
	}

	previousStatus := record.Status
	record.ReceivedDate = receivedDate
	record.ReceivedBy = receivedBy
	record.Condition = condition
	record.Notes = notes
	record.Status = "DELIVERED"
	record.LastUpdateTime = receivedDate
	record.StatusHistory = append(record.StatusHistory, CourierStatusUpdate{
		Status: "DELIVERED", Location: "", UpdateTime: receivedDate, Notes: notes,
	})
	record.UpdatedAt = ledgerNow

	recordJSON, err := json.Marshal(record)
	if err != nil {
		return fmt.Errorf("ConfirmDocumentReceipt: failed to marshal: %w", err)
	}
	if err := ctx.GetStub().PutState("COURIER_"+shipmentID, recordJSON); err != nil {
		return fmt.Errorf("ConfirmDocumentReceipt: failed to put state: %w", err)
	}

	// The API status GET derives DELIVERED from this shipment field.
	shipment.DocumentsReceivedDate = receivedDate
	shipment.UpdatedAt = ledgerNow
	normalizeShipmentSlices(shipment)
	shipmentJSON, err := json.Marshal(shipment)
	if err != nil {
		return fmt.Errorf("ConfirmDocumentReceipt: failed to marshal shipment: %w", err)
	}
	if err := ctx.GetStub().PutState("SHIPMENT_"+shipmentID, shipmentJSON); err != nil {
		return fmt.Errorf("ConfirmDocumentReceipt: failed to update shipment: %w", err)
	}

	changes := []FieldChange{
		{FieldName: "documentsReceivedDate", OldValue: "", NewValue: receivedDate, DataType: "date"},
		{FieldName: "status", OldValue: previousStatus, NewValue: "DELIVERED", DataType: "string"},
	}
	compliance := ComplianceMetadata{
		ECTACompliance: true,
		EUDRCompliance: true,
		ICOCompliance:  true,
		ComplianceNote: fmt.Sprintf("Documents received by %s (%s)", receivedBy, condition),
	}
	if err := c.CreateAuditLog(ctx, "RECEIVE", "SHIPMENT", shipmentID, previousStatus, "DELIVERED",
		changes, fmt.Sprintf("Document receipt confirmed by %s", receivedBy), compliance); err != nil {
		return fmt.Errorf("ConfirmDocumentReceipt: failed to create audit log: %w", err)
	}

	fmt.Printf("✅ Document receipt confirmed for shipment %s by %s\n", shipmentID, receivedBy)
	return nil
}

// UpdateCourierStatus - Record an intermediate courier tracking
// update. Called by PUT /api/v1/courier/:shipmentID/update-status
// with (shipmentID, status, location, updateTime, notes).
//
// Guards: the shipment must exist, and documents must have been sent
// first. The status value comes from the caller — any non-empty string
// is accepted (no restrictive enum: the API validates only that it is
// non-empty, and courier carriers report statuses this system does
// not enumerate). Updates are allowed after delivery too: the record
// is a tracking history, not a gated lifecycle.
//
// NOTE: the stored status does NOT surface in the API's status GET,
// which derives its status only from the shipment's sent/received
// dates. The update is stored on the courier record (and appended to
// its status history) so the data is not lost.
func (c *CoffeeContract) UpdateCourierStatus(ctx contractapi.TransactionContextInterface,
	shipmentID, status, location, updateTime, notes string) error {

	if err := ValidateID(shipmentID, "shipmentID"); err != nil {
		return fmt.Errorf("UpdateCourierStatus: %w", err)
	}
	if err := ValidateRequiredString(status, "status", MaxStringLen); err != nil {
		return fmt.Errorf("UpdateCourierStatus: %w", err)
	}
	if err := ValidateRequiredString(location, "location", MaxStringLen); err != nil {
		return fmt.Errorf("UpdateCourierStatus: %w", err)
	}
	if err := ValidateString(notes, "notes", MaxStringLen); err != nil {
		return fmt.Errorf("UpdateCourierStatus: %w", err)
	}

	ledgerNow, err := ledgerTransactionTime(ctx)
	if err != nil {
		return fmt.Errorf("UpdateCourierStatus: failed to read Fabric transaction timestamp: %w", err)
	}

	// updateTime: the API defaults it to now (RFC3339); a direct
	// Fabric caller passing "" gets the same default.
	if updateTime == "" {
		updateTime = ledgerNow.Format(time.RFC3339)
	} else if err := ValidateDate(updateTime); err != nil {
		return fmt.Errorf("UpdateCourierStatus: %w", err)
	}

	// GUARD: the shipment must exist.
	if _, err := c.ReadShipment(ctx, shipmentID); err != nil {
		return fmt.Errorf("UpdateCourierStatus: %w", err)
	}

	// GUARD: documents must have been sent before their status can
	// be updated.
	record, err := c.readCourierRecord(ctx, shipmentID)
	if err != nil {
		return fmt.Errorf("UpdateCourierStatus: %w", err)
	}

	previousStatus := record.Status
	record.Status = status
	record.Location = location
	record.LastUpdateTime = updateTime
	record.Notes = notes
	record.StatusHistory = append(record.StatusHistory, CourierStatusUpdate{
		Status: status, Location: location, UpdateTime: updateTime, Notes: notes,
	})
	record.UpdatedAt = ledgerNow

	recordJSON, err := json.Marshal(record)
	if err != nil {
		return fmt.Errorf("UpdateCourierStatus: failed to marshal: %w", err)
	}
	if err := ctx.GetStub().PutState("COURIER_"+shipmentID, recordJSON); err != nil {
		return fmt.Errorf("UpdateCourierStatus: failed to put state: %w", err)
	}

	changes := []FieldChange{
		{FieldName: "status", OldValue: previousStatus, NewValue: status, DataType: "string"},
		{FieldName: "location", OldValue: "", NewValue: location, DataType: "string"},
	}
	compliance := ComplianceMetadata{
		ECTACompliance: true,
		EUDRCompliance: true,
		ICOCompliance:  true,
		ComplianceNote: fmt.Sprintf("Courier status update: %s at %s", status, location),
	}
	if err := c.CreateAuditLog(ctx, "UPDATE", "SHIPMENT", shipmentID, previousStatus, status,
		changes, fmt.Sprintf("Courier status updated to %s at %s", status, location), compliance); err != nil {
		return fmt.Errorf("UpdateCourierStatus: failed to create audit log: %w", err)
	}

	fmt.Printf("✅ Courier status updated: %s - %s at %s\n", shipmentID, status, location)
	return nil
}

// readCourierRecord loads the COURIER_<shipmentID> record, erroring
// when no documents have been sent for the shipment yet.
func (c *CoffeeContract) readCourierRecord(ctx contractapi.TransactionContextInterface,
	shipmentID string) (*CourierRecord, error) {

	recordJSON, err := ctx.GetStub().GetState("COURIER_" + shipmentID)
	if err != nil {
		return nil, fmt.Errorf("failed to read courier record: %w", err)
	}
	if recordJSON == nil {
		return nil, fmt.Errorf("no courier dispatch recorded for shipment %s: documents have not been sent yet", shipmentID)
	}
	var record CourierRecord
	if err := json.Unmarshal(recordJSON, &record); err != nil {
		return nil, fmt.Errorf("failed to unmarshal courier record: %w", err)
	}
	if record.Documents == nil {
		record.Documents = []string{}
	}
	if record.StatusHistory == nil {
		record.StatusHistory = []CourierStatusUpdate{}
	}
	return &record, nil
}

// normalizeShipmentSlices replaces nil slices with empty ones before
// a shipment is re-written: this function reads the shipment and
// writes it back, and a nil slice would marshal as JSON null and
// break the ReadShipment response schema (same class as the SWIFT
// validate fix, fb8cc605; cf. QueryAllShipments).
func normalizeShipmentSlices(shipment *CoffeeShipment) {
	if shipment.Documents == nil {
		shipment.Documents = []string{}
	}
	if shipment.ECXLots == nil {
		shipment.ECXLots = []string{}
	}
}

// DocumentsReceivedDateAlreadySet reports whether receipt was already
// confirmed for this courier record.
func (r *CourierRecord) DocumentsReceivedDateAlreadySet() bool {
	return r.ReceivedDate != ""
}
