import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

interface JobBenchmarkRow {
  job_id: string;
  job_number: string | null;
  title: string;
  job_status: string;
  job_category: string | null;
  estimated_subtotal_cents: number;
  estimated_total_cents: number;
  estimated_labor_cents: number;
  estimated_material_cents: number;
  invoiced_total_cents: number;
  actual_labor_mins: number;
  actual_labor_hours: number;
  actual_material_cost_cents: number;
  estimated_hours_derived: number;
}

interface BenchmarkMetrics {
  jobId: string;
  jobNumber: string;
  title: string;
  status: string;
  estimatedTotalCents: number;
  invoicedTotalCents: number;
  estimatedHours: number;
  actualHours: number;
  laborRatio: number | null; // actual / estimated
  estimatedMaterialCents: number;
  actualMaterialCents: number;
  materialRatio: number | null; // actual / estimated
  totalVarianceCents: number;
  signedPercentErrorPct: number | null;
  absolutePercentErrorPct: number | null;
}

const DATABASE_URL =
  process.env.DATABASE_URL ||
  `postgresql://${process.env.POSTGRES_USER || 'ai_fsm'}:${process.env.POSTGRES_PASSWORD || 'ai_fsm_dev_password'}@${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || '5432'}/${process.env.POSTGRES_DB || 'ai_fsm'}`;

async function runBenchmark() {
  console.log('---------------------------------------------------------');
  console.log('   Dovetails AI-FSM: Estimate vs Actual Benchmark Runner');
  console.log('---------------------------------------------------------\n');

  const client = new Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    console.log('✓ Connected to PostgreSQL database.');

    // Query active & completed jobs with linked estimates, invoices, labor activities, and actual materials
    const query = `
      SELECT 
        j.id as job_id,
        j.job_number,
        j.title,
        j.status as job_status,
        j.job_category,
        COALESCE(e.subtotal_cents, 0) as estimated_subtotal_cents,
        COALESCE(e.total_cents, 0) as estimated_total_cents,
        COALESCE(
          NULLIF(e.internal_labor_cost_cents, 0), 
          (e.computed_result->'summary'->>'laborCents')::int, 
          eli.labor_cents, 
          0
        ) as estimated_labor_cents,
        COALESCE(
          NULLIF(e.internal_material_cost_cents, 0), 
          (e.computed_result->'summary'->>'materialCents')::int, 
          0
        ) as estimated_material_cents,
        COALESCE(inv.total_cents, 0) as invoiced_total_cents,
        COALESCE(act.total_labor_mins, 0) as actual_labor_mins,
        COALESCE(mat.total_mat_cost_cents, j.actual_cost_cents, 0) as actual_material_cost_cents
      FROM jobs j
      LEFT JOIN estimates e ON e.job_id = j.id OR j.materials_plan_seed_estimate_id = e.id
      LEFT JOIN (
        SELECT estimate_id, SUM(total_cents) as labor_cents
        FROM estimate_line_items
        WHERE line_item_type IS NULL OR line_item_type = 'labor'
        GROUP BY estimate_id
      ) eli ON eli.estimate_id = e.id
      LEFT JOIN (
        SELECT job_id, SUM(total_cents) as total_cents 
        FROM invoices 
        WHERE status NOT IN ('void', 'draft') OR status IS NULL
        GROUP BY job_id
      ) inv ON inv.job_id = j.id
      LEFT JOIN (
        SELECT 
          CASE ae.entity_type
            WHEN 'job' THEN ae.entity_id
            WHEN 'visit' THEN v.job_id
            WHEN 'work_order' THEN wt.job_id
          END as resolved_job_id,
          SUM(
            CASE 
              WHEN ae.ended_at IS NOT NULL AND ae.started_at IS NOT NULL 
              THEN EXTRACT(EPOCH FROM (ae.ended_at - ae.started_at))/60.0
              ELSE 0 
            END
          ) as total_labor_mins
        FROM activity_entries ae
        LEFT JOIN visits v ON ae.entity_type = 'visit' AND ae.entity_id = v.id
        LEFT JOIN work_orders wt ON ae.entity_type = 'work_order' AND ae.entity_id = wt.id
        WHERE ae.activity_type = 'job_work'
          AND ae.voided_at IS NULL
          AND ae.started_at IS NOT NULL
          AND ae.ended_at IS NOT NULL
          AND (ae.labor_bucket IS NULL OR ae.labor_bucket = 'billable')
          AND (ae.entity_type != 'visit' OR v.visit_type IS DISTINCT FROM 'site_visit')
        GROUP BY CASE ae.entity_type
          WHEN 'job' THEN ae.entity_id
          WHEN 'visit' THEN v.job_id
          WHEN 'work_order' THEN wt.job_id
        END
      ) act ON act.resolved_job_id = j.id
      LEFT JOIN (
        SELECT 
          job_id, 
          SUM(amount_cents) as total_mat_cost_cents
        FROM expenses
        WHERE category IN ('materials', 'supplies', 'parts')
        GROUP BY job_id
      ) mat ON mat.job_id = j.id
      WHERE j.status IN ('invoiced', 'completed', 'in_progress', 'scheduled', 'quoted')
      ORDER BY j.created_at DESC;
    `;

    const res = await client.query(query);
    const rows: JobBenchmarkRow[] = res.rows.map((row) => ({
      ...row,
      estimated_subtotal_cents: parseInt(row.estimated_subtotal_cents, 10),
      estimated_total_cents: parseInt(row.estimated_total_cents, 10),
      estimated_labor_cents: parseInt(row.estimated_labor_cents, 10),
      estimated_material_cents: parseInt(row.estimated_material_cents, 10),
      invoiced_total_cents: parseInt(row.invoiced_total_cents, 10),
      actual_labor_mins: parseFloat(row.actual_labor_mins),
      actual_labor_hours: Math.round((parseFloat(row.actual_labor_mins) / 60.0) * 10) / 10,
      actual_material_cost_cents: parseInt(row.actual_material_cost_cents, 10),
      // Derived estimated labor hours ($85/hr burdened baseline = 8500 cents/hr)
      estimated_hours_derived:
        parseInt(row.estimated_labor_cents, 10) > 0
          ? Math.round((parseInt(row.estimated_labor_cents, 10) / 8500) * 10) / 10
          : 0,
    }));

    console.log(`✓ Fetched ${rows.length} benchmark jobs from database.\n`);

    const metrics: BenchmarkMetrics[] = rows.map((r) => {
      const estimatedTotal = r.estimated_total_cents;
      const invoicedTotal = r.invoiced_total_cents;

      const laborRatio =
        r.estimated_hours_derived > 0 && r.actual_labor_hours > 0
          ? r.actual_labor_hours / r.estimated_hours_derived
          : null;
      const materialRatio =
        r.estimated_material_cents > 0 && r.actual_material_cost_cents > 0
          ? r.actual_material_cost_cents / r.estimated_material_cents
          : null;

      const totalVariance = invoicedTotal - estimatedTotal;
      const signedErr =
        estimatedTotal > 0 && invoicedTotal > 0
          ? ((estimatedTotal - invoicedTotal) / invoicedTotal) * 100.0
          : null;
      const absErr = signedErr !== null ? Math.abs(signedErr) : null;

      return {
        jobId: r.job_id,
        jobNumber: r.job_number || r.job_id.substring(0, 8),
        title: r.title,
        status: r.job_status,
        estimatedTotalCents: estimatedTotal,
        invoicedTotalCents: invoicedTotal,
        estimatedHours: r.estimated_hours_derived,
        actualHours: r.actual_labor_hours,
        laborRatio: laborRatio !== null ? Math.round(laborRatio * 100) / 100 : null,
        estimatedMaterialCents: r.estimated_material_cents,
        actualMaterialCents: r.actual_material_cost_cents,
        materialRatio: materialRatio !== null ? Math.round(materialRatio * 100) / 100 : null,
        totalVarianceCents: totalVariance,
        signedPercentErrorPct: signedErr !== null ? Math.round(signedErr * 10) / 10 : null,
        absolutePercentErrorPct: absErr !== null ? Math.round(absErr * 10) / 10 : null,
      };
    });

    // ── Compute Aggregate Benchmark Statistics ──────────────────────────────
    const completedJobs = metrics.filter((m) => ['invoiced', 'completed'].includes(m.status));
    const validLaborRatios = metrics.map((m) => m.laborRatio).filter((r): r is number => r !== null && r > 0);
    const validMaterialRatios = metrics.map((m) => m.materialRatio).filter((r): r is number => r !== null && r > 0);
    const validAbsErrors = metrics.map((m) => m.absolutePercentErrorPct).filter((e): e is number => e !== null);
    const validSignedErrors = metrics.map((m) => m.signedPercentErrorPct).filter((e): e is number => e !== null);

    const median = (arr: number[]) => {
      if (arr.length === 0) return 1.0;
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    const mean = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

    const medianLaborRatio = median(validLaborRatios);
    const medianMaterialRatio = median(validMaterialRatios);
    const mape = mean(validAbsErrors);
    const meanSignedError = mean(validSignedErrors);

    // Shrinkage Rate Calibration Formula:
    // SuggestedRateMultiplier = (PriorWeight * 1.0 + N * ObservedMedian) / (PriorWeight + N)
    const priorWeight = 5;
    const nLabor = validLaborRatios.length;
    const suggestedLaborMultiplier =
      nLabor > 0 ? (priorWeight * 1.0 + nLabor * medianLaborRatio) / (priorWeight + nLabor) : 1.0;

    const nMat = validMaterialRatios.length;
    const suggestedMaterialMultiplier =
      nMat > 0 ? (priorWeight * 1.0 + nMat * medianMaterialRatio) / (priorWeight + nMat) : 1.0;

    // ── Output Summary Table ────────────────────────────────────────────────
    console.log('========================================================================================');
    console.log('                      BENCHMARK RESULTS & CALIBRATION SUMMARY                           ');
    console.log('========================================================================================');
    console.log(`Total Active/Completed Jobs Evaluated : ${metrics.length}`);
    console.log(`Completed / Invoiced Jobs            : ${completedJobs.length}`);
    console.log(`Valid Labor Ratio Observations       : ${nLabor}`);
    console.log(`Valid Material Ratio Observations    : ${nMat}`);
    console.log('----------------------------------------------------------------------------------------');
    console.log(`Median Labor Ratio (Actual/Est)      : ${medianLaborRatio.toFixed(2)}x ${medianLaborRatio > 1.05 ? '(Under-estimating labor time)' : medianLaborRatio < 0.95 ? '(Over-estimating labor time)' : '(On target)'}`);
    console.log(`Median Material Ratio (Actual/Est)   : ${medianMaterialRatio.toFixed(2)}x ${medianMaterialRatio > 1.05 ? '(Under-estimating material cost)' : medianMaterialRatio < 0.95 ? '(Over-estimating material cost)' : '(On target)'}`);
    console.log(`Mean Absolute Percent Error (MAPE)   : ${mape.toFixed(1)}%`);
    console.log(`Mean Signed Error (Bias)             : ${meanSignedError.toFixed(1)}% ${meanSignedError > 0 ? '(Estimates tend higher than invoiced)' : '(Invoiced tends higher than estimated)'}`);
    console.log('----------------------------------------------------------------------------------------');
    console.log('CALIBRATION RECOMMENDATIONS (Shrinkage Formula, Prior Weight = 5):');
    console.log(`  • Suggested Labor Rate Multiplier    : ${suggestedLaborMultiplier.toFixed(3)}x (${suggestedLaborMultiplier > 1.0 ? '+' : ''}${((suggestedLaborMultiplier - 1) * 100).toFixed(1)}% adjustment)`);
    console.log(`  • Suggested Material Markup Adj      : ${suggestedMaterialMultiplier.toFixed(3)}x (${suggestedMaterialMultiplier > 1.0 ? '+' : ''}${((suggestedMaterialMultiplier - 1) * 100).toFixed(1)}% adjustment)`);
    console.log('========================================================================================\n');

    // ── Sample Job Table Output ──────────────────────────────────────────────
    console.log('SAMPLE BENCHMARK JOBS (FIRST 10):');
    console.table(
      metrics.slice(0, 10).map((m) => ({
        Job: m.jobNumber,
        Title: m.title.substring(0, 25),
        Status: m.status,
        'Est Total ($)': (m.estimatedTotalCents / 100).toFixed(2),
        'Inv Total ($)': (m.invoicedTotalCents / 100).toFixed(2),
        'Est Hrs': m.estimatedHours,
        'Act Hrs': m.actualHours,
        'Labor Ratio': m.laborRatio !== null ? `${m.laborRatio}x` : 'N/A',
      }))
    );

    // ── Generate Markdown Report ────────────────────────────────────────────
    const reportMd = `# Dovetails AI-FSM: Estimate vs Actual Benchmark Report

**Generated:** ${new Date().toISOString()}  

---

## Executive Summary

- **Total Jobs Evaluated:** ${metrics.length}
- **Completed & Invoiced Jobs:** ${completedJobs.length}
- **Median Labor Ratio ($Actual / Estimated$):** ${medianLaborRatio.toFixed(2)}x
- **Median Material Ratio ($Actual / Estimated$):** ${medianMaterialRatio.toFixed(2)}x
- **Mean Absolute Percentage Error (MAPE):** ${mape.toFixed(1)}%
- **Signed Bias:** ${meanSignedError.toFixed(1)}%

---

## Rate Calibration Recommendations

Using Bayesian shrinkage weighting ($\text{PriorWeight} = 5$):

| Dimension | Observed Median | Clean Samples | Suggested Multiplier | Recommended Policy Action |
|---|---|---|---|---|
| **Labor Production Rate** | ${medianLaborRatio.toFixed(2)}x | ${nLabor} | **${suggestedLaborMultiplier.toFixed(3)}x** | ${suggestedLaborMultiplier > 1.03 ? 'Increase estimated hours per sqft/unit slightly' : suggestedLaborMultiplier < 0.97 ? 'Reduce estimated hours per unit' : 'Maintain current baseline'} |
| **Material Cost Allowance** | ${medianMaterialRatio.toFixed(2)}x | ${nMat} | **${suggestedMaterialMultiplier.toFixed(3)}x** | ${suggestedMaterialMultiplier > 1.03 ? 'Increase material waste/pack buffer' : 'Maintain current 15% material handling'} |

---

## Job Benchmark Detail Table

| Job # | Title | Status | Est Total ($) | Inv Total ($) | Est Hrs | Act Hrs | Labor Ratio | Variance ($) |
|---|---|---|---|---|---|---|---|---|
${metrics
  .map(
    (m) =>
      `| ${m.jobNumber} | ${m.title.replace(/\|/g, '-')} | ${m.status} | $${(m.estimatedTotalCents / 100).toFixed(2)} | $${(m.invoicedTotalCents / 100).toFixed(2)} | ${m.estimatedHours} | ${m.actualHours} | ${m.laborRatio !== null ? `${m.laborRatio}x` : 'N/A'} | $${(m.totalVarianceCents / 100).toFixed(2)} |`
  )
  .join('\n')}

---

*Report generated automatically by \`scripts/run-estimate-benchmark.ts\` per TASK-095.*
`;

    const reportPath = path.join(__dirname, '../docs/generated/ESTIMATE_BENCHMARK_REPORT.md');
    fs.writeFileSync(reportPath, reportMd, 'utf8');
    console.log(`\n✓ Generated benchmark report saved to: docs/generated/ESTIMATE_BENCHMARK_REPORT.md`);

  } catch (err) {
    console.error('❌ Error executing benchmark script:', err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

runBenchmark();
