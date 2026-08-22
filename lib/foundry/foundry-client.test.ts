import { describe, expect, it, vi } from "vitest";
import type { ExecutionContract, OvernightDiff } from "@/lib/contracts/schemas";
import { createFoundryClient } from "./foundry-client";

const validDiff: OvernightDiff = {
  commits: [
    {
      sha: "abc123",
      message: "fix: 파서 버그 수정",
      author: "hodu",
      url: "https://github.com/acme/repo/commit/abc123",
      committedAt: "2026-08-22T01:00:00Z",
    },
  ],
  issueEvents: [],
  reviewRequests: [],
  meetings: [],
  availableMinutes: 120,
  missingSources: [],
};

const validContract: ExecutionContract = {
  executionId: "exec-1",
  actions: [1, 2, 3].map((n) => ({
    nodeId: `action-${n}`,
    title: `할 일 ${n}`,
    evidenceUrls: ["https://github.com/acme/repo/issues/1"],
    successCriteria: "완료 조건",
    estimatedMinutes: 15,
  })),
  prepNodes: [],
  forbiddenScope: ["main 브랜치 직접 푸시"],
  noChanges: false,
};

// content 문자열을 chat completions 응답 형태로 감싸는 헬퍼
function chatResponse(content: string): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
  } as unknown as Response;
}

function makeClient(fetchFn: typeof fetch) {
  return createFoundryClient({
    endpoint: "https://foundry.example.com",
    apiKey: "test-key",
    deployment: "gpt-test",
    fetchFn,
  });
}

describe("createFoundryClient", () => {
  it("정상 응답을 파싱하고 스키마 검증을 통과시킨다", async () => {
    const fetchFn = vi.fn().mockResolvedValue(chatResponse(JSON.stringify(validContract)));
    const client = makeClient(fetchFn);

    const contract = await client.inferContract({ repoRef: "acme/repo", diff: validDiff });

    expect(contract).toEqual(validContract);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("첫 응답이 스키마를 위반하면 1회 재시도 후 성공한다", async () => {
    const invalid = { ...validContract, actions: [] }; // noChanges=false인데 actions 3개 아님
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(chatResponse(JSON.stringify(invalid)))
      .mockResolvedValueOnce(chatResponse(JSON.stringify(validContract)));
    const client = makeClient(fetchFn);

    const contract = await client.inferContract({ repoRef: "acme/repo", diff: validDiff });

    expect(contract).toEqual(validContract);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("재시도까지 실패하면 throw한다", async () => {
    const fetchFn = vi.fn().mockResolvedValue(chatResponse("not-json"));
    const client = makeClient(fetchFn);

    await expect(client.inferContract({ repoRef: "acme/repo", diff: validDiff })).rejects.toThrow();
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("api-key 헤더와 untrusted_content 래핑을 포함해 요청한다", async () => {
    const fetchFn = vi.fn().mockResolvedValue(chatResponse(JSON.stringify(validContract)));
    const client = makeClient(fetchFn);

    await client.inferContract({ repoRef: "acme/repo", diff: validDiff });

    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://foundry.example.com/openai/deployments/gpt-test/chat/completions?api-version=2024-10-21",
    );
    expect((init.headers as Record<string, string>)["api-key"]).toBe("test-key");

    const body = JSON.parse(init.body as string) as {
      messages: Array<{ role: string; content: string }>;
    };
    const userMessage = body.messages.find((m) => m.role === "user");
    expect(userMessage?.content).toContain("<untrusted_content>");
    expect(userMessage?.content).toContain("</untrusted_content>");
    expect(userMessage?.content).toContain(JSON.stringify(validDiff));
  });
});
