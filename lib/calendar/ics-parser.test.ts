import { describe, expect, it } from "vitest";
import { computeAvailableMinutes, parseIcsEvents, selectMeetingsOnDate } from "./ics-parser";

const SAMPLE_ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "SUMMARY:스탠드업",
  "DTSTART:20260822T090000Z",
  "DTEND:20260822T093000Z",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "SUMMARY:설계 리뷰",
  "DTSTART:20260822T130000Z",
  "DTEND:20260822T140000Z",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "SUMMARY:내일 회의",
  "DTSTART:20260823T090000Z",
  "DTEND:20260823T100000Z",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("parseIcsEvents", () => {
  it("parses summary, start, and end of each VEVENT", () => {
    const events = parseIcsEvents(SAMPLE_ICS);
    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({
      title: "스탠드업",
      startsAt: "2026-08-22T09:00:00.000Z",
      endsAt: "2026-08-22T09:30:00.000Z",
    });
  });

  it("returns an empty array for a calendar without events", () => {
    expect(parseIcsEvents("BEGIN:VCALENDAR\r\nEND:VCALENDAR")).toEqual([]);
  });

  it("unescapes ICS text values", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "SUMMARY:회의\\, 후속\\; 논의",
      "DTSTART:20260822T090000Z",
      "DTEND:20260822T100000Z",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    expect(parseIcsEvents(ics)[0].title).toBe("회의, 후속; 논의");
  });

  it("skips events with invalid dates instead of throwing", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "SUMMARY:broken",
      "DTSTART:not-a-date",
      "DTEND:20260822T100000Z",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    expect(parseIcsEvents(ics)).toEqual([]);
  });
});

describe("selectMeetingsOnDate", () => {
  it("keeps only meetings on the given UTC date", () => {
    const meetings = selectMeetingsOnDate(parseIcsEvents(SAMPLE_ICS), "2026-08-22");
    expect(meetings.map((m) => m.title)).toEqual(["스탠드업", "설계 리뷰"]);
  });
});

describe("computeAvailableMinutes", () => {
  const workday = { startHourUtc: 9, endHourUtc: 18 };

  it("subtracts meeting time from the workday", () => {
    const meetings = selectMeetingsOnDate(parseIcsEvents(SAMPLE_ICS), "2026-08-22");
    // 9h workday = 540m, meetings 30m + 60m
    expect(computeAvailableMinutes(meetings, "2026-08-22", workday)).toBe(450);
  });

  it("returns the full workday when there are no meetings", () => {
    expect(computeAvailableMinutes([], "2026-08-22", workday)).toBe(540);
  });

  it("does not double-count overlapping meetings", () => {
    const meetings = [
      { title: "a", startsAt: "2026-08-22T09:00:00.000Z", endsAt: "2026-08-22T10:00:00.000Z" },
      { title: "b", startsAt: "2026-08-22T09:30:00.000Z", endsAt: "2026-08-22T10:30:00.000Z" },
    ];
    expect(computeAvailableMinutes(meetings, "2026-08-22", workday)).toBe(450);
  });

  it("never returns a negative value", () => {
    const meetings = [
      { title: "all-day", startsAt: "2026-08-22T00:00:00.000Z", endsAt: "2026-08-23T00:00:00.000Z" },
    ];
    expect(computeAvailableMinutes(meetings, "2026-08-22", workday)).toBe(0);
  });
});
