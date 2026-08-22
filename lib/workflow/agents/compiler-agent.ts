import type { ExecutionContract, OvernightDiff, PrepNode, PriorityAction } from "@/lib/contracts/schemas";
import { ExecutionContractSchema } from "@/lib/contracts/schemas";

export type CompilerInput = {
  executionId: string;
  repoRef: string;
  diff: OvernightDiff;
  /** Foundry 구조화 출력 — 미설정 시 결정적 폴백 컴파일러 사용 */
  inferContract?: (input: { repoRef: string; diff: OvernightDiff }) => Promise<ExecutionContract>;
};

export const DEFAULT_FORBIDDEN_SCOPE = [
  "github.merge_pull_request",
  "github.push_commit",
  "github.post_comment",
  "message.send",
  "code.modify",
];

export async function compileExecutionContract(input: CompilerInput): Promise<ExecutionContract> {
  if (input.inferContract) {
    const inferred = await input.inferContract({ repoRef: input.repoRef, diff: input.diff });
    return ExecutionContractSchema.parse(inferred);
  }
  return ExecutionContractSchema.parse(compileFallbackContract(input));
}

function compileFallbackContract(input: CompilerInput): ExecutionContract {
  const { executionId, repoRef, diff } = input;
  const candidates: PriorityAction[] = [];

  for (const review of diff.reviewRequests) {
    candidates.push({
      nodeId: `node_action_${candidates.length + 1}`,
      title: `PR #${review.prNumber} 리뷰 요청 응답: ${review.prTitle}`,
      evidenceUrls: [review.url],
      successCriteria: `PR #${review.prNumber} 리뷰 코멘트 작성`,
      estimatedMinutes: 20,
    });
  }
  for (const event of diff.issueEvents) {
    candidates.push({
      nodeId: `node_action_${candidates.length + 1}`,
      title: `이슈 #${event.issueNumber} 댓글 확인·응답 (${event.commentAuthor})`,
      evidenceUrls: [event.url],
      successCriteria: `이슈 #${event.issueNumber} 댓글에 응답`,
      estimatedMinutes: 10,
    });
  }
  for (const commit of diff.commits) {
    candidates.push({
      nodeId: `node_action_${candidates.length + 1}`,
      title: `커밋 이어서 작업: ${commit.message}`,
      evidenceUrls: [commit.url],
      successCriteria: "어제 커밋의 후속 작업 착수",
      estimatedMinutes: 30,
    });
  }

  const hasChanges = candidates.length > 0;
  if (!hasChanges) {
    return {
      executionId,
      actions: [],
      prepNodes: [],
      forbiddenScope: DEFAULT_FORBIDDEN_SCOPE,
      noChanges: true,
    };
  }

  const actions = candidates.slice(0, 3);
  while (actions.length < 3) {
    actions.push({
      nodeId: `node_action_${actions.length + 1}`,
      title: "오늘 작업 계획 검토",
      evidenceUrls: [`https://github.com/${repoRef}`],
      successCriteria: "가용 시간에 맞춘 오늘 계획 확정",
      estimatedMinutes: Math.max(10, Math.min(30, diff.availableMinutes)),
    });
  }

  const prepNodes: PrepNode[] = actions
    .filter((action) => !action.evidenceUrls[0].endsWith(repoRef))
    .slice(0, 2)
    .map((action, index) => ({
      nodeId: `node_todo_${index + 1}`,
      tool: "github.create_todo_issue" as const,
      args: {
        title: action.title,
        body: `${action.successCriteria}\n\n근거: ${action.evidenceUrls.join(", ")}`,
      },
      preview: `이슈 '${action.title}' 생성 (라벨 first-move)`,
    }));

  const firstIssueEvent = diff.issueEvents[0];
  if (firstIssueEvent) {
    prepNodes.push({
      nodeId: "node_draft_1",
      tool: "drafts.save_issue_comment",
      args: {
        issueNumber: firstIssueEvent.issueNumber,
        body: `@${firstIssueEvent.commentAuthor} 확인했습니다. 오늘 중으로 답변드리겠습니다.`,
      },
      preview: `이슈 #${firstIssueEvent.issueNumber} 코멘트 초안 저장 (게시하지 않음)`,
    });
  }

  return {
    executionId,
    actions,
    prepNodes,
    forbiddenScope: DEFAULT_FORBIDDEN_SCOPE,
    noChanges: false,
  };
}
