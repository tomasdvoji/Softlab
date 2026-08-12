-- Klientský portál: zakázky a soubory
CREATE TABLE submissions (
  id TEXT PRIMARY KEY,
  public_reference TEXT UNIQUE NOT NULL,
  client_name TEXT NOT NULL,
  company_name TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  project_name TEXT NOT NULL,
  instructions TEXT,
  created_at TEXT NOT NULL,
  total_size INTEGER NOT NULL DEFAULT 0,
  file_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'uploading'
);
CREATE INDEX idx_submissions_created ON submissions(created_at DESC);
CREATE INDEX idx_submissions_status ON submissions(status);

CREATE TABLE files (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  original_name TEXT NOT NULL,
  storage_name TEXT NOT NULL,
  mime_type TEXT,
  size INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_files_submission ON files(submission_id);

-- jednoduchý fixed-window rate limiting
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
