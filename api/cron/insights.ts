import { proxyToMiniPc } from '../_lib/miniPcProxy.js';
import { isAuthorizedCronRequest } from "./oura-sync.js";
import { reconcileInsights } from "../_lib/insightsProjection.js";
export const maxDuration = 60;
export default async function handler(req: any, res: any) {
    if (await proxyToMiniPc(req, res, '/api/cron/insights')) return;
  if (req.method !== "GET" && req.method !== "POST")
    return res.status(405).json({ error: "method_not_allowed" });
  if (
    !isAuthorizedCronRequest(
      req.headers?.authorization,
      process.env.CRON_SECRET,
    )
  )
    return res.status(401).json({ error: "unauthorized" });
  try {
    const profileId =
      typeof req.query?.profileId === "string"
        ? req.query.profileId
        : undefined;
    const results = await reconcileInsights({
      profileId,
      budgetMs: 45_000,
      archiveDays: 20,
    });
    return res.status(200).json({ ok: true, results });
  } catch {
    return res.status(500).json({ error: "insights_reconciliation_failed" });
  }
}
