import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ThinkingDots } from "../../primitives/thinking-dots";

describe("ThinkingDots", () => {
  it("renders three dot elements", () => {
    const { container } = render(<ThinkingDots />);
    // Three dot spans
    const dots = container.querySelectorAll("[class*='rounded-full']");
    expect(dots.length).toBeGreaterThanOrEqual(3);
  });

  it("renders optional label when provided", () => {
    render(<ThinkingDots label="Analyzing…" />);
    expect(screen.getByText("Analyzing…")).toBeInTheDocument();
  });

  it("renders without label by default", () => {
    const { container } = render(<ThinkingDots />);
    // No visible text
    expect(container.textContent?.trim()).toBe("");
  });
});
