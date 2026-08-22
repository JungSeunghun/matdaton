import { notFound, unauthorized } from "@/lib/api/errors";
import { subscribeExecutionEvents } from "@/lib/api/event-registry";
import { getSessionUser } from "@/lib/api/session";
import { createWorkflowDeps } from "@/lib/api/workflow-deps";
import type { ExecutionProgressEvent, ExecutionStatus } from "@/lib/contracts/schemas";

export const dynamic = "force-dynamic";

const PING_INTERVAL_MS = 15_000;
const TERMINAL_STATUSES = new Set<ExecutionStatus>([
  "completed",
  "failed",
  "rejected",
  "expired",
]);

function isTerminalEvent(event: ExecutionProgressEvent): boolean {
  return event.type === "stage_changed" && TERMINAL_STATUSES.has(event.stage);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  const { id } = await params;
  const { store } = createWorkflowDeps();
  const execution = await store.getExecution(user.userId, id);
  if (!execution) return notFound();

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      let initialized = false;
      let closed = false;
      let unsubscribe: (() => void) | undefined;
      let pingInterval: ReturnType<typeof setInterval> | undefined;
      const pendingEvents: ExecutionProgressEvent[] = [];

      const handleAbort = () => close();

      cleanup = () => {
        if (closed) return;
        closed = true;
        if (pingInterval) clearInterval(pingInterval);
        unsubscribe?.();
        request.signal.removeEventListener("abort", handleAbort);
      };

      const close = () => {
        cleanup();
        controller.close();
      };

      const sendEvent = (event: ExecutionProgressEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        if (isTerminalEvent(event)) close();
      };

      const handleEvent = (event: ExecutionProgressEvent) => {
        if (!initialized) {
          pendingEvents.push(event);
          return;
        }
        sendEvent(event);
      };

      request.signal.addEventListener("abort", handleAbort, { once: true });
      unsubscribe = subscribeExecutionEvents(id, handleEvent);

      sendEvent({ type: "stage_changed", executionId: id, stage: execution.status });
      initialized = true;

      for (const event of pendingEvents) {
        if (closed) break;
        sendEvent(event);
      }

      if (!closed) {
        pingInterval = setInterval(() => {
          if (!closed) controller.enqueue(encoder.encode(": ping\n\n"));
        }, PING_INTERVAL_MS);
      }

      if (request.signal.aborted && !closed) close();
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
