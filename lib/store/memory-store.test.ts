import { describe, expect, it } from "vitest";
import type { Execution } from "@/lib/contracts/schemas";
import { createMemoryStore } from "./memory-store";

function makeExecution(overrides: Partial<Execution> = {}): Execution {
  return {
    id: "exec_01",
    userId: "user_1",
    repoRef: "acme/repo",
    mode: "daily",
    status: "created",
    startedAt: "2026-08-22T07:50:00.000Z",
    traceId: "trace_01",
    ...overrides,
  };
}

describe("createMemoryStore", () => {
  it("creates and reads an execution scoped by userId", async () => {
    const store = createMemoryStore();
    await store.createExecution(makeExecution());
    expect(await store.getExecution("user_1", "exec_01")).toMatchObject({ id: "exec_01" });
    expect(await store.getExecution("user_2", "exec_01")).toBeNull();
  });

  it("rejects duplicate execution ids", async () => {
    const store = createMemoryStore();
    await store.createExecution(makeExecution());
    await expect(store.createExecution(makeExecution())).rejects.toThrow(/already exists/i);
  });

  it("applies a patch with updateExecution", async () => {
    const store = createMemoryStore();
    await store.createExecution(makeExecution());
    await store.updateExecution("user_1", "exec_01", { status: "scouting" });
    expect((await store.getExecution("user_1", "exec_01"))?.status).toBe("scouting");
  });

  it("transitions status conditionally and refuses illegal transitions", async () => {
    const store = createMemoryStore();
    await store.createExecution(makeExecution());

    expect(await store.transitionStatus("user_1", "exec_01", "created", "scouting")).toBe(true);
    // 이미 scouting이므로 created 조건 불일치 — 경쟁 상태 방지
    expect(await store.transitionStatus("user_1", "exec_01", "created", "scouting")).toBe(false);
    // 상태 기계상 불법 전이
    expect(await store.transitionStatus("user_1", "exec_01", "scouting", "executing")).toBe(false);
  });

  it("appends and lists metric events by user and date", async () => {
    const store = createMemoryStore();
    const event = {
      id: "evt_1",
      userId: "user_1",
      executionId: "exec_01",
      date: "2026-08-22",
      name: "button_clicked" as const,
      value: 1,
      source: "client",
      recordedAt: "2026-08-22T07:50:00.000Z",
    };
    await store.appendMetricEvent(event);
    await store.appendMetricEvent({ ...event, id: "evt_2", date: "2026-08-21" });

    expect(await store.listMetricEvents("user_1", "2026-08-22")).toHaveLength(1);
    expect(await store.listMetricEvents("user_1")).toHaveLength(2);
    expect(await store.listMetricEvents("user_2")).toHaveLength(0);
  });

  it("saves and reads a comment draft by idempotency key", async () => {
    const store = createMemoryStore();
    const draft = {
      id: "exec_01:node_draft_1",
      userId: "user_1",
      executionId: "exec_01",
      nodeId: "node_draft_1",
      issueNumber: 3,
      body: "확인했습니다",
      savedAt: "2026-08-22T07:52:00.000Z",
    };
    await store.saveCommentDraft(draft);
    expect(await store.getCommentDraft("exec_01:node_draft_1")).toEqual(draft);
    expect(await store.getCommentDraft("missing")).toBeNull();
  });
});
