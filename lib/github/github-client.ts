import type {
  CommitSummarySchema,
  IssueEventSummarySchema,
  ReviewRequestSummarySchema,
} from "@/lib/contracts/schemas";
import type { z } from "zod";

type CommitSummary = z.infer<typeof CommitSummarySchema>;
type IssueEventSummary = z.infer<typeof IssueEventSummarySchema>;
type ReviewRequestSummary = z.infer<typeof ReviewRequestSummarySchema>;

export type GithubClientOptions = {
  token: string;
  fetchFn?: typeof fetch;
  apiBase?: string;
};

export type CreateTodoIssueInput = {
  title: string;
  body: string;
  idempotencyKey: string;
};

export type GithubClient = ReturnType<typeof createGithubClient>;

const TODO_LABEL = "first-move";

export function createGithubClient(options: GithubClientOptions) {
  const fetchFn = options.fetchFn ?? fetch;
  const apiBase = options.apiBase ?? "https://api.github.com";
  const etagCache = new Map<string, { etag: string; body: unknown }>();

  function baseHeaders(): Record<string, string> {
    return {
      authorization: `Bearer ${options.token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
    };
  }

  async function getJson<T>(url: string): Promise<T> {
    const cached = etagCache.get(url);
    const headers = baseHeaders();
    if (cached) headers["if-none-match"] = cached.etag;

    const response = await fetchFn(url, { headers });
    if (response.status === 304 && cached) return cached.body as T;
    if (!response.ok) throw new Error(`github_api_error:${response.status}`);

    const body = (await response.json()) as T;
    const etag = response.headers.get("etag");
    if (etag) etagCache.set(url, { etag, body });
    return body;
  }

  async function postJson<T>(url: string, payload: unknown): Promise<T> {
    const response = await fetchFn(url, {
      method: "POST",
      headers: { ...baseHeaders(), "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`github_api_error:${response.status}`);
    return (await response.json()) as T;
  }

  return {
    async listCommitsSince(repoRef: string, sinceIso: string): Promise<CommitSummary[]> {
      type RawCommit = {
        sha: string;
        html_url: string;
        commit: { message: string; author: { name: string; date: string } | null };
      };
      const url = `${apiBase}/repos/${repoRef}/commits?since=${encodeURIComponent(sinceIso)}&per_page=50`;
      const raw = await getJson<RawCommit[]>(url);
      return raw.map((c) => ({
        sha: c.sha,
        message: c.commit.message.split("\n")[0],
        author: c.commit.author?.name ?? "unknown",
        url: c.html_url,
        committedAt: c.commit.author?.date ?? "",
      }));
    },

    async listIssueEventsSince(repoRef: string, sinceIso: string): Promise<IssueEventSummary[]> {
      type RawComment = {
        issue_url: string;
        html_url: string;
        body: string;
        created_at: string;
        user: { login: string } | null;
      };
      const url = `${apiBase}/repos/${repoRef}/issues/comments?since=${encodeURIComponent(sinceIso)}&per_page=50`;
      const raw = await getJson<RawComment[]>(url);
      return raw.map((c) => {
        const issueNumber = Number(c.issue_url.split("/").pop() ?? 0);
        return {
          issueNumber,
          issueTitle: `#${issueNumber}`,
          commentAuthor: c.user?.login ?? "unknown",
          commentSummary: c.body.slice(0, 200),
          url: c.html_url,
          createdAt: c.created_at,
        };
      });
    },

    async listReviewRequests(repoRef: string): Promise<ReviewRequestSummary[]> {
      type RawPull = {
        number: number;
        title: string;
        html_url: string;
        created_at: string;
        user: { login: string } | null;
        requested_reviewers: { login: string }[];
      };
      const url = `${apiBase}/repos/${repoRef}/pulls?state=open&per_page=50`;
      const raw = await getJson<RawPull[]>(url);
      return raw
        .filter((pr) => pr.requested_reviewers.length > 0)
        .map((pr) => ({
          prNumber: pr.number,
          prTitle: pr.title,
          requestedBy: pr.user?.login ?? "unknown",
          url: pr.html_url,
          requestedAt: pr.created_at,
        }));
    },

    async createTodoIssue(
      repoRef: string,
      input: CreateTodoIssueInput,
    ): Promise<{ number: number; url: string }> {
      type RawIssue = { number: number; html_url: string };
      const raw = await postJson<RawIssue>(`${apiBase}/repos/${repoRef}/issues`, {
        title: input.title,
        body: `${input.body}\n\n<!-- idempotency:${input.idempotencyKey} -->`,
        labels: [TODO_LABEL],
      });
      return { number: raw.number, url: raw.html_url };
    },

    async checkUrlExists(url: string): Promise<boolean> {
      const apiUrl = mapGithubUrlToApi(url, apiBase);
      try {
        const response = await fetchFn(apiUrl ?? url, {
          method: apiUrl ? "GET" : "HEAD",
          headers: apiUrl ? baseHeaders() : undefined,
        });
        return response.ok;
      } catch {
        return false;
      }
    },
  };
}

function mapGithubUrlToApi(url: string, apiBase: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== "github.com") return null;

  const [owner, repo, kind, id] = parsed.pathname.split("/").filter(Boolean);
  if (!owner || !repo) return null;
  const repoApi = `${apiBase}/repos/${owner}/${repo}`;
  if (!kind || !id) return repoApi;

  switch (kind) {
    case "issues":
      return `${repoApi}/issues/${id.split("#")[0]}`;
    case "pull":
      return `${repoApi}/pulls/${id}`;
    case "commit":
      return `${repoApi}/commits/${id}`;
    default:
      return repoApi;
  }
}
