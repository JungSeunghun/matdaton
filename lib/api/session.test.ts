import { describe, expect, it } from "vitest";
import {
  clearSessionCookie,
  createOAuthState,
  createSessionCookie,
  getSessionUser,
  verifyOAuthState,
} from "./session";

const secret = "test-session-secret";

function requestWithCookie(setCookie: string): Request {
  return new Request("http://localhost", { headers: { cookie: setCookie.split(";", 1)[0] } });
}

describe("session cookies", () => {
  it("round-trips a signed session", async () => {
    const cookie = createSessionCookie({ userId: "42", login: "octocat" }, secret);
    await expect(getSessionUser(requestWithCookie(cookie), secret)).resolves.toEqual({ userId: "42", login: "octocat" });
  });

  it("rejects a tampered session", async () => {
    const cookie = createSessionCookie({ userId: "42", login: "octocat" }, secret);
    const tampered = cookie.replace(/first_move_session=./, "first_move_session=x");
    await expect(getSessionUser(requestWithCookie(tampered), secret)).resolves.toBeNull();
  });

  it("clears the session cookie", () => {
    expect(clearSessionCookie()).toContain("Max-Age=0");
  });
});

describe("OAuth state", () => {
  it("accepts only the state bound to the signed cookie", () => {
    const { state, cookie } = createOAuthState(secret);
    const request = requestWithCookie(cookie);
    expect(verifyOAuthState(request, state, secret)).toBe(true);
    expect(verifyOAuthState(request, "different", secret)).toBe(false);
  });
});