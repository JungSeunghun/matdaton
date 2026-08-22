import type { ExecutionContract, PolicyFinding, PolicyReport } from "@/lib/contracts/schemas";

export type PolicyCheckInput = {
  contract: ExecutionContract;
  repoRef: string;
};

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /disregard\s+.{0,40}instructions/i,
  /system\s*prompt/i,
  /you\s+are\s+now/i,
  /이전\s*지시(를|사항)?\s*무시/,
  /시스템\s*프롬프트/,
  /지시(를|사항)?\s*무시하고/,
];

function findInjectionPhrase(text: string): string | null {
  for (const pattern of INJECTION_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

function isEvidenceUrlInScope(url: string, repoRef: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "github.com") return false;
  return parsed.pathname === `/${repoRef}` || parsed.pathname.startsWith(`/${repoRef}/`);
}

export function runPolicyChecks(input: PolicyCheckInput): PolicyReport {
  const { contract, repoRef } = input;
  const nodeFindings: PolicyFinding[] = [];

  for (const node of contract.prepNodes) {
    const reasons: string[] = [];

    if (contract.forbiddenScope.includes(node.tool)) {
      reasons.push(`forbidden scope violation: ${node.tool}`);
    }

    const text = `${JSON.stringify(node.args)} ${node.preview}`;
    const phrase = findInjectionPhrase(text);
    if (phrase) {
      reasons.push(`prompt injection suspected: "${phrase}"`);
    }

    nodeFindings.push({
      nodeId: node.nodeId,
      verdict: reasons.length > 0 ? "blocked" : "allowed",
      reasons,
    });
  }

  for (const action of contract.actions) {
    const outOfScope = action.evidenceUrls.filter((url) => !isEvidenceUrlInScope(url, repoRef));
    nodeFindings.push({
      nodeId: action.nodeId,
      verdict: outOfScope.length > 0 ? "needs_review" : "allowed",
      reasons: outOfScope.map((url) => `evidence url outside ${repoRef}: ${url}`),
    });
  }

  return { executionId: contract.executionId, nodeFindings };
}

export function selectBlockedNodeIds(report: PolicyReport): string[] {
  return report.nodeFindings.filter((f) => f.verdict === "blocked").map((f) => f.nodeId);
}
