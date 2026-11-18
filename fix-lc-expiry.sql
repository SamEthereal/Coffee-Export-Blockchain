-- Fix missing LC expiry date
-- Set expiry date to 90 days from request date (or now if request_date is NULL)

UPDATE letters_of_credit 
SET expiry_date = COALESCE(
  request_date + INTERVAL '90 days',
  NOW() + INTERVAL '90 days'
),
updated_at = NOW()
WHERE lc_id = 'LC-CONTRACT1794809015706' 
AND expiry_date IS NULL;

-- Verify the update
SELECT 
  lc_id, 
  status,
  to_char(request_date, 'YYYY-MM-DD') as request_date,
  to_char(expiry_date, 'YYYY-MM-DD') as expiry_date,
  to_char(issue_date, 'YYYY-MM-DD') as issue_date
FROM letters_of_credit 
WHERE lc_id = 'LC-CONTRACT1794809015706';
