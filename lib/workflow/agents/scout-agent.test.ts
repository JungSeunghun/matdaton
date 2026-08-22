import { describe, expect, it } from "vitest";
import type { ScoutDeps } from "./scout-agent";
import { collectOvernightDiff } from "./scout-agent";

const commit = {
  sha: "abc123",
  message: "feat: add scout",
  author: "jsh",
  url: "https://github.com/acme/repo/commit/abc123",
  committedAt: "2026-08-22T01:00:00.000Z",
};

const issueEvent = {
  issueNumber: 3,
  issueTitle: "버그 수정",
  commentAuthor: "kh",
  commentSummary: "재현 확인했습니다",
  url: "https://github.com/acme/repo/issues/3#issuecomment-1",
  createdAt: "2026-08-22T02:00:00.000Z",
};

const reviewRequest = {
  prNumber: 12,
  prTitle: "scout 파이프라인",
  requestedBy: "hodu",
  url: "https://github.com/acme/repo/pull/12",
  requestedAt: "2026-08-22T03:00:00.000Z",
};

const SAMPLE_ICS = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "SUMMARY:스탠드업",
  "DTSTART:20260822T090000Z",
  "DTEND:20260822T093000Z",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

function makeDeps(overrides: Partial<ScoutDeps> = {}): ScoutDeps {
  return {
    listCommitsSince: async () => [commit],
    listIssueEventsSince: async () => [issueEvent],
    listReviewRequests: async () => [reviewRequest],
    fetchIcsText: async () => SAMPLE_ICS,
    ...overrides,
  };
}

const baseInput = {
  repoRef: "acme/repo",
  icsUrl: "https://calendar.example.com/feed.ics",
  sinceIso: "2026-08-21T22:00:00.000Z",
  dateUtc: "2026-08-22",
};

describe("collectOvernightDiff", () => {
  it("collects all four sources in parallel", async () => {
    const diff = await collectOvernightDiff(baseInput, makeDeps());
    expect(diff.commits).toEqual([commit]);
    expect(diff.issueEvents).toEqual([issueEvent]);
    expect(diff.reviewRequests).toEqual([reviewRequest]);
    expect(diff.meetings).toHaveLength(1);
    expect(diff.availableMinutes).toBe(510);
    expect(diff.missingSources).toEqual([]);
  });

  it("records a failed source and continues with the rest", async () => {
    const diff = await collectOvernightDiff(
      baseInput,
      makeDeps({
        listCommitsSince: async () => {
          throw new Error("boom");
        },
      }),
    );
    expect(diff.commits).toEqual([]);
    expect(diff.missingSources).toEqual(["commits"]);
    expect(diff.issueEvents).toEqual([issueEvent]);
  });

  it("treats a missing ics url as no-schedule, not a failure", async () => {
    const diff = await collectOvernightDiff({ ...baseInput, icsUrl: null }, makeDeps());
    expect(diff.meetings).toEqual([]);
    expect(diff.availableMinutes).toBe(540);
    expect(diff.missingSources).toEqual([]);
  });

  it("records calendar as missing when the ics fetch fails", async () => {
    const diff = await collectOvernightDiff(
      baseInput,
      makeDeps({
        fetchIcsText: async () => {
          throw new Error("timeout");
        },
      }),
    );
    expect(diff.missingSources).toEqual(["calendar"]);
  });
});
