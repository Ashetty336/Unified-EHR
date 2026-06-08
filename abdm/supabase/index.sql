-- 005_indexes.sql

-- Fast patient lookup by ABHA
CREATE INDEX idx_patients_abha_number    ON public.patients(abha_number);
CREATE INDEX idx_abha_registry_number    ON public.abha_registry(abha_number);
CREATE INDEX idx_abha_registry_patient   ON public.abha_registry(patient_id);

-- Consent lookups
CREATE INDEX idx_consents_patient_id     ON public.consents(patient_id);
CREATE INDEX idx_consents_requester_id   ON public.consents(requester_id);
CREATE INDEX idx_consents_status         ON public.consents(status);
CREATE INDEX idx_consents_expires_at     ON public.consents(expires_at);

-- Consent request lookups
CREATE INDEX idx_consent_req_requester   ON public.consent_requests(requester_id);
CREATE INDEX idx_consent_req_abha        ON public.consent_requests(abha_number);
CREATE INDEX idx_consent_req_status      ON public.consent_requests(status);

-- Audit log lookups
CREATE INDEX idx_audit_patient           ON public.audit_logs(patient_id);
CREATE INDEX idx_audit_accessed_by       ON public.audit_logs(accessed_by);
CREATE INDEX idx_audit_consent_id        ON public.audit_logs(consent_id);
CREATE INDEX idx_audit_timestamp         ON public.audit_logs(timestamp DESC);

-- Doctor hospital lookup
CREATE INDEX idx_doctors_hospital_id     ON public.doctors(hospital_id);