-- 007_approval_audit_columns.sql
--
-- The live DB was provisioned from an older schema where hospitals/doctors
-- lacked approval audit columns. The admin approval routes and dashboard read
-- approved_at (and write approved_by/approved_at). Add them to match the code.

ALTER TABLE public.hospitals
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.users(user_id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.users(user_id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
