// MOCK: 실제 파이프라인 연결 전 프론트엔드 개발용 임시 응답
import { NextResponse } from "next/server";
import { mockDailyMetrics } from "../../_mock/fixtures";

export async function GET() {
  return NextResponse.json(mockDailyMetrics(7));
}
