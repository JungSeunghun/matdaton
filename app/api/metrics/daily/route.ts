import { badRequest, unauthorized } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/api/session";
import { createWorkflowDeps } from "@/lib/api/workflow-deps";
import { deriveDailyMetrics } from "@/lib/metrics/daily-metrics";

const DEFAULT_DAYS = 7;
const MAX_DAYS = 90;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function parseDays(request: Request): number | null {
  const value = new URL(request.url).searchParams.get("days");
  if (value === null) return DEFAULT_DAYS;
  if (!/^[1-9]\d*$/.test(value)) return null;

  const days = Number(value);
  return days <= MAX_DAYS ? days : null;
}

function recentUtcDates(days: number): string[] {
  const today = new Date(Date.now());
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());

  return Array.from({ length: days }, (_, index) => {
    const daysAgo = days - index - 1;
    return new Date(todayUtc - daysAgo * MILLISECONDS_PER_DAY).toISOString().slice(0, 10);
  });
}

export async function GET(request: Request): Promise<Response> {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  const days = parseDays(request);
  if (days === null) return badRequest(`days는 1 이상 ${MAX_DAYS} 이하의 정수여야 합니다`);

  const events = await createWorkflowDeps().store.listMetricEvents(user.userId);
  const metrics = recentUtcDates(days).map((date) => deriveDailyMetrics(events, date));
  return Response.json(metrics);
}
