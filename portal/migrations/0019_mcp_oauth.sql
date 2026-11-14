-- Sign in to connect (MCP authorisation, OAuth 2.1). Public clients only; every
-- code and token is stored as a SHA-256 hash, never in the clear.
CREATE TABLE oauth_clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  redirect_uris TEXT NOT NULL, -- JSON array, matched exactly (loopback: any port)
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);
CREATE INDEX oauth_clients_age ON oauth_clients(created_at);
-- One row per member consent: what a member sees and removes as a connected client.
-- Removing a connection deletes the row, and its codes and tokens with it.
CREATE TABLE oauth_grants (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  redirect_host TEXT NOT NULL,
  resource TEXT NOT NULL,
  scope TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);
CREATE INDEX oauth_grants_member ON oauth_grants(member_id);
CREATE INDEX oauth_grants_client ON oauth_grants(client_id);
CREATE TABLE oauth_codes (
  code_hash TEXT PRIMARY KEY,
  grant_id TEXT NOT NULL REFERENCES oauth_grants(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
-- kind is 'access' or 'refresh'. A used refresh token stays until it expires so a
-- second use is recognised and removes the whole connection.
CREATE TABLE oauth_tokens (
  token_hash TEXT PRIMARY KEY,
  grant_id TEXT NOT NULL REFERENCES oauth_grants(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('access','refresh')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX oauth_tokens_grant ON oauth_tokens(grant_id);
CREATE INDEX oauth_tokens_expiry ON oauth_tokens(expires_at);
