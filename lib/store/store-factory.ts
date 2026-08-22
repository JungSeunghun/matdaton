import { getServerConfig } from "@/lib/config";
import { createCosmosStore } from "./cosmos-store";
import type { ExecutionStore } from "./execution-store";
import { createMemoryStore } from "./memory-store";

const STORE_KEY = "__firstMoveStore";

type StoreGlobal = typeof globalThis & { [STORE_KEY]?: ExecutionStore };

// Cosmos 설정 유무에 따라 스토어를 선택하고 globalThis에 캐싱
export function getStore(): ExecutionStore {
  const globalRef = globalThis as StoreGlobal;
  if (!globalRef[STORE_KEY]) {
    const config = getServerConfig();
    globalRef[STORE_KEY] = config.cosmos ? createCosmosStore(config.cosmos) : createMemoryStore();
  }
  return globalRef[STORE_KEY];
}
