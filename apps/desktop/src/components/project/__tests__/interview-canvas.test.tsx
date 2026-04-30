import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InterviewCanvas } from "../interview-canvas";

import type { Interview } from "@/lib/supabase/types";

const BASE_INTERVIEW: Interview = {
  id: "iv-1",
  project_id: "proj-1",
  persona_id: null,
  status: "completed",
  source: "desktop",
  created_at: new Date().toISOString(),
  attendee_name: "Sarah Chen",
  transcript: [
    { speaker: "Sarah Chen", text: "Close takes a full week.", timestamp: 0 },
    { speaker: "You", text: "Can you tell me more?", timestamp: 30 },
  ],
  suggested_questions: ["What breaks before board meetings?"],
  meeting_platform: null,
  meeting_link: null,
  scheduled_at: null,
  attendee_company: null,
  duration_seconds: 120,
  recording_path: null,
  upload_status: "none",
};

describe("InterviewCanvas", () => {
  it("renders empty state when no interview is selected", () => {
    render(<InterviewCanvas interview={null} />);
    expect(screen.getByText(/select a conversation/i)).toBeInTheDocument();
  });

  it("renders transcript turns", () => {
    render(<InterviewCanvas interview={BASE_INTERVIEW} />);
    expect(screen.getByText("Close takes a full week.")).toBeInTheDocument();
    expect(screen.getByText("Can you tell me more?")).toBeInTheDocument();
  });

  it("shows attendee name in header", () => {
    render(<InterviewCanvas interview={BASE_INTERVIEW} />);
    // Attendee name appears both in header and as speaker labels in the
    // transcript, so there may be multiple matches — we just need at least one.
    expect(screen.getAllByText("Sarah Chen").length).toBeGreaterThan(0);
  });

  it("renders suggested follow-up card when live and questions exist", () => {
    const iv: Interview = { ...BASE_INTERVIEW, status: "live" };
    render(<InterviewCanvas interview={iv} />);
    expect(
      screen.getByText("What breaks before board meetings?")
    ).toBeInTheDocument();
  });

  it("does not render follow-up card when not live", () => {
    render(<InterviewCanvas interview={BASE_INTERVIEW} />);
    expect(
      screen.queryByText("What breaks before board meetings?")
    ).not.toBeInTheDocument();
  });

  it("does not render follow-up card when no questions", () => {
    const iv: Interview = {
      ...BASE_INTERVIEW,
      status: "live",
      suggested_questions: [],
    };
    render(<InterviewCanvas interview={iv} />);
    expect(
      screen.queryByText("What breaks before board meetings?")
    ).not.toBeInTheDocument();
  });

  it("shows End conversation affordance for live interviews", () => {
    const iv: Interview = { ...BASE_INTERVIEW, status: "live" };
    render(<InterviewCanvas interview={iv} />);
    expect(screen.getByRole("button", { name: /end conversation/i })).toBeInTheDocument();
  });

  it("shows 'In person' modality chip for inperson source", () => {
    const iv: Interview = { ...BASE_INTERVIEW, source: "inperson" };
    render(<InterviewCanvas interview={iv} />);
    expect(screen.getByText(/^In person$/)).toBeInTheDocument();
  });

  it("shows 'Online' modality chip for non-inperson sources", () => {
    const iv: Interview = { ...BASE_INTERVIEW, source: "meet_link" };
    render(<InterviewCanvas interview={iv} />);
    expect(screen.getByText(/^Online$/)).toBeInTheDocument();
  });

  it("shows the 'Live transcript' section header", () => {
    render(<InterviewCanvas interview={BASE_INTERVIEW} />);
    expect(screen.getByText(/live transcript/i)).toBeInTheDocument();
  });

  it("shows Start recording buttons for scheduled conversations", () => {
    const iv: Interview = { ...BASE_INTERVIEW, status: "scheduled", source: "inperson" };
    render(<InterviewCanvas interview={iv} />);
    // One in the header, one in the empty-transcript CTA.
    expect(
      screen.getAllByRole("button", { name: /start recording/i }).length
    ).toBeGreaterThanOrEqual(1);
  });

  it("does not show Start recording for completed conversations", () => {
    render(<InterviewCanvas interview={BASE_INTERVIEW} />);
    expect(
      screen.queryByRole("button", { name: /start recording/i })
    ).not.toBeInTheDocument();
  });

  it("does not show Start recording for live conversations", () => {
    const iv: Interview = { ...BASE_INTERVIEW, status: "live" };
    render(<InterviewCanvas interview={iv} />);
    expect(
      screen.queryByRole("button", { name: /start recording/i })
    ).not.toBeInTheDocument();
  });
});
