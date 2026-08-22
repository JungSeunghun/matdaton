import { describe, expect, it } from "vitest";
import { computeApprovedHash, computeContractHash, createIdempotencyKey } from "./contract-hash";

const contract = {
  executionId: "exec_01",
  actions: [],
  prepNodes: [
    { nodeId: "node_todo_1", tool: "github.create_todo_issue", args: { title: "a" }, preview: "p" },
    { nodeId: "node_draft_1", tool: "drafts.save_issue_comment", args: { body: "b" }, preview: "p" },
  ],
  forbiddenScope: [],
  noChanges: true,
};

describe("computeContractHash", () => {
  it("is deterministic for the same contract", () => {
    expect(computeContractHash(contract)).toBe(computeContractHash(structuredClone(contract)));
  });

  it("changes when the contract changes", () => {
    const modified = structuredClone(contract);
    modified.prepNodes[0].args = { title: "changed" };
    expect(computeContractHash(modified)).not.toBe(computeContractHash(contract));
  });

  it("is prefixed with sha256:", () => {
    expect(computeContractHash(contract)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe("computeApprovedHash", () => {
  it("ignores node id ordering", () => {
    expect(computeApprovedHash(contract, ["node_todo_1", "node_draft_1"])).toBe(
      computeApprovedHash(contract, ["node_draft_1", "node_todo_1"]),
    );
  });

  it("changes when the approved node set changes", () => {
    expect(computeApprovedHash(contract, ["node_todo_1"])).not.toBe(
      computeApprovedHash(contract, ["node_todo_1", "node_draft_1"]),
    );
  });

  it("changes when the underlying contract changes", () => {
    const modified = structuredClone(contract);
    modified.prepNodes[0].args = { title: "changed" };
    expect(computeApprovedHash(modified, ["node_todo_1"])).not.toBe(
      computeApprovedHash(contract, ["node_todo_1"]),
    );
  });
});

describe("createIdempotencyKey", () => {
  it("is executionId:nodeId", () => {
    expect(createIdempotencyKey("exec_01", "node_todo_1")).toBe("exec_01:node_todo_1");
  });
});
