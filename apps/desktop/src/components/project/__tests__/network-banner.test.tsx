import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NetworkBanner } from "../../network-banner";

// Mock useNetworkStatus hook
vi.mock("@/lib/network", () => ({
  useNetworkStatus: vi.fn(),
}));

import { useNetworkStatus } from "@/lib/network";
const mockUseNetworkStatus = useNetworkStatus as ReturnType<typeof vi.fn>;

describe("NetworkBanner", () => {
  it("renders nothing when online", () => {
    mockUseNetworkStatus.mockReturnValue({ status: "online", lastChecked: null });
    const { container } = render(<NetworkBanner />);
    // Banner should not be visible when online
    expect(container.firstChild).toBeNull();
  });

  it("shows offline message when offline", () => {
    mockUseNetworkStatus.mockReturnValue({ status: "offline", lastChecked: null });
    render(<NetworkBanner />);
    expect(screen.getByText(/offline/i)).toBeInTheDocument();
    expect(screen.getByText(/recordings will upload/i)).toBeInTheDocument();
  });

  it("shows api-unreachable message", () => {
    mockUseNetworkStatus.mockReturnValue({ status: "api-unreachable", lastChecked: null });
    render(<NetworkBanner />);
    expect(screen.getByText(/can't reach/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("shows auth-expired message with sign-in link", () => {
    mockUseNetworkStatus.mockReturnValue({ status: "auth-expired", lastChecked: null });
    render(<NetworkBanner />);
    expect(screen.getByText(/session expired/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign in/i })).toBeInTheDocument();
  });

  it("shows rate-limited message", () => {
    mockUseNetworkStatus.mockReturnValue({ status: "rate-limited", lastChecked: null });
    render(<NetworkBanner />);
    expect(screen.getByText(/catching up/i)).toBeInTheDocument();
  });
});
