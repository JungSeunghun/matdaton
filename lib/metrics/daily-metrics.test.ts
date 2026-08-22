import { describe, expect, it } from "vitest";
import type { MetricEvent } from "@/lib/contracts/schemas";
import { deriveDailyMetrics } from "./daily-metrics";

function makeEvent(overrides: Partial<MetricEvent>): MetricEvent {
  return {
    id: "evt_1",
    userId: "user_1",
    executionId: "exec_01",
    date: "2026-08-22",
    name: "button_clicked",
    value: 1,
    source: "client",
    recordedAt: "2026-08-22T07:50:00.000Z",
    ...overrides,
  };
}

describe("deriveDailyMetrics", () => {
  const events: MetricEvent[] = [
    makeEvent({ id: "e1", name: "button_clicked", recordedAt: "2026-08-22T07:50:00.000Z" }),
    makeEvent({ id: "e2", name: "screen_viewed", recordedAt: "2026-08-22T07:50:10.000Z" }),
    makeEvent({ id: "e3", name: "approval_completed", recordedAt: "2026-08-22T07:51:24.000Z" }),
    makeEvent({ id: "e4", name: "first_action_done", recordedAt: "2026-08-22T07:55:24.000Z" }),
  ];

  it("computes startup_seconds from button_clicked to approval_completed", () => {
    expect(deriveDailyMetrics(events, "2026-08-22").startupSeconds).toBe(84);
  });

  it("computes screens_viewed as the count of screen_viewed events", () => {
    expect(deriveDailyMetrics(events, "2026-08-22").screensViewed).toBe(1);
  });

  it("computes first_action_minutes from approval_completed to first_action_done", () => {
    expect(deriveDailyMetrics(events, "2026-08-22").firstActionMinutes).toBe(4);
  });

  it("computes saved_minutes against the 30-minute manual baseline", () => {
    expect(deriveDailyMetrics(events, "2026-08-22").savedMinutes).toBe(28.6);
  });

  it("returns nulls when the day has no matching events", () => {
    const metrics = deriveDailyMetrics([], "2026-08-22");
    expect(metrics).toEqual({
      date: "2026-08-22",
      startupSeconds: null,
      screensViewed: 0,
      firstActionMinutes: null,
      savedMinutes: null,
    });
  });

  it("ignores events from other dates", () => {
    const other = events.map((e) => ({ ...e, date: "2026-08-21" }));
    expect(deriveDailyMetrics(other, "2026-08-22").startupSeconds).toBeNull();
  });

  it("uses the earliest button_clicked and the latest matching approval per execution", () => {
    const doubled = [
      ...events,
      makeEvent({ id: "e5", name: "button_clicked", recordedAt: "2026-08-22T07:49:00.000Z" }),
    ];
    expect(deriveDailyMetrics(doubled, "2026-08-22").startupSeconds).toBe(144);
  });
});
