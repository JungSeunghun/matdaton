import { badRequest } from "@/lib/api/errors";
import { exchangeGithubCode, fetchGithubUser, getGithubOAuthConfig } from "@/lib/api/github-oauth";
import { saveGithubToken } from "@/lib/api/github-token-registry";
import { clearOAuthStateCookie, createSessionCookie, verifyOAuthState } from "@/lib/api/session";

const INVALID_OAUTH_REQUEST = "OAuth 요청이 올바르지 않습니다";

function invalidOAuthRequest(): Response {
  const response = badRequest(INVALID_OAUTH_REQUEST);
  response.headers.append("Set-Cookie", clearOAuthStateCookie());
  return response;
}

function oauthFailure(): Response {
  const headers = new Headers();
  headers.append("Set-Cookie", clearOAuthStateCookie());

  return Response.json(
    { error: { code: "oauth_failed", message: "GitHub 로그인에 실패했습니다" } },
    { status: 401, headers },
  );
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) return invalidOAuthRequest();

  try {
    if (!verifyOAuthState(request, state)) return invalidOAuthRequest();

    const config = getGithubOAuthConfig(request.url);
    const token = await exchangeGithubCode(config, code);
    const user = await fetchGithubUser(token);
    saveGithubToken(user.userId, token);
    const headers = new Headers({ Location: new URL("/", request.url).toString() });
    headers.append("Set-Cookie", createSessionCookie(user));
    headers.append("Set-Cookie", clearOAuthStateCookie());

    return new Response(null, { status: 302, headers });
  } catch {
    return oauthFailure();
  }
}