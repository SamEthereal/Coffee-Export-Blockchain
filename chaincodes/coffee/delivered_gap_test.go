package main

// DELIVERED-gap fix tests (2026-11-13, chaincode coffee v2.3 seq 13):
// RecordBillOfLading moves a shipment to LOADED, and LOADED had no gated
// outgoing transition — StartLandTransport required CUSTOMS_CLEARED or
// FREIGHT_BOOKED — so a shipment with its B/L issued in portal order
// could never reach DELIVERED through any gated endpoint. The fix accepts
// LOADED as a StartLandTransport from-state (and in the matching
// RecordShipmentActionRejection gate). This test walks the whole gated
// logistics path LOADED -> LAND_TRANSPORT -> PORT_ARRIVED ->
// CONTAINER_STUFFED -> VESSEL_LOADED -> DEPARTED -> IN_TRANSIT ->
// DESTINATION_ARRIVED -> DELIVERED on a MockStub, plus the negative
// (CREATED still refuses) and the rejection gate from LOADED.

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestDeliveredGapLoadedStartsLandTransport(t *testing.T) {
	stub := newTestStub(t)
	setTestCreator(t, stub, "ShippingMSP")

	shipID := "SHIP-DLV-1"
	seedState(t, stub, "SHIPMENT_"+shipID,
		`{"shipmentId":"SHIP-DLV-1","status":"LOADED","billOfLadingNo":"BL-DLV-1"}`)

	// LOADED -> LAND_TRANSPORT (the fix: was refused before seq 13).
	code, payload := invoke(t, stub, "StartLandTransport", shipID,
		"Ethio Transport", "TRK-DLV-1", "Abebe Tesfaye", "SEAL-DLV-1")
	if code != 200 {
		t.Fatalf("StartLandTransport on LOADED: %d %s", code, payload)
	}
	raw, err := stub.GetState("SHIPMENT_" + shipID)
	if err != nil || raw == nil {
		t.Fatalf("GetState %s: %v (nil=%v)", shipID, err, raw == nil)
	}
	var ship struct {
		Status string `json:"status"`
	}
	readJSON(t, string(raw), &ship)
	if ship.Status != "LAND_TRANSPORT" {
		t.Fatalf("after StartLandTransport: status %q, want LAND_TRANSPORT", ship.Status)
	}

	// Walk the rest of the gated path to DELIVERED.
	steps := []struct {
		fn   string
		args []string
		want string
	}{
		{"ArriveAtPort", []string{shipID, "arrived Djibouti"}, "PORT_ARRIVED"},
		{"StuffContainer", []string{shipID, "MSKU-DLV-1", "DRY", "SEAL-DLV-1", "shipping_admin", "Djibouti Port"}, "CONTAINER_STUFFED"},
		{"LoadOnVessel", []string{shipID, "loaded MV DLV"}, "VESSEL_LOADED"},
		{"DepartFromPort", []string{shipID, "departed Djibouti"}, "DEPARTED"},
		{"UpdateToInTransit", []string{shipID, "MSKU-DLV-1"}, "IN_TRANSIT"},
		{"ArriveAtDestination", []string{shipID, "arrived New York"}, "DESTINATION_ARRIVED"},
		{"CompleteDelivery", []string{shipID, "delivered to buyer"}, "DELIVERED"},
	}
	for _, s := range steps {
		code, payload := invoke(t, stub, s.fn, s.args...)
		if code != 200 {
			t.Fatalf("%s: %d %s", s.fn, code, payload)
		}
		raw, err := stub.GetState("SHIPMENT_" + shipID)
		if err != nil || raw == nil {
			t.Fatalf("GetState after %s: %v (nil=%v)", s.fn, err, raw == nil)
		}
		var cur struct {
			Status string `json:"status"`
		}
		readJSON(t, string(raw), &cur)
		if cur.Status != s.want {
			t.Fatalf("after %s: status %q, want %q", s.fn, cur.Status, s.want)
		}
	}

	// The B/L recorded before transport survives the whole walk.
	var final struct {
		Status         string `json:"status"`
		BillOfLadingNo string `json:"billOfLadingNo"`
	}
	readJSON(t, string(raw), &final)
	if final.BillOfLadingNo != "BL-DLV-1" {
		t.Fatalf("after delivery: billOfLadingNo %q, want BL-DLV-1 (B/L lost on the walk)", final.BillOfLadingNo)
	}
}

func TestDeliveredGapLandTransportStillGated(t *testing.T) {
	stub := newTestStub(t)
	setTestCreator(t, stub, "ShippingMSP")

	// CREATED still refuses: the fix widens the gate to LOADED, it does
	// not open land transport to every state.
	seedState(t, stub, "SHIPMENT_SHIP-DLV-CREATED",
		`{"shipmentId":"SHIP-DLV-CREATED","status":"CREATED"}`)
	code, payload := invokeFull(t, stub, "StartLandTransport", "SHIP-DLV-CREATED",
		"Ethio Transport", "TRK-DLV-2", "Abebe Tesfaye", "SEAL-DLV-2")
	if code == 200 {
		t.Fatalf("StartLandTransport on CREATED succeeded, want refusal")
	}
	if !strings.Contains(payload, "LOADED") {
		t.Fatalf("StartLandTransport CREATED error %q does not name LOADED among the allowed states", payload)
	}

	// CUSTOMS_CLEARED and FREIGHT_BOOKED still work (no regression).
	for _, tc := range []struct{ id, status string }{
		{"SHIP-DLV-CLEARED", "CUSTOMS_CLEARED"},
		{"SHIP-DLV-BOOKED", "FREIGHT_BOOKED"},
	} {
		seedState(t, stub, "SHIPMENT_"+tc.id,
			`{"shipmentId":"`+tc.id+`","status":"`+tc.status+`"}`)
		code, payload := invoke(t, stub, "StartLandTransport", tc.id,
			"Ethio Transport", "TRK-DLV-3", "Abebe Tesfaye", "SEAL-DLV-3")
		if code != 200 {
			t.Fatalf("StartLandTransport on %s: %d %s", tc.status, code, payload)
		}
	}
}

func TestDeliveredGapRejectionGateFromLoaded(t *testing.T) {
	stub := newTestStub(t)
	setTestCreator(t, stub, "ShippingMSP")

	// A LOADED shipment's land-transport start can be rejected (the
	// rejection gate must accept the same from-states as the start).
	seedState(t, stub, "SHIPMENT_SHIP-DLV-REJ",
		`{"shipmentId":"SHIP-DLV-REJ","status":"LOADED"}`)
	code, payload := invoke(t, stub, "RecordShipmentActionRejection",
		"SHIP-DLV-REJ", "START_LAND_TRANSPORT", "truck unavailable")
	if code != 200 {
		t.Fatalf("RecordShipmentActionRejection START_LAND_TRANSPORT on LOADED: %d %s", code, payload)
	}
	// Rejection does not move the shipment.
	raw, err := stub.GetState("SHIPMENT_SHIP-DLV-REJ")
	if err != nil || raw == nil {
		t.Fatalf("GetState SHIP-DLV-REJ: %v (nil=%v)", err, raw == nil)
	}
	var ship struct {
		Status string `json:"status"`
	}
	if err := json.Unmarshal(raw, &ship); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if ship.Status != "LOADED" {
		t.Fatalf("after rejection: status %q, want LOADED (unchanged)", ship.Status)
	}

	// ... but a LAND_TRANSPORT shipment cannot reject a land-transport
	// start (wrong from-state).
	seedState(t, stub, "SHIPMENT_SHIP-DLV-REJ2",
		`{"shipmentId":"SHIP-DLV-REJ2","status":"LAND_TRANSPORT"}`)
	code, payload = invokeFull(t, stub, "RecordShipmentActionRejection",
		"SHIP-DLV-REJ2", "START_LAND_TRANSPORT", "too late")
	if code == 200 {
		t.Fatalf("RecordShipmentActionRejection START_LAND_TRANSPORT on LAND_TRANSPORT succeeded, want refusal")
	}
}
