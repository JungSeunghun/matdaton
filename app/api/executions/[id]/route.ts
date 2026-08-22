// MOCK: 실제 파이프라인 연결 전 프론트엔드 개발용 임시 응답
import { NextResponse } from "next/server";
import { mockExecution } from "../../_mock/fixtures";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const execution = mockExecution(id, { status: "waiting_approval" });
  return NextResponse.json(execution);
}
