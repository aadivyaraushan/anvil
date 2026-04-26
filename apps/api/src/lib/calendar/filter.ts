/**
 * Filters Google Calendar events down to founder ↔ external 1:1s.
 *
 * An event qualifies when it has exactly one attendee whose email domain
 * differs from the user's domain (and who is not marked `self`). Events with
 * zero or multiple external attendees — internal meetings, all-hands, panels —
 * are excluded.
 */

export type CalendarEventInput = {
  id?: string | null;
  summary?: string | null;
  start?: { dateTime?: string | null; date?: string | null };
  attendees?: Array<{
    email?: string | null;
    displayName?: string | null;
    self?: boolean | null;
  }>;
  status?: string | null;
};

export type FilteredEvent = {
  id: string;
  summary: string;
  attendee_name: string;
  attendee_company: string;
  start: string | null;
  source: "cal";
  status: "done" | "upcoming";
};

export function emailDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

export function filterOneExternalAttendeeEvents(
  events: CalendarEventInput[],
  userDomain: string,
  now: Date = new Date()
): FilteredEvent[] {
  return events
    .map((event): FilteredEvent | null => {
      const attendees = event.attendees ?? [];
      const external = attendees.filter(
        (a) => !a.self && a.email && emailDomain(a.email) !== userDomain
      );
      if (external.length !== 1) return null;

      const ext = external[0];
      const startRaw = event.start?.dateTime ?? event.start?.date ?? null;
      const startDate = startRaw ? new Date(startRaw) : null;

      return {
        id: event.id ?? "",
        summary: event.summary ?? "(No title)",
        attendee_name: ext.displayName ?? ext.email ?? "",
        attendee_company: ext.email ? emailDomain(ext.email) : "",
        start: startRaw,
        source: "cal",
        status: startDate && startDate < now ? "done" : "upcoming",
      };
    })
    .filter((e): e is FilteredEvent => e !== null);
}
