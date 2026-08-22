import { z } from "zod";

// ── 공통 상수 ──────────────────────────────────────────────

export const SCOUT_SOURCES = ["commits", "issueEvents", "reviewRequests", "calendar"] as const;

export const WRITE_TOOLS = ["github.create_todo_issue", "drafts.save_issue_comment"] as const;

export const EXECUTION_STATUSES = [
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
] as const;

export const METRIC_EVENT_NAMES = [
  "button_clicked",
  "approval_completed",
  "first_action_done",
  "screen_viewed",
] as const;

export const ExecutionStatusSchema = z.enum(EXECUTION_STATUSES);
export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;

export const WriteToolSchema = z.enum(WRITE_TOOLS);
export type WriteTool = z.infer<typeof WriteToolSchema>;

export const MetricEventNameSchema = z.enum(METRIC_EVENT_NAMES);
export type MetricEventName = z.infer<typeof MetricEventNameSchema>;

export const ExecutionModeSchema = z.enum(["daily", "judge"]);
export type ExecutionMode = z.infer<typeof ExecutionModeSchema>;

// ── OvernightDiff ──────────────────────────────────────────

export const CommitSummarySchema = z.object({
  sha: z.string(),
  message: z.string(),
  author: z.string(),
  url: z.string().url(),
  committedAt: z.string(),
});

export const IssueEventSummarySchema = z.object({
  issueNumber: z.number().int(),
  issueTitle: z.string(),
  commentAuthor: z.string(),
  commentSummary: z.string(),
  url: z.string().url(),
  createdAt: z.string(),
});

export const ReviewRequestSummarySchema = z.object({
  prNumber: z.number().int(),
  prTitle: z.string(),
  requestedBy: z.string(),
  url: z.string().url(),
  requestedAt: z.string(),
});

export const MeetingSummarySchema = z.object({
  title: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
});

export const OvernightDiffSchema = z.object({
  commits: z.array(CommitSummarySchema),
  issueEvents: z.array(IssueEventSummarySchema),
  reviewRequests: z.array(ReviewRequestSummarySchema),
  meetings: z.array(MeetingSummarySchema),
  availableMinutes: z.number().int().min(0),
  missingSources: z.array(z.enum(SCOUT_SOURCES)),
});
export type OvernightDiff = z.infer<typeof OvernightDiffSchema>;

// ── ExecutionContract ──────────────────────────────────────

export const PriorityActionSchema = z.object({
  nodeId: z.string(),
  title: z.string(),
  evidenceUrls: z.array(z.string().url()).min(1),
  successCriteria: z.string(),
  estimatedMinutes: z.number().int().positive(),
});
export type PriorityAction = z.infer<typeof PriorityActionSchema>;

export const PrepNodeSchema = z.object({
  nodeId: z.string(),
  tool: WriteToolSchema,
  args: z.record(z.string(), z.unknown()),
  preview: z.string(),
});
export type PrepNode = z.infer<typeof PrepNodeSchema>;

export const ExecutionContractSchema = z
  .object({
    executionId: z.string(),
    actions: z.array(PriorityActionSchema),
    prepNodes: z.array(PrepNodeSchema),
    forbiddenScope: z.array(z.string()),
    noChanges: z.boolean(),
  })
  .refine((contract) => contract.noChanges || contract.actions.length === 3, {
    message: "actions must contain exactly 3 items unless noChanges is true",
  });
export type ExecutionContract = z.infer<typeof ExecutionContractSchema>;

// ── PolicyReport ───────────────────────────────────────────

export const PolicyVerdictSchema = z.enum(["allowed", "blocked", "needs_review"]);
export type PolicyVerdict = z.infer<typeof PolicyVerdictSchema>;

export const PolicyFindingSchema = z.object({
  nodeId: z.string(),
  verdict: PolicyVerdictSchema,
  reasons: z.array(z.string()),
});
export type PolicyFinding = z.infer<typeof PolicyFindingSchema>;

export const PolicyReportSchema = z.object({
  executionId: z.string(),
  nodeFindings: z.array(PolicyFindingSchema),
});
export type PolicyReport = z.infer<typeof PolicyReportSchema>;

// ── ApprovalToken ──────────────────────────────────────────

export const ApprovalTokenSchema = z.object({
  executionId: z.string(),
  approvedNodeIds: z.array(z.string()),
  approvedHash: z.string(),
  allowedTools: z.array(z.string()),
  issuedAt: z.string(),
  expiresAt: z.string(),
  signature: z.string(),
});
export type ApprovalToken = z.infer<typeof ApprovalTokenSchema>;

// ── ExecutionResult ────────────────────────────────────────

export const NodeResultSchema = z.object({
  nodeId: z.string(),
  tool: WriteToolSchema,
  status: z.enum(["succeeded", "failed", "skipped"]),
  resourceUrl: z.string().url().optional(),
  resourceRef: z.string().optional(),
  idempotencyKey: z.string(),
  errorCode: z.string().optional(),
});
export type NodeResult = z.infer<typeof NodeResultSchema>;

export const ExecutionResultSchema = z.object({
  executionId: z.string(),
  nodeResults: z.array(NodeResultSchema),
});
export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;

// ── EvidenceReceipt ────────────────────────────────────────

export const RuleResultSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  evidence: z.string(),
});
export type RuleResult = z.infer<typeof RuleResultSchema>;

export const EvidenceReceiptSchema = z.object({
  executionId: z.string(),
  mode: ExecutionModeSchema,
  ruleResults: z.array(RuleResultSchema),
  checkedScope: z.array(z.string()),
  startupSeconds: z.number().nullable(),
  savedMinutes: z.number().nullable(),
  issuedAt: z.string(),
});
export type EvidenceReceipt = z.infer<typeof EvidenceReceiptSchema>;

// ── MetricEvent ────────────────────────────────────────────

export const MetricEventSchema = z.object({
  id: z.string(),
  userId: z.string(),
  executionId: z.string(),
  date: z.string(),
  name: MetricEventNameSchema,
  value: z.number(),
  source: z.string(),
  recordedAt: z.string(),
});
export type MetricEvent = z.infer<typeof MetricEventSchema>;
// ── CommentDraft (Cosmos DB 저장, GitHub 미게시) ───────

export const CommentDraftSchema = z.object({
  id: z.string(), // idempotencyKey
  userId: z.string(),
  executionId: z.string(),
  nodeId: z.string(),
  issueNumber: z.number().int(),
  body: z.string(),
  savedAt: z.string(),
});
export type CommentDraft = z.infer<typeof CommentDraftSchema>;

// ── ToolCallLog ──────────────────────────────────

export const ToolCallLogEntrySchema = z.object({
  tool: z.string(),
  nodeId: z.string().optional(),
});
export type ToolCallLogEntry = z.infer<typeof ToolCallLogEntrySchema>;
// ── ExecutionProgressEvent (실행 진행 이벤트) ─────────────

export const AGENT_NAMES = ["scout", "compiler", "policy", "executor", "verifier"] as const;
export const AgentNameSchema = z.enum(AGENT_NAMES);
export type AgentName = z.infer<typeof AgentNameSchema>;

export const ExecutionProgressEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("stage_changed"), executionId: z.string(), stage: ExecutionStatusSchema }),
  z.object({ type: z.literal("agent_started"), executionId: z.string(), agent: AgentNameSchema }),
  z.object({ type: z.literal("agent_completed"), executionId: z.string(), agent: AgentNameSchema }),
  z.object({ type: z.literal("tool_called"), executionId: z.string(), tool: z.string(), agent: AgentNameSchema.optional() }),
  z.object({ type: z.literal("node_completed"), executionId: z.string(), nodeId: z.string() }),
  z.object({ type: z.literal("node_failed"), executionId: z.string(), nodeId: z.string(), reason: z.string() }),
]);
export type ExecutionProgressEvent = z.infer<typeof ExecutionProgressEventSchema>;

// ── Execution (Cosmos DB 문서) ─────────────────────────────

export const ExecutionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  repoRef: z.string(),
  mode: ExecutionModeSchema,
  status: ExecutionStatusSchema,
  startedAt: z.string(),
  overnightDiff: OvernightDiffSchema.optional(),
  contract: ExecutionContractSchema.optional(),
  contractHash: z.string().optional(),
  policyReport: PolicyReportSchema.optional(),
  approval: ApprovalTokenSchema.optional(),
  excludedNodeIds: z.array(z.string()).optional(),
  executionResult: ExecutionResultSchema.optional(),
  toolCallLog: z.array(ToolCallLogEntrySchema).optional(),
  receipt: EvidenceReceiptSchema.optional(),
  failure: z.object({ stage: z.string(), message: z.string() }).optional(),
  traceId: z.string(),
});
export type Execution = z.infer<typeof ExecutionSchema>;
