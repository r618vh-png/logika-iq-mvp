CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  answers TEXT NOT NULL,
  result TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid')),
  created_at INTEGER NOT NULL,
  paid_at INTEGER
);
