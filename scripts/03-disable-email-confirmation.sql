-- Disable email confirmation for easier development and testing
-- This allows users to sign up and login immediately without email verification

-- Update auth settings to disable email confirmation
UPDATE auth.config 
SET raw_app_meta_data = jsonb_set(
  COALESCE(raw_app_meta_data, '{}'::jsonb),
  '{email_confirm}',
  'false'::jsonb
)
WHERE id = 'default';

-- Alternative approach: Update the auth settings directly
-- Note: This might need to be done through Supabase dashboard instead
INSERT INTO auth.config (id, raw_app_meta_data) 
VALUES ('default', '{"email_confirm": false}'::jsonb)
ON CONFLICT (id) 
DO UPDATE SET raw_app_meta_data = jsonb_set(
  COALESCE(auth.config.raw_app_meta_data, '{}'::jsonb),
  '{email_confirm}',
  'false'::jsonb
);
