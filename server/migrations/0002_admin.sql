-- admin tools: featured items, user reports, who sent it (salted hashes only), blocks, settings, action log
ALTER TABLE items ADD COLUMN featured INTEGER NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN reports INTEGER NOT NULL DEFAULT 0;
-- sender: salted hash of the app's random install id. ipk: salted hash of the IP. Neither can be turned back into an IP or a person.
ALTER TABLE items ADD COLUMN sender TEXT;
ALTER TABLE items ADD COLUMN ipk TEXT;
CREATE INDEX items_sender ON items (sender);
CREATE INDEX items_ipk ON items (ipk);
CREATE INDEX items_reports ON items (reports);

CREATE TABLE blocks (
  k       TEXT PRIMARY KEY,
  created INTEGER NOT NULL,
  note    TEXT
);

CREATE TABLE config (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);

CREATE TABLE log (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  t      INTEGER NOT NULL,
  action TEXT NOT NULL,
  item   TEXT,
  note   TEXT
);
