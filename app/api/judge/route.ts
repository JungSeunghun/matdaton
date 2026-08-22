// MOCK: 실제 파이프라인 연결 전 프론트엔드 개발용 임시 응답
import { NextResponse } from "next/server";
import { mockExecution, mockExecutionId } from "../_mock/fixtures";

export async function POST(request: Request) {
  let repoUrl = "https://github.com/octocat/hello-world";
  try {
    const body = await request.json();
    if (typeof body?.repoUrl === "string" && body.repoUrl.length > 0) {
      repoUrl = body.repoUrl;
    }
  } catch {
    // body 없이 호출된 경우 기본 저장소 유지
  }

  const repoRef = repoUrl.replace(/^https?:\/\/github\.com\//, "").replace(/\/+$/, "");
  const id = mockExecutionId("judge");
  const execution = mockExecution(id, {
    mode: "judge",
    status: "created",
    repoRef,
  });
  return NextResponse.json({ ...execution, userId: "judge" });
}
