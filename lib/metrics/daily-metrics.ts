import type { MetricEvent } from "@/lib/contracts/schemas";

/** 수동 기준값: 해커톤 첫날 실측 평균 (PRD 2장) */
export const MANUAL_BASELINE_MINUTES = 30;

export type DailyMetrics = {
  date: string;
  startupSeconds: number | null;
  screensViewed: number;
  firstActionMinutes: number | null;
  savedMinutes: number | null;
};

function earliestAt(events: MetricEvent[], name: MetricEvent["name"]): number | null {
  const timestamps = events.filter((e) => e.name === name).map((e) => Date.parse(e.recordedAt));
  return timestamps.length > 0 ? Math.min(...timestamps) : null;
}

function earliestAtAfter(events: MetricEvent[], name: MetricEvent["name"], after: number): number | null {
  const timestamps = events
    .filter((e) => e.name === name)
    .map((e) => Date.parse(e.recordedAt))
    .filter((t) => t >= after);
  return timestamps.length > 0 ? Math.min(...timestamps) : null;
}

export function deriveDailyMetrics(events: MetricEvent[], date: string): DailyMetrics {
  const dayEvents = events.filter((e) => e.date === date);

  const buttonClickedAt = earliestAt(dayEvents, "button_clicked");
  const approvalCompletedAt =
    buttonClickedAt !== null ? earliestAtAfter(dayEvents, "approval_completed", buttonClickedAt) : null;
  const firstActionDoneAt =
    approvalCompletedAt !== null ? earliestAtAfter(dayEvents, "first_action_done", approvalCompletedAt) : null;

  const startupSeconds =
    buttonClickedAt !== null && approvalCompletedAt !== null
      ? Math.round((approvalCompletedAt - buttonClickedAt) / 1000)
      : null;

  const firstActionMinutes =
    approvalCompletedAt !== null && firstActionDoneAt !== null
      ? Math.round((firstActionDoneAt - approvalCompletedAt) / 60000)
      : null;

  const savedMinutes =
    startupSeconds !== null
      ? Math.round((MANUAL_BASELINE_MINUTES - startupSeconds / 60) * 10) / 10
      : null;

  return {
    date,
    startupSeconds,
    screensViewed: dayEvents.filter((e) => e.name === "screen_viewed").length,
    firstActionMinutes,
    savedMinutes,
  };
}
