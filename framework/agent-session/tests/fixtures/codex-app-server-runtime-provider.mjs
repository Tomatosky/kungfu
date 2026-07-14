// SPDX-License-Identifier: Apache-2.0

import readline from 'node:readline';

const mode = process.argv[2] ?? 'late-turn-response';
const lines = readline.createInterface({ input: process.stdin });

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function turn(threadId, turnId, status = 'inProgress') {
  return { id: turnId, status, items: [] };
}

lines.on('line', (line) => {
  const message = JSON.parse(line);
  if (message.method === 'initialize') {
    send({ id: message.id, result: { userAgent: 'synthetic-redacted' } });
    return;
  }
  if (message.method === 'initialized') {
    if (mode === 'malformed') {
      process.stdout.write('{not-json}\n');
    } else if (mode === 'unknown-method') {
      send({ method: 'provider/unknown', params: {} });
    } else if (mode === 'burst') {
      for (let index = 0; index < 32; index += 1) {
        send({
          method: 'thread/status/changed',
          params: { threadId: `thread-${index}`, status: { type: 'idle' } },
        });
      }
    } else if (mode === 'server-request') {
      send({
        id: 'approval-1',
        method: 'item/commandExecution/requestApproval',
        params: {
          threadId: 'thread-1',
          turnId: 'turn-1',
          itemId: 'item-1',
          startedAtMs: 1,
        },
      });
    } else if (mode === 'multi-identity') {
      send({
        method: 'turn/started',
        params: { threadId: 'thread-a', turn: turn('thread-a', 'turn-a') },
      });
      send({
        method: 'turn/started',
        params: { threadId: 'thread-b', turn: turn('thread-b', 'turn-b') },
      });
    } else if (mode === 'stderr-redaction') {
      process.stderr.write('synthetic-secret-must-not-be-retained');
    } else if (mode === 'stdout-end') {
      process.stdout.end();
    }
    return;
  }
  if (message.method === 'turn/start') {
    const threadId = message.params.threadId;
    send({
      method: 'turn/started',
      params: { threadId, turn: turn(threadId, 'turn-authority') },
    });
    send({
      method: 'turn/completed',
      params: {
        threadId,
        turn: turn(threadId, 'turn-authority', 'completed'),
      },
    });
    setTimeout(
      () => send({ id: message.id, result: { turn: { id: 'turn-authority' } } }),
      10,
    );
  }
});

process.on('SIGTERM', () => process.exit(0));
