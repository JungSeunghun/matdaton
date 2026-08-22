import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Execution, ExecutionProgressEvent } from "@/lib/contracts/schemas";

const {
  createWorkflowDepsMock,
  getExecutionMock,
  getSessionUserMock,
  subscribeExecutionEventsMock,
  unsubscribeMock,
} = vi.hoisted(() => ({
  createWorkflowDepsMock: vi.fn(),
  getExecutionMock: vi.fn(),
  getSessionUserMock: vi.fn(),
  subscribeExecutionEventsMock: vi.fn(),
  unsubscribeMock: vi.fn(),
}));

vi.mock("@/lib/api/session", () => ({
  getSessionUser: getSessionUserMock,
}));

vi.mock("@/lib/api/workflow-deps", () => ({
  createWorkflowDeps: createWorkflowDepsMock,
}));

vi.mock("@/lib/api/event-registry", () => ({
  subscribeExecutionEvents: subscribeExecutionEventsMock,
}));

import { dynamic, GET } from "./route";

const execution: Execution = {
  id: "exec_01",
  userId: "user_1",
  repoRef: "acme/repo",
  mode: "daily",
  status: "waiting_approval",
  startedAt: "2026-08-22T07:50:00.000Z",
  traceId: "trace_01",
};

const decoder = new TextDecoder();
let listener: ((event: ExecutionProgressEvent) => void) | undefined;

function requestStream(id = execution.id) {
  return GET(new Request(`http://localhost/api/executions/${id}/stream`), {
    params: Promise.resolve({ id }),
  });
}

async function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const result = await reader.read();
  return { ...result, text: result.value ? decoder.decode(result.value) : "" };
}

describe("GET /api/executions/:id/stream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listener = undefined;
    getSessionUserMock.mockResolvedValue({ userId: "user_1", login: "octocat" });
    getExecutionMock.mockResolvedValue(execution);
    createWorkflowDepsMock.mockReturnValue({ store: { getExecution: getExecutionMock } });
    subscribeExecutionEventsMock.mockImplementation(
      (_executionId: string, nextListener: (event: ExecutionProgressEvent) => void) => {
        listener = nextListener;
        return unsubscribeMock;
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the common 401 error before creating an SSE stream", async () => {
    getSessionUserMock.mockResolvedValue(null);

    const response = await requestStream();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "unauthorized", message: "인증이 필요합니다" },
    });
    expect(createWorkflowDepsMock).not.toHaveBeenCalled();
    expect(subscribeExecutionEventsMock).not.toHaveBeenCalled();
  });

  it("returns the common 404 error before creating an SSE stream", async () => {
    getExecutionMock.mockResolvedValue(null);

    const response = await requestStream("missing");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: "리소스를 찾을 수 없습니다" },
    });
    expect(getExecutionMock).toHaveBeenCalledWith("user_1", "missing");
    expect(subscribeExecutionEventsMock).not.toHaveBeenCalled();
  });

  it("sends the current stage first and then delivers live events", async () => {
    const response = await requestStream();
    const reader = response.body!.getReader();

    expect(dynamic).toBe("force-dynamic");
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(response.headers.get("Cache-Control")).toBe("no-cache, no-transform");
    expect(response.headers.get("Connection")).toBe("keep-alive");
    expect((await readChunk(reader)).text).toBe(
      'data: {"type":"stage_changed","executionId":"exec_01","stage":"waiting_approval"}\n\n',
    );

    listener?.({ type: "agent_started", executionId: "exec_01", agent: "executor" });

    expect((await readChunk(reader)).text).toBe(
      'data: {"type":"agent_started","executionId":"exec_01","agent":"executor"}\n\n',
    );
    await reader.cancel();
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  it("keeps waiting_approval open and sends a ping every 15 seconds", async () => {
    vi.useFakeTimers();
    const response = await requestStream();
    const reader = response.body!.getReader();
    await readChunk(reader);

    expect(unsubscribeMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(15_000);
    expect((await readChunk(reader)).text).toBe(": ping\n\n");
    expect(unsubscribeMock).not.toHaveBeenCalled();

    await reader.cancel();
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("closes and cleans up when a terminal live event arrives", async () => {
    vi.useFakeTimers();
    const response = await requestStream();
    const reader = response.body!.getReader();
    await readChunk(reader);

    listener?.({ type: "stage_changed", executionId: "exec_01", stage: "completed" });

    expect((await readChunk(reader)).text).toContain('"stage":"completed"');
    expect((await readChunk(reader)).done).toBe(true);
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("sends an initially terminal stage and closes immediately", async () => {
    getExecutionMock.mockResolvedValue({ ...execution, status: "failed" });

    const response = await requestStream();
    const reader = response.body!.getReader();

    expect((await readChunk(reader)).text).toContain('"stage":"failed"');
    expect((await readChunk(reader)).done).toBe(true);
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  it("preserves initial-first ordering and cleanup when subscribe publishes synchronously", async () => {
    subscribeExecutionEventsMock.mockImplementation(
      (_executionId: string, nextListener: (event: ExecutionProgressEvent) => void) => {
        listener = nextListener;
        nextListener({ type: "stage_changed", executionId: "exec_01", stage: "rejected" });
        return unsubscribeMock;
      },
    );

    const response = await requestStream();
    const reader = response.body!.getReader();

    expect((await readChunk(reader)).text).toContain('"stage":"waiting_approval"');
    expect((await readChunk(reader)).text).toContain('"stage":"rejected"');
    expect((await readChunk(reader)).done).toBe(true);
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });
});