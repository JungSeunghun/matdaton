import { describe, expect, it } from "vitest";
import { ExecutionContractSchema, type OvernightDiff } from "@/lib/contracts/schemas";
import { compileExecutionContract } from "./compiler-agent";

function makeDiff(overrides: Partial<OvernightDiff> = {}): OvernightDiff {
  return {
    commits: [
      {
        sha: "abc123",
        message: "feat: add scout",
        author: "jsh",
        url: "https://github.com/acme/repo/commit/abc123",
        committedAt: "2026-08-22T01:00:00.000Z",
      },
    ],
    issueEvents: [
      {
        issueNumber: 3,
        issueTitle: "버그 수정",
        commentAuthor: "kh",
        commentSummary: "재현 확인했습니다",
        url: "https://github.com/acme/repo/issues/3#issuecomment-1",
        createdAt: "2026-08-22T02:00:00.000Z",
      },
    ],
    reviewRequests: [
      {
        prNumber: 12,
        prTitle: "scout 파이프라인",
        requestedBy: "hodu",
        url: "https://github.com/acme/repo/pull/12",
        requestedAt: "2026-08-22T03:00:00.000Z",
      },
    ],
    meetings: [],
    availableMinutes: 480,
    missingSources: [],
    ...overrides,
  };
}

const baseInput = { executionId: "exec_01", repoRef: "acme/repo" };

describe("compileExecutionContract (deterministic fallback)", () => {
  it("compiles a schema-valid contract with 3 evidence-backed actions", async () => {
    const contract = await compileExecutionContract({ ...baseInput, diff: makeDiff() });
    expect(() => ExecutionContractSchema.parse(contract)).not.toThrow();
    expect(contract.actions).toHaveLength(3);
    expect(contract.noChanges).toBe(false);
    for (const action of contract.actions) {
      expect(action.evidenceUrls.length).toBeGreaterThan(0);
    }
  });

  it("prioritizes review requests over issue events over commits", async () => {
    const contract = await compileExecutionContract({ ...baseInput, diff: makeDiff() });
    expect(contract.actions[0].evidenceUrls[0]).toContain("/pull/12");
    expect(contract.actions[1].evidenceUrls[0]).toContain("/issues/3");
    expect(contract.actions[2].evidenceUrls[0]).toContain("/commit/abc123");
  });

  it("compiles a no-changes contract when the diff is empty", async () => {
    const contract = await compileExecutionContract({
      ...baseInput,
      diff: makeDiff({ commits: [], issueEvents: [], reviewRequests: [] }),
    });
    expect(contract.noChanges).toBe(true);
    expect(contract.actions).toEqual([]);
    expect(() => ExecutionContractSchema.parse(contract)).not.toThrow();
  });

  it("creates prep nodes only from collected events with unique node ids", async () => {
    const contract = await compileExecutionContract({ ...baseInput, diff: makeDiff() });
    expect(contract.prepNodes.length).toBeGreaterThan(0);
    const ids = contract.prepNodes.map((n) => n.nodeId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const node of contract.prepNodes) {
      expect(["github.create_todo_issue", "drafts.save_issue_comment"]).toContain(node.tool);
    }
  });

  it("always includes the default forbidden scope", async () => {
    const contract = await compileExecutionContract({ ...baseInput, diff: makeDiff() });
    expect(contract.forbiddenScope).toContain("github.merge_pull_request");
    expect(contract.forbiddenScope).toContain("github.push_commit");
  });
});
