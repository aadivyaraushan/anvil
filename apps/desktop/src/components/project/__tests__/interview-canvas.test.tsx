import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { InterviewCanvas } from "../interview-canvas";

import type { Interview } from "@/lib/supabase/types";
import type { ReactNode } from "react";

function Wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const renderCanvas = (interview: Interview | null) =>
  render(<InterviewCanvas interview={interview} />, { wrapper: Wrapper });

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
    renderCanvas(null);
    expect(screen.getByText(/select a conversation/i)).toBeInTheDocument();
  });

  it("renders transcript turns", () => {
    renderCanvas(BASE_INTERVIEW);
    expect(screen.getByText("Close takes a full week.")).toBeInTheDocument();
    expect(screen.getByText("Can you tell me more?")).toBeInTheDocument();
  });

  it("shows attendee name in header", () => {
    renderCanvas(BASE_INTERVIEW);
    // Attendee name appears both in header and as speaker labels in the
    // transcript, so there may be multiple matches — we just need at least one.
    expect(screen.getAllByText("Sarah Chen").length).toBeGreaterThan(0);
  });

  it("renders suggested follow-up card when live and questions exist", () => {
    const iv: Interview = { ...BASE_INTERVIEW, status: "live" };
    renderCanvas(iv);
    expect(
      screen.getByText("What breaks before board meetings?")
    ).toBeInTheDocument();
  });

  it("does not render follow-up card when not live", () => {
    renderCanvas(BASE_INTERVIEW);
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
    renderCanvas(iv);
    expect(
      screen.queryByText("What breaks before board meetings?")
    ).not.toBeInTheDocument();
  });

  it("shows End conversation affordance for live interviews", () => {
    const iv: Interview = { ...BASE_INTERVIEW, status: "live" };
    renderCanvas(iv);
    expect(screen.getByRole("button", { name: /end conversation/i })).toBeInTheDocument();
  });

  it("shows 'In person' modality chip for inperson source", () => {
    const iv: Interview = { ...BASE_INTERVIEW, source: "inperson" };
    renderCanvas(iv);
    expect(screen.getByText(/^In person$/)).toBeInTheDocument();
  });

  it("shows 'Online' modality chip for non-inperson sources", () => {
    const iv: Interview = { ...BASE_INTERVIEW, source: "meet_link" };
    renderCanvas(iv);
    expect(screen.getByText(/^Online$/)).toBeInTheDocument();
  });

  it("shows the 'Live transcript' section header", () => {
    renderCanvas(BASE_INTERVIEW);
    expect(screen.getByText(/live transcript/i)).toBeInTheDocument();
  });

  it("shows Start recording buttons for scheduled conversations", () => {
    const iv: Interview = { ...BASE_INTERVIEW, status: "scheduled", source: "inperson" };
    renderCanvas(iv);
    // One in the header, one in the empty-transcript CTA.
    expect(
      screen.getAllByRole("button", { name: /start recording/i }).length
    ).toBeGreaterThanOrEqual(1);
  });

  it("does not show Start recording for completed conversations", () => {
    renderCanvas(BASE_INTERVIEW);
    expect(
      screen.queryByRole("button", { name: /start recording/i })
    ).not.toBeInTheDocument();
  });

  it("does not show Start recording for live conversations", () => {
    const iv: Interview = { ...BASE_INTERVIEW, status: "live" };
    renderCanvas(iv);
    expect(
      screen.queryByRole("button", { name: /start recording/i })
    ).not.toBeInTheDocument();
  });
});
