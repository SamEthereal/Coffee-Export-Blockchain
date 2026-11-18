-- Fix missing forex allocation expiry date
-- Set expiry date to match the LC expiry date (90 days from LC request date)

UPDATE forex_allocations fa
SET 
  expiry_date = lc.expiry_date,
  updated_at = NOW()
FROM letters_of_credit lc
WHERE fa.lc_id = lc.lc_id
  AND fa.forex_id = 'FOREX_LC-CONTRACT1794809015706_REQUEST'
  AND fa.expiry_date IS NULL;

-- Verify the update
SELECT 
  forex_id,
  lc_id,
  to_char(expiry_date, 'YYYY-MM-DD') as expiry_date,
  to_char(created_at, 'YYYY-MM-DD') as created_at,
  status,
  amount_usd,
  requested_amount
FROM forex_allocations 
WHERE forex_id = 'FOREX_LC-CONTRACT1794809015706_REQUEST';
