-- Portal authentication: magic links and sessions
-- Magic links: one-time tokens emailed to clients (expires 1 hour)
-- Sessions: long-lived tokens stored as httpOnly cookies (expires 30 days)

CREATE TABLE portal_magic_links (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  token      UUID        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_portal_magic_links_token ON portal_magic_links(token);

CREATE TABLE portal_sessions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  token      UUID        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_portal_sessions_token ON portal_sessions(token);
