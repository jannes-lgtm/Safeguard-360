-- ─────────────────────────────────────────────────────────────────────────────
-- WhatsApp Sessions
-- Stores per-number conversation history and extracted journey context for CAIRO.
-- Enables CAIRO to maintain stateful conversation across WhatsApp messages.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,

  -- WhatsApp number in Twilio format: "whatsapp:+27821234567"
  phone_number  text        UNIQUE NOT NULL,

  -- Extracted journey context from conversation
  journey       jsonb       DEFAULT '{}' NOT NULL,

  -- Conversation history: [{ role: 'user'|'assistant', text: '...' }]
  -- Capped at 24 entries (~12 exchanges) by the webhook before save
  history       jsonb       DEFAULT '[]' NOT NULL,

  -- Timestamps
  last_activity timestamptz DEFAULT now() NOT NULL,
  created_at    timestamptz DEFAULT now() NOT NULL
);

-- Fast lookup by phone number
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_phone
  ON whatsapp_sessions (phone_number);

-- Index for cleanup job (prune sessions inactive > 30 days)
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_last_activity
  ON whatsapp_sessions (last_activity);

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;

-- Only the service role (used by the webhook function) can read/write sessions.
-- WhatsApp sessions are not exposed to the frontend.
CREATE POLICY "service_role_all_whatsapp_sessions"
  ON whatsapp_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── Automatic cleanup: prune sessions inactive > 30 days ─────────────────────
-- Run this manually or via a pg_cron job if you have it enabled:
--
-- SELECT cron.schedule(
--   'prune-whatsapp-sessions',
--   '0 3 * * *',
--   $$DELETE FROM whatsapp_sessions WHERE last_activity < now() - interval '30 days'$$
-- );
