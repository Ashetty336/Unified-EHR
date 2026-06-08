import { adminClient } from '@/lib/supabase/admin'

type AuditAction =
  | 'fhir_read'
  | 'fhir_upload'
  | 'consent_granted'
  | 'consent_revoked'
  | 'consent_expired'

type AuditEntry = {
  accessed_by: string
  accessor_role: 'patient' | 'doctor' | 'hospital' | 'admin'
  patient_id: string
  action: AuditAction
  resource_type: string
  fhir_resource_id?: string
  consent_id?: string
  ip_address?: string
  user_agent?: string
  status?: 'success' | 'denied' | 'error'
  error_message?: string
}

// Insert audit log via service_role (RLS blocks client inserts).
// Fire-and-forget — callers should not await unless they need confirmation.
export async function auditLog(entry: AuditEntry): Promise<void> {
  const { error } = await adminClient.from('audit_logs').insert({
    accessed_by: entry.accessed_by,
    accessor_role: entry.accessor_role,
    patient_id: entry.patient_id,
    action: entry.action,
    resource_type: entry.resource_type,
    fhir_resource_id: entry.fhir_resource_id ?? null,
    consent_id: entry.consent_id ?? null,
    ip_address: entry.ip_address ?? null,
    user_agent: entry.user_agent ?? null,
    status: entry.status ?? 'success',
    error_message: entry.error_message ?? null,
  })

  if (error) {
    // Log to stderr but don't throw — audit failure must not block data access
    console.error('[audit] insert failed:', error.message)
  }
}
