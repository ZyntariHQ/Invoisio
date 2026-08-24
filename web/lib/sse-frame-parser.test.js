import test from 'node:test';
import assert from 'node:assert/strict';
import { createSseFrameParser } from './sse-frame-parser.js';

function collect() {
  const messages = [];
  const parser = createSseFrameParser((payload) => messages.push(payload));
  return { parser, messages };
}

test('parses a single JSON message', () => {
  const { parser, messages } = collect();
  parser.push('data:{"invoiceId":"inv-1","status":"paid"}\n\n');
  assert.deepEqual(messages, ['{"invoiceId":"inv-1","status":"paid"}']);
});

test('parses multiple messages delivered in one chunk', () => {
  const { parser, messages } = collect();
  parser.push(
    'data:{"status":"pending"}\n\ndata:{"status":"paid"}\n\n',
  );
  assert.equal(messages.length, 2);
  assert.deepEqual(messages[1], '{"status":"paid"}');
});

test('reassembles a message split across chunks', () => {
  const { parser, messages } = collect();
  parser.push('data:{"invoiceId":"inv-');
  parser.push('2","status":"proc');
  parser.push('essing"}\n\n');
  assert.deepEqual(messages, ['{"invoiceId":"inv-2","status":"processing"}']);
});

test('handles CRLF line endings', () => {
  const { parser, messages } = collect();
  parser.push('data:{"status":"paid"}\r\n\r\n');
  assert.deepEqual(messages, ['{"status":"paid"}']);
});

test('ignores comment heartbeat lines without dispatching', () => {
  const { parser, messages } = collect();
  parser.push(': heartbeat\n\n');
  assert.deepEqual(messages, []);

  parser.push(': ping\ndata:{"status":"paid"}\n\n');
  assert.deepEqual(messages, ['{"status":"paid"}']);
});

test('joins multi-line data payloads with newlines', () => {
  const { parser, messages } = collect();
  parser.push('data:first\ndata:second\n\n');
  assert.deepEqual(messages, ['first\nsecond']);
});

test('strips a single leading space after the data field colon', () => {
  const { parser, messages } = collect();
  parser.push('data: {"status":"paid"}\n\n');
  assert.deepEqual(messages, ['{"status":"paid"}']);
});

test('ignores other SSE fields such as id and event', () => {
  const { parser, messages } = collect();
  parser.push('id:42\nevent:invoice-status\ndata:{"status":"paid"}\n\n');
  assert.deepEqual(messages, ['{"status":"paid"}']);
});

test('flush emits a message when the stream ends without trailing newline', () => {
  const { parser, messages } = collect();
  parser.push('data:{"status":"paid"}\ndata:{"status":"cancelled"}');
  assert.deepEqual(messages, []);
  parser.flush();
  assert.deepEqual(messages.length, 1);
  assert.equal(messages[0], '{"status":"paid"}\n{"status":"cancelled"}');
});
