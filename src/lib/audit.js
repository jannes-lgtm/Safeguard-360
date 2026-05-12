import { supabase } from './supabase'

export async function logAudit({ action, entity_type, entity_id, entity_org_id, description, metadata }) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return
    await fetch('/api/audit-log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action, entity_type, entity_id, entity_org_id, description, metadata }),
    })
  } catch {
    // never block the main action
  }
}
