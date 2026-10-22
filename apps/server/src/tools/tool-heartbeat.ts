import type { ToolExecutionContext } from "@tanstack/ai";

interface ToolHeartbeatOptions {
  eventName: string;
  intervalMs?: number;
  payload?: Record<string, unknown>;
}

const DEFAULT_HEARTBEAT_INTERVAL_MS = 4000;

const runWithToolHeartbeat = async <T>(
  context: ToolExecutionContext | undefined,
  options: ToolHeartbeatOptions,
  task: () => Promise<T>
): Promise<T> => {
  if (!context) {
    return task();
  }

  const emit = (phase: "started" | "heartbeat" | "completed") => {
    context.emitCustomEvent(options.eventName, {
      phase,
      ...options.payload,
    });
  };

  emit("started");

  const timer = setInterval(() => {
    emit("heartbeat");
  }, options.intervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS);

  try {
    const result = await task();
    emit("completed");
    return result;
  } finally {
    clearInterval(timer);
  }
};

export { runWithToolHeartbeat };
