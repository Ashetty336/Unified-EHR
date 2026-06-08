-- 005_uploads_and_linked_records.sql
--
-- Tracks every original document a patient or provider uploaded so the patient
-- dashboard can show "original file + FHIR rendering" pairs grouped by hospital.
--
-- The original file blob lives in Supabase Storage (bucket: `medical-uploads`).
-- The FHIR resources produced from it are tagged with `urn:upload|<upload_id>`
-- so they can be grouped back to the same upload at read time.
--
-- Storage bucket setup (run once in Supabase dashboard or via SQL):
--   INSERT INTO storage.buckets (id, name, public)
--   VALUES ('medical-uploads', 'medical-uploads', false)
--   ON CONFLICT (id) DO NOTHING;
--
-- File path convention: <patient_user_id>/<upload_id>/<sanitized_filename>

CREATE TABLE IF NOT EXISTS public.medical_uploads (
  upload_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id    UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  uploaded_by        UUID NOT NULL REFERENCES public.users(user_id),
  uploader_role      user_role NOT NULL,
  hospital_id        UUID REFERENCES public.hospitals(hospital_id),
  abha_number        TEXT,
  input_type         TEXT NOT NULL CHECK (input_type IN ('pdf', 'ccda', 'json')),
  original_filename  TEXT,
  storage_path       TEXT NOT NULL,
  content_type       TEXT,
  file_size          BIGINT,
  fhir_patient_id    TEXT,
  resource_count     INT NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medical_uploads_patient ON public.medical_uploads(patient_user_id);
CREATE INDEX IF NOT EXISTS idx_medical_uploads_hospital ON public.medical_uploads(hospital_id);
CREATE INDEX IF NOT EXISTS idx_medical_uploads_created ON public.medical_uploads(created_at DESC);

-- External Patient resources (other hospitals) the user has chosen to link to
-- their account via ABHA number. These records exist in HAPI under a different
-- fhir_patient_id but the same ABHA identifier.
CREATE TABLE IF NOT EXISTS public.linked_patient_records (
  link_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  abha_number       TEXT NOT NULL,
  fhir_patient_id   TEXT NOT NULL,
  hospital_code     TEXT,
  linked_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, fhir_patient_id)
);

CREATE INDEX IF NOT EXISTS idx_linked_records_user ON public.linked_patient_records(user_id);
