-- 008_verification_certificates.sql
--
-- Anti-fraud verification: store the registration/license certificate uploaded
-- at signup so admins can verify a hospital or doctor before approving.
--
--   hospitals.official_email  — institution contact email shown in approval queue
--   hospitals.certificate_path — storage path of the registration certificate PDF
--   doctors.certificate_path   — storage path of the medical license certificate PDF
--
-- Files live in the existing medical-uploads bucket, served via signed URL by the
-- admin certificate routes. Path keyed by the registrant's user_id.

ALTER TABLE public.hospitals
  ADD COLUMN IF NOT EXISTS official_email   TEXT,
  ADD COLUMN IF NOT EXISTS certificate_path TEXT;

ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS certificate_path TEXT;
