-- Klientské odkazy: personalizovaný přístup k předání podkladů
CREATE TABLE invites (
  id TEXT PRIMARY KEY,            -- token v URL
  client_name TEXT NOT NULL,
  email TEXT,
  password_hash TEXT NOT NULL,    -- HMAC(SESSION_SECRET, token+jméno+heslo), plaintext se nikam neukládá
  created_at TEXT NOT NULL
);

ALTER TABLE submissions ADD COLUMN invite_id TEXT;
