import type { ExecutionProgressEvent } from "@/lib/contracts/schemas";

export type { ExecutionProgressEvent };

export type ExecutionEventListener = (event: ExecutionProgressEvent) => void;

export type ExecutionEventBus = {
  publish: (event: ExecutionProgressEvent) => void;
  subscribe: (executionId: string, listener: ExecutionEventListener) => () => void;
};

export function createExecutionEventBus(): ExecutionEventBus {
  const listeners = new Map<string, Set<ExecutionEventListener>>();

  return {
    publish(event) {
      const set = listeners.get(event.executionId);
      if (!set) return;
      for (const listener of set) listener(event);
    },
    subscribe(executionId, listener) {
      let set = listeners.get(executionId);
      if (!set) {
        set = new Set();
        listeners.set(executionId, set);
      }
      set.add(listener);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(executionId);
      };
    },
  };
}

// Next dev 핫리로드에서도 구독 상태가 유지되도록 globalThis에 캐싱
const GLOBAL_KEY = "__matdaton_execution_event_bus__";

type GlobalWithBus = typeof globalThis & { [GLOBAL_KEY]?: ExecutionEventBus };

export function getExecutionEventBus(): ExecutionEventBus {
  const globalRef = globalThis as GlobalWithBus;
  globalRef[GLOBAL_KEY] ??= createExecutionEventBus();
  return globalRef[GLOBAL_KEY];
}
