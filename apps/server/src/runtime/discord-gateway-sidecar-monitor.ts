import type {
  DiscordGatewaySidecarHeartbeat,
  DiscordGatewaySidecarOps,
} from "@neobuni/contracts";

const DISCORD_GATEWAY_HEARTBEAT_STALE_MULTIPLIER = 3;
const MIN_DISCORD_GATEWAY_HEARTBEAT_STALE_WINDOW_MS = 30_000;

interface DiscordGatewaySidecarMonitorDeps {
  now: () => string;
}

interface DiscordGatewaySidecarHeartbeatRecord {
  heartbeat: DiscordGatewaySidecarHeartbeat;
  receivedAt: string;
}

const createDiscordGatewaySidecarMonitor = (
  deps: Partial<DiscordGatewaySidecarMonitorDeps> = {}
) => {
  const effectiveDeps: DiscordGatewaySidecarMonitorDeps = {
    now: () => new Date().toISOString(),
    ...deps,
  };
  let latestHeartbeat: DiscordGatewaySidecarHeartbeatRecord | null = null;

  const getHeartbeatAgeMs = (input: { receivedAt: string; now: string }) => {
    const deltaMs = Date.parse(input.now) - Date.parse(input.receivedAt);
    return Number.isFinite(deltaMs) && deltaMs >= 0 ? Math.trunc(deltaMs) : 0;
  };

  return {
    recordHeartbeat: (heartbeat: DiscordGatewaySidecarHeartbeat) => {
      latestHeartbeat = {
        heartbeat,
        receivedAt: effectiveDeps.now(),
      };

      return {
        accepted: true as const,
      };
    },
    getSnapshot: (): DiscordGatewaySidecarOps => {
      if (!latestHeartbeat) {
        return {
          status: "down",
          stale: true,
          heartbeatAgeMs: null,
          staleAfterMs: null,
          heartbeat: null,
        };
      }

      const heartbeatAgeMs = getHeartbeatAgeMs({
        receivedAt: latestHeartbeat.receivedAt,
        now: effectiveDeps.now(),
      });
      const staleAfterMs = Math.max(
        MIN_DISCORD_GATEWAY_HEARTBEAT_STALE_WINDOW_MS,
        latestHeartbeat.heartbeat.heartbeatIntervalMs *
          DISCORD_GATEWAY_HEARTBEAT_STALE_MULTIPLIER
      );
      const stale = heartbeatAgeMs > staleAfterMs;
      const hasDegradedSession = latestHeartbeat.heartbeat.sessions.some(
        (session) => session.status === "degraded"
      );
      const status = stale
        ? "down"
        : latestHeartbeat.heartbeat.enabled
          ? latestHeartbeat.heartbeat.lastReconcileStatus === "error" ||
            hasDegradedSession
            ? "degraded"
            : "healthy"
          : "disabled";

      return {
        status,
        stale,
        heartbeatAgeMs,
        staleAfterMs,
        heartbeat: latestHeartbeat.heartbeat,
      };
    },
  };
};

const defaultDiscordGatewaySidecarMonitor =
  createDiscordGatewaySidecarMonitor();

const recordDiscordGatewayHeartbeat =
  defaultDiscordGatewaySidecarMonitor.recordHeartbeat;
const getDiscordGatewaySidecarOpsSnapshot =
  defaultDiscordGatewaySidecarMonitor.getSnapshot;

export {
  createDiscordGatewaySidecarMonitor,
  DISCORD_GATEWAY_HEARTBEAT_STALE_MULTIPLIER,
  getDiscordGatewaySidecarOpsSnapshot,
  MIN_DISCORD_GATEWAY_HEARTBEAT_STALE_WINDOW_MS,
  recordDiscordGatewayHeartbeat,
};
