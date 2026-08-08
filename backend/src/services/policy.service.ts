import { query } from '../db/pool.js';
import { notFound } from '../lib/errors.js';
import type { ServicePoliciesRow } from '../types.js';

export async function getPolicies(): Promise<ServicePoliciesRow> {
  const { rows } = await query<ServicePoliciesRow>('SELECT * FROM service_policies LIMIT 1');
  if (!rows[0]) throw notFound('Service policies not initialized — run migrations');
  return rows[0];
}

export interface UpdatePoliciesInput {
  terms_of_service?: string;
  privacy_policy?: string;
  service_policy?: string;
}

export async function updatePolicies(input: UpdatePoliciesInput): Promise<ServicePoliciesRow> {
  const current = await getPolicies();
  const merged = { ...current, ...input };
  const { rows } = await query<ServicePoliciesRow>(
    `UPDATE service_policies SET
        terms_of_service = $1,
        privacy_policy = $2,
        service_policy = $3,
        updated_at = NOW()
     WHERE id = $4
     RETURNING *`,
    [merged.terms_of_service, merged.privacy_policy, merged.service_policy, current.id],
  );
  return rows[0];
}
