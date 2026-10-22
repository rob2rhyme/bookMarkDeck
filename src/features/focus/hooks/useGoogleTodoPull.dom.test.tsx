import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Todo } from "@/features/focus/lib/types";
import { useGoogleTodoPull } from "./useGoogleTodoPull";

const T1 = "2026-10-23T14:00:00.000Z";
const T2 = "2026-10-24T09:30:00.000Z";

const todo = (over: Partial<Todo> = {}): Todo => ({
  id: "t1",
  text: "Call mum",
  note: "",
  done: false,
  dueAt: T1,
  createdAt: null,
  day: "2026-10-20",
  googleTaskId: "gt",
  googleEventId: "ge",
  gsync: { dueAt: T1, done: false },
  ...over,
});

let fetchMock: ReturnType<typeof vi.fn>;
let reply: object;

beforeEach(() => {
  vi.useFakeTimers();
  reply = { results: [] };
  fetchMock = vi.fn(async () => new Response(JSON.stringify(reply), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(2_100); });

describe("useGoogleTodoPull", () => {
  it("is inert while Google sync is off", async () => {
    renderHook(() => useGoogleTodoPull(false, [todo()], vi.fn()));
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks about mirrored, open, personal to-dos only", async () => {
    renderHook(() =>
      useGoogleTodoPull(
        true,
        [
          todo(),
          todo({ id: "done", done: true }),
          todo({ id: "project", list: "project" }),
          todo({ id: "unmirrored", googleTaskId: null, googleEventId: null }),
        ],
        vi.fn()
      )
    );
    await settle();
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.items.map((i: { id: string }) => i.id)).toEqual(["t1"]);
  });

  it("does not call at all when nothing is mirrored", async () => {
    renderHook(() => useGoogleTodoPull(true, [todo({ googleTaskId: null, googleEventId: null })], vi.fn()));
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("hands over a completion and a moved event it finds", async () => {
    reply = {
      results: [
        { id: "t1", task: { state: "ok", completed: true }, event: { state: "ok", start: T2 } },
      ],
    };
    const onPatch = vi.fn();
    renderHook(() => useGoogleTodoPull(true, [todo()], onPatch));
    await settle();
    expect(onPatch).toHaveBeenCalledTimes(1);
    expect(onPatch.mock.calls[0][1]).toMatchObject({ complete: true, dueAt: T2 });
  });

  it("hands over nothing when Google agrees", async () => {
    reply = { results: [{ id: "t1", task: { state: "ok", completed: false }, event: { state: "ok", start: T1 } }] };
    const onPatch = vi.fn();
    renderHook(() => useGoogleTodoPull(true, [todo()], onPatch));
    await settle();
    expect(onPatch).not.toHaveBeenCalled();
  });

  it("judges the to-do as it is when the answer arrives, not as it was asked", async () => {
    reply = { results: [{ id: "t1", task: { state: "ok", completed: true }, event: null }] };
    const onPatch = vi.fn();
    const { result, rerender } = renderHook(({ list }) => useGoogleTodoPull(true, list, onPatch), {
      initialProps: { list: [todo()] },
    });
    // Completed here while the request was out: Google's completion has nothing to do.
    // (Called outside act so the re-render inside the request is the outermost act.)
    fetchMock.mockImplementationOnce(async () => {
      await act(async () => rerender({ list: [todo({ done: true })] }));
      return new Response(JSON.stringify(reply), { status: 200 });
    });
    await result.current.pull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onPatch).not.toHaveBeenCalled();
  });

  it("changes nothing when the request fails", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const onPatch = vi.fn();
    renderHook(() => useGoogleTodoPull(true, [todo()], onPatch));
    await settle();
    expect(onPatch).not.toHaveBeenCalled();
  });

  it("pulls again when the tab regains focus, but not more than once a minute", async () => {
    renderHook(() => useGoogleTodoPull(true, [todo()], vi.fn()));
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1); // too soon

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
