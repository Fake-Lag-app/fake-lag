-- lags and effects people share. data is the validated preset JSON.
CREATE TABLE items (
  id       TEXT PRIMARY KEY,
  kind     TEXT NOT NULL CHECK (kind IN ('effect', 'lag')),
  data     TEXT NOT NULL,
  status   TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  likes    INTEGER NOT NULL DEFAULT 0,
  created  INTEGER NOT NULL,
  decided  INTEGER
);
CREATE INDEX items_list ON items (status, kind, created);
CREATE INDEX items_top ON items (status, kind, likes);

-- counters for rate limits and likes. keys hold a salted hash that changes daily, never an IP.
CREATE TABLE hits (
  k  TEXT PRIMARY KEY,
  n  INTEGER NOT NULL DEFAULT 0,
  day INTEGER NOT NULL
);
CREATE INDEX hits_day ON hits (day);
