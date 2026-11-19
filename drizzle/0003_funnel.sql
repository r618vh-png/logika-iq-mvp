ALTER TABLE attempts ADD COLUMN journey TEXT;
ALTER TABLE attempts ADD COLUMN offer_at INTEGER;
ALTER TABLE attempts ADD COLUMN checkout_at INTEGER;
ALTER TABLE attempts ADD COLUMN report_at INTEGER;
ALTER TABLE attempts ADD COLUMN training_at INTEGER;
ALTER TABLE attempts ADD COLUMN reminder_at INTEGER;
CREATE INDEX attempts_journey ON attempts(journey);
CREATE INDEX attempts_email ON attempts(lower(trim(email)));
CREATE TABLE journeys(id TEXT PRIMARY KEY, started INTEGER NOT NULL, question INTEGER NOT NULL DEFAULT 0, touched INTEGER NOT NULL);
CREATE TABLE reminders(email TEXT PRIMARY KEY, state TEXT NOT NULL, created INTEGER NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL);
CREATE VIEW unpaid_contacts AS
WITH ranked AS (
 SELECT lower(trim(email)) AS address, reminder_at,
 max(status='paid') OVER (PARTITION BY lower(trim(email))) AS ever_paid,
 row_number() OVER (PARTITION BY lower(trim(email)) ORDER BY coalesce(consent_at,created_at) DESC, rowid DESC) AS n
 FROM attempts WHERE nullif(trim(email),'') IS NOT NULL
)
SELECT address, reminder_at FROM ranked WHERE n=1 AND ever_paid=0;
CREATE VIEW funnel_rows AS
SELECT a.rowid AS number,a.email,a.created_at AS finished,
 coalesce(j.started,a.created_at) AS started,
 max(a.created_at,coalesce(a.consent_at,0),coalesce(a.offer_at,0),coalesce(a.checkout_at,0),coalesce(a.paid_at,0),coalesce(a.report_at,0),coalesce(a.training_at,0)) AS touched,
 CASE WHEN training_at IS NOT NULL THEN 8 WHEN report_at IS NOT NULL THEN 7 WHEN status='paid' THEN 6
 WHEN checkout_at IS NOT NULL THEN 5 WHEN offer_at IS NOT NULL THEN 4 WHEN email IS NOT NULL THEN 3 ELSE 2 END AS stage,
 9 AS question,j.id IS NOT NULL AS tracked
FROM attempts a LEFT JOIN journeys j ON j.id=a.journey
UNION ALL SELECT -j.rowid,NULL,NULL,j.started,j.touched,CASE WHEN question=0 THEN 0 ELSE 1 END,j.question,1
FROM journeys j WHERE NOT EXISTS(SELECT 1 FROM attempts a WHERE a.journey=j.id);
