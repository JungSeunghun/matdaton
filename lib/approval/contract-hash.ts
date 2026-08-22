import { createHash } from "node:crypto";

type HashableContract = {
  executionId: string;
  actions: unknown[];
  prepNodes: { nodeId: string; tool: string; args: Record<string, unknown>; preview: string }[];
  forbiddenScope: string[];
  noChanges: boolean;
};

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

export function computeContractHash(contract: HashableContract): string {
  const digest = createHash("sha256").update(stableStringify(contract)).digest("hex");
  return `sha256:${digest}`;
}

export function computeApprovedHash(contract: HashableContract, approvedNodeIds: string[]): string {
  const payload = {
    contractHash: computeContractHash(contract),
    approvedNodeIds: [...approvedNodeIds].sort(),
  };
  const digest = createHash("sha256").update(stableStringify(payload)).digest("hex");
  return `sha256:${digest}`;
}

export function createIdempotencyKey(executionId: string, nodeId: string): string {
  return `${executionId}:${nodeId}`;
}
