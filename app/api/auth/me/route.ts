import { unauthorized } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/api/session";

export async function GET(request: Request): Promise<Response> {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  return Response.json({ userId: user.userId, login: user.login }, { status: 200 });
}