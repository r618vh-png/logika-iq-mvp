-- Track each different benefit once; retain the original constraint for legacy records.
DROP INDEX IF EXISTS cancel_flow_retained;
DROP INDEX IF EXISTS cancel_flow_offer;
CREATE UNIQUE INDEX cancel_flow_offer ON cancel_flows(attempt) WHERE outcome IN ('discount','pause') AND offer_code IS NULL;
CREATE UNIQUE INDEX cancel_flow_retained ON cancel_flows(attempt,offer_code) WHERE offer_code IS NOT NULL;
UPDATE cancel_flows SET exit_step=min(10,coalesce(json_array_length(survey_answers),0)+1)
WHERE outcome IS NULL AND offer_path=1;
