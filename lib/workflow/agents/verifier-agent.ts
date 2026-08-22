import { computeApprovedHash } from "@/lib/approval/contract-hash";
import type {
  EvidenceReceipt,
  ExecutionContract,
  ExecutionMode,
  ExecutionResult,
  MetricEvent,
  OvernightDiff,
  RuleResult,
  ToolCallLogEntry,
} from "@/lib/contracts/schemas";
import { WRITE_TOOLS } from "@/lib/contracts/schemas";
import { MANUAL_BASELINE_MINUTES } from "@/lib/metrics/daily-metrics";

export type { ToolCallLogEntry };

export type VerifierInput = {
  mode: ExecutionMode;
  overnightDiff?: OvernightDiff | null;
  contract: ExecutionContract | null;
  executionResult: ExecutionResult | null;
  approvedNodeIds: string[];
  approvedHash: string | null;
  toolCallLog: ToolCallLogEntry[];
  metricEvents: MetricEvent[];
};

export type VerifierDeps = {
  checkUrlExists: (url: string) => Promise<boolean>;
  checkArtifactExists: (nodeResult: ExecutionResult["nodeResults"][number]) => Promise<boolean>;
};

const STARTUP_LIMIT_SECONDS = 90;

function computeStartupSeconds(events: MetricEvent[]): number | null {
  const clickTimes = events.filter((e) => e.name === "button_clicked").map((e) => Date.parse(e.recordedAt));
  if (clickTimes.length === 0) return null;
  const clickedAt = Math.min(...clickTimes);
  const approvalTimes = events
    .filter((e) => e.name === "approval_completed")
    .map((e) => Date.parse(e.recordedAt))
    .filter((t) => t >= clickedAt);
  if (approvalTimes.length === 0) return null;
  return Math.round((Math.min(...approvalTimes) - clickedAt) / 1000);
}

async function checkEvidenceUrls(input: VerifierInput, deps: VerifierDeps): Promise<RuleResult> {
  const urls = (input.contract?.actions ?? []).flatMap((a) => a.evidenceUrls);
  const missing: string[] = [];
  for (const url of urls) {
    if (!(await deps.checkUrlExists(url))) missing.push(url);
  }
  return {
    name: "evidence_url_exists",
    passed: missing.length === 0,
    evidence: missing.length === 0 ? `checked ${urls.length} urls` : `missing: ${missing.join(", ")}`,
  };
}

async function checkArtifacts(input: VerifierInput, deps: VerifierDeps): Promise<RuleResult> {
  const succeeded = (input.executionResult?.nodeResults ?? []).filter((n) => n.status === "succeeded");
  const missing: string[] = [];
  for (const node of succeeded) {
    if (!(await deps.checkArtifactExists(node))) missing.push(node.nodeId);
  }
  return {
    name: "artifact_exists",
    passed: missing.length === 0,
    evidence:
      missing.length === 0 ? `re-fetched ${succeeded.length} artifacts` : `missing: ${missing.join(", ")}`,
  };
}

function checkNoForbiddenCalls(input: VerifierInput): RuleResult {
  const forbiddenScope = input.contract?.forbiddenScope ?? [];
  const violations = input.toolCallLog.filter((entry) => {
    if (forbiddenScope.includes(entry.tool)) return true;
    if (input.mode === "judge" && (WRITE_TOOLS as readonly string[]).includes(entry.tool)) return true;
    return false;
  });
  return {
    name: "no_forbidden_calls",
    passed: violations.length === 0,
    evidence:
      violations.length === 0
        ? `checked ${input.toolCallLog.length} tool calls`
        : `violations: ${violations.map((v) => v.tool).join(", ")}`,
  };
}

function checkApprovedHashMatch(input: VerifierInput): RuleResult {
  const executedNodeIds = (input.executionResult?.nodeResults ?? [])
    .filter((n) => n.status !== "skipped")
    .map((n) => n.nodeId);
  const unapproved = executedNodeIds.filter((id) => !input.approvedNodeIds.includes(id));
  const recomputedHash =
    input.contract !== null ? computeApprovedHash(input.contract, input.approvedNodeIds) : null;
  const hashMatches = input.approvedHash !== null && recomputedHash === input.approvedHash;
  return {
    name: "approved_hash_match",
    passed: unapproved.length === 0 && hashMatches,
    evidence:
      unapproved.length > 0
        ? `unapproved nodes executed: ${unapproved.join(", ")}`
        : hashMatches
          ? `hash ${input.approvedHash} verified`
          : "approved hash mismatch",
  };
}

function checkStartupTimer(startupSeconds: number | null): RuleResult {
  return {
    name: "startup_within_90s",
    passed: startupSeconds !== null && startupSeconds <= STARTUP_LIMIT_SECONDS,
    evidence:
      startupSeconds === null
        ? "startup events not found"
        : `measured ${startupSeconds}s (limit ${STARTUP_LIMIT_SECONDS}s)`,
  };
}

function checkCollectionCompleted(input: VerifierInput): RuleResult {
  const diff = input.overnightDiff;
  return {
    name: "collection_completed",
    passed: diff != null,
    evidence: diff != null ? `missing sources: [${diff.missingSources.join(", ")}]` : "overnight diff absent",
  };
}

function checkContractCompiled(input: VerifierInput): RuleResult {
  const contract = input.contract;
  const compiled = contract !== null && (contract.noChanges || contract.actions.length === 3);
  return {
    name: "contract_compiled",
    passed: compiled,
    evidence:
      contract === null
        ? "contract absent"
        : contract.noChanges
          ? "no-changes contract compiled"
          : `${contract.actions.length} actions compiled`,
  };
}

export async function runVerifierRules(input: VerifierInput, deps: VerifierDeps): Promise<EvidenceReceipt> {
  const startupSeconds = input.mode === "daily" ? computeStartupSeconds(input.metricEvents) : null;

  const ruleResults: RuleResult[] =
    input.mode === "judge"
      ? [
          checkCollectionCompleted(input),
          checkContractCompiled(input),
          await checkEvidenceUrls(input, deps),
          checkNoForbiddenCalls(input),
        ]
      : [
          await checkEvidenceUrls(input, deps),
          await checkArtifacts(input, deps),
          checkNoForbiddenCalls(input),
          checkApprovedHashMatch(input),
          checkStartupTimer(startupSeconds),
        ];

  const savedMinutes =
    startupSeconds !== null
      ? Math.round((MANUAL_BASELINE_MINUTES - startupSeconds / 60) * 10) / 10
      : null;

  return {
    executionId: input.contract?.executionId ?? input.executionResult?.executionId ?? "unknown",
    mode: input.mode,
    ruleResults,
    checkedScope: ruleResults.map((r) => r.name),
    startupSeconds,
    savedMinutes,
    issuedAt: new Date().toISOString(),
  };
}
