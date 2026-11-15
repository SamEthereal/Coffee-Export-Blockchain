package main

import (
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// ==================== EUDR DUE DILIGENCE STRUCTURE ====================
// EU Deforestation Regulation (EUDR) due diligence statements: one
// record per farm plot / shipment, submitted by the exporter and
// verified (or rejected) by ECTA.
//
// NOTE: this is NOT QueryEUDRCompliantShipments (main.go), which reads
// the eudrCompliant flag on shipments. These are standalone due
// diligence records keyed EUDR_<dueDiligenceID>.
//
// JSON tags: camelCase throughout, EXCEPT the ID field, which is
// `dueDiligenceID` (capital ID) because api/src/routes/eudr.ts
// /geolocation reads record.dueDiligenceID (or record.id). No
// `omitempty` anywhere: the contractapi response schema requires every
// field, and nil slices serialize as JSON null (SWIFT validate fix,
// commit fb8cc605), so slices are always initialised to [].

type EUDRDueDiligence struct {
	DueDiligenceID string `json:"dueDiligenceID"`
	ShipmentID     string `json:"shipmentId"`
	ExporterID     string `json:"exporterId"`

	// Farm plot
	GeoCoordinates    [][]float64 `json:"geoCoordinates"` // [lat, lon] pairs
	PlotSize          float64     `json:"plotSize"`       // hectares
	FarmName          string      `json:"farmName"`
	FarmLocation      string      `json:"farmLocation"`
	DeforestationFree bool        `json:"deforestationFree"`
	LegalHarvest      bool        `json:"legalHarvest"`
	HarvestDate       string      `json:"harvestDate"` // YYYY-MM-DD
	LandRights        string      `json:"landRights"`  // DOCUMENTED, etc.
	Documents         []string    `json:"documents"`

	// Verification (ECTA)
	Status            string `json:"status"` // SUBMITTED, VERIFIED, REJECTED
	Verified          bool   `json:"verified"`
	VerifiedBy        string `json:"verifiedBy"`
	VerificationDate  string `json:"verificationDate"` // RFC3339
	VerificationNotes string `json:"verificationNotes"`

	Timestamp string    `json:"timestamp"` // ledger time, RFC3339 (read by /geolocation)
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// EUDR record statuses.
const (
	EUDRStatusSubmitted = "SUBMITTED"
	EUDRStatusVerified  = "VERIFIED"
	EUDRStatusRejected  = "REJECTED"
)

// ==================== EUDR FUNCTIONS ====================

// SubmitEUDRDueDiligence - Exporter submits an EUDR due diligence
// statement. Called by POST /api/v1/eudr/due-diligence with
// (dueDiligenceID, shipmentID, exporterID, geoCoordinatesJSON,
// plotSize, farmName, farmLocation, deforestationFree, legalHarvest,
// harvestDate, landRights, documentsJSON).
//
// The shipment is NOT required to exist on-chain: due diligence is
// about the farm plot, and the API does not check the shipment either.
// Arguments are validated strictly instead. A duplicate
// dueDiligenceID is an error; records are never overwritten.
func (c *CoffeeContract) SubmitEUDRDueDiligence(ctx contractapi.TransactionContextInterface,
	dueDiligenceID, shipmentID, exporterID, geoCoordinatesJSON, plotSizeStr,
	farmName, farmLocation, deforestationFreeStr, legalHarvestStr,
	harvestDate, landRights, documentsJSON string) error {

	if err := ValidateID(dueDiligenceID, "dueDiligenceID"); err != nil {
		return fmt.Errorf("SubmitEUDRDueDiligence: %w", err)
	}
	if err := ValidateID(shipmentID, "shipmentID"); err != nil {
		return fmt.Errorf("SubmitEUDRDueDiligence: %w", err)
	}
	if err := ValidateID(exporterID, "exporterID"); err != nil {
		return fmt.Errorf("SubmitEUDRDueDiligence: %w", err)
	}
	if err := ValidateRequiredString(farmName, "farmName", MaxStringLen); err != nil {
		return fmt.Errorf("SubmitEUDRDueDiligence: %w", err)
	}
	if err := ValidateString(farmLocation, "farmLocation", MaxStringLen); err != nil {
		return fmt.Errorf("SubmitEUDRDueDiligence: %w", err)
	}
	if err := ValidateBoolean(deforestationFreeStr, "deforestationFree"); err != nil {
		return fmt.Errorf("SubmitEUDRDueDiligence: %w", err)
	}
	if err := ValidateBoolean(legalHarvestStr, "legalHarvest"); err != nil {
		return fmt.Errorf("SubmitEUDRDueDiligence: %w", err)
	}

	// geoCoordinates: non-empty JSON array of [lat, lon] pairs.
	geoCoordinates, err := parseGeoCoordinates(geoCoordinatesJSON)
	if err != nil {
		return fmt.Errorf("SubmitEUDRDueDiligence: %w", err)
	}

	// plotSize: finite number > 0 (hectares).
	plotSize, err := strconv.ParseFloat(plotSizeStr, 64)
	if err != nil {
		return fmt.Errorf("SubmitEUDRDueDiligence: plotSize must be a valid number: %w", err)
	}
	if math.IsNaN(plotSize) || math.IsInf(plotSize, 0) {
		return fmt.Errorf("SubmitEUDRDueDiligence: plotSize must be a finite number")
	}
	if plotSize <= 0 {
		return fmt.Errorf("SubmitEUDRDueDiligence: plotSize must be positive, got: %v", plotSize)
	}

	deforestationFree, err := strconv.ParseBool(deforestationFreeStr)
	if err != nil {
		return fmt.Errorf("SubmitEUDRDueDiligence: invalid deforestationFree: %w", err)
	}
	legalHarvest, err := strconv.ParseBool(legalHarvestStr)
	if err != nil {
		return fmt.Errorf("SubmitEUDRDueDiligence: invalid legalHarvest: %w", err)
	}

	// documents: JSON array of document IDs/names; "" means none.
	documents := []string{}
	if documentsJSON != "" && documentsJSON != "[]" {
		if err := json.Unmarshal([]byte(documentsJSON), &documents); err != nil {
			return fmt.Errorf("SubmitEUDRDueDiligence: documents must be a JSON array of strings: %w", err)
		}
		if documents == nil {
			documents = []string{}
		}
	}

	ledgerNow, err := ledgerTransactionTime(ctx)
	if err != nil {
		return fmt.Errorf("SubmitEUDRDueDiligence: failed to read Fabric transaction timestamp: %w", err)
	}

	// harvestDate: the API defaults it to today; a direct Fabric caller
	// passing "" gets the same default. A supplied value must be valid.
	if harvestDate == "" {
		harvestDate = ledgerNow.Format("2006-01-02")
	} else if err := ValidateDate(harvestDate); err != nil {
		return fmt.Errorf("SubmitEUDRDueDiligence: %w", err)
	}
	// landRights: the API defaults it to DOCUMENTED.
	if landRights == "" {
		landRights = "DOCUMENTED"
	}

	// Duplicate IDs must error — never overwrite an existing record.
	existing, err := ctx.GetStub().GetState("EUDR_" + dueDiligenceID)
	if err != nil {
		return fmt.Errorf("SubmitEUDRDueDiligence: failed to read record: %w", err)
	}
	if existing != nil {
		return fmt.Errorf("SubmitEUDRDueDiligence: due diligence record %s already exists", dueDiligenceID)
	}

	record := &EUDRDueDiligence{
		DueDiligenceID:    dueDiligenceID,
		ShipmentID:        shipmentID,
		ExporterID:        exporterID,
		GeoCoordinates:    geoCoordinates,
		PlotSize:          plotSize,
		FarmName:          farmName,
		FarmLocation:      farmLocation,
		DeforestationFree: deforestationFree,
		LegalHarvest:      legalHarvest,
		HarvestDate:       harvestDate,
		LandRights:        landRights,
		Documents:         documents,
		Status:            EUDRStatusSubmitted,
		Verified:          false,
		Timestamp:         ledgerNow.Format(time.RFC3339),
		CreatedAt:         ledgerNow,
		UpdatedAt:         ledgerNow,
	}

	recordJSON, err := json.Marshal(record)
	if err != nil {
		return fmt.Errorf("SubmitEUDRDueDiligence: failed to marshal: %w", err)
	}
	if err := ctx.GetStub().PutState("EUDR_"+dueDiligenceID, recordJSON); err != nil {
		return fmt.Errorf("SubmitEUDRDueDiligence: failed to put state: %w", err)
	}

	changes := []FieldChange{
		{FieldName: "dueDiligenceId", OldValue: "", NewValue: dueDiligenceID, DataType: "string"},
		{FieldName: "shipmentId", OldValue: "", NewValue: shipmentID, DataType: "string"},
		{FieldName: "status", OldValue: "", NewValue: EUDRStatusSubmitted, DataType: "string"},
	}
	compliance := ComplianceMetadata{
		ECTACompliance: true,
		EUDRCompliance: true,
		ICOCompliance:  true,
		ComplianceNote: fmt.Sprintf("EUDR due diligence submitted for shipment %s (farm %s)", shipmentID, farmName),
	}
	if err := c.CreateAuditLog(ctx, "SUBMIT", "EUDR", dueDiligenceID, "", EUDRStatusSubmitted,
		changes, fmt.Sprintf("EUDR due diligence submitted by %s", exporterID), compliance); err != nil {
		return fmt.Errorf("SubmitEUDRDueDiligence: failed to create audit log: %w", err)
	}

	fmt.Printf("✅ EUDR due diligence submitted: %s for shipment %s\n", dueDiligenceID, shipmentID)
	return nil
}

// parseGeoCoordinates parses and validates the geoCoordinates JSON:
// a non-empty array of [lat, lon] pairs, lat in [-90, 90],
// lon in [-180, 180].
func parseGeoCoordinates(geoJSON string) ([][]float64, error) {
	if geoJSON == "" {
		return nil, fmt.Errorf("geoCoordinates is required")
	}
	var coords [][]float64
	if err := json.Unmarshal([]byte(geoJSON), &coords); err != nil {
		return nil, fmt.Errorf("geoCoordinates must be a JSON array of [lat, lon] pairs: %w", err)
	}
	if len(coords) == 0 {
		return nil, fmt.Errorf("geoCoordinates must contain at least one coordinate pair")
	}
	for i, pair := range coords {
		if len(pair) != 2 {
			return nil, fmt.Errorf("geoCoordinates[%d] must be a [lat, lon] pair, got %d values", i, len(pair))
		}
		lat, lon := pair[0], pair[1]
		if math.IsNaN(lat) || math.IsInf(lat, 0) || math.IsNaN(lon) || math.IsInf(lon, 0) {
			return nil, fmt.Errorf("geoCoordinates[%d] must be finite numbers", i)
		}
		if lat < -90 || lat > 90 {
			return nil, fmt.Errorf("geoCoordinates[%d] latitude must be between -90 and 90, got: %v", i, lat)
		}
		if lon < -180 || lon > 180 {
			return nil, fmt.Errorf("geoCoordinates[%d] longitude must be between -180 and 180, got: %v", i, lon)
		}
	}
	return coords, nil
}

// VerifyEUDRCompliance - ECTA verifies (or rejects) a due diligence
// record. Called by POST /api/v1/eudr/:dueDiligenceID/verify with
// (dueDiligenceID, verifiedBy, verified, verificationNotes); the API
// already enforces the ECTA-only role (403 otherwise).
//
// Only a SUBMITTED record can be verified: the verdict is terminal,
// so re-verifying a VERIFIED or REJECTED record is an error rather
// than a silent overwrite. verified=true -> VERIFIED, verified=false
// -> REJECTED.
func (c *CoffeeContract) VerifyEUDRCompliance(ctx contractapi.TransactionContextInterface,
	dueDiligenceID, verifiedBy, verifiedStr, verificationNotes string) error {

	if err := ValidateID(dueDiligenceID, "dueDiligenceID"); err != nil {
		return fmt.Errorf("VerifyEUDRCompliance: %w", err)
	}
	if err := ValidateRequiredString(verifiedBy, "verifiedBy", MaxStringLen); err != nil {
		return fmt.Errorf("VerifyEUDRCompliance: %w", err)
	}
	if err := ValidateBoolean(verifiedStr, "verified"); err != nil {
		return fmt.Errorf("VerifyEUDRCompliance: %w", err)
	}
	verified, err := strconv.ParseBool(verifiedStr)
	if err != nil {
		return fmt.Errorf("VerifyEUDRCompliance: invalid verified: %w", err)
	}

	recordJSON, err := ctx.GetStub().GetState("EUDR_" + dueDiligenceID)
	if err != nil {
		return fmt.Errorf("VerifyEUDRCompliance: failed to read record: %w", err)
	}
	if recordJSON == nil {
		return fmt.Errorf("VerifyEUDRCompliance: due diligence record %s does not exist", dueDiligenceID)
	}

	var record EUDRDueDiligence
	if err := json.Unmarshal(recordJSON, &record); err != nil {
		return fmt.Errorf("VerifyEUDRCompliance: failed to unmarshal: %w", err)
	}

	// GUARD: the verdict is terminal — only SUBMITTED can be verified.
	if record.Status != EUDRStatusSubmitted {
		return fmt.Errorf("VerifyEUDRCompliance: only SUBMITTED records can be verified, current status: %s", record.Status)
	}

	ledgerNow, err := ledgerTransactionTime(ctx)
	if err != nil {
		return fmt.Errorf("VerifyEUDRCompliance: failed to read Fabric transaction timestamp: %w", err)
	}

	previousStatus := record.Status
	if verified {
		record.Status = EUDRStatusVerified
	} else {
		record.Status = EUDRStatusRejected
	}
	record.Verified = verified
	record.VerifiedBy = verifiedBy
	record.VerificationDate = ledgerNow.Format(time.RFC3339)
	record.VerificationNotes = verificationNotes
	record.UpdatedAt = ledgerNow

	recordJSON, err = json.Marshal(record)
	if err != nil {
		return fmt.Errorf("VerifyEUDRCompliance: failed to marshal: %w", err)
	}
	if err := ctx.GetStub().PutState("EUDR_"+dueDiligenceID, recordJSON); err != nil {
		return fmt.Errorf("VerifyEUDRCompliance: failed to put state: %w", err)
	}

	changes := []FieldChange{
		{FieldName: "status", OldValue: previousStatus, NewValue: record.Status, DataType: "string"},
		{FieldName: "verifiedBy", OldValue: "", NewValue: verifiedBy, DataType: "string"},
	}
	compliance := ComplianceMetadata{
		ECTACompliance: true,
		EUDRCompliance: verified,
		ICOCompliance:  true,
		ComplianceNote: fmt.Sprintf("EUDR due diligence %s by %s: %s", record.Status, verifiedBy, verificationNotes),
	}
	if err := c.CreateAuditLog(ctx, "VERIFY", "EUDR", dueDiligenceID, previousStatus, record.Status,
		changes, fmt.Sprintf("EUDR compliance %s by %s", record.Status, verifiedBy), compliance); err != nil {
		return fmt.Errorf("VerifyEUDRCompliance: failed to create audit log: %w", err)
	}

	fmt.Printf("✅ EUDR compliance %s: %s by %s\n", record.Status, dueDiligenceID, verifiedBy)
	return nil
}

// ReadEUDRDueDiligence - Get a due diligence record by ID.
// Called by GET /api/v1/eudr/:dueDiligenceID; a missing record is a
// 404 NOT_FOUND at the API.
func (c *CoffeeContract) ReadEUDRDueDiligence(ctx contractapi.TransactionContextInterface,
	dueDiligenceID string) (*EUDRDueDiligence, error) {

	recordJSON, err := ctx.GetStub().GetState("EUDR_" + dueDiligenceID)
	if err != nil {
		return nil, fmt.Errorf("ReadEUDRDueDiligence: failed to read: %w", err)
	}
	if recordJSON == nil {
		return nil, fmt.Errorf("ReadEUDRDueDiligence: due diligence record %s does not exist", dueDiligenceID)
	}

	var record EUDRDueDiligence
	if err := json.Unmarshal(recordJSON, &record); err != nil {
		return nil, fmt.Errorf("ReadEUDRDueDiligence: failed to unmarshal: %w", err)
	}
	normalizeEUDRRecord(&record)
	return &record, nil
}

// QueryAllEUDRRecords - Get all due diligence records.
// Called by GET /api/v1/eudr and GET /api/v1/eudr/statements (and
// /geolocation). Returns an empty slice, never nil, when there are no
// records. Range scan (not a CouchDB rich query) so it also works on a
// MockStub — same pattern as QueryAllPhytosanitaryCertificates.
func (c *CoffeeContract) QueryAllEUDRRecords(ctx contractapi.TransactionContextInterface) ([]*EUDRDueDiligence, error) {
	return c.queryEUDRRecordsByRange(ctx, "EUDR_", "EUDR_~", "")
}

// QueryEUDRByShipment - Get all due diligence records for a shipment.
// Called by GET /api/v1/eudr/shipment/:shipmentID. Returns an empty
// slice, never nil, when the shipment has no records.
func (c *CoffeeContract) QueryEUDRByShipment(ctx contractapi.TransactionContextInterface,
	shipmentID string) ([]*EUDRDueDiligence, error) {

	if err := ValidateID(shipmentID, "shipmentID"); err != nil {
		return nil, fmt.Errorf("QueryEUDRByShipment: %w", err)
	}
	return c.queryEUDRRecordsByRange(ctx, "EUDR_", "EUDR_~", shipmentID)
}

// queryEUDRRecordsByRange scans the EUDR_ key range and, when
// shipmentID is non-empty, keeps only that shipment's records.
func (c *CoffeeContract) queryEUDRRecordsByRange(ctx contractapi.TransactionContextInterface,
	startKey, endKey, shipmentID string) ([]*EUDRDueDiligence, error) {

	resultsIterator, err := ctx.GetStub().GetStateByRange(startKey, endKey)
	if err != nil {
		return nil, fmt.Errorf("failed to query EUDR records: %w", err)
	}
	defer resultsIterator.Close()

	records := []*EUDRDueDiligence{}
	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if err != nil {
			return nil, err
		}
		var record EUDRDueDiligence
		if err := json.Unmarshal(queryResponse.Value, &record); err != nil {
			return nil, fmt.Errorf("failed to unmarshal EUDR record: %w", err)
		}
		if shipmentID != "" && record.ShipmentID != shipmentID {
			continue
		}
		normalizeEUDRRecord(&record)
		records = append(records, &record)
	}
	return records, nil
}

// normalizeEUDRRecord replaces nil slices with empty ones so the
// response never serializes JSON null (SWIFT validate fix, fb8cc605).
func normalizeEUDRRecord(record *EUDRDueDiligence) {
	if record.GeoCoordinates == nil {
		record.GeoCoordinates = [][]float64{}
	}
	if record.Documents == nil {
		record.Documents = []string{}
	}
}
