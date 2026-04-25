/**
 * Unit-level Tauri coverage. The `useTauri` hook is the single boundary
 * between the rest of the app and the Tauri runtime — every `invoke`,
 * `emit`, `listen`, and file-system read funnels through here.
 *
 * Real Tauri runtime tests would need `tauri-driver` driving a built
 * `.app`. These tests instead verify the wrapper's contract:
 *   - in a non-Tauri environment, every operation degrades to `null` /
 *     no-op and never imports the Tauri modules (which would fail);
 *   - in a Tauri environment (window.__TAURI_INTERNALS__ present), the
 *     dynamic imports are reached and called with the right args.
 *
 * That contract is what callers across the app rely on; getting it wrong
 * is what would crash the dev/browser flow with "Cannot find module
 * @tauri-apps/api/core" — historically a real recurring bug.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTauri } from "../use-tauri";

describe("useTauri — non-Tauri environment", () => {
  // jsdom doesn't define __TAURI_INTERNALS__, so detection must return false.
  it("isTauri is false in jsdom", () => {
    const { result } = renderHook(() => useTauri());
    expect(result.current.isTauri).toBe(false);
  });

  it("invoke returns null and never throws when Tauri is absent", async () => {
    const { result } = renderHook(() => useTauri());
    const v = await result.current.invoke<string>("anything");
    expect(v).toBeNull();
  });

  it("emit is a no-op when Tauri is absent", async () => {
    const { result } = renderHook(() => useTauri());
    // Should resolve without throwing.
    await expect(
      result.current.emit("some-event", { x: 1 }),
    ).resolves.toBeUndefined();
  });

  it("listen returns null when Tauri is absent (caller can short-circuit)", async () => {
    const { result } = renderHook(() => useTauri());
    const unlisten = await result.current.listen("some-event", () => {});
    expect(unlisten).toBeNull();
  });

  it("readFileBytes returns null when Tauri is absent", async () => {
    const { result } = renderHook(() => useTauri());
    const bytes = await result.current.readFileBytes("/tmp/x.bin");
    expect(bytes).toBeNull();
  });
});

describe("useTauri — simulated Tauri environment", () => {
  // Stash and restore window.__TAURI_INTERNALS__ around each test so we
  // don't leak the simulated runtime to other suites.
  let originalInternals: unknown;

  beforeEach(() => {
    originalInternals = (
      window as unknown as { __TAURI_INTERNALS__?: unknown }
    ).__TAURI_INTERNALS__;
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
  });

  afterEach(() => {
    if (originalInternals === undefined) {
      delete (window as unknown as { __TAURI_INTERNALS__?: unknown })
        .__TAURI_INTERNALS__;
    } else {
      (
        window as unknown as { __TAURI_INTERNALS__?: unknown }
      ).__TAURI_INTERNALS__ = originalInternals;
    }
    vi.resetModules();
  });

  it("isTauri detects __TAURI_INTERNALS__", () => {
    const { result } = renderHook(() => useTauri());
    expect(result.current.isTauri).toBe(true);
  });

  it("invoke routes through @tauri-apps/api/core", async () => {
    const invokeSpy = vi.fn(async () => "ok");
    vi.doMock("@tauri-apps/api/core", () => ({ invoke: invokeSpy }));

    // Re-import after mock so the dynamic import inside useTauri picks it up.
    const { useTauri: useTauriFresh } = await import("../use-tauri");
    const { result } = renderHook(() => useTauriFresh());

    const v = await result.current.invoke<string>("start_recording", {
      projectId: "p1",
    });
    expect(v).toBe("ok");
    expect(invokeSpy).toHaveBeenCalledWith("start_recording", {
      projectId: "p1",
    });
  });

  it("emit routes through @tauri-apps/api/event", async () => {
    const emitSpy = vi.fn(async () => undefined);
    vi.doMock("@tauri-apps/api/event", () => ({
      emit: emitSpy,
      listen: vi.fn(),
    }));

    const { useTauri: useTauriFresh } = await import("../use-tauri");
    const { result } = renderHook(() => useTauriFresh());

    await result.current.emit("recording-started", { foo: 1 });
    expect(emitSpy).toHaveBeenCalledWith("recording-started", { foo: 1 });
  });

  it("listen wires the Tauri payload into the user handler", async () => {
    type Payload = { ok: boolean };
    let registered: ((e: { payload: Payload }) => void) | undefined;
    const unlisten = vi.fn();
    vi.doMock("@tauri-apps/api/event", () => ({
      emit: vi.fn(),
      listen: vi.fn(async (_evt: string, cb: (e: { payload: Payload }) => void) => {
        registered = cb;
        return unlisten;
      }),
    }));

    const { useTauri: useTauriFresh } = await import("../use-tauri");
    const { result } = renderHook(() => useTauriFresh());

    const handler = vi.fn();
    const off = await result.current.listen<Payload>("recording-started", handler);
    expect(typeof off).toBe("function");

    // Simulate a Tauri event firing.
    registered?.({ payload: { ok: true } });
    expect(handler).toHaveBeenCalledWith({ ok: true });

    off?.();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("readFileBytes returns the raw Uint8Array from plugin-fs", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    vi.doMock("@tauri-apps/plugin-fs", () => ({
      readFile: vi.fn(async () => bytes),
    }));

    const { useTauri: useTauriFresh } = await import("../use-tauri");
    const { result } = renderHook(() => useTauriFresh());

    const got = await result.current.readFileBytes("/tmp/x.bin");
    expect(got).toEqual(bytes);
  });
});
