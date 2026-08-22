import { describe, expect, it, vi } from "vitest";
import { createTelemetry, type TelemetryClientLike } from "./telemetry";

function makeFakeClient(): TelemetryClientLike {
  return {
    trackEvent: vi.fn(),
    trackException: vi.fn(),
    flush: vi.fn(),
  };
}

describe("createTelemetry", () => {
  it("연결 문자열이 없으면 no-op 텔레메트리를 반환하고 클라이언트를 만들지 않는다", () => {
    const factory = vi.fn();
    const telemetry = createTelemetry({ connectionString: null, clientFactory: factory });

    expect(telemetry.enabled).toBe(false);
    expect(factory).not.toHaveBeenCalled();
    expect(() => {
      telemetry.trackEvent("agent_started", "exec_1");
      telemetry.trackException(new Error("boom"), "exec_1");
      telemetry.flush();
    }).not.toThrow();
  });

  it("trackEvent는 executionId를 operation id 태그와 속성으로 전파한다", () => {
    const client = makeFakeClient();
    const telemetry = createTelemetry({
      connectionString: "InstrumentationKey=test",
      clientFactory: () => client,
    });

    telemetry.trackEvent("tool_called", "exec_42", { tool: "github.create_todo_issue" });

    expect(telemetry.enabled).toBe(true);
    expect(client.trackEvent).toHaveBeenCalledWith({
      name: "tool_called",
      properties: { executionId: "exec_42", tool: "github.create_todo_issue" },
      tagOverrides: { "ai.operation.id": "exec_42" },
    });
  });

  it("trackException은 executionId를 operation id 태그로 전파한다", () => {
    const client = makeFakeClient();
    const telemetry = createTelemetry({
      connectionString: "InstrumentationKey=test",
      clientFactory: () => client,
    });
    const error = new Error("scout timeout");

    telemetry.trackException(error, "exec_7");

    expect(client.trackException).toHaveBeenCalledWith({
      exception: error,
      properties: { executionId: "exec_7" },
      tagOverrides: { "ai.operation.id": "exec_7" },
    });
  });

  it("flush는 클라이언트 flush로 위임한다", () => {
    const client = makeFakeClient();
    const telemetry = createTelemetry({
      connectionString: "InstrumentationKey=test",
      clientFactory: () => client,
    });

    telemetry.flush();

    expect(client.flush).toHaveBeenCalledOnce();
  });
});
