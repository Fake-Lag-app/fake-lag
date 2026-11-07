-- support chat: one thread per install. k is a salted hash of the app's random install id, never the id itself.
CREATE TABLE threads (
  k            TEXT PRIMARY KEY,
  created      INTEGER NOT NULL,
  updated      INTEGER NOT NULL,
  unread_admin INTEGER NOT NULL DEFAULT 0,
  unread_user  INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  nick         TEXT,
  diag         TEXT
);
CREATE INDEX threads_updated ON threads (updated);

CREATE TABLE msgs (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  k    TEXT NOT NULL,
  t    INTEGER NOT NULL,
  who  TEXT NOT NULL CHECK (who IN ('user', 'admin')),
  text TEXT NOT NULL
);
CREATE INDEX msgs_thread ON msgs (k, id);
