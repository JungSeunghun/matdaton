import { deleteGithubToken } from "@/lib/api/github-token-registry";
import { clearSessionCookie, getSessionUser } from "@/lib/api/session";

export async function POST(request: Request): Promise<Response> {
  const user = await getSessionUser(request);
  if (user) deleteGithubToken(user.userId);

  return new Response(null, {
    status: 204,
    headers: { "Set-Cookie": clearSessionCookie() },
  });
}