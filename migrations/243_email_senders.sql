-- Migration 243: Nhiều địa chỉ gửi (SES hoặc SMTP), template chọn sender mặc định.
CREATE TABLE IF NOT EXISTS email_senders (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,                    -- Tên hiển thị (VD: "Kế toán WOKA")
  from_addr          TEXT NOT NULL,                    -- Email gửi (VD: ketoan@woka.vn)
  from_name          TEXT,                             -- Tên hiển thị người gửi (VD: "WOKA Việt Nam")
  reply_to           TEXT,
  engine             TEXT NOT NULL DEFAULT 'ses' CHECK (engine IN ('ses', 'smtp')),
  ses_region         TEXT,                             -- override AWS_REGION (tùy chọn)
  ses_access_key     TEXT,                             -- override credentials (tùy chọn)
  ses_secret_key     TEXT,
  smtp_host          TEXT,
  smtp_port          INTEGER,
  smtp_secure        BOOLEAN DEFAULT false,
  smtp_user          TEXT,
  smtp_password      TEXT,
  smtp_reject_unauth BOOLEAN DEFAULT true,
  is_default         BOOLEAN NOT NULL DEFAULT false,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_senders_active ON email_senders(is_active);

-- Chỉ 1 sender là mặc định (partial unique index).
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_senders_default ON email_senders(is_default) WHERE is_default;

ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS default_sender_id TEXT REFERENCES email_senders(id) ON DELETE SET NULL;

ALTER TABLE email_outbox
  ADD COLUMN IF NOT EXISTS sender_id TEXT REFERENCES email_senders(id) ON DELETE SET NULL;

-- Seed 1 sender mặc định từ env SES_FROM_EMAIL (nếu chưa có sender nào).
INSERT INTO email_senders (id, name, from_addr, from_name, engine, is_default, is_active)
SELECT 'es_default_ses', 'Mặc định (SES)', 'no-reply@fadogroup.com.au', 'FADO Group', 'ses', true, true
WHERE NOT EXISTS (SELECT 1 FROM email_senders);
