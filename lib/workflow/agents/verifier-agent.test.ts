import { describe, expect, it } from "vitest";
import type { ExecutionContract, ExecutionResult, MetricEvent } from "@/lib/contracts/schemas";
import { computeApprovedHash } from "@/lib/approval/contract-hash";
import { runVerifierRules, type VerifierDeps, type VerifierInput } from "./verifier-agent";

const contract: ExecutionContract = {
  executionId: "exec_01",
  actions: [
    {
      nodeId: "node_action_1",
      title: "리뷰 응답",
      evidenceUrls: ["https://github.com/acme/repo/pull/12"],
      successCriteria: "코멘트 초안 저장",
      estimatedMinutes: 15,
    },
    {
      nodeId: "node_action_2",
      title: "이슈 확인",
      evidenceUrls: ["https://github.com/acme/repo/issues/3"],
      successCriteria: "확인",
      estimatedMinutes: 10,
    },
    {
      nodeId: "node_action_3",
      title: "커밋 이어서",
      evidenceUrls: ["https://github.com/acme/repo/commit/abc123"],
      successCriteria: "작업 재개",
      estimatedMinutes: 30,
    },
  ],
  prepNodes: [
    {
      nodeId: "node_todo_1",
      tool: "github.create_todo_issue",
      args: { title: "PR #12 리뷰" },
      preview: "이슈 생성",
    },
  ],
  forbiddenScope: ["github.merge_pull_request"],
  noChanges: false,
};

const executionResult: ExecutionResult = {
  executionId: "exec_01",
  nodeResults: [
    {
      nodeId: "node_todo_1",
      tool: "github.create_todo_issue",
      status: "succeeded",
      resourceUrl: "https://github.com/acme/repo/issues/42",
      idempotencyKey: "exec_01:node_todo_1",
    },
  ],
};

const approvedNodeIds = ["node_todo_1"];
const approvedHash = computeApprovedHash(contract, approvedNodeIds);

const metricEvents: MetricEvent[] = [
  {
    id: "e1",
    userId: "u1",
    executionId: "exec_01",
    date: "2026-08-22",
    name: "button_clicked",
    value: 1,
    source: "client",
    recordedAt: "2026-08-22T07:50:00.000Z",
  },
  {
    id: "e2",
    userId: "u1",
    executionId: "exec_01",
    date: "2026-08-22",
    name: "approval_completed",
    value: 1,
    source: "client",
    recordedAt: "2026-08-22T07:51:24.000Z",
  },
];

function makeInput(overrides: Partial<VerifierInput> = {}): VerifierInput {
  return {
    mode: "daily",
    overnightDiff: {
      commits: [],
      issueEvents: [],
      reviewRequests: [],
      meetings: [],
      availableMinutes: 480,
      missingSources: [],
    },
    contract,
    executionResult,
    approvedNodeIds,
    approvedHash,
    toolCallLog: [{ tool: "github.create_todo_issue", nodeId: "node_todo_1" }],
    metricEvents,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<VerifierDeps> = {}): VerifierDeps {
  return {
    checkUrlExists: async () => true,
    checkArtifactExists: async () => true,
    ...overrides,
  };
}

function rule(receipt: { ruleResults: { name: string; passed: boolean }[] }, name: string) {
  return receipt.ruleResults.find((r) => r.name === name);
}

describe("runVerifierRules — daily mode", () => {
  it("passes all 5 rules on the happy path", async () => {
    const receipt = await runVerifierRules(makeInput(), makeDeps());
    expect(receipt.ruleResults).toHaveLength(5);
    expect(receipt.ruleResults.every((r) => r.passed)).toBe(true);
    expect(receipt.startupSeconds).toBe(84);
  });

  it("fails evidence_url_exists when a url is missing", async () => {
    const receipt = await runVerifierRules(
      makeInput(),
      makeDeps({ checkUrlExists: async (url) => url !== "https://github.com/acme/repo/pull/12" }),
    );
    expect(rule(receipt, "evidence_url_exists")?.passed).toBe(false);
  });

  it("fails artifact_exists when a created resource cannot be re-fetched", async () => {
    const receipt = await runVerifierRules(makeInput(), makeDeps({ checkArtifactExists: async () => false }));
    expect(rule(receipt, "artifact_exists")?.passed).toBe(false);
  });

  it("fails no_forbidden_calls when the tool log contains a forbidden call", async () => {
    const receipt = await runVerifierRules(
      makeInput({
        toolCallLog: [
          { tool: "github.create_todo_issue", nodeId: "node_todo_1" },
          { tool: "github.merge_pull_request", nodeId: "node_x" },
        ],
      }),
      makeDeps(),
    );
    expect(rule(receipt, "no_forbidden_calls")?.passed).toBe(false);
  });

  it("fails approved_hash_match when an unapproved node was executed", async () => {
    const receipt = await runVerifierRules(
      makeInput({
        executionResult: {
          executionId: "exec_01",
          nodeResults: [
            ...executionResult.nodeResults,
            {
              nodeId: "node_rogue",
              tool: "drafts.save_issue_comment",
              status: "succeeded",
              idempotencyKey: "exec_01:node_rogue",
            },
          ],
        },
      }),
      makeDeps(),
    );
    expect(rule(receipt, "approved_hash_match")?.passed).toBe(false);
  });

  it("fails startup_within_90s beyond 90 seconds without invalidating other rules", async () => {
    const slowEvents = metricEvents.map((e) =>
      e.name === "approval_completed" ? { ...e, recordedAt: "2026-08-22T07:52:00.000Z" } : e,
    );
    const receipt = await runVerifierRules(makeInput({ metricEvents: slowEvents }), makeDeps());
    expect(rule(receipt, "startup_within_90s")?.passed).toBe(false);
    expect(receipt.startupSeconds).toBe(120);
    expect(rule(receipt, "artifact_exists")?.passed).toBe(true);
  });
});

describe("runVerifierRules — judge mode", () => {
  it("checks only the judge scope and excludes hash/timer rules", async () => {
    const receipt = await runVerifierRules(
      makeInput({ mode: "judge", approvedNodeIds: [], approvedHash: null, toolCallLog: [], metricEvents: [] }),
      makeDeps(),
    );
    const names = receipt.ruleResults.map((r) => r.name);
    expect(names).toEqual([
      "collection_completed",
      "contract_compiled",
      "evidence_url_exists",
      "no_forbidden_calls",
    ]);
    expect(receipt.ruleResults.every((r) => r.passed)).toBe(true);
    expect(receipt.checkedScope).toEqual(names);
    expect(receipt.mode).toBe("judge");
    expect(receipt.startupSeconds).toBeNull();
  });

  it("fails no_forbidden_calls when any write tool was called in judge mode", async () => {
    const receipt = await runVerifierRules(
      makeInput({
        mode: "judge",
        approvedNodeIds: [],
        approvedHash: null,
        toolCallLog: [{ tool: "github.create_todo_issue", nodeId: "node_todo_1" }],
      }),
      makeDeps(),
    );
    expect(rule(receipt, "no_forbidden_calls")?.passed).toBe(false);
  });
});
