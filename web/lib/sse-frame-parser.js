/**
 * Incremental parser for Server-Sent Events (SSE) text streams.
 *
 * The backend realtime endpoint (`GET /realtime/invoices`) emits NestJS SSE
 * frames shaped like:
 *
 *   data:{"merchantId":"...","invoiceId":"...","status":"paid","at":"..."}

 *
 * Frames can be split across arbitrary chunk boundaries, may use CRLF line
 * endings and can include comment lines (e.g. `: heartbeat`) that must be
 * ignored. This parser handles all of those cases and hands fully assembled
 * message payloads to a callback.
 */

/**
 * @callback SseMessageHandler
 * @param {string} payload Raw `data:` payload of one message. JSON payloads are
 *   NOT parsed here so callers decide how to interpret them.
 */

/**
 * Create an incremental SSE frame parser.
 * @param {SseMessageHandler} onMessage Called once per completed SSE message.
 * @returns {{ push: (chunk: string) => void, flush: () => void }}
 */
export function createSseFrameParser(onMessage) {
  let buffer = '';
  let dataLines = [];

  function processLine(rawLine) {
    let line = rawLine;
    if (line.endsWith('\r')) {
      line = line.slice(0, -1);
    }

    if (line === '') {
      // Empty line: end of the current message.
      dispatch();
    } else if (line.startsWith(':')) {
      // Comment / keep-alive heartbeat from the server.
      return;
    } else if (line.startsWith('data:')) {
      let value = line.slice('data:'.length);
      if (value.startsWith(' ')) {
        value = value.slice(1);
      }
      dataLines.push(value);
    }
    // Other fields (event:, id:, retry:) are intentionally ignored.
  }

  function dispatch() {
    if (dataLines.length === 0) {
      return;
    }

    const payload = dataLines.join('\n');
    dataLines = [];
    onMessage(payload);
  }

  return {
    /**
     * Feed the next chunk of text from the stream into the parser.
     * @param {string} chunk
     */
    push(chunk) {
      buffer += chunk;

      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        processLine(line);
        newlineIndex = buffer.indexOf('\n');
      }
    },

    /**
     * Flush any buffered partial message. Useful when a server closes the
     * stream without a trailing empty line.
     */
    flush() {
      if (buffer.length > 0) {
        const line = buffer;
        buffer = '';
        processLine(line);
      }
      dispatch();
    },
  };
}
