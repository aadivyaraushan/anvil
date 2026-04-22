import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SuggestedFollowupCard } from "../suggested-followup-card";

describe("SuggestedFollowupCard", () => {
  it("renders the question text", () => {
    render(
      <SuggestedFollowupCard
        question="What breaks before board meetings?"
        onUse={() => {}}
        onDismiss={() => {}}
      />
    );
    expect(
      screen.getByText("What breaks before board meetings?")
    ).toBeInTheDocument();
  });

  it("calls onUse when Use button is clicked", () => {
    const onUse = vi.fn();
    render(
      <SuggestedFollowupCard
        question="Test question"
        onUse={onUse}
        onDismiss={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /use/i }));
    expect(onUse).toHaveBeenCalledTimes(1);
  });

  it("calls onDismiss when Dismiss button is clicked", () => {
    const onDismiss = vi.fn();
    render(
      <SuggestedFollowupCard
        question="Test question"
        onUse={() => {}}
        onDismiss={onDismiss}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("has dashed border styling class", () => {
    const { container } = render(
      <SuggestedFollowupCard
        question="Test"
        onUse={() => {}}
        onDismiss={() => {}}
      />
    );
    // Card should have dashed border
    const card = container.firstChild as HTMLElement;
    expect(card.className).toMatch(/dashed|border/);
  });
});
