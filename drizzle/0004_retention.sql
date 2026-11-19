CREATE TABLE IF NOT EXISTS cancel_flows (
  id TEXT PRIMARY KEY,
  attempt TEXT NOT NULL REFERENCES attempts(id),
  started INTEGER NOT NULL,
  reason TEXT CHECK(reason IN ('price','time','result','skip')),
  outcome TEXT CHECK(outcome IN ('discount','pause','cancel','keep')),
  decided INTEGER,
  effective INTEGER,
  period_end INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS cancel_flow_open ON cancel_flows(attempt) WHERE outcome IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS cancel_flow_offer ON cancel_flows(attempt) WHERE outcome IN ('discount','pause');
CREATE UNIQUE INDEX IF NOT EXISTS cancel_flow_end ON cancel_flows(attempt) WHERE outcome='cancel';
CREATE INDEX IF NOT EXISTS cancel_flow_attempt ON cancel_flows(attempt,started);
CREATE TABLE IF NOT EXISTS subscription_keys(
  attempt TEXT PRIMARY KEY REFERENCES attempts(id), token TEXT UNIQUE NOT NULL
);
