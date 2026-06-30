export interface AutomationRow {
  id: string;
  account_id: string;
  type: string;
  config: Record<string, unknown>;
  enabled: boolean;
  next_run_at: string;
}

export interface RunResult {
  automationId: string;
  accountId: string;
  sent: number;
  skipped: number;
  errors: number;
}