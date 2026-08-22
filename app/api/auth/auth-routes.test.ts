import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteGithubToken, getGithubToken, saveGithubToken } from "@/lib/api/github-token-registry";
import { createSessionCookie } from "@/lib/api/session";
import { GET as login } from "./login/route";
import { GET as callback } from "./callback/route";
import { POST as logout } from "./logout/route";
import { GET as me } from "./me/route";

function cookiePair(setCookie: string): string {
  return setCookie.split(";", 1)[0];
}

beforeEach(() => {
  deleteGithubToken("42");
  process.env.GITHUB_OAUTH_CLIENT_ID = "client-id";
  process.env.GITHUB_OAUTH_CLIENT_SECRET = "client-secret";
});

afterEach(() => {
  deleteGithubToken("42");
  delete process.env.GITHUB_OAUTH_CLIENT_ID;
  delete process.env.GITHUB_OAUTH_CLIENT_SECRET;
  delete process.env.GITHUB_OAUTH_REDIRECT_URI;
  vi.unstubAllGlobals();
});

describe("GitHub OAuth routes", () => {
  it("redirects to GitHub with a state cookie", async () => {
    const response = await login(new Request("http://localhost/api/auth/login"));
    const location = new URL(response.headers.get("location")!);
    expect(response.status).toBe(302);
    expect(location.origin).toBe("https://github.com");
    expect(location.searchParams.get("state")).toBeTruthy();
    expect(response.headers.get("set-cookie")).toContain("first_move_oauth_state=");
  });

  it("rejects a callback whose state does not match", async () => {
    const loginResponse = await login(new Request("http://localhost/api/auth/login"));
    const cookie = cookiePair(loginResponse.headers.get("set-cookie")!);
    const response = await callback(
      new Request("http://localhost/api/auth/callback?code=code&state=wrong", { headers: { cookie } }),
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("set-cookie")).toContain("first_move_oauth_state=");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("creates a session after a valid callback and exposes it through me", async () => {
    const loginResponse = await login(new Request("http://localhost/api/auth/login"));
    const location = new URL(loginResponse.headers.get("location")!);
    const state = location.searchParams.get("state")!;
    const stateCookie = cookiePair(loginResponse.headers.get("set-cookie")!);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ access_token: "token" }))
      .mockResolvedValueOnce(Response.json({ id: 42, login: "octocat" }));
    vi.stubGlobal("fetch", fetchMock);

    const callbackResponse = await callback(
      new Request(`http://localhost/api/auth/callback?code=code&state=${state}`, { headers: { cookie: stateCookie } }),
    );
    expect(callbackResponse.status).toBe(302);
    expect(callbackResponse.headers.get("location")).toBe("http://localhost/");
    const sessionMatch = callbackResponse.headers.get("set-cookie")!.match(/first_move_session=[^;]+/);
    expect(sessionMatch).not.toBeNull();

    const meResponse = await me(new Request("http://localhost/api/auth/me", { headers: { cookie: sessionMatch![0] } }));
    expect(meResponse.status).toBe(200);
    await expect(meResponse.json()).resolves.toEqual({ userId: "42", login: "octocat" });
    expect(getGithubToken("42")).toBe("token");
  });

  it("returns 401 without a session and clears one on logout", async () => {
    expect((await me(new Request("http://localhost/api/auth/me"))).status).toBe(401);
    const response = await logout(new Request("http://localhost/api/auth/logout", { method: "POST" }));
    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("deletes the authenticated user's token on logout", async () => {
    saveGithubToken("42", "token");
    const sessionCookie = cookiePair(createSessionCookie({ userId: "42", login: "octocat" }));

    const response = await logout(
      new Request("http://localhost/api/auth/logout", { method: "POST", headers: { cookie: sessionCookie } }),
    );

    expect(response.status).toBe(204);
    expect(getGithubToken("42")).toBeNull();
  });
});