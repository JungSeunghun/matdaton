import { computeAvailableMinutes, parseIcsEvents, selectMeetingsOnDate } from "@/lib/calendar/ics-parser";
import type { MeetingSummary } from "@/lib/calendar/types";
import type { OvernightDiff } from "@/lib/contracts/schemas";

export type ScoutInput = {
  repoRef: string;
  icsUrl: string | null;
  sinceIso: string;
  dateUtc: string;
};

export type ScoutDeps = {
  listCommitsSince: (repoRef: string, sinceIso: string) => Promise<OvernightDiff["commits"]>;
  listIssueEventsSince: (repoRef: string, sinceIso: string) => Promise<OvernightDiff["issueEvents"]>;
  listReviewRequests: (repoRef: string) => Promise<OvernightDiff["reviewRequests"]>;
  fetchIcsText: (icsUrl: string) => Promise<string>;
};

const DEFAULT_WORKDAY = { startHourUtc: 9, endHourUtc: 18 };

export async function collectOvernightDiff(input: ScoutInput, deps: ScoutDeps): Promise<OvernightDiff> {
  const missingSources: OvernightDiff["missingSources"] = [];

  const [commits, issueEvents, reviewRequests, meetings] = await Promise.all([
    deps.listCommitsSince(input.repoRef, input.sinceIso).catch(() => {
      missingSources.push("commits");
      return [];
    }),
    deps.listIssueEventsSince(input.repoRef, input.sinceIso).catch(() => {
      missingSources.push("issueEvents");
      return [];
    }),
    deps.listReviewRequests(input.repoRef).catch(() => {
      missingSources.push("reviewRequests");
      return [];
    }),
    collectMeetings(input, deps).catch(() => {
      missingSources.push("calendar");
      return [] as MeetingSummary[];
    }),
  ]);

  return {
    commits,
    issueEvents,
    reviewRequests,
    meetings,
    availableMinutes: computeAvailableMinutes(meetings, input.dateUtc, DEFAULT_WORKDAY),
    missingSources,
  };
}

async function collectMeetings(input: ScoutInput, deps: ScoutDeps): Promise<MeetingSummary[]> {
  if (!input.icsUrl) return []; // ICS 미입력은 실패가 아니라 "일정 없음"
  const icsText = await deps.fetchIcsText(input.icsUrl);
  return selectMeetingsOnDate(parseIcsEvents(icsText), input.dateUtc);
}
