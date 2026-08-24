import { nextReconnectDelayMs, parseSseBuffer } from "./sse-parser";

describe("parseSseBuffer", () => {
  it("parses a single complete frame", () => {
    const { events, rest } = parseSseBuffer('data: {"a":1}\n\n');
    expect(events).toEqual([{ event: null, data: '{"a":1}', id: null }]);
    expect(rest).toBe("");
  });

  it("parses multiple frames delivered in one chunk", () => {
    const { events, rest } = parseSseBuffer(
      'data: {"a":1}\n\ndata: {"a":2}\n\n',
    );
    expect(events.map((e) => e.data)).toEqual(['{"a":1}', '{"a":2}']);
    expect(rest).toBe("");
  });

  it("retains an incomplete trailing frame for the next chunk", () => {
    const first = parseSseBuffer('data: {"a":1}\n\ndata: {"a":2');
    expect(first.events.map((e) => e.data)).toEqual(['{"a":1}']);
    expect(first.rest).toBe('data: {"a":2');

    const second = parseSseBuffer(first.rest + "}\n\n");
    expect(second.events.map((e) => e.data)).toEqual(['{"a":2}']);
    expect(second.rest).toBe("");
  });

  it("captures event and id fields alongside data", () => {
    const { events } = parseSseBuffer(
      'event: status\nid: 42\ndata: {"a":1}\n\n',
    );
    expect(events).toEqual([{ event: "status", data: '{"a":1}', id: "42" }]);
  });

  it("joins multi-line data fields with newlines", () => {
    const { events } = parseSseBuffer("data: line1\ndata: line2\n\n");
    expect(events[0]?.data).toBe("line1\nline2");
  });

  it("ignores comment lines used as SSE keep-alives", () => {
    const { events, rest } = parseSseBuffer(": ping\n\ndata: {" + '"a":1}\n\n');
    expect(events).toEqual([{ event: null, data: '{"a":1}', id: null }]);
    expect(rest).toBe("");
  });

  it("normalizes CRLF line endings", () => {
    const { events } = parseSseBuffer('data: {"a":1}\r\n\r\n');
    expect(events).toEqual([{ event: null, data: '{"a":1}', id: null }]);
  });

  it("returns no events for an empty or whitespace-only buffer", () => {
    expect(parseSseBuffer("").events).toEqual([]);
    expect(parseSseBuffer("\n\n").events).toEqual([]);
  });
});

describe("nextReconnectDelayMs", () => {
  it("doubles the delay for each successive attempt", () => {
    expect(nextReconnectDelayMs(0, 1000, 30000)).toBe(1000);
    expect(nextReconnectDelayMs(1, 1000, 30000)).toBe(2000);
    expect(nextReconnectDelayMs(2, 1000, 30000)).toBe(4000);
  });

  it("caps the delay at the configured maximum", () => {
    expect(nextReconnectDelayMs(10, 1000, 30000)).toBe(30000);
  });

  it("treats negative attempts as the first attempt", () => {
    expect(nextReconnectDelayMs(-1, 1000, 30000)).toBe(1000);
  });
});
