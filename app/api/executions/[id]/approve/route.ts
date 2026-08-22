// MOCK: 실제 파이프라인 연결 전 프론트엔드 개발용 임시 응답
import { NextResponse } from "next/server";
import { mockApprovalToken, mockExecution } from "../../../_mock/fixtures";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let approvedNodeIds: string[] = [];
  try {
    const body = await request.json();
    if (Array.isArray(body?.approvedNodeIds)) {
      approvedNodeIds = body.approvedNodeIds;
    }
  } catch {
    // body 없이 호출된 경우 빈 배열 유지
  }

  const execution = mockExecution(id, { status: "executing" });
  return NextResponse.json({
    ...execution,
    approval: {
      token: mockApprovalToken(id, approvedNodeIds),
      approvedNodeIds,
    },
  });
}
