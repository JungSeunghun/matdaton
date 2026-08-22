import { z } from "zod";
import { badRequest } from "@/lib/api/errors";
import { createWorkflowDeps } from "@/lib/api/workflow-deps";
import { getServerConfig } from "@/lib/config";
import { startExecution } from "@/lib/workflow/run-execution";

const JudgeBodySchema = z.strictObject({
  repoUrl: z.string(),
});

function parseRepoRef(repoUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(repoUrl);
  } catch {
    return null;
  }

  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    return null;
  }

  const match = /^\/([^/]+)\/([^/]+)\/?$/.exec(url.pathname);
  if (!match) return null;

  const owner = match[1];
  const repo = match[2].endsWith(".git") ? match[2].slice(0, -4) : match[2];
  if (!owner || !repo) return null;

  return `${owner}/${repo}`;
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("요청 body는 올바른 JSON이어야 합니다");
  }

  const parsed = JudgeBodySchema.safeParse(body);
  if (!parsed.success) return badRequest("요청 body가 올바르지 않습니다");

  const repoRef = parseRepoRef(parsed.data.repoUrl);
  if (!repoRef) return badRequest("repoUrl은 올바른 GitHub 저장소 URL이어야 합니다");

  const config = getServerConfig();
  const deps = createWorkflowDeps({ githubToken: config.judgeGithubToken });
  const execution = await startExecution(
    {
      userId: "judge",
      repoRef,
      icsUrl: null,
      mode: "judge",
    },
    deps,
  );

  return Response.json(execution, { status: 200 });
}
