import { after } from "next/server";
import { z } from "zod";
import { badRequest, unauthorized } from "@/lib/api/errors";
import { getGithubToken } from "@/lib/api/github-token-registry";
import { getSessionUser } from "@/lib/api/session";
import { createWorkflowDeps } from "@/lib/api/workflow-deps";
import { getServerConfig } from "@/lib/config";
import { createExecution, runCreatedExecution } from "@/lib/workflow/run-execution";

const CreateExecutionBodySchema = z.strictObject({
  repoRef: z.string().trim().min(1).optional(),
  icsUrl: z.url().optional(),
});

export async function POST(request: Request): Promise<Response> {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("요청 body는 올바른 JSON이어야 합니다");
  }

  const parsed = CreateExecutionBodySchema.safeParse(body);
  if (!parsed.success) return badRequest("요청 body가 올바르지 않습니다");

  const config = getServerConfig();
  const repoRef = parsed.data.repoRef ?? config.defaultRepoRef;
  if (!repoRef) return badRequest("repoRef 또는 서버 기본 저장소가 필요합니다");

  const input = {
    userId: user.userId,
    repoRef,
    icsUrl: parsed.data.icsUrl ?? config.defaultIcsUrl,
    mode: "daily" as const,
  };
  const deps = createWorkflowDeps({ githubToken: getGithubToken(user.userId) });
  const execution = await createExecution(input, deps);

  after(async () => {
    try {
      await runCreatedExecution(input, execution, deps);
    } catch (error) {
      console.error(`[executions] background pipeline failed: ${execution.id}`, error);
    }
  });
  return Response.json(execution, { status: 201 });
}
