ALTER TABLE cancel_flows ADD COLUMN offer_path INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cancel_flows ADD COLUMN offer_code TEXT;
CREATE UNIQUE INDEX cancel_flow_retained ON cancel_flows(attempt) WHERE offer_code IS NOT NULL;
CREATE TABLE benefit_sessions (
  owner TEXT NOT NULL REFERENCES attempts(id), slot TEXT NOT NULL, answers TEXT NOT NULL,
  PRIMARY KEY(owner,slot)
);
CREATE TABLE guest_passes (
  owner TEXT PRIMARY KEY REFERENCES attempts(id), token TEXT NOT NULL UNIQUE, recipient TEXT UNIQUE, answers TEXT
);
