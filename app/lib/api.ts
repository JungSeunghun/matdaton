// API 클라이언트 — /api/health 로 실제 백엔드 존재 여부를 감지해
// 있으면 TRD §4 실제 엔드포인트를, 없으면 클라이언트 mock 엔진을 사용한다.

import { ExecutionProgressEventSchema, ExecutionSchema, type Execution } from "@/lib/contracts/schemas";
import { approveMock, createMockExecution, metricsFixture, retryMock, subscribeMock } from "./mock";
import type { DailyMetric, StreamEvent } from "./types";

let modePromise: Promise<"real" | "mock"> | null = null;

function backend(): Promise<"real" | "mock"> {
  if (!modePromise) {
    modePromise = (async () => {
      try {
        const r = await fetch("/api/health", { signal: AbortSignal.timeout(1500) });
        return r.ok ? "real" : "mock";
      } catch {
        return "mock";
      }
    })();
  }
  return modePromise;
}

export async function isMockMode(): Promise<boolean> {
  return (await backend()) === "mock";
}

export async function startDaily(input: { repoRef: string; icsUrl?: string }): Promise<string> {
  if ((await backend()) === "real") {
    const r = await fetch("/api/executions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!r.ok) throw new Error(`실행 생성 실패 (${r.status})`);
    const j = await r.json();
    return j.executionId ?? j.id;
  }
  return createMockExecution({ mode: "daily", repoRef: input.repoRef }).id;
}

export async function startJudge(repoUrl: string): Promise<string> {
  const repoRef = repoUrl.replace(/^https?:\/\/github\.com\//, "").replace(/\/+$/, "");
  if ((await backend()) === "real") {
    const r = await fetch("/api/judge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoUrl }),
    });
    if (!r.ok) throw new Error(`즉석 실행 생성 실패 (${r.status})`);
    const j = await r.json();
    return j.executionId ?? j.id;
  }
  return createMockExecution({ mode: "judge", repoRef }).id;
}

export function subscribeStream(id: string, onEvent: (e: StreamEvent) => void): () => void {
  let cleanup: () => void = () => {};
  let cancelled = false;
  void backend().then((m) => {
    if (cancelled) return;
    if (m === "real") {
      const es = new EventSource(`/api/executions/${id}/stream`);
      es.onmessage = (e) => {
        const parsed = ExecutionProgressEventSchema.safeParse(JSON.parse(e.data));
        if (parsed.success) onEvent(parsed.data);
        else console.warn("SSE 이벤트가 계약 스키마와 불일치:", parsed.error.issues, e.data);
      };
      es.onerror = () => {
        es.close();
        // 서버가 스트림을 닫아도 onerror로 온다 — 정상 종료 여부는 수신측이 현재 상태로 판단
        onEvent({ type: "stream_error", executionId: id, message: "진행 스트림 연결이 종료되었습니다.", at: new Date().toISOString() });
      };
      cleanup = () => es.close();
    } else {
      cleanup = subscribeMock(id, onEvent);
    }
  });
  return () => {
    cancelled = true;
    cleanup();
  };
}

/** 승인 — 성공 시 갱신된 Execution 스냅샷을 반환 (스트림이 끊긴 환경 대비) */
export async function approve(id: string, approvedNodeIds: string[], startupSeconds: number): Promise<Execution | null> {
  if ((await backend()) === "real") {
    const r = await fetch(`/api/executions/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvedNodeIds, startupSeconds }),
    });
    if (!r.ok) throw new Error(r.status === 403 ? "승인 토큰이 만료되었거나 계약이 변경되었습니다." : `승인 실패 (${r.status})`);
    const parsed = ExecutionSchema.safeParse(await r.json());
    return parsed.success ? parsed.data : null;
  }
  void approveMock(id, approvedNodeIds, startupSeconds);
  return null;
}

export async function retryNode(id: string, nodeId: string): Promise<Execution | null> {
  if ((await backend()) === "real") {
    const r = await fetch(`/api/executions/${id}/retry/${nodeId}`, { method: "POST" });
    if (!r.ok) throw new Error(`재시도 실패 (${r.status})`);
    const parsed = ExecutionSchema.safeParse(await r.json());
    return parsed.success ? parsed.data : null;
  }
  void retryMock(id, nodeId);
  return null;
}

export async function getDailyMetrics(): Promise<DailyMetric[]> {
  if ((await backend()) === "real") {
    const r = await fetch("/api/metrics/daily");
    if (r.ok) return (await r.json()) as DailyMetric[];
  }
  return metricsFixture();
}
