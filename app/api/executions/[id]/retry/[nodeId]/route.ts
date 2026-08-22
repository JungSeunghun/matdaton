// MOCK: 실제 파이프라인 연결 전 프론트엔드 개발용 임시 응답
import { NextResponse } from "next/server";
import { mockExecution, mockExecutionResult, mockReceipt } from "../../../../_mock/fixtures";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; nodeId: string }> },
) {
  const { id } = await params;
  const execution = mockExecution(id, { status: "completed" });
  return NextResponse.json({
    ...execution,
    executionResult: mockExecutionResult(id),
    receipt: mockReceipt(id),
  });
}
