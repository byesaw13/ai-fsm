import type { PoolClient } from "pg";

export async function validateWorkOrderForeignKeys(
  client: PoolClient,
  accountId: string,
  refs: {
    client_id: string;
    job_id?: string | null;
    property_id?: string | null;
    source_visit_id?: string | null;
    source_assessment_id?: string | null;
  },
): Promise<string | null> {
  const cli = await client.query(
    `SELECT id FROM clients WHERE id = $1 AND account_id = $2`,
    [refs.client_id, accountId],
  );
  if (cli.rowCount === 0) return "Unknown client";

  if (refs.job_id) {
    const job = await client.query(
      `SELECT id, client_id FROM jobs WHERE id = $1 AND account_id = $2`,
      [refs.job_id, accountId],
    );
    if (job.rowCount === 0) return "Unknown project";
    if (job.rows[0].client_id !== refs.client_id) return "Project does not belong to this customer";
  }

  if (refs.property_id) {
    const prop = await client.query(
      `SELECT id, client_id FROM properties WHERE id = $1 AND account_id = $2`,
      [refs.property_id, accountId],
    );
    if (prop.rowCount === 0) return "Unknown property";
    if (prop.rows[0].client_id !== refs.client_id) return "Property does not belong to this customer";
  }

  if (refs.source_visit_id) {
    const visit = await client.query(
      `SELECT id FROM visits WHERE id = $1 AND account_id = $2`,
      [refs.source_visit_id, accountId],
    );
    if (visit.rowCount === 0) return "Unknown source visit";
  }

  if (refs.source_assessment_id) {
    const assessment = await client.query(
      `SELECT id FROM site_visit_assessments WHERE id = $1 AND account_id = $2`,
      [refs.source_assessment_id, accountId],
    );
    if (assessment.rowCount === 0) return "Unknown source assessment";
  }

  return null;
}

/** Assessment-path work orders must stay draft until estimate acceptance. */
export function enforceDraftOnlyFromAssessment(input: {
  status: string;
  job_id?: string | null;
  source_visit_id?: string | null;
  source_assessment_id?: string | null;
}): string | null {
  const fromAssessment = !!(input.source_visit_id || input.source_assessment_id);
  if (fromAssessment && !input.job_id && input.status !== "draft") {
    return "Assessment work orders must remain draft until the estimate is accepted";
  }
  if (!input.job_id && input.status !== "draft") {
    return "Work orders without a project must remain draft";
  }
  return null;
}