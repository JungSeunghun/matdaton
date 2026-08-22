import type { ExecutionStatus } from "@/lib/contracts/schemas";

const TRANSITIONS: Record<ExecutionStatus, ExecutionStatus[]> = {
  created: ["scouting", "failed"],
  scouting: ["compiling", "failed"],
  compiling: ["policy_check", "failed"],
  policy_check: ["waiting_approval", "verifying", "failed"],
  waiting_approval: ["executing", "rejected", "expired", "failed"],
  executing: ["verifying", "failed"],
  verifying: ["completed", "failed"],
  completed: [],
  failed: [],
  rejected: [],
  expired: [],
};

export function canTransition(from: ExecutionStatus, to: ExecutionStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
