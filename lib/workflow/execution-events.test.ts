import { describe, expect, it, vi } from "vitest";
import { createExecutionEventBus, getExecutionEventBus } from "./execution-events";

describe("createExecutionEventBus", () => {
  it("delivers events only to subscribers of the matching executionId", () => {
    const bus = createExecutionEventBus();
    const listenerA = vi.fn();
    const listenerB = vi.fn();
    bus.subscribe("exec_a", listenerA);
    bus.subscribe("exec_b", listenerB);

    bus.publish({ type: "stage_changed", executionId: "exec_a", stage: "scouting" });

    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerA).toHaveBeenCalledWith({ type: "stage_changed", executionId: "exec_a", stage: "scouting" });
    expect(listenerB).not.toHaveBeenCalled();
  });

  it("passes discriminated event payloads through to listeners", () => {
    const bus = createExecutionEventBus();
    const listener = vi.fn();
    bus.subscribe("exec_a", listener);

    bus.publish({ type: "tool_called", executionId: "exec_a", tool: "github.create_todo_issue", agent: "executor" });

    expect(listener).toHaveBeenCalledWith({
      type: "tool_called",
      executionId: "exec_a",
      tool: "github.create_todo_issue",
      agent: "executor",
    });
  });

  it("supports multiple subscribers on the same executionId", () => {
    const bus = createExecutionEventBus();
    const first = vi.fn();
    const second = vi.fn();
    bus.subscribe("exec_a", first);
    bus.subscribe("exec_a", second);

    bus.publish({ type: "stage_changed", executionId: "exec_a", stage: "verifying" });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("stops delivering after unsubscribe", () => {
    const bus = createExecutionEventBus();
    const listener = vi.fn();
    const unsubscribe = bus.subscribe("exec_a", listener);

    unsubscribe();
    bus.publish({ type: "stage_changed", executionId: "exec_a", stage: "scouting" });

    expect(listener).not.toHaveBeenCalled();
  });

  it("does not throw when publishing with no subscribers", () => {
    const bus = createExecutionEventBus();
    expect(() => bus.publish({ type: "stage_changed", executionId: "exec_none", stage: "scouting" })).not.toThrow();
  });
});

describe("getExecutionEventBus", () => {
  it("returns the same globalThis-cached singleton", () => {
    expect(getExecutionEventBus()).toBe(getExecutionEventBus());
  });
});
