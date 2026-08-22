import { describe, expect, it, vi } from "vitest";
import { createGithubClient } from "./github-client";

type FetchFn = typeof fetch;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("createGithubClient", () => {
  it("lists commits since a timestamp with auth header", async () => {
    const fetchFn = vi.fn<FetchFn>(async () =>
      jsonResponse([
        {
          sha: "abc123",
          html_url: "https://github.com/acme/repo/commit/abc123",
          commit: {
            message: "feat: add scout",
            author: { name: "jsh", date: "2026-08-22T01:00:00Z" },
          },
        },
      ]),
    );
    const client = createGithubClient({ token: "gho_test", fetchFn });

    const commits = await client.listCommitsSince("acme/repo", "2026-08-21T22:00:00Z");

    expect(commits).toEqual([
      {
        sha: "abc123",
        message: "feat: add scout",
        author: "jsh",
        url: "https://github.com/acme/repo/commit/abc123",
        committedAt: "2026-08-22T01:00:00Z",
      },
    ]);
    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toContain("/repos/acme/repo/commits");
    expect(String(url)).toContain("since=2026-08-21T22%3A00%3A00Z");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer gho_test");
  });

  it("serves cached body on 304 via ETag conditional request", async () => {
    const fetchFn = vi
      .fn<FetchFn>()
      .mockResolvedValueOnce(jsonResponse([], { headers: { etag: 'W/"tag1"' } }))
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    const client = createGithubClient({ token: "gho_test", fetchFn });

    await client.listCommitsSince("acme/repo", "2026-08-21T22:00:00Z");
    const second = await client.listCommitsSince("acme/repo", "2026-08-21T22:00:00Z");

    expect(second).toEqual([]);
    const secondInit = fetchFn.mock.calls[1][1];
    expect(new Headers(secondInit?.headers).get("if-none-match")).toBe('W/"tag1"');
  });

  it("creates a todo issue with the first-move label", async () => {
    const fetchFn = vi.fn<FetchFn>(async () =>
      jsonResponse({ number: 42, html_url: "https://github.com/acme/repo/issues/42" }, { status: 201 }),
    );
    const client = createGithubClient({ token: "gho_test", fetchFn });

    const issue = await client.createTodoIssue("acme/repo", {
      title: "PR #12 리뷰",
      body: "리뷰 요청 대응",
      idempotencyKey: "exec_01:node_todo_1",
    });

    expect(issue).toEqual({ number: 42, url: "https://github.com/acme/repo/issues/42" });
    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toContain("/repos/acme/repo/issues");
    expect(init?.method).toBe("POST");
    const payload = JSON.parse(String(init?.body));
    expect(payload.labels).toContain("first-move");
    expect(payload.body).toContain("exec_01:node_todo_1");
  });

  it("throws a coded error on GitHub API failure", async () => {
    const fetchFn = vi.fn<FetchFn>(async () => new Response("rate limited", { status: 403 }));
    const client = createGithubClient({ token: "gho_test", fetchFn });

    await expect(client.listCommitsSince("acme/repo", "2026-08-21T22:00:00Z")).rejects.toThrow(
      /github_api_error:403/,
    );
  });

  it("checks url existence with an authenticated api lookup for github urls", async () => {
    const fetchFn = vi.fn<FetchFn>(async () => jsonResponse({ id: 1 }));
    const client = createGithubClient({ token: "gho_test", fetchFn });

    await expect(client.checkUrlExists("https://github.com/acme/repo/issues/42")).resolves.toBe(true);
    expect(String(fetchFn.mock.calls[0][0])).toBe("https://api.github.com/repos/acme/repo/issues/42");
  });
});
