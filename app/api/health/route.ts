import { NextResponse } from "next/server";
import { getStore } from "@/lib/store/store-factory";

const HEALTH_USER_ID = "__health__";
const HEALTH_DATE = "1970-01-01";

export async function GET() {
  try {
    await getStore().listMetricEvents(HEALTH_USER_ID, HEALTH_DATE);
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}
