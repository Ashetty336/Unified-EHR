  -- 006_prescriptions.sql
  --
  -- Mirror of prescriptions created by doctors. Lets the patient dashboard list
  -- prescriptions with doctor + hospital metadata without scanning audit logs.
  -- The authoritative MedicationRequest still lives in HAPI; this table is the
  -- index pointing back to it.

  CREATE TABLE IF NOT EXISTS public.prescriptions (
    prescription_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_user_id   UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    doctor_user_id    UUID NOT NULL REFERENCES public.users(user_id),
    fhir_resource_id  TEXT NOT NULL,
    medication        TEXT NOT NULL,
    dosage            TEXT,
    status            TEXT NOT NULL DEFAULT 'active',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_prescriptions_patient
    ON public.prescriptions(patient_user_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_prescriptions_doctor
    ON public.prescriptions(doctor_user_id);
