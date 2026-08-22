import type { MeetingSummary } from "./types";

export type { MeetingSummary };

function unfoldLines(icsText: string): string[] {
  const rawLines = icsText.split(/\r?\n/);
  const lines: string[] = [];
  for (const line of rawLines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function parseIcsDate(value: string): string | null {
  // 지원 형식: 20260822T090000Z, 20260822T090000, 20260822
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?Z?$/);
  if (!match) return null;
  const [, y, mo, d, h = "00", mi = "00", s = "00"] = match;
  const date = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function parseIcsEvents(icsText: string): MeetingSummary[] {
  const events: MeetingSummary[] = [];
  let current: Partial<Record<"title" | "startsAt" | "endsAt", string | null>> | null = null;

  for (const line of unfoldLines(icsText)) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (current?.title && current.startsAt && current.endsAt) {
        events.push({ title: current.title, startsAt: current.startsAt, endsAt: current.endsAt });
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const colonIndex = line.indexOf(":");
    if (colonIndex < 0) continue;
    const name = line.slice(0, colonIndex).split(";")[0].toUpperCase();
    const value = line.slice(colonIndex + 1);

    if (name === "SUMMARY") current.title = unescapeText(value);
    else if (name === "DTSTART") current.startsAt = parseIcsDate(value);
    else if (name === "DTEND") current.endsAt = parseIcsDate(value);
  }
  return events;
}

export function selectMeetingsOnDate(events: MeetingSummary[], dateUtc: string): MeetingSummary[] {
  return events.filter((event) => event.startsAt.startsWith(dateUtc));
}

export type WorkdayWindow = { startHourUtc: number; endHourUtc: number };

export function computeAvailableMinutes(
  meetings: MeetingSummary[],
  dateUtc: string,
  workday: WorkdayWindow,
): number {
  const windowStart = Date.parse(`${dateUtc}T${String(workday.startHourUtc).padStart(2, "0")}:00:00.000Z`);
  const windowEnd = Date.parse(`${dateUtc}T${String(workday.endHourUtc).padStart(2, "0")}:00:00.000Z`);

  const clipped = meetings
    .map((m) => ({
      start: Math.max(Date.parse(m.startsAt), windowStart),
      end: Math.min(Date.parse(m.endsAt), windowEnd),
    }))
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start - b.start);

  let busyMs = 0;
  let cursor = windowStart;
  for (const interval of clipped) {
    const start = Math.max(interval.start, cursor);
    if (interval.end > start) {
      busyMs += interval.end - start;
      cursor = interval.end;
    }
  }

  const availableMs = windowEnd - windowStart - busyMs;
  return Math.max(0, Math.round(availableMs / 60000));
}
