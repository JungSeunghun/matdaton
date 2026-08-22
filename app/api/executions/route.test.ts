import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  getGithubToken: vi.fn(),
  getSessionUser: vi.fn(),
  getServerConfig: vi.fn(),
  createWorkflowDeps: vi.fn(),
  createExecution: vi.fn(),
  runCreatedExecution: vi.fn(),
}));

vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/api/github-token-registry", () => ({ getGithubToken: mocks.getGithubToken }));
vi.mock("@/lib/api/session", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("@/lib/config", () => ({ getServerConfig: mocks.getServerConfig }));
vi.mock("@/lib/api/workflow-deps", () => ({ createWorkflowDeps: mocks.createWorkflowDeps }));
vi.mock("@/lib/workflow/run-execution", () => ({
  createExecution: mocks.createExecution,
  runCreatedExecution: mocks.runCreatedExecution,
}));

import { POST } from "./route";

const deps = { store: "test-store" };
const createdExecution = {
  id: "exec_1",
  userId: "user_1",
  repoRef: "acme/default",
  mode: "daily",
  status: "created",
  startedAt: "2026-08-22T00:00:00.000Z",
  traceId: "trace_1",
};

function request(body: string): Request {
  return new Request("http://localhost/api/executions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/executions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getGithubToken.mockReturnValue("oauth-token");
    mocks.getSessionUser.mockResolvedValue({ userId: "user_1", login: "octocat" });
    mocks.getServerConfig.mockReturnValue({
      defaultRepoRef: "acme/default",
      defaultIcsUrl: "https://example.com/calendar.ics",
    });
    mocks.createWorkflowDeps.mockReturnValue(deps);
    mocks.createExecution.mockResolvedValue(createdExecution);
    mocks.runCreatedExecution.mockReturnValue(new Promise(() => {}));
  });

  it("returns the created execution immediately and schedules the pipeline", async () => {
    const response = await POST(request("{}"));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(createdExecution);
    const input = {
      userId: "user_1",
      repoRef: "acme/default",
      icsUrl: "https://example.com/calendar.ics",
      mode: "daily",
    };
    expect(mocks.createExecution).toHaveBeenCalledWith(input, deps);
    expect(mocks.getGithubToken).toHaveBeenCalledWith("user_1");
    expect(mocks.createWorkflowDeps).toHaveBeenCalledWith({ githubToken: "oauth-token" });
    expect(mocks.after).toHaveBeenCalledOnce();
    expect(mocks.runCreatedExecution).not.toHaveBeenCalled();

    const callback = mocks.after.mock.calls[0][0] as () => Promise<void>;
    mocks.runCreatedExecution.mockResolvedValue(createdExecution);
    await callback();

    expect(mocks.runCreatedExecution).toHaveBeenCalledWith(input, createdExecution, deps);
  });

  it("uses request values instead of server defaults", async () => {
    await POST(request(JSON.stringify({ repoRef: "acme/requested", icsUrl: "https://example.com/team.ics" })));

    expect(mocks.createExecution).toHaveBeenCalledWith(
      expect.objectContaining({ repoRef: "acme/requested", icsUrl: "https://example.com/team.ics" }),
      deps,
    );
  });

  it("keeps the server token fallback when the user has no OAuth token", async () => {
    mocks.getGithubToken.mockReturnValue(null);

    const response = await POST(request("{}"));

    expect(response.status).toBe(201);
    expect(mocks.createWorkflowDeps).toHaveBeenCalledWith({ githubToken: null });
  });

  it("returns 401 without a session", async () => {
    mocks.getSessionUser.mockResolvedValue(null);

    const response = await POST(request("{}"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "unauthorized" } });
    expect(mocks.getServerConfig).not.toHaveBeenCalled();
  });

  it("logs a rejected background pipeline promise", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.runCreatedExecution.mockRejectedValue(new Error("pipeline failed"));

    const response = await POST(request("{}"));
    const callback = mocks.after.mock.calls[0][0] as () => Promise<void>;
    await callback();

    expect(response.status).toBe(201);
    expect(mocks.runCreatedExecution).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith(
      "[executions] background pipeline failed: exec_1",
      expect.any(Error),
    );
    consoleError.mockRestore();
  });

  it.each([
    ["malformed JSON", "{"],
    ["invalid field type", JSON.stringify({ repoRef: 42 })],
  ])("returns 400 for %s", async (_case, body) => {
    const response = await POST(request(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "bad_request" } });
    expect(mocks.createExecution).not.toHaveBeenCalled();
  });

  it("returns 400 when neither request nor server provides a repository", async () => {
    mocks.getServerConfig.mockReturnValue({ defaultRepoRef: null, defaultIcsUrl: null });

    const response = await POST(request("{}"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "bad_request" } });
    expect(mocks.createWorkflowDeps).not.toHaveBeenCalled();
  });
});