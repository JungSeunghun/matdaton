import { describe, expect, it, vi } from "vitest";
import { createExecutionEventBus, getExecutionEventBus } from "./execution-events";

describe("createExecutionEventBus", () => {
  it("delivers events only to subscribers of the matching executionId", () => {
    const bus = createExecutionEventBus();
    const listenerA = vi.fn();
    const listenerB = vi.fn();
    bus.subscribe("exec_a", listenerA);
    bus.subscribe("exec_b", listenerB);

    bus.publish({ executionId: "exec_a", stage: "scouting" });

    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerA).toHaveBeenCalledWith({ executionId: "exec_a", stage: "scouting" });
    expect(listenerB).not.toHaveBeenCalled();
  });

  it("passes detail through to listeners", () => {
    const bus = createExecutionEventBus();
    const listener = vi.fn();
    bus.subscribe("exec_a", listener);

    bus.publish({ executionId: "exec_a", stage: "compiling", detail: { progress: 0.5 } });

    expect(listener).toHaveBeenCalledWith({
      executionId: "exec_a",
      stage: "compiling",
      detail: { progress: 0.5 },
    });
  });

  it("supports multiple subscribers on the same executionId", () => {
    const bus = createExecutionEventBus();
    const first = vi.fn();
    const second = vi.fn();
    bus.subscribe("exec_a", first);
    bus.subscribe("exec_a", second);

    bus.publish({ executionId: "exec_a", stage: "verifying" });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("stops delivering after unsubscribe", () => {
    const bus = createExecutionEventBus();
    const listener = vi.fn();
    const unsubscribe = bus.subscribe("exec_a", listener);

    unsubscribe();
    bus.publish({ executionId: "exec_a", stage: "scouting" });

    expect(listener).not.toHaveBeenCalled();
  });

  it("does not throw when publishing with no subscribers", () => {
    const bus = createExecutionEventBus();
    expect(() => bus.publish({ executionId: "exec_none", stage: "scouting" })).not.toThrow();
  });
});

describe("getExecutionEventBus", () => {
  it("returns the same globalThis-cached singleton", () => {
    expect(getExecutionEventBus()).toBe(getExecutionEventBus());
  });
});
