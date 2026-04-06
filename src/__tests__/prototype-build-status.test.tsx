import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn().mockReturnValue({
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }),
    removeChannel: vi.fn(),
  }),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("PrototypeBuildStatus", () => {
  it("shows 'Building your prototype' heading when status is generating", async () => {
    const { PrototypeBuildStatus } = await import("@/components/prototype-build-status");
    render(
      <PrototypeBuildStatus
        projectId="proj-1"
        initialStatus="generating"
        initialPhase="architect"
        projectName="ReconAI"
        createdAt={new Date().toISOString()}
      />
    );
    expect(screen.getByText("Building your prototype")).toBeDefined();
  });

  it("shows 'Prototype ready' heading when status is deployed", async () => {
    const { PrototypeBuildStatus } = await import("@/components/prototype-build-status");
    render(
      <PrototypeBuildStatus
        projectId="proj-1"
        initialStatus="deployed"
        initialPhase="deployed"
        projectName="ReconAI"
        createdAt={new Date().toISOString()}
      />
    );
    expect(screen.getByText("Prototype ready")).toBeDefined();
  });

  it("shows phase progress list when status is generating", async () => {
    const { PrototypeBuildStatus } = await import("@/components/prototype-build-status");
    render(
      <PrototypeBuildStatus
        projectId="proj-1"
        initialStatus="generating"
        initialPhase="developer"
        projectName="ReconAI"
        createdAt={new Date().toISOString()}
      />
    );
    // Phase labels should be visible in the progress list
    expect(screen.getByText("Architect designing spec...")).toBeDefined();
    // "Developer generating code..." appears in both the phase list and the status message below
    expect(screen.getAllByText("Developer generating code...").length).toBeGreaterThanOrEqual(1);
  });

  it("shows Retry button when status is failed", async () => {
    const { PrototypeBuildStatus } = await import("@/components/prototype-build-status");
    render(
      <PrototypeBuildStatus
        projectId="proj-1"
        initialStatus="failed"
        initialPhase={null}
        projectName="ReconAI"
        createdAt={new Date().toISOString()}
      />
    );
    expect(screen.getByText("Retry")).toBeDefined();
  });

  it("does NOT show Retry button when status is generating", async () => {
    const { PrototypeBuildStatus } = await import("@/components/prototype-build-status");
    render(
      <PrototypeBuildStatus
        projectId="proj-1"
        initialStatus="generating"
        initialPhase="architect"
        projectName="ReconAI"
        createdAt={new Date().toISOString()}
      />
    );
    expect(screen.queryByText("Retry")).toBeNull();
  });

  it("shows Restart build button when generating has gone stale", async () => {
    const { PrototypeBuildStatus } = await import("@/components/prototype-build-status");
    render(
      <PrototypeBuildStatus
        projectId="proj-1"
        initialStatus="generating"
        initialPhase={null}
        projectName="ReconAI"
        createdAt="2020-01-01T00:00:00.000Z"
      />
    );
    expect(screen.getByText("Restart build")).toBeDefined();
  });

  it("shows settings link regardless of status", async () => {
    const { PrototypeBuildStatus } = await import("@/components/prototype-build-status");
    const { unmount } = render(
      <PrototypeBuildStatus
        projectId="proj-1"
        initialStatus="generating"
        initialPhase="architect"
        projectName="ReconAI"
        createdAt={new Date().toISOString()}
      />
    );
    expect(screen.getByText("Settings")).toBeDefined();
    unmount();

    render(
      <PrototypeBuildStatus
        projectId="proj-1"
        initialStatus="deployed"
        initialPhase="deployed"
        projectName="ReconAI"
        createdAt={new Date().toISOString()}
      />
    );
    expect(screen.getByText("Settings")).toBeDefined();
  });
});
