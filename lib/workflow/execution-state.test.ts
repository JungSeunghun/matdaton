import { describe, expect, it } from "vitest";
import { canTransition } from "./execution-state";

describe("canTransition", () => {
  it.each([
    ["created", "scouting"],
    ["scouting", "compiling"],
    ["compiling", "policy_check"],
    ["policy_check", "waiting_approval"],
    ["waiting_approval", "executing"],
    ["executing", "verifying"],
    ["verifying", "completed"],
  ] as const)("allows the happy path %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each([
    ["waiting_approval", "rejected"],
    ["waiting_approval", "expired"],
    ["policy_check", "verifying"], // judge mode은 승인 없이 검증으로 진행
    ["scouting", "failed"],
    ["compiling", "failed"],
    ["executing", "failed"],
    ["verifying", "failed"],
  ] as const)("allows terminal branch %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each([
    ["created", "executing"],
    ["completed", "executing"],
    ["failed", "scouting"],
    ["expired", "executing"],
    ["waiting_approval", "completed"],
  ] as const)("rejects the illegal transition %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });
});
