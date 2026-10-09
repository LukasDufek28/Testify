export async function cleanup(sql) {
  await sql.transaction([
    sql`DELETE FROM testify_candle_cache WHERE expires_at<now()`,
    sql`DELETE FROM testify_candle_leases WHERE expires_at<now()`,
    sql`UPDATE testify_mcp_jobs SET status=CASE WHEN cancel_requested THEN 'cancelled' ELSE 'failed' END,errors='[{"error":"Job checkpoint expired after 24 hours without progress. Resubmit the original period."}]'::jsonb,updated_at=now() WHERE status IN('queued','loading','running','waiting_retry') AND updated_at<now()-interval '24 hours'`,
    sql`DELETE FROM testify_mcp_pages WHERE expires_at<now() OR job_id IN(SELECT id FROM testify_mcp_jobs WHERE status IN('completed','partial','failed','cancelled'))`,
    sql`DELETE FROM testify_mcp_codes WHERE expires_at<now()`,
    sql`DELETE FROM testify_mcp_requests WHERE expires_at<now()`,
    sql`DELETE FROM testify_mcp_tokens WHERE expires_at<now()`,
    sql`DELETE FROM testify_mcp_approvals WHERE expires_at<now()`,
    sql`DELETE FROM testify_mcp_events WHERE created_at<now()-interval '30 days'`,
  ]);
}
