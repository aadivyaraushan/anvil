/**
 * Unit tests for the 1-external-attendee filter used by the calendar ingest.
 * An event qualifies if it has exactly one attendee whose email domain differs
 * from the organiser's domain (i.e. a founder's customer call, not an internal).
 */
import { describe, expect, it } from "vitest";

type Attendee = { email: string; self?: boolean; responseStatus?: string };
type CalendarEvent = {
  summary?: string;
  organizer?: { email: string };
  attendees?: Attendee[];
};

/**
 * Mirrors the logic in apps/api/src/app/api/calendar/google/events/route.ts.
 * Returns true if the event has exactly one external attendee.
 */
function hasOneExternalAttendee(
  event: CalendarEvent,
  organizerDomain: string
): boolean {
  if (!event.attendees || event.attendees.length < 2) return false;
  const external = event.attendees.filter(
    (a) => !a.self && !a.email.endsWith(`@${organizerDomain}`)
  );
  return external.length === 1;
}

describe("calendar 1-external-attendee filter", () => {
  const organizerDomain = "anvil.app";

  it("returns true when exactly one external attendee", () => {
    const event: CalendarEvent = {
      organizer: { email: "founder@anvil.app" },
      attendees: [
        { email: "founder@anvil.app", self: true },
        { email: "sarah@customer.com" },
      ],
    };
    expect(hasOneExternalAttendee(event, organizerDomain)).toBe(true);
  });

  it("returns false when all attendees are internal", () => {
    const event: CalendarEvent = {
      organizer: { email: "founder@anvil.app" },
      attendees: [
        { email: "founder@anvil.app", self: true },
        { email: "teammate@anvil.app" },
      ],
    };
    expect(hasOneExternalAttendee(event, organizerDomain)).toBe(false);
  });

  it("returns false when two external attendees (group call)", () => {
    const event: CalendarEvent = {
      organizer: { email: "founder@anvil.app" },
      attendees: [
        { email: "founder@anvil.app", self: true },
        { email: "sarah@customer.com" },
        { email: "alex@other.com" },
      ],
    };
    expect(hasOneExternalAttendee(event, organizerDomain)).toBe(false);
  });

  it("returns false when no attendees", () => {
    const event: CalendarEvent = {
      organizer: { email: "founder@anvil.app" },
      attendees: [],
    };
    expect(hasOneExternalAttendee(event, organizerDomain)).toBe(false);
  });

  it("returns false when only the self attendee", () => {
    const event: CalendarEvent = {
      organizer: { email: "founder@anvil.app" },
      attendees: [{ email: "founder@anvil.app", self: true }],
    };
    expect(hasOneExternalAttendee(event, organizerDomain)).toBe(false);
  });

  it("handles events without an attendees list", () => {
    const event: CalendarEvent = {
      organizer: { email: "founder@anvil.app" },
    };
    expect(hasOneExternalAttendee(event, organizerDomain)).toBe(false);
  });
});
