import React, { useEffect, useState } from 'react';
import { Box, TextField, Button, Typography, Alert } from '@mui/material';
import api from '@/utils/api';
import { AnimatedButton } from '@/components/modern';

// Risk rules editor (PUT /customs/risk-rules, migration 079).
//
// The old form edited { highValueThreshold, hsPrefixesMedium } — fields
// that exist nowhere in the API: GET /customs/risk-rules returns
// { highRiskCountries, valueThresholds: { automatic_inspection,
// enhanced_scrutiny, senior_approval }, redFlags, inspectionTriggers,
// complianceChecks }, and PUT requires highRiskCountries (array),
// valueThresholds (object, each threshold a non-negative number) and
// redFlags (array). Every save from the old form therefore 400d with
// VALIDATION_ERROR, and the two fields it displayed were always empty
// (the API never returns them). This form edits the real shape:
// the three value thresholds and the high-risk countries list.
// redFlags / inspectionTriggers / complianceChecks are not edited here —
// the loaded values are round-tripped unchanged so a save never wipes
// them.
const RiskRulesManager: React.FC = () => {
  const [rules, setRules] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const resp = await api.get('/customs/risk-rules');
        if (resp.data && resp.data.success) {
          setRules(resp.data.data || null);
        } else {
          setError('Could not load risk rules.');
        }
      } catch (err: any) {
        setError(err?.response?.data?.error?.message || 'Could not load risk rules.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const setThreshold = (key: string, raw: string) => {
    setRules((prev: any) => ({
      ...prev,
      valueThresholds: { ...(prev?.valueThresholds || {}), [key]: raw },
    }));
  };

  const handleSave = async () => {
    setError(null);
    setMessage(null);
    const thresholds: Record<string, number> = {};
    for (const key of ['automatic_inspection', 'enhanced_scrutiny', 'senior_approval']) {
      const n = Number(rules?.valueThresholds?.[key]);
      if (!Number.isFinite(n) || n < 0) {
        setError(`Threshold "${key}" must be a number of 0 or more (USD).`);
        return;
      }
      thresholds[key] = n;
    }
    const highRiskCountries = String(rules?.highRiskCountries ?? '')
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean);
    try {
      setLoading(true);
      const payload = {
        highRiskCountries,
        valueThresholds: thresholds,
        // Round-trip the parts this form does not edit, so saving never
        // wipes the red-flag list, inspection triggers or compliance
        // checks the API requires alongside the thresholds.
        redFlags: Array.isArray(rules?.redFlags) ? rules.redFlags : [],
        inspectionTriggers: rules?.inspectionTriggers ?? {},
        complianceChecks: Array.isArray(rules?.complianceChecks) ? rules.complianceChecks : [],
      };

      const resp = await api.put('/customs/risk-rules', payload);
      if (resp.data && resp.data.success) {
        setMessage('Risk rules updated successfully');
        setRules(resp.data.data);
      } else {
        setError(resp.data?.error?.message || 'Failed to update rules');
      }
    } catch (err: any) {
      // Surface the API's message (e.g. the VALIDATION_ERROR detail)
      // instead of a generic "Error saving rules".
      setError(err?.response?.data?.error?.message || 'Error saving rules');
    } finally {
      setLoading(false);
      setTimeout(() => { setMessage(null); setError(null); }, 6000);
    }
  };

  const thresholds = rules?.valueThresholds || {};
  const countriesText = Array.isArray(rules?.highRiskCountries)
    ? rules.highRiskCountries.join(', ')
    : String(rules?.highRiskCountries ?? '');

  return (
    <Box sx={{ p: 2, maxWidth: 720 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Risk Rules Manager</Typography>

      {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Typography variant="subtitle2" sx={{ mb: 1 }}>Value thresholds (USD) — a shipment at or above the threshold triggers the action</Typography>
      <TextField
        label="Automatic inspection threshold (USD)"
        type="number"
        fullWidth
        value={thresholds.automatic_inspection ?? ''}
        onChange={(e) => setThreshold('automatic_inspection', e.target.value)}
        helperText="Shipments at or above this value are inspected automatically"
        inputProps={{ min: 0, step: 1000 }}
        sx={{ mb: 2 }}
      />
      <TextField
        label="Enhanced scrutiny threshold (USD)"
        type="number"
        fullWidth
        value={thresholds.enhanced_scrutiny ?? ''}
        onChange={(e) => setThreshold('enhanced_scrutiny', e.target.value)}
        helperText="Shipments at or above this value require enhanced due diligence"
        inputProps={{ min: 0, step: 1000 }}
        sx={{ mb: 2 }}
      />
      <TextField
        label="Senior approval threshold (USD)"
        type="number"
        fullWidth
        value={thresholds.senior_approval ?? ''}
        onChange={(e) => setThreshold('senior_approval', e.target.value)}
        helperText="Shipments at or above this value require senior officer approval"
        inputProps={{ min: 0, step: 1000 }}
        sx={{ mb: 2 }}
      />

      <TextField
        label="High-risk countries (comma-separated)"
        fullWidth
        value={countriesText}
        onChange={(e) => setRules((prev: any) => ({ ...prev, highRiskCountries: e.target.value }))}
        helperText="Countries / jurisdictions flagged as high risk"
        sx={{ mb: 2 }}
      />

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Red flags ({Array.isArray(rules?.redFlags) ? rules.redFlags.length : 0}), inspection triggers and compliance checks are kept as loaded — this form edits thresholds and countries only.
      </Typography>

      <Box sx={{ display: 'flex', gap: 1 }}>
        <AnimatedButton variant="contained" onClick={handleSave} disabled={loading || !rules} loading={loading} loadingLabel="Saving…">Save</AnimatedButton>
        <Button variant="outlined" onClick={() => { setRules((prev: any) => (prev ? { ...prev, valueThresholds: { automatic_inspection: 100000, enhanced_scrutiny: 500000, senior_approval: 1000000 }, highRiskCountries: ['Country with sanctions', 'High-risk jurisdictions'] } : prev)); }}>Reset to Defaults</Button>
      </Box>
    </Box>
  );
};

export default RiskRulesManager;
