import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MetricEvent } from "@/lib/contracts/schemas";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  createWorkflowDeps: vi.fn(),
  listMetricEvents: vi.fn(),
}));

vi.mock("@/lib/api/session", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("@/lib/api/workflow-deps", () => ({ createWorkflowDeps: mocks.createWorkflowDeps }));

import { GET } from "./route";

function request(days?: string): Request {
  const url = new URL("http://localhost/api/metrics/daily");
  if (days !== undefined) url.searchParams.set("days", days);
  return new Request(url);
}

function metricEvent(
  id: string,
  date: string,
  name: MetricEvent["name"],
  recordedAt: string,
): MetricEvent {
  return {
    id,
    userId: "user_1",
    executionId: "exec_1",
    date,
    name,
    value: 1,
    source: "test",
    recordedAt,
  };
}

describe("GET /api/metrics/daily", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-08-22T15:30:00.000Z"));
    mocks.getSessionUser.mockResolvedValue({ userId: "user_1", login: "octocat" });
    mocks.createWorkflowDeps.mockReturnValue({ store: { listMetricEvents: mocks.listMetricEvents } });
    mocks.listMetricEvents.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns derived metrics from oldest UTC date through today", async () => {
    mocks.listMetricEvents.mockResolvedValue([
      metricEvent("event_1", "2026-08-20", "button_clicked", "2026-08-20T08:00:00.000Z"),
      metricEvent("event_2", "2026-08-20", "approval_completed", "2026-08-20T08:01:30.000Z"),
      metricEvent("event_3", "2026-08-20", "first_action_done", "2026-08-20T08:06:30.000Z"),
      metricEvent("event_4", "2026-08-20", "screen_viewed", "2026-08-20T08:00:10.000Z"),
      metricEvent("event_5", "2026-08-20", "screen_viewed", "2026-08-20T08:00:20.000Z"),
      metricEvent("event_6", "2026-08-22", "screen_viewed", "2026-08-22T10:00:00.000Z"),
    ]);

    const response = await GET(request("3"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      {
        date: "2026-08-20",
        startupSeconds: 90,
        screensViewed: 2,
        firstActionMinutes: 5,
        savedMinutes: 28.5,
      },
      {
        date: "2026-08-21",
        startupSeconds: null,
        screensViewed: 0,
        firstActionMinutes: null,
        savedMinutes: null,
      },
      {
        date: "2026-08-22",
        startupSeconds: null,
        screensViewed: 1,
        firstActionMinutes: null,
        savedMinutes: null,
      },
    ]);
    expect(mocks.listMetricEvents).toHaveBeenCalledOnce();
    expect(mocks.listMetricEvents).toHaveBeenCalledWith("user_1");
  });

  it("defaults to the most recent seven UTC dates", async () => {
    const response = await GET(request());
    const metrics = await response.json();

    expect(response.status).toBe(200);
    expect(metrics).toHaveLength(7);
    expect(metrics.map((metric: { date: string }) => metric.date)).toEqual([
      "2026-08-16",
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
    ]);
  });

  it.each(["0", "-1", "1.5", "abc", "91", " 7"])("returns 400 for invalid days=%s", async (days) => {
    const response = await GET(request(days));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "bad_request" } });
    expect(mocks.createWorkflowDeps).not.toHaveBeenCalled();
  });

  it("returns 401 without a session", async () => {
    mocks.getSessionUser.mockResolvedValue(null);

    const response = await GET(request("7"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "unauthorized" } });
    expect(mocks.createWorkflowDeps).not.toHaveBeenCalled();
  });
});