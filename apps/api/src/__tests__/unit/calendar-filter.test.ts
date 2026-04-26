/**
 * Unit tests for the 1-external-attendee filter used by calendar ingest.
 * These import the real helper from src/lib/calendar/filter.ts — no mirroring.
 */
import { describe, expect, it } from "vitest";
import {
  emailDomain,
  filterOneExternalAttendeeEvents,
  type CalendarEventInput,
} from "@/lib/calendar/filter";

const NOW = new Date("2026-04-25T12:00:00Z");

function event(partial: Partial<CalendarEventInput>): CalendarEventInput {
  return {
    id: "evt",
    summary: "Meeting",
    start: { dateTime: "2026-04-26T15:00:00Z" },
    attendees: [],
    ...partial,
  };
}

describe("emailDomain", () => {
  it("returns the lowercased domain", () => {
    expect(emailDomain("Founder@Acme.IO")).toBe("acme.io");
  });

  it("returns empty string when there is no @", () => {
    expect(emailDomain("garbage")).toBe("");
  });
});

describe("filterOneExternalAttendeeEvents", () => {
  it("keeps events with exactly one external attendee", () => {
    const events: CalendarEventInput[] = [
      event({
        id: "1",
        attendees: [
          { email: "founder@anvil.app", self: true },
          { email: "lead@customer.com", displayName: "Pat Lead" },
        ],
      }),
    ];
    const out = filterOneExternalAttendeeEvents(events, "anvil.app", NOW);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "1",
      attendee_name: "Pat Lead",
      attendee_company: "customer.com",
      source: "cal",
      status: "upcoming",
    });
  });

  it("drops internal-only events", () => {
    const events: CalendarEventInput[] = [
      event({
        attendees: [
          { email: "a@anvil.app", self: true },
          { email: "b@anvil.app" },
        ],
      }),
    ];
    expect(filterOneExternalAttendeeEvents(events, "anvil.app", NOW)).toEqual([]);
  });

  it("drops events with multiple externals (panels, all-hands)", () => {
    const events: CalendarEventInput[] = [
      event({
        attendees: [
          { email: "founder@anvil.app", self: true },
          { email: "a@x.com" },
          { email: "b@y.com" },
        ],
      }),
    ];
    expect(filterOneExternalAttendeeEvents(events, "anvil.app", NOW)).toEqual([]);
  });

  it("ignores attendees flagged self even if domain differs", () => {
    const events: CalendarEventInput[] = [
      event({
        attendees: [
          { email: "founder@personal.me", self: true },
          { email: "lead@customer.com" },
        ],
      }),
    ];
    const out = filterOneExternalAttendeeEvents(events, "anvil.app", NOW);
    expect(out).toHaveLength(1);
    expect(out[0].attendee_company).toBe("customer.com");
  });

  it("marks past events as done", () => {
    const events: CalendarEventInput[] = [
      event({
        start: { dateTime: "2026-04-20T10:00:00Z" },
        attendees: [
          { email: "founder@anvil.app", self: true },
          { email: "lead@customer.com" },
        ],
      }),
    ];
    expect(filterOneExternalAttendeeEvents(events, "anvil.app", NOW)[0].status).toBe("done");
  });

  it("handles all-day events (date, not dateTime)", () => {
    const events: CalendarEventInput[] = [
      event({
        start: { date: "2026-05-01" },
        attendees: [
          { email: "founder@anvil.app", self: true },
          { email: "lead@customer.com" },
        ],
      }),
    ];
    const out = filterOneExternalAttendeeEvents(events, "anvil.app", NOW);
    expect(out[0].start).toBe("2026-05-01");
    expect(out[0].status).toBe("upcoming");
  });

  it("falls back to email when displayName is absent", () => {
    const events: CalendarEventInput[] = [
      event({
        attendees: [
          { email: "founder@anvil.app", self: true },
          { email: "lead@customer.com" },
        ],
      }),
    ];
    expect(filterOneExternalAttendeeEvents(events, "anvil.app", NOW)[0].attendee_name).toBe(
      "lead@customer.com"
    );
  });

  it("skips attendees with no email rather than crashing", () => {
    const events: CalendarEventInput[] = [
      event({
        attendees: [
          { email: "founder@anvil.app", self: true },
          { email: null, displayName: "Mystery Guest" },
        ],
      }),
    ];
    expect(filterOneExternalAttendeeEvents(events, "anvil.app", NOW)).toEqual([]);
  });

  it("uses '(No title)' when summary is missing", () => {
    const events: CalendarEventInput[] = [
      event({
        summary: null,
        attendees: [
          { email: "founder@anvil.app", self: true },
          { email: "lead@customer.com" },
        ],
      }),
    ];
    expect(filterOneExternalAttendeeEvents(events, "anvil.app", NOW)[0].summary).toBe("(No title)");
  });
});
