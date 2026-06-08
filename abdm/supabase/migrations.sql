-- 002_core_tables.sql

-- Users (mirrors Supabase auth.users)
CREATE TABLE public.users (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL UNIQUE,
  role        user_role NOT NULL,
  full_name   TEXT,
  phone       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Patients
CREATE TABLE public.patients (
  patient_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE REFERENCES public.users(user_id) ON DELETE CASCADE,
  abha_number     TEXT NOT NULL UNIQUE,
  abha_address    TEXT NOT NULL UNIQUE,
  fhir_patient_id TEXT,                     -- HAPI FHIR Patient resource ID
  date_of_birth   DATE,
  gender          TEXT,
  blood_group     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Hospitals
CREATE TABLE public.hospitals (
  hospital_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL UNIQUE REFERENCES public.users(user_id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  address          TEXT,
  phone            TEXT,
  registration_no  TEXT UNIQUE,
  approval_status  approval_status NOT NULL DEFAULT 'pending',
  fhir_org_id      TEXT,                    -- HAPI FHIR Organization resource ID
  approved_by      UUID REFERENCES public.users(user_id),
  approved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Doctors
CREATE TABLE public.doctors (
  doctor_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL UNIQUE REFERENCES public.users(user_id) ON DELETE CASCADE,
  hospital_id           UUID NOT NULL REFERENCES public.hospitals(hospital_id),
  specialization        TEXT,
  license_number        TEXT UNIQUE,
  fhir_practitioner_id  TEXT,              -- HAPI FHIR Practitioner resource ID
  approval_status       approval_status NOT NULL DEFAULT 'pending',
  approved_by           UUID REFERENCES public.users(user_id),
  approved_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ABHA Registry (fast lookup by abha_number)
CREATE TABLE public.abha_registry (
  abha_number   TEXT PRIMARY KEY,
  abha_address  TEXT NOT NULL UNIQUE,
  patient_id    UUID NOT NULL UNIQUE REFERENCES public.patients(patient_id) ON DELETE CASCADE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- 003_consent_tables.sql

-- Consent Requests (doctor initiates before consent is granted)
CREATE TABLE public.consent_requests (
  request_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id       UUID NOT NULL REFERENCES public.users(user_id),
  requester_type     requester_type NOT NULL,
  abha_number        TEXT NOT NULL,          -- used to look up patient
  resource_scope     TEXT[] NOT NULL DEFAULT '{}',   -- e.g. {'Observation','Medication'}
  access_type        consent_access_type NOT NULL DEFAULT 'full',
  requested_duration INT NOT NULL DEFAULT 30, -- days
  purpose            TEXT,
  status             consent_request_status NOT NULL DEFAULT 'pending',
  requested_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at       TIMESTAMPTZ
);

-- Consents (created when patient approves a consent_request)
CREATE TABLE public.consents (
  consent_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      UUID REFERENCES public.consent_requests(request_id),
  patient_id      UUID NOT NULL REFERENCES public.patients(patient_id),
  requester_id    UUID NOT NULL REFERENCES public.users(user_id),
  requester_type  requester_type NOT NULL,
  status          consent_status NOT NULL DEFAULT 'pending',
  access_type     consent_access_type NOT NULL DEFAULT 'full',
  resource_scope  TEXT[] NOT NULL DEFAULT '{}',
  fhir_consent_id TEXT,                      -- HAPI FHIR Consent resource ID
  granted_at      TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 004_audit_logs.sql

CREATE TABLE public.audit_logs (
  log_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consent_id       UUID REFERENCES public.consents(consent_id),
  accessed_by      UUID NOT NULL REFERENCES public.users(user_id),
  patient_id       UUID NOT NULL REFERENCES public.patients(patient_id),
  accessor_role    user_role NOT NULL,
  resource_type    TEXT NOT NULL,            -- e.g. 'Observation', 'Medication'
  fhir_resource_id TEXT,
  action           TEXT NOT NULL,            -- e.g. 'READ', 'LIST'
  ip_address       INET,
  user_agent       TEXT,
  status           TEXT NOT NULL DEFAULT 'success',  -- 'success' | 'denied' | 'error'
  error_message    TEXT,
  timestamp        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);