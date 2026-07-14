import { bindAgentSessionSurfaceRpc } from '@kungfu-tech/agent-session/product-rpc';
import { InProcessAgentSessionProductRuntime } from '@kungfu-tech/agent-session/product-runtime';
import { AgentSessionProductSurface } from '@kungfu-tech/agent-session/product-surface';
import type { AgentSession } from '@kungfu-tech/api/capability';

import { AGENT_SESSION_CALL_CHANNEL } from '../sandbox/channels';

type IpcMainLike = {
  handle: (
    channel: string,
    listener: (event: unknown, payload: unknown) => unknown,
  ) => void;
  removeHandler: (channel: string) => void;
};

export function createMainAgentSessionHost(): AgentSession {
  const pty = require('node-pty');
  const runtime = new InProcessAgentSessionProductRuntime({
    pty,
    baseEnv: process.env as Record<string, string | undefined>,
  });
  const surface = new AgentSessionProductSurface({ runtime });
  return { invoke: (request) => surface.invoke(request) };
}

export function bindElectronAgentSessionHost(
  ipcMain: IpcMainLike,
  host: AgentSession,
) {
  ipcMain.handle(AGENT_SESSION_CALL_CHANNEL, (_event, request) =>
    host.invoke(request as Record<string, unknown> & { operation: string }),
  );
  return {
    dispose() {
      ipcMain.removeHandler(AGENT_SESSION_CALL_CHANNEL);
    },
  };
}

export function bindLocalAgentSessionHost(
  host: AgentSession,
  endpoint: string,
) {
  return bindAgentSessionSurfaceRpc({
    endpoint,
    invoke: (request: Record<string, unknown>) =>
      host.invoke(request as { operation: string }),
  });
}
