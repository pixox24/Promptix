import { and, eq, isNull, sql } from 'drizzle-orm';
import { promptTemplates } from '../db/schema.js';

export function publiclyDiscoverableTemplate() {
  return and(
    eq(promptTemplates.status, 'published'),
    isNull(promptTemplates.deletedAt),
    sql`coalesce((
      select lifecycle_state
      from template_governance_state
      where template_id = ${promptTemplates.id}
    ), 'stable') <> 'exposure_limited'`,
  )!;
}
