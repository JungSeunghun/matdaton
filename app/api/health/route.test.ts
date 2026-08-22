import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getStore: vi.fn(),
  listMetricEvents: vi.fn(),
}));

vi.mock("@/lib/store/store-factory", () => ({ getStore: mocks.getStore }));

import { GET } from "./route";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStore.mockReturnValue({ listMetricEvents: mocks.listMetricEvents });
    mocks.listMetricEvents.mockResolvedValue([]);
  });

  it("checks store accessibility and returns ok", async () => {
    const response = await GET();

    expect(mocks.getStore).toHaveBeenCalledOnce();
    expect(mocks.listMetricEvents).toHaveBeenCalledWith("__health__", "1970-01-01");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("returns unavailable without exposing store errors", async () => {
    mocks.listMetricEvents.mockRejectedValue(new Error("secret connection string"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ status: "unavailable" });
    expect(JSON.stringify(body)).not.toContain("secret connection string");
  });
});