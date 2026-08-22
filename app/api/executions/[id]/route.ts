import { notFound, unauthorized } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/api/session";
import { createWorkflowDeps } from "@/lib/api/workflow-deps";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  const { id } = await params;
  const { store } = createWorkflowDeps();
  const execution = await store.getExecution(user.userId, id);
  if (!execution) return notFound();

  return Response.json(execution);
}
