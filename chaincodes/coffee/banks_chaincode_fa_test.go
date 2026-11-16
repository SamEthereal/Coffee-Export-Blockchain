package main

// Banks workflow fix round, chaincode (2026-11-16, coffee v2.3 seq 21):
// F-A  CreateShipment range scan returned an error on the FIRST
//      contract-matching LC whose status was not FOREX_ALLOCATED /
//      UTILIZED / PAYMENT_RELEASED, instead of continuing the scan.
//      At contract approval the ECTA handoff creates a REQUESTED LC
//      with id LC-<contractID> that stays REQUESTED forever, so any
//      real LC whose ID sorts after LC-CONT-... (lcID starting D-Z)
//      could never create a shipment. The fix continues past a
//      non-qualifying LC and still refuses when NO qualifying LC
//      exists.
// F-AM SettlePayment auto-map looked the forex allocation up as
//      GetState("FOREX_" + lcID), but the stored key is the
//      double-prefixed FOREX_FOREX_<lcID>_REQUEST (AllocateForex is
//      invoked with forexID "FOREX_<lcID>_REQUEST" and every forex
//      read prefixes "FOREX_"). The zero-rate fallback was dead; the
//      fix reads the key that actually exists.
// F-D  SubmitLCDocuments attaches documents but deliberately does NOT
//      set DOCUMENTS_SUBMITTED on the LC (that is a payment status,
//      absent from validLCTransitions; examine/release require
//      ISSUED/FOREX_ALLOCATED then UTILIZED). The test pins the
//      actual behaviour: status stays FOREX_ALLOCATED, documents
//      attached.
//
// All tests run the real chaincode functions through the real
// contractapi chaincode on a MockStub (same harness as
// response_schema_test.go / leg2_fixes_test.go).

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/hyperledger/fabric-chaincode-go/shimtest"
)

// invokeMsg is invoke() plus the error message: contractapi puts a
// failed call's error text in res.Message, not in the payload.
func invokeMsg(t *testing.T, stub *shimtest.MockStub, fn string, args ...string) (int32, string, string) {
	t.Helper()
	argv := [][]byte{[]byte(fn)}
	for _, a := range args {
		argv = append(argv, []byte(a))
	}
	res := stub.MockInvoke("tx-"+fn, argv)
	return res.Status, string(res.Payload), res.Message
}
const faContractJSON = `{
	"contractId": "CONT-VERIFY-FA-1", "exporterId": "EXP-FA-1",
	"buyerId": "BUYER-FA-1", "buyerName": "Buyer FA",
	"buyerCountry": "DE", "quantity": 1000, "pricePerKg": 50,
	"totalValue": 50000, "currency": "USD", "paymentMethod": "LC",
	"eudrRequired": false
}`

// faLCJSON builds a minimal LC doc for the F-A scan tests.
func faLCJSON(lcID, status string) string {
	b, _ := json.Marshal(map[string]interface{}{
		"lcId": lcID, "contractId": "CONT-VERIFY-FA-1",
		"exporterId": "EXP-FA-1", "issuingBank": "CBE",
		"advisingBank": "CBE", "beneficiary": "Exporter FA",
		"amount": 50000, "currency": "USD", "status": status,
		"expiryDate": "2027-01-01",
		"requestDate": "2026-11-16T00:00:00Z",
		"terms": "UCP600", "documents": []string{},
		"amendments": []string{}, "amendmentCount": 0,
		"discrepancies": []string{}, "discrepancyResolved": true,
		"negotiationStatus": "NOT_STARTED",
	})
	return string(b)
}

// TestCreateShipmentSkipsPhantomLC (F-A): the REQUESTED handoff record
// LC-CONT-VERIFY-FA-1 sorts BEFORE the real LC LC-VERIFY-FA-1
// ('C' < 'V'), so on the old code the scan hit the phantom first and
// returned "current LC status: REQUESTED". The shipment must now
// create, validated against the real FOREX_ALLOCATED LC.
func TestCreateShipmentSkipsPhantomLC(t *testing.T) {
	stub := newTestStub(t)
	// CreateShipment writes an audit log at the end (CaptureIdentity
	// needs a creator, else GetMSPID nil-panics on the MockStub).
	setTestCreator(t, stub, "BanksMSP")
	seedState(t, stub, "CONTRACT_CONT-VERIFY-FA-1", faContractJSON)
	// Phantom first in range order (LC_LC-CONT-... < LC_LC-VERIFY-...).
	seedState(t, stub, "LC_LC-CONT-VERIFY-FA-1", faLCJSON("LC-CONT-VERIFY-FA-1", "REQUESTED"))
	seedState(t, stub, "LC_LC-VERIFY-FA-1", faLCJSON("LC-VERIFY-FA-1", "FOREX_ALLOCATED"))

	status, payload := invoke(t, stub, "CreateShipment",
		"SHIP-VERIFY-FA-1", "CONT-VERIFY-FA-1", "EXP-FA-1", "BUYER-FA-1",
		"Ethiopia", "0", "Grade 1", "ICO-FA-1", "", "SEA", "0", "0", "AUTO", "[]")
	if status != 200 {
		t.Fatalf("CreateShipment with phantom + allocated LC: status %d, payload %s (want 200)", status, payload)
	}

	status, payload = invoke(t, stub, "ReadShipment", "SHIP-VERIFY-FA-1")
	if status != 200 {
		t.Fatalf("ReadShipment: status %d, payload %s", status, payload)
	}
	if !strings.Contains(payload, `"status":"CREATED"`) {
		t.Fatalf("shipment not CREATED: %s", payload)
	}
	// The phantom record itself must be untouched.
	status, payload = invoke(t, stub, "ReadLC", "LC-CONT-VERIFY-FA-1")
	if status != 200 || !strings.Contains(payload, `"status":"REQUESTED"`) {
		t.Fatalf("phantom LC changed: status %d, payload %s", status, payload)
	}
}

// TestCreateShipmentOnlyPhantomLCRefuses (F-A guard): a contract whose
// ONLY LC is the REQUESTED handoff record must still be refused —
// a shipment with no allocated LC must not be created.
func TestCreateShipmentOnlyPhantomLCRefuses(t *testing.T) {
	stub := newTestStub(t)
	setTestCreator(t, stub, "BanksMSP")
	seedState(t, stub, "CONTRACT_CONT-VERIFY-FA-1", faContractJSON)
	seedState(t, stub, "LC_LC-CONT-VERIFY-FA-1", faLCJSON("LC-CONT-VERIFY-FA-1", "REQUESTED"))

	status, _, message := invokeMsg(t, stub, "CreateShipment",
		"SHIP-VERIFY-FA-2", "CONT-VERIFY-FA-1", "EXP-FA-1", "BUYER-FA-1",
		"Ethiopia", "0", "Grade 1", "ICO-FA-1", "", "SEA", "0", "0", "AUTO", "[]")
	if status == 200 {
		t.Fatalf("CreateShipment with only a REQUESTED LC succeeded (want refusal)")
	}
	if !strings.Contains(message, "LC validation failed") {
		t.Fatalf("refusal message is not the LC-validation refusal: %s", message)
	}
}

// faForexJSON is an ALLOCATED allocation stored at the real ledger key
// FOREX_FOREX_<lcID>_REQUEST, with the live ledger rates (57.25/40).
const faForexJSON = `{
	"forexId": "FOREX_LC-VERIFY-FA-1_REQUEST", "contractId": "CONT-VERIFY-FA-1",
	"exporterId": "EXP-FA-1", "lcId": "LC-VERIFY-FA-1",
	"requestedAmount": 50000, "allocatedAmount": 50000, "currency": "USD",
	"exchangeRate": 57.25, "officialRate": 57.25, "marketRate": 57.25,
	"retentionRate": 40, "retentionPercentage": 40,
	"retentionAmountUsd": 20000, "status": "ALLOCATED",
	"requestDate": "2026-11-16T00:00:00Z",
	"screenedAgainst": []
}`

// faPaymentJSON builds a VERIFIED bridge payment for the settle tests.
func faPaymentJSON(paymentID, lcID string) string {
	b, _ := json.Marshal(map[string]interface{}{
		"paymentId": paymentID, "contractId": "CONT-VERIFY-FA-1",
		"exporterId": "EXP-FA-1", "lcId": lcID,
		"amount": 10000, "currency": "USD", "status": "VERIFIED",
		"paymentMethod": "LC",
	})
	return string(b)
}

// TestSettlePaymentAutoMapsForexRates (F-AM): a rate-0 SettlePayment
// must auto-map exchange/retention rates from the allocation stored
// at the real double-prefixed key, instead of refusing
// "exchange rate must be positive" (the old single-prefix lookup
// never matched a stored allocation).
func TestSettlePaymentAutoMapsForexRates(t *testing.T) {
	stub := newTestStub(t)
	setTestCreator(t, stub, "BanksMSP")
	seedState(t, stub, "PAYMENT_PAY-FA-1", faPaymentJSON("PAY-FA-1", "LC-VERIFY-FA-1"))
	seedState(t, stub, "FOREX_FOREX_LC-VERIFY-FA-1_REQUEST", faForexJSON)
	// LC in the expected pre-settlement state so the cascade is exercised.
	seedState(t, stub, "LC_LC-VERIFY-FA-1", faLCJSON("LC-VERIFY-FA-1", "PAYMENT_RELEASED"))

	status, payload := invoke(t, stub, "SettlePayment",
		"PAY-FA-1", "0", "0", "Deutsche Bank", "DEUTDEFF", "SWIFT-FA-1", "NBE-FA-1")
	if status != 200 {
		t.Fatalf("SettlePayment with zero rates: status %d, payload %s (want 200 via auto-map)", status, payload)
	}

	status, payload = invoke(t, stub, "ReadPayment", "PAY-FA-1")
	if status != 200 {
		t.Fatalf("ReadPayment: status %d, payload %s", status, payload)
	}
	if !strings.Contains(payload, `"status":"SETTLED"`) {
		t.Fatalf("payment not SETTLED: %s", payload)
	}
	if !strings.Contains(payload, `"exchangeRate":57.25`) {
		t.Fatalf("exchange rate was not auto-mapped to 57.25: %s", payload)
	}
	if !strings.Contains(payload, `"retentionRate":40`) {
		t.Fatalf("retention rate was not auto-mapped to 40: %s", payload)
	}

	status, payload = invoke(t, stub, "ReadLC", "LC-VERIFY-FA-1")
	if status != 200 || !strings.Contains(payload, `"status":"SETTLED"`) {
		t.Fatalf("LC cascade to SETTLED did not happen: status %d, payload %s", status, payload)
	}
}

// TestSettlePaymentZeroRateNoForexStillRefuses (F-AM guard): with no
// allocation stored for the LC, a rate-0 settle must still fail
// honestly instead of settling at a zero/default rate.
func TestSettlePaymentZeroRateNoForexStillRefuses(t *testing.T) {
	stub := newTestStub(t)
	setTestCreator(t, stub, "BanksMSP")
	seedState(t, stub, "PAYMENT_PAY-FA-2", faPaymentJSON("PAY-FA-2", "LC-NOFOREX-1"))

	status, payload, message := invokeMsg(t, stub, "SettlePayment",
		"PAY-FA-2", "0", "0", "Deutsche Bank", "DEUTDEFF", "SWIFT-FA-2", "NBE-FA-2")
	if status == 200 {
		t.Fatalf("SettlePayment with zero rates and no forex allocation succeeded (want refusal)")
	}
	if !strings.Contains(message, "exchange rate must be positive") {
		t.Fatalf("refusal message is not the rate refusal: %s", message)
	}
	// And the payment must be untouched (still VERIFIED).
	status, payload = invoke(t, stub, "ReadPayment", "PAY-FA-2")
	if status != 200 || !strings.Contains(payload, `"status":"VERIFIED"`) {
		t.Fatalf("refused payment changed state: status %d, payload %s", status, payload)
	}
}

// faDocLCJSON is a full-shape LC (response-schema-safe, cf.
// legacyLCJSON) for the F-D behaviour test.
const faDocLCJSON = `{
	"lcId": "LC-FA-DOC-1", "contractId": "CONT-FA-DOC-1", "exporterId": "EXP-FA-1",
	"issuingBank": "CBE", "advisingBank": "CBE", "beneficiary": "Exporter FA",
	"amount": 10000, "currency": "USD", "status": "FOREX_ALLOCATED",
	"expiryDate": "2027-01-01", "requestDate": "2026-11-16T00:00:00Z",
	"approvalDate": "2026-11-16", "issueDate": "2026-11-16",
	"utilizationDate": "", "terms": "UCP600",
	"documents": [], "amendments": [], "amendmentCount": 0,
	"discrepancies": [], "discrepancyResolved": true,
	"negotiationStatus": "NOT_STARTED", "negotiationDate": "",
	"negotiatingBank": "", "approvedBy": "x", "approvedByMsp": "BanksMSP",
	"issuedBy": "x", "issuedByMsp": "BanksMSP",
	"lastUpdatedBy": "x", "lastUpdatedByMsp": "BanksMSP",
	"createdAt": "2026-11-16T00:00:00Z", "updatedAt": "2026-11-16T00:00:00Z"
}`

// TestSubmitLCDocumentsKeepsStatus (F-D): submitting documents attaches
// them to the LC and leaves the status FOREX_ALLOCATED — it must NOT
// become DOCUMENTS_SUBMITTED (a payment status; examine/release
// require FOREX_ALLOCATED then UTILIZED).
func TestSubmitLCDocumentsKeepsStatus(t *testing.T) {
	stub := newTestStub(t)
	setTestCreator(t, stub, "BanksMSP")
	seedState(t, stub, "LC_LC-FA-DOC-1", faDocLCJSON)

	status, payload := invoke(t, stub, "SubmitLCDocuments", "LC-FA-DOC-1", `["DOC-FA-1","DOC-FA-2"]`)
	if status != 200 {
		t.Fatalf("SubmitLCDocuments: status %d, payload %s (want 200)", status, payload)
	}

	status, payload = invoke(t, stub, "ReadLC", "LC-FA-DOC-1")
	if status != 200 {
		t.Fatalf("ReadLC: status %d, payload %s", status, payload)
	}
	if !strings.Contains(payload, `"status":"FOREX_ALLOCATED"`) {
		t.Fatalf("LC status changed after document submission (want FOREX_ALLOCATED): %s", payload)
	}
	if !strings.Contains(payload, "DOC-FA-1") || !strings.Contains(payload, "DOC-FA-2") {
		t.Fatalf("documents were not attached to the LC: %s", payload)
	}
}
