import { afterEach, describe, expect, it, vi } from "vitest";
import { createGithubAuthorizeUrl, exchangeGithubCode, fetchGithubUser, getGithubOAuthConfig } from "./github-oauth";

const config = { clientId: "client-id", clientSecret: "client-secret", redirectUri: "http://localhost/api/auth/callback" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GitHub OAuth", () => {
  it("builds an authorize URL with state and minimum required scopes", () => {
    const url = new URL(createGithubAuthorizeUrl(config, "state-value"));
    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(url.searchParams.get("state")).toBe("state-value");
    expect(url.searchParams.get("scope")).toBe("read:user repo");
  });

  it("derives the callback URL from the incoming origin", () => {
    process.env.GITHUB_OAUTH_CLIENT_ID = "client-id";
    process.env.GITHUB_OAUTH_CLIENT_SECRET = "client-secret";
    expect(getGithubOAuthConfig("https://example.com/api/auth/login").redirectUri).toBe("https://example.com/api/auth/callback");
  });

  it("exchanges a code without exposing the client secret in the URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ access_token: "token" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(exchangeGithubCode(config, "code")).resolves.toBe("token");
    expect(fetchMock.mock.calls[0][0]).toBe("https://github.com/login/oauth/access_token");
    expect(fetchMock.mock.calls[0][1].body).toContain("client-secret");
  });

  it("maps the authenticated GitHub identity to a session user", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ id: 42, login: "octocat" })));
    await expect(fetchGithubUser("token")).resolves.toEqual({ userId: "42", login: "octocat" });
  });
});