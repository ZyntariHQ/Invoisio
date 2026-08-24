/**
 * Framework-agnostic parsing helpers for the text/event-stream (SSE) wire
 * format emitted by the backend's `@Sse()` endpoints. Kept dependency-free
 * so it can be unit tested without any React Native runtime.
 */

export interface ParsedSseEvent {
  event: string | null;
  data: string;
  id: string | null;
}

interface ParseResult {
  events: ParsedSseEvent[];
  rest: string;
}

/**
 * Parses as many complete SSE frames (terminated by a blank line) as are
 * present in `buffer`. Returns the parsed events plus whatever incomplete
 * trailing text should be retained for the next chunk.
 */
export function parseSseBuffer(buffer: string): ParseResult {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const frames = normalized.split("\n\n");
  // The last element is either "" (buffer ended on a blank line) or an
  // incomplete frame awaiting more data.
  const rest = frames.pop() ?? "";

  const events: ParsedSseEvent[] = [];
  for (const frame of frames) {
    if (frame.trim().length === 0) continue;
    const parsed = parseSseFrame(frame);
    if (parsed) events.push(parsed);
  }

  return { events, rest };
}

function parseSseFrame(frame: string): ParsedSseEvent | null {
  const dataLines: string[] = [];
  let event: string | null = null;
  let id: string | null = null;

  for (const line of frame.split("\n")) {
    if (line.startsWith(":")) continue; // comment / keep-alive
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).replace(/^ /, ""));
    } else if (line.startsWith("event:")) {
      event = line.slice(6).replace(/^ /, "");
    } else if (line.startsWith("id:")) {
      id = line.slice(3).replace(/^ /, "");
    }
  }

  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n"), id };
}

/**
 * Exponential backoff with a hard cap and no jitter, used to space out SSE
 * reconnect attempts. `attempt` is 0-indexed (first retry = attempt 0).
 */
export function nextReconnectDelayMs(
  attempt: number,
  baseMs = 1000,
  maxMs = 30000,
): number {
  const uncapped = baseMs * Math.pow(2, Math.max(0, attempt));
  return Math.min(uncapped, maxMs);
}
