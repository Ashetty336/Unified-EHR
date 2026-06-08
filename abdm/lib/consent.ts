import { adminClient } from '@/lib/supabase/admin'

export type ConsentCheckResult =
  | { valid: true; consent_id: string; access_type: string; resource_scope: string[] }
  | { valid: false; reason: string }

// Validate that requester has active, non-expired, non-revoked consent for patient.
// Optionally check that a specific FHIR resource_type is in scope.
export async function validateConsent(
  requester_id: string,
  patient_id: string,
  resource_type?: string
): Promise<ConsentCheckResult> {
  const now = new Date().toISOString()

  const { data: consent, error } = await adminClient
    .from('consents')
    .select('consent_id, status, access_type, resource_scope, expires_at')
    .eq('requester_id', requester_id)
    .eq('patient_id', patient_id)
    .eq('status', 'approved')
    .order('granted_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !consent) {
    return { valid: false, reason: 'no approved consent found' }
  }

  // Check expiry inline (belt-and-suspenders alongside the cron job)
  if (consent.expires_at && consent.expires_at < now) {
    // Mark expired in DB asynchronously — don't block the request
    adminClient
      .from('consents')
      .update({ status: 'expired' })
      .eq('consent_id', consent.consent_id)
      .then(() => {})

    return { valid: false, reason: 'consent expired' }
  }

  // Resource scope check
  if (resource_type && consent.access_type === 'resource_level') {
    const scope: string[] = consent.resource_scope ?? []
    if (!scope.includes(resource_type)) {
      return { valid: false, reason: `resource ${resource_type} not in consent scope` }
    }
  }

  return {
    valid: true,
    consent_id: consent.consent_id,
    access_type: consent.access_type,
    resource_scope: consent.resource_scope ?? [],
  }
}
