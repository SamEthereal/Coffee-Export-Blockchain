package main

// EUDR + courier chaincode tests (2026-11-15, chaincode coffee v2.3
// seq 19): the API routes (api/src/routes/eudr.ts, courier.ts)
// called SubmitEUDRDueDiligence, VerifyEUDRCompliance,
// QueryAllEUDRRecords, ReadEUDRDueDiligence, QueryEUDRByShipment,
// SendDocumentsByCourier, ConfirmDocumentReceipt and
// UpdateCourierStatus, none of which existed in the contract — every
// live call failed with "Function … not found in contract
// CoffeeContract" (audit-followups probe table, bugs 3 and 6).
// These tests FAIL before the fix (unknown function) and PASS after,
// running the real functions through the real contractapi chaincode
// on a MockStub (same harness as response_schema_test.go).

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/hyperledger/fabric-chaincode-go/shimtest"
)

const eudrGeoJSON = `[[9.0054,38.7636],[9.0154,38.7736]]`
const eudrDocsJSON = `["LAND_TITLE_1","FARM_MAP_1"]`

func seedShipment(t *testing.T, stub *shimtest.MockStub, id string) {
	t.Helper()
	seedState(t, stub, "SHIPMENT_"+id,
		`{"shipmentId":"`+id+`","status":"CUSTOMS_CLEARED"}`)
}
func TestEUDRSubmitReadVerifyQuery(t *testing.T) {
	stub := newTestStub(t)
	setTestCreator(t, stub, "ExporterMSP")

	// Submit -> 200. No shipment needs to exist: due diligence is
	// about the farm plot (see eudr.go).
	code, payload := invoke(t, stub, "SubmitEUDRDueDiligence", "DD-EC-1", "SHIP-EC-1", "EXP-EC-1",
		eudrGeoJSON, "12.5", "Yirgacheffe Farm", "Yirgacheffe, SNNPR",
		"true", "true", "2026-09-15", "DOCUMENTED", eudrDocsJSON)
	if code != 200 {
		t.Fatalf("SubmitEUDRDueDiligence: %d %s", code, payload)
	}

	// Read back: the API geolocation reader's fields must be present
	// with exactly these JSON names (dueDiligenceID, capital ID).
	code, payload = invoke(t, stub, "ReadEUDRDueDiligence", "DD-EC-1")
	if code != 200 {
		t.Fatalf("ReadEUDRDueDiligence: %d %s", code, payload)
	}
	var rec EUDRDueDiligence
	readJSON(t, payload, &rec)
	if rec.DueDiligenceID != "DD-EC-1" || rec.ShipmentID != "SHIP-EC-1" || rec.ExporterID != "EXP-EC-1" {
		t.Fatalf("read record IDs: %+v", rec)
	}
	if rec.Status != "SUBMITTED" || rec.Verified {
		t.Fatalf("fresh record: status %q verified %v, want SUBMITTED/false", rec.Status, rec.Verified)
	}
	if len(rec.GeoCoordinates) != 2 || rec.GeoCoordinates[0][0] != 9.0054 || rec.GeoCoordinates[0][1] != 38.7636 {
		t.Fatalf("geoCoordinates %+v, want [[9.0054 38.7636] [9.0154 38.7736]]", rec.GeoCoordinates)
	}
	if rec.PlotSize != 12.5 || rec.FarmName != "Yirgacheffe Farm" || !rec.DeforestationFree || !rec.LegalHarvest {
		t.Fatalf("read record fields: %+v", rec)
	}
	if len(rec.Documents) != 2 || rec.Documents[0] != "LAND_TITLE_1" {
		t.Fatalf("documents %+v, want [LAND_TITLE_1 FARM_MAP_1]", rec.Documents)
	}
	// Raw JSON must carry the exact keys the API reads.
	for _, key := range []string{`"dueDiligenceID"`, `"shipmentId"`, `"exporterId"`, `"farmName"`,
		`"farmLocation"`, `"geoCoordinates"`, `"plotSize"`, `"deforestationFree"`, `"verified"`, `"timestamp"`} {
		if !strings.Contains(payload, key) {
			t.Fatalf("read payload missing key %s: %s", key, payload)
		}
	}

	// Verify (ECTA) -> VERIFIED.
	code, payload = invoke(t, stub, "VerifyEUDRCompliance", "DD-EC-1", "ECTA Officer", "true", "Plot verified deforestation-free")
	if code != 200 {
		t.Fatalf("VerifyEUDRCompliance: %d %s", code, payload)
	}
	code, payload = invoke(t, stub, "ReadEUDRDueDiligence", "DD-EC-1")
	if code != 200 {
		t.Fatalf("ReadEUDRDueDiligence after verify: %d %s", code, payload)
	}
	readJSON(t, payload, &rec)
	if rec.Status != "VERIFIED" || !rec.Verified || rec.VerifiedBy != "ECTA Officer" {
		t.Fatalf("after verify: status %q verified %v by %q", rec.Status, rec.Verified, rec.VerifiedBy)
	}

	// Query by shipment -> exactly this record; query-all -> same.
	code, payload = invoke(t, stub, "QueryEUDRByShipment", "SHIP-EC-1")
	if code != 200 {
		t.Fatalf("QueryEUDRByShipment: %d %s", code, payload)
	}
	var byShipment []*EUDRDueDiligence
	readJSON(t, payload, &byShipment)
	if len(byShipment) != 1 || byShipment[0].DueDiligenceID != "DD-EC-1" {
		t.Fatalf("QueryEUDRByShipment: got %d records, want 1 (DD-EC-1)", len(byShipment))
	}

	code, payload = invoke(t, stub, "QueryAllEUDRRecords")
	if code != 200 {
		t.Fatalf("QueryAllEUDRRecords: %d %s", code, payload)
	}
	var all []*EUDRDueDiligence
	readJSON(t, payload, &all)
	if len(all) != 1 || all[0].DueDiligenceID != "DD-EC-1" {
		t.Fatalf("QueryAllEUDRRecords: got %d records, want 1 (DD-EC-1)", len(all))
	}

	// Another shipment has no records: empty array, never null.
	code, payload = invoke(t, stub, "QueryEUDRByShipment", "SHIP-EC-NONE")
	if code != 200 {
		t.Fatalf("QueryEUDRByShipment (empty): %d %s", code, payload)
	}
	if strings.TrimSpace(payload) != "[]" {
		t.Fatalf("QueryEUDRByShipment (empty): payload %q, want []", payload)
	}
}

func TestEUDRVerifyRejectAndReverifyRefused(t *testing.T) {
	stub := newTestStub(t)
	setTestCreator(t, stub, "ECTAMSP")

	code, payload := invoke(t, stub, "SubmitEUDRDueDiligence", "DD-EC-REJ", "SHIP-EC-2", "EXP-EC-1",
		eudrGeoJSON, "8", "Sidama Farm", "Sidama", "false", "true", "2026-09-15", "DOCUMENTED", "[]")
	if code != 200 {
		t.Fatalf("submit: %d %s", code, payload)
	}

	// verified=false -> REJECTED.
	code, payload = invoke(t, stub, "VerifyEUDRCompliance", "DD-EC-REJ", "ECTA Officer", "false", "Deforestation detected in plot history")
	if code != 200 {
		t.Fatalf("verify-reject: %d %s", code, payload)
	}
	if got := readStatus(t, stub, "ReadEUDRDueDiligence", "DD-EC-REJ"); got != "REJECTED" {
		t.Fatalf("after reject: status %q, want REJECTED", got)
	}

	// The verdict is terminal: re-verifying a REJECTED record fails.
	code, payload = invokeFull(t, stub, "VerifyEUDRCompliance", "DD-EC-REJ", "ECTA Officer", "true", "second look")
	if code == 200 {
		t.Fatalf("re-verify of REJECTED succeeded, want refusal")
	}
	if !strings.Contains(payload, "SUBMITTED") {
		t.Fatalf("re-verify error %q does not name SUBMITTED as the required state", payload)
	}
}

func TestEUDRErrors(t *testing.T) {
	stub := newTestStub(t)
	setTestCreator(t, stub, "ExporterMSP")

	submit := func(id, geo, plot, defFree, legal, harvest string) (int32, string) {
		return invokeFull(t, stub, "SubmitEUDRDueDiligence", id, "SHIP-EC-ERR", "EXP-EC-1",
			geo, plot, "Farm", "", defFree, legal, harvest, "DOCUMENTED", "[]")
	}

	// Duplicate ID: the second submit must fail, not overwrite.
	if code, p := submit("DD-EC-DUP", eudrGeoJSON, "10", "true", "true", "2026-09-15"); code != 200 {
		t.Fatalf("first submit: %d %s", code, p)
	}
	if code, p := submit("DD-EC-DUP", eudrGeoJSON, "10", "true", "true", "2026-09-15"); code == 200 {
		t.Fatalf("duplicate submit succeeded, want refusal")
	} else if !strings.Contains(p, "already exists") {
		t.Fatalf("duplicate submit error %q, want 'already exists'", p)
	}

	// Missing argument: empty dueDiligenceID.
	if code, _ := submit("", eudrGeoJSON, "10", "true", "true", "2026-09-15"); code == 200 {
		t.Fatalf("empty dueDiligenceID succeeded, want refusal")
	}
	// Geo: empty array, bad latitude, bad pair shape.
	for _, geo := range []string{"[]", "[[91,38]]", "[[9,181]]", "[[9]]", "not-json", `[{"lat":9,"lon":38}]`} {
		if code, p := submit("DD-EC-GEO", geo, "10", "true", "true", "2026-09-15"); code == 200 {
			t.Fatalf("bad geo %q succeeded, want refusal", geo)
		} else if p == "" {
			t.Fatalf("bad geo %q failed with empty error", geo)
		}
	}
	// plotSize: zero, negative, non-numeric.
	for _, plot := range []string{"0", "-5", "abc"} {
		if code, _ := submit("DD-EC-PLOT", eudrGeoJSON, plot, "true", "true", "2026-09-15"); code == 200 {
			t.Fatalf("bad plotSize %q succeeded, want refusal", plot)
		}
	}
	// Booleans must parse as booleans; harvestDate must be a date.
	if code, _ := submit("DD-EC-BOOL", eudrGeoJSON, "10", "yes", "true", "2026-09-15"); code == 200 {
		t.Fatalf("non-boolean deforestationFree succeeded, want refusal")
	}
	if code, _ := submit("DD-EC-DATE", eudrGeoJSON, "10", "true", "true", "15/09/2026"); code == 200 {
		t.Fatalf("bad harvestDate succeeded, want refusal")
	}

	// Read / verify of a record that does not exist.
	if code, _ := invokeFull(t, stub, "ReadEUDRDueDiligence", "DD-EC-MISSING"); code == 200 {
		t.Fatalf("read of missing record succeeded, want refusal")
	}
	if code, _ := invokeFull(t, stub, "VerifyEUDRCompliance", "DD-EC-MISSING", "ECTA", "true", "x"); code == 200 {
		t.Fatalf("verify of missing record succeeded, want refusal")
	}
}

func TestEUDRQueryAllEmpty(t *testing.T) {
	stub := newTestStub(t)
	code, payload := invoke(t, stub, "QueryAllEUDRRecords")
	if code != 200 {
		t.Fatalf("QueryAllEUDRRecords (empty): %d %s", code, payload)
	}
	// Empty array, never null — the API returns data: [] on this.
	if strings.TrimSpace(payload) != "[]" {
		t.Fatalf("QueryAllEUDRRecords (empty): payload %q, want []", payload)
	}
}

func TestCourierSendStatusReceiveUpdate(t *testing.T) {
	stub := newTestStub(t)
	setTestCreator(t, stub, "ShippingMSP")

	shipID := "SHIP-CR-1"
	seedShipment(t, stub, shipID)

	// Receive / update-status before any send must fail.
	if code, _ := invokeFull(t, stub, "ConfirmDocumentReceipt", shipID, "2026-11-15T10:00:00Z", "Buyer", "GOOD", "ok"); code == 200 {
		t.Fatalf("receive before send succeeded, want refusal")
	}
	if code, _ := invokeFull(t, stub, "UpdateCourierStatus", shipID, "IN_TRANSIT", "Addis Ababa", "2026-11-14T10:00:00Z", ""); code == 200 {
		t.Fatalf("update-status before send succeeded, want refusal")
	}

	// Send -> 200. The shipment must carry the four fields the API
	// status GET reads (courierCompany / courierTracking /
	// documentsSentDate), so GET /:shipmentID/status derives IN_TRANSIT.
	code, payload := invoke(t, stub, "SendDocumentsByCourier", shipID,
		"DHL", "DHL-EC-123", `["INVOICE","BILL_OF_LADING"]`, "Buyer Co", "New York, USA", "2026-11-14T09:00:00Z")
	if code != 200 {
		t.Fatalf("SendDocumentsByCourier: %d %s", code, payload)
	}
	code, payload = invoke(t, stub, "ReadShipment", shipID)
	if code != 200 {
		t.Fatalf("ReadShipment after send: %d %s", code, payload)
	}
	var ship struct {
		CourierCompany        string `json:"courierCompany"`
		CourierTracking       string `json:"courierTracking"`
		DocumentsSentDate     string `json:"documentsSentDate"`
		DocumentsReceivedDate string `json:"documentsReceivedDate"`
	}
	readJSON(t, payload, &ship)
	if ship.CourierCompany != "DHL" || ship.CourierTracking != "DHL-EC-123" || ship.DocumentsSentDate != "2026-11-14T09:00:00Z" {
		t.Fatalf("shipment courier fields after send: %+v", ship)
	}
	if ship.DocumentsReceivedDate != "" {
		t.Fatalf("shipment documentsReceivedDate %q after send, want empty", ship.DocumentsReceivedDate)
	}

	// A second send for the same shipment must fail (no overwrite).
	if code, p := invokeFull(t, stub, "SendDocumentsByCourier", shipID,
		"FedEx", "FDX-999", "[]", "Buyer Co", "New York, USA", "2026-11-14T10:00:00Z"); code == 200 {
		t.Fatalf("second send succeeded, want refusal")
	} else if !strings.Contains(p, "already been sent") {
		t.Fatalf("second send error %q, want 'already been sent'", p)
	}

	// Intermediate status update -> stored on the courier record.
	code, payload = invoke(t, stub, "UpdateCourierStatus", shipID, "IN_TRANSIT", "Djibouti Port", "2026-11-14T18:00:00Z", "Departed Addis")
	if code != 200 {
		t.Fatalf("UpdateCourierStatus: %d %s", code, payload)
	}
	raw, err := stub.GetState("COURIER_" + shipID)
	if err != nil || raw == nil {
		t.Fatalf("GetState COURIER_%s: %v (nil=%v)", shipID, err, raw == nil)
	}
	var rec CourierRecord
	readJSON(t, string(raw), &rec)
	if rec.Status != "IN_TRANSIT" || rec.Location != "Djibouti Port" {
		t.Fatalf("courier record after update: status %q location %q", rec.Status, rec.Location)
	}
	if rec.CourierCompany != "DHL" || rec.TrackingNumber != "DHL-EC-123" || rec.Recipient != "Buyer Co" {
		t.Fatalf("courier record dispatch details lost: %+v", rec)
	}
	if len(rec.Documents) != 2 || len(rec.StatusHistory) != 2 {
		t.Fatalf("courier record: %d documents, %d history entries, want 2/2", len(rec.Documents), len(rec.StatusHistory))
	}

	// Receive -> shipment gets documentsReceivedDate, so the API
	// status GET derives DELIVERED.
	code, payload = invoke(t, stub, "ConfirmDocumentReceipt", shipID, "2026-11-15T10:00:00Z", "Buyer Rep", "GOOD", "All documents received")
	if code != 200 {
		t.Fatalf("ConfirmDocumentReceipt: %d %s", code, payload)
	}
	code, payload = invoke(t, stub, "ReadShipment", shipID)
	if code != 200 {
		t.Fatalf("ReadShipment after receive: %d %s", code, payload)
	}
	readJSON(t, payload, &ship)
	if ship.DocumentsReceivedDate != "2026-11-15T10:00:00Z" {
		t.Fatalf("shipment documentsReceivedDate %q, want 2026-11-15T10:00:00Z", ship.DocumentsReceivedDate)
	}
	raw, err = stub.GetState("COURIER_" + shipID)
	if err != nil || raw == nil {
		t.Fatalf("GetState COURIER_%s after receive: %v (nil=%v)", shipID, err, raw == nil)
	}
	readJSON(t, string(raw), &rec)
	if rec.Status != "DELIVERED" || rec.ReceivedBy != "Buyer Rep" || rec.Condition != "GOOD" {
		t.Fatalf("courier record after receive: status %q receivedBy %q condition %q", rec.Status, rec.ReceivedBy, rec.Condition)
	}
	if len(rec.StatusHistory) != 3 || rec.StatusHistory[2].Status != "DELIVERED" {
		t.Fatalf("courier status history after receive: %+v, want 3 entries ending DELIVERED", rec.StatusHistory)
	}

	// A second receipt must fail.
	if code, _ := invokeFull(t, stub, "ConfirmDocumentReceipt", shipID, "2026-11-16T10:00:00Z", "Buyer Rep", "GOOD", "again"); code == 200 {
		t.Fatalf("second receive succeeded, want refusal")
	}

	// Status updates still work after delivery (tracking history,
	// not a gated lifecycle).
	code, payload = invoke(t, stub, "UpdateCourierStatus", shipID, "DELIVERED", "New York", "2026-11-15T11:00:00Z", "Handed to buyer")
	if code != 200 {
		t.Fatalf("UpdateCourierStatus after delivery: %d %s", code, payload)
	}
}

func TestCourierMissingShipment(t *testing.T) {
	stub := newTestStub(t)
	setTestCreator(t, stub, "ShippingMSP")

	// All three writes require the shipment to exist (house pattern:
	// cf. the border-crossing fix, which requires the shipment to
	// resolve).
	if code, _ := invokeFull(t, stub, "SendDocumentsByCourier", "SHIP-CR-GHOST",
		"DHL", "DHL-1", "[]", "Buyer", "NY", "2026-11-14T09:00:00Z"); code == 200 {
		t.Fatalf("send for missing shipment succeeded, want refusal")
	}
	if code, _ := invokeFull(t, stub, "ConfirmDocumentReceipt", "SHIP-CR-GHOST",
		"2026-11-15T10:00:00Z", "Buyer", "GOOD", ""); code == 200 {
		t.Fatalf("receive for missing shipment succeeded, want refusal")
	}
	if code, _ := invokeFull(t, stub, "UpdateCourierStatus", "SHIP-CR-GHOST",
		"IN_TRANSIT", "Addis", "2026-11-14T10:00:00Z", ""); code == 200 {
		t.Fatalf("update-status for missing shipment succeeded, want refusal")
	}

	// Missing arguments.
	seedShipment(t, stub, "SHIP-CR-2")
	if code, _ := invokeFull(t, stub, "SendDocumentsByCourier", "SHIP-CR-2",
		"", "DHL-1", "[]", "Buyer", "NY", "2026-11-14T09:00:00Z"); code == 200 {
		t.Fatalf("send with empty courierCompany succeeded, want refusal")
	}
	if code, _ := invokeFull(t, stub, "SendDocumentsByCourier", "SHIP-CR-2",
		"DHL", "", "[]", "Buyer", "NY", "2026-11-14T09:00:00Z"); code == 200 {
		t.Fatalf("send with empty trackingNumber succeeded, want refusal")
	}
	if code, _ := invokeFull(t, stub, "SendDocumentsByCourier", "SHIP-CR-2",
		"DHL", "DHL-1", "[]", "Buyer", "NY", "not-a-date"); code == 200 {
		t.Fatalf("send with bad sentDate succeeded, want refusal")
	}
	if code, _ := invokeFull(t, stub, "UpdateCourierStatus", "SHIP-CR-2",
		"", "Addis", "2026-11-14T10:00:00Z", ""); code == 200 {
		t.Fatalf("update-status with empty status succeeded, want refusal")
	}

	// A courier record serialises with empty (never null) slices.
	code, payload := invoke(t, stub, "SendDocumentsByCourier", "SHIP-CR-2",
		"DHL", "DHL-2", "[]", "Buyer", "NY", "2026-11-14T09:00:00Z")
	if code != 200 {
		t.Fatalf("send (empty docs): %d %s", code, payload)
	}
	raw, err := stub.GetState("COURIER_SHIP-CR-2")
	if err != nil || raw == nil {
		t.Fatalf("GetState COURIER_SHIP-CR-2: %v (nil=%v)", err, raw == nil)
	}
	var rec CourierRecord
	if err := json.Unmarshal(raw, &rec); err != nil {
		t.Fatalf("unmarshal courier record: %v", err)
	}
	if rec.Documents == nil || rec.StatusHistory == nil {
		t.Fatalf("courier record has nil slice(s): documents nil=%v history nil=%v", rec.Documents == nil, rec.StatusHistory == nil)
	}
	if !strings.Contains(string(raw), `"documents":[]`) {
		t.Fatalf("courier record JSON %s does not carry empty documents array", string(raw))
	}
}
