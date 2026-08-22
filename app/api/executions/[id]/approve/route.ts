// MOCK: 실제 파이프라인 연결 전 프론트엔드 개발용 임시 응답
import { NextResponse } from "next/server";
import { mockApprovalToken, mockExecution, mockExecutionResult, mockReceipt } from "../../../_mock/fixtures";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let approvedNodeIds: string[] = [];
  let startupSeconds = 84;
  try {
    const body = await request.json();
    if (Array.isArray(body?.approvedNodeIds)) {
      approvedNodeIds = body.approvedNodeIds;
    }
    if (typeof body?.startupSeconds === "number") {
      startupSeconds = body.startupSeconds;
    }
  } catch {
    // body 없이 호출된 경우 기본값 유지
  }

  // mock 스트림은 승인 후 이어지지 않으므로 완료 스냅샷을 바로 반환한다
  const execution = mockExecution(id, { status: "completed" });
  return NextResponse.json({
    ...execution,
    approval: mockApprovalToken(id, approvedNodeIds),
    excludedNodeIds: execution.contract?.actions
      .map((a) => a.nodeId)
      .filter((n) => approvedNodeIds.length > 0 && !approvedNodeIds.includes(n)),
    executionResult: mockExecutionResult(id, approvedNodeIds.length > 0 ? approvedNodeIds : undefined),
    receipt: mockReceipt(id, startupSeconds),
  });
}
