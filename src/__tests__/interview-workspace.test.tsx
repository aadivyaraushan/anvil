import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Interview } from "@/lib/supabase/types";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "proj-1", interviewId: "int-1" }),
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    type,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    type?: "button" | "submit" | "reset";
  }) => (
    <button type={type ?? "button"} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

type SocketHandler = (payload?: unknown) => void;

const socketHandlers: Record<string, SocketHandler> = {};
const sendMediaMock = vi.fn();
const closeMock = vi.fn();
const connectMock = vi.fn(async () => ({
  on: vi.fn((event: string, handler: SocketHandler) => {
    socketHandlers[event] = handler;
  }),
  sendMedia: sendMediaMock,
  close: closeMock,
}));

vi.mock("@deepgram/sdk", () => ({
  DeepgramClient: vi.fn().mockImplementation(function DeepgramClientMock() {
    return {
      listen: {
        v1: {
          connect: connectMock,
        },
      },
    };
  }),
}));

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];

  listeners: Record<string, ((event: { data: { size: number } }) => void) | undefined> =
    {};
  start = vi.fn();

  constructor(_stream: MediaStream, _options: { mimeType: string }) {
    FakeMediaRecorder.instances.push(this);
  }

  addEventListener(
    event: string,
    handler: (event: { data: { size: number } }) => void
  ) {
    this.listeners[event] = handler;
  }

  emitDataAvailable(size = 4) {
    this.listeners.dataavailable?.({ data: { size } });
  }
}

const stopTrackMock = vi.fn();
const getUserMediaMock = vi.fn(async () => ({
  getTracks: () => [{ stop: stopTrackMock }],
}));

const patchBodies: Array<Record<string, unknown>> = [];
let interviewFixture: Interview;
let copilotChunks: string[] = [];

function createCopilotResponse(lines: string[]) {
  return {
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        for (const line of lines) {
          controller.enqueue(encoder.encode(`${line}\n`));
        }
        controller.close();
      },
    }),
  };
}

const fetchMock = vi.fn(
  async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);

    if (url === "/api/deepgram/token") {
      return {
        json: async () => ({ key: "dg-test-key" }),
      };
    }

    if (url === "/api/projects/proj-1/interviews/int-1/copilot") {
      return createCopilotResponse(copilotChunks);
    }

    if (url === "/api/projects/proj-1/interviews/int-1" && !init?.method) {
      return {
        json: async () => interviewFixture,
      };
    }

    if (url === "/api/projects/proj-1/interviews/int-1" && init?.method === "PATCH") {
      patchBodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return {
        json: async () => ({ ok: true }),
      };
    }

    throw new Error(`Unhandled fetch in test: ${url}`);
  }
);

async function renderPage() {
  const module = await import(
    "@/app/(app)/project/[id]/interviews/[interviewId]/page"
  );
  const Page = module.default;
  render(<Page />);
}

describe("InterviewWorkspacePage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();

    patchBodies.length = 0;
    copilotChunks = [];
    pushMock.mockReset();
    connectMock.mockClear();
    sendMediaMock.mockClear();
    closeMock.mockClear();
    stopTrackMock.mockClear();
    getUserMediaMock.mockClear();
    FakeMediaRecorder.instances = [];
    Object.keys(socketHandlers).forEach((key) => delete socketHandlers[key]);

    interviewFixture = {
      id: "int-1",
      project_id: "proj-1",
      contact_id: null,
      persona_id: null,
      meeting_platform: "zoom",
      meeting_link: "https://zoom.us/j/test",
      scheduled_at: "2026-04-20T10:30:00.000Z",
      status: "scheduled",
      transcript: [],
      suggested_questions: [],
      brief: null,
      brief_status: "idle",
      calendar_event_id: null,
      interviewee_name: null,
      interviewee_email: null,
      created_at: "2026-04-20T10:00:00.000Z",
    };

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      value: vi.fn(),
      configurable: true,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: getUserMediaMock },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts recording, streams transcript, fetches copilot suggestions, and saves transcript snapshots", async () => {
    copilotChunks = [
      'data: {"text":"Ask how they measure success"}',
      'data: {"text":"\\nProbe on monthly reporting blockers"}',
      "data: [DONE]",
    ];
    interviewFixture = {
      ...interviewFixture,
      transcript: [
        { speaker: "interviewer", text: "Intro question", timestamp: 0 },
        { speaker: "interviewer", text: "What is hardest today?", timestamp: 5000 },
        { speaker: "interviewer", text: "How often does it happen?", timestamp: 10000 },
      ],
    };

    await renderPage();

    await screen.findByText("Start Recording");

    await act(async () => {
      fireEvent.click(screen.getByText("Start Recording"));
    });

    expect(getUserMediaMock).toHaveBeenCalledWith({ audio: true });
    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(
      patchBodies.some((body) => body.status === "live")
    ).toBe(true);

    await act(async () => {
      socketHandlers.open?.();
    });

    expect(FakeMediaRecorder.instances).toHaveLength(1);
    expect(FakeMediaRecorder.instances[0]?.start).toHaveBeenCalledWith(250);

    await act(async () => {
      FakeMediaRecorder.instances[0]?.emitDataAvailable(8);
    });
    expect(sendMediaMock).toHaveBeenCalled();

    vi.useFakeTimers();
    await act(async () => {
      socketHandlers.message?.({
        type: "Results",
        is_final: true,
        channel: {
          alternatives: [{ transcript: "We spend days on reconciliation." }],
        },
      });
    });

    expect(screen.getByText("We spend days on reconciliation.")).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });
    vi.useRealTimers();

    expect(
      patchBodies.some((body) =>
        Array.isArray(body.transcript) &&
        body.transcript.some(
          (chunk) =>
            typeof chunk === "object" &&
            chunk !== null &&
            "text" in chunk &&
            chunk.text === "We spend days on reconciliation."
        )
      )
    ).toBe(true);

    await act(async () => {
      fireEvent.click(screen.getByText("Refresh"));
    });

    await waitFor(() => {
      expect(screen.getByText(/Ask how they measure success/i)).toBeTruthy();
    });
    expect(screen.getByText(/Probe on monthly reporting blockers/i)).toBeTruthy();
  });

  it("completes the interview and navigates back to the interviews list", async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText("Complete")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Complete"));
    });

    expect(
      patchBodies.some(
        (body) => Array.isArray(body.transcript) && body.transcript.length === 0
      )
    ).toBe(true);
    expect(
      patchBodies.some((body) => body.status === "completed")
    ).toBe(true);
    expect(pushMock).toHaveBeenCalledWith("/project/proj-1/interviews");
  });
});
