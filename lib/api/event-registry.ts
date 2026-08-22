import { getExecutionEventBus, type ExecutionProgressEvent } from "@/lib/workflow/execution-events";

const MAX_HISTORY_PER_EXECUTION = 200;

// Next dev 핫리로드에서도 히스토리가 유지되도록 globalThis에 캐싱
const GLOBAL_KEY = "__matdaton_execution_event_history__";

type GlobalWithHistory = typeof globalThis & { [GLOBAL_KEY]?: Map<string, ExecutionProgressEvent[]> };

function getHistoryMap(): Map<string, ExecutionProgressEvent[]> {
  const globalRef = globalThis as GlobalWithHistory;
  globalRef[GLOBAL_KEY] ??= new Map();
  return globalRef[GLOBAL_KEY];
}

export function publishExecutionEvent(event: ExecutionProgressEvent): void {
  const historyMap = getHistoryMap();
  let buffer = historyMap.get(event.executionId);
  if (!buffer) {
    buffer = [];
    historyMap.set(event.executionId, buffer);
  }
  buffer.push(event);
  if (buffer.length > MAX_HISTORY_PER_EXECUTION) buffer.splice(0, buffer.length - MAX_HISTORY_PER_EXECUTION);
  getExecutionEventBus().publish(event);
}

export function getExecutionEventHistory(executionId: string): ExecutionProgressEvent[] {
  return [...(getHistoryMap().get(executionId) ?? [])];
}

export function subscribeExecutionEvents(
  executionId: string,
  listener: (event: ExecutionProgressEvent) => void,
): () => void {
  return getExecutionEventBus().subscribe(executionId, listener);
}

export function clearExecutionEventHistory(executionId: string): void {
  getHistoryMap().delete(executionId);
}
