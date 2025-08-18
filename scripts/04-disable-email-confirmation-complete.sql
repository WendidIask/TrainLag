-- Disable email confirmation for Supabase Auth
-- This allows users to sign up and login immediately without email verification

-- Update auth configuration to disable email confirmation
UPDATE auth.config 
SET 
  enable_signup = true,
  enable_confirmations = false,
  enable_email_confirmations = false
WHERE true;

-- If the above doesn't work (some Supabase versions), try this approach:
-- Update the site_url and other settings
INSERT INTO auth.config (
  site_url,
  enable_signup,
  enable_confirmations,
  enable_email_confirmations,
  mailer_autoconfirm,
  sms_autoconfirm,
  email_confirm_change_enabled
) VALUES (
  coalesce(current_setting('app.settings.site_url', true), 'http://localhost:3000'),
  true,
  false,
  false,
  true,
  true,
  false
) ON CONFLICT DO NOTHING;

-- Alternative approach: Update auth settings directly
UPDATE auth.config SET 
  mailer_autoconfirm = true,
  sms_autoconfirm = true,
  enable_confirmations = false,
  enable_email_confirmations = false,
  email_confirm_change_enabled = false
WHERE true;

-- Confirm any existing unconfirmed users (for development)
UPDATE auth.users 
SET 
  email_confirmed_at = now(),
  confirmed_at = now()
WHERE 
  email_confirmed_at IS NULL 
  AND confirmed_at IS NULL;
