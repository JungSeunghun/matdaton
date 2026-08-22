import { describe, expect, it } from "vitest";
import {
  ExecutionContractSchema,
  ExecutionStatusSchema,
  MetricEventNameSchema,
  OvernightDiffSchema,
  PolicyReportSchema,
} from "./schemas";

const validAction = {
  nodeId: "node_action_1",
  title: "PR #12 리뷰 요청 응답",
  evidenceUrls: ["https://github.com/acme/repo/pull/12"],
  successCriteria: "리뷰 코멘트 초안 저장",
  estimatedMinutes: 15,
};

const validContract = {
  executionId: "exec_01",
  actions: [validAction, { ...validAction, nodeId: "node_action_2" }, { ...validAction, nodeId: "node_action_3" }],
  prepNodes: [
    {
      nodeId: "node_todo_1",
      tool: "github.create_todo_issue",
      args: { title: "할 일", body: "본문" },
      preview: "이슈 '할 일' 생성",
    },
  ],
  forbiddenScope: ["github.merge_pull_request"],
  noChanges: false,
};

describe("OvernightDiffSchema", () => {
  it("accepts an empty diff with missing sources recorded", () => {
    const diff = OvernightDiffSchema.parse({
      commits: [],
      issueEvents: [],
      reviewRequests: [],
      meetings: [],
      availableMinutes: 0,
      missingSources: ["calendar"],
    });
    expect(diff.missingSources).toEqual(["calendar"]);
  });

  it("rejects unknown source names in missingSources", () => {
    expect(() =>
      OvernightDiffSchema.parse({
        commits: [],
        issueEvents: [],
        reviewRequests: [],
        meetings: [],
        availableMinutes: 0,
        missingSources: ["slack"],
      }),
    ).toThrow();
  });
});

describe("ExecutionContractSchema", () => {
  it("accepts a contract with exactly 3 actions", () => {
    expect(ExecutionContractSchema.parse(validContract).actions).toHaveLength(3);
  });

  it("rejects an action without evidence urls", () => {
    const contract = {
      ...validContract,
      actions: [{ ...validAction, evidenceUrls: [] }, validContract.actions[1], validContract.actions[2]],
    };
    expect(() => ExecutionContractSchema.parse(contract)).toThrow();
  });

  it("rejects a prep node with a tool outside the allowed write tools", () => {
    const contract = {
      ...validContract,
      prepNodes: [{ ...validContract.prepNodes[0], tool: "github.delete_repo" }],
    };
    expect(() => ExecutionContractSchema.parse(contract)).toThrow();
  });

  it("accepts a no-changes contract with zero actions", () => {
    const contract = { ...validContract, actions: [], noChanges: true };
    expect(ExecutionContractSchema.parse(contract).noChanges).toBe(true);
  });

  it("rejects a contract with fewer than 3 actions unless noChanges", () => {
    const contract = { ...validContract, actions: [validAction] };
    expect(() => ExecutionContractSchema.parse(contract)).toThrow();
  });
});

describe("PolicyReportSchema", () => {
  it("accepts allowed | blocked | needs_review verdicts only", () => {
    const report = PolicyReportSchema.parse({
      executionId: "exec_01",
      nodeFindings: [{ nodeId: "node_todo_1", verdict: "blocked", reasons: ["forbidden scope"] }],
    });
    expect(report.nodeFindings[0].verdict).toBe("blocked");
    expect(() =>
      PolicyReportSchema.parse({
        executionId: "exec_01",
        nodeFindings: [{ nodeId: "node_todo_1", verdict: "maybe", reasons: [] }],
      }),
    ).toThrow();
  });
});

describe("ExecutionStatusSchema", () => {
  it.each([
    "created",
    "scouting",
    "compiling",
    "policy_check",
    "waiting_approval",
    "executing",
    "verifying",
    "completed",
    "failed",
    "rejected",
    "expired",
  ])("accepts %s", (status) => {
    expect(ExecutionStatusSchema.parse(status)).toBe(status);
  });
});

describe("MetricEventNameSchema", () => {
  it.each(["button_clicked", "approval_completed", "first_action_done", "screen_viewed"])(
    "accepts %s",
    (name) => {
      expect(MetricEventNameSchema.parse(name)).toBe(name);
    },
  );
});
