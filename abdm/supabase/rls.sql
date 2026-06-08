-- 007_rls.sql

ALTER TABLE public.users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctors         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospitals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consents        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abha_registry   ENABLE ROW LEVEL SECURITY;

-- Users: can only see/edit their own row
CREATE POLICY users_self ON public.users
  FOR ALL USING (user_id = auth.uid());

-- Patients: own row only
CREATE POLICY patients_self ON public.patients
  FOR ALL USING (user_id = auth.uid());

-- Consents: patient sees their own; requester sees ones they made
CREATE POLICY consents_patient ON public.consents
  FOR SELECT USING (
    patient_id IN (SELECT patient_id FROM public.patients WHERE user_id = auth.uid())
  );

CREATE POLICY consents_requester ON public.consents
  FOR SELECT USING (requester_id = auth.uid());

-- Patients can update (approve/revoke) their own consents
CREATE POLICY consents_patient_update ON public.consents
  FOR UPDATE USING (
    patient_id IN (SELECT patient_id FROM public.patients WHERE user_id = auth.uid())
  );

-- Doctors/hospitals can insert consent requests
CREATE POLICY consent_req_insert ON public.consent_requests
  FOR INSERT WITH CHECK (requester_id = auth.uid());

CREATE POLICY consent_req_view_own ON public.consent_requests
  FOR SELECT USING (requester_id = auth.uid());

-- Audit logs: only own records (patients see logs about them; doctors see their own)
CREATE POLICY audit_accessed_by ON public.audit_logs
  FOR SELECT USING (accessed_by = auth.uid());

CREATE POLICY audit_patient_view ON public.audit_logs
  FOR SELECT USING (
    patient_id IN (SELECT patient_id FROM public.patients WHERE user_id = auth.uid())
  );

-- NOTE: All INSERT to audit_logs should go through a service_role API route,
-- not directly from the client. Add a blanket deny for anon/authenticated inserts:
CREATE POLICY audit_no_client_insert ON public.audit_logs
  FOR INSERT WITH CHECK (FALSE);  -- only service_role bypasses RLS