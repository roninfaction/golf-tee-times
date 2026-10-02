-- 042_profile_venmo_username.sql
-- Optional Venmo username so a side bet tab can open Venmo with the payment filled in.
-- Venmo has no API for apps to move money between friends; the payer still taps Pay in Venmo.
-- Venmo usernames are 5-30 letters, numbers, hyphens or underscores (stored without the @).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS venmo_username TEXT
  CHECK (venmo_username IS NULL OR venmo_username ~ '^[A-Za-z0-9_-]{5,30}$');
