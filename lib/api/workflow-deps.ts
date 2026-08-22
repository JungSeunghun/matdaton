import { getServerConfig } from "@/lib/config";
import { createFoundryClient } from "@/lib/foundry/foundry-client";
import { createGithubClient } from "@/lib/github/github-client";
import { getStore } from "@/lib/store/store-factory";
import type { ScoutDeps } from "@/lib/workflow/agents/scout-agent";
import type { WorkflowDeps } from "@/lib/workflow/run-execution";
import { publishExecutionEvent } from "./event-registry";

export type CreateWorkflowDepsOptions = {
  githubToken?: string | null;
};

async function fetchIcsText(icsUrl: string): Promise<string> {
  const response = await fetch(icsUrl);
  if (!response.ok) throw new Error(`ics_fetch_failed:${response.status}`);
  return response.text();
}

// GitHub 토큰 없이도 deps는 조립하되, 호출 시 실패시켜 scout가 소스별로 처리하게 한다
function rejectMissingToken(): Promise<never> {
  return Promise.reject(new Error("github_token_missing"));
}

export function createWorkflowDeps(options?: CreateWorkflowDepsOptions): WorkflowDeps {
  const config = getServerConfig();
  const token = options?.githubToken ?? config.githubToken;
  const github = token ? createGithubClient({ token }) : null;

  const scoutDeps: ScoutDeps = github
    ? {
        listCommitsSince: (repoRef, sinceIso) => github.listCommitsSince(repoRef, sinceIso),
        listIssueEventsSince: (repoRef, sinceIso) => github.listIssueEventsSince(repoRef, sinceIso),
        listReviewRequests: (repoRef) => github.listReviewRequests(repoRef),
        fetchIcsText,
      }
    : {
        listCommitsSince: rejectMissingToken,
        listIssueEventsSince: rejectMissingToken,
        listReviewRequests: rejectMissingToken,
        fetchIcsText,
      };

  return {
    store: getStore(),
    scoutDeps,
    hmacSecret: config.hmacSecret,
    approvalTtlSeconds: config.approvalTtlSeconds,
    createTodoIssue: github
      ? (repoRef, args) => github.createTodoIssue(repoRef, args)
      : rejectMissingToken,
    checkUrlExists: github ? (url) => github.checkUrlExists(url) : rejectMissingToken,
    inferContract: config.foundry ? createFoundryClient(config.foundry).inferContract : undefined,
    emitProgress: (event) => publishExecutionEvent(event),
  };
}
