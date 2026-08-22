import { createGithubAuthorizeUrl, getGithubOAuthConfig } from "@/lib/api/github-oauth";
import { createOAuthState } from "@/lib/api/session";

export async function GET(request: Request): Promise<Response> {
  try {
    const config = getGithubOAuthConfig(request.url);
    const { state, cookie } = createOAuthState();

    return new Response(null, {
      status: 302,
      headers: {
        Location: createGithubAuthorizeUrl(config, state),
        "Set-Cookie": cookie,
      },
    });
  } catch {
    return Response.json(
      {
        error: {
          code: "internal_error",
          message: "GitHub OAuth가 구성되지 않았습니다",
        },
      },
      { status: 500 },
    );
  }
}