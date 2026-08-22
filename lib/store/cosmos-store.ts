import { CosmosClient, type Container } from "@azure/cosmos";
import type { CommentDraft, Execution, ExecutionStatus, MetricEvent } from "@/lib/contracts/schemas";
import type { CosmosConfig } from "@/lib/config";
import { canTransition } from "@/lib/workflow/execution-state";
import type { ExecutionStore } from "./execution-store";

type Containers = {
  executions: Container;
  metrics: Container;
  drafts: Container;
};

function statusOf(error: unknown): number | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? (error as { code?: number }).code
    : undefined;
}

// Cosmos 시스템 속성(_로 시작)을 제거해 도메인 객체만 반환
function stripSystemProps<T>(doc: Record<string, unknown>): T {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc)) {
    if (!key.startsWith("_")) clean[key] = value;
  }
  return clean as T;
}

export function createCosmosStore(config: CosmosConfig): ExecutionStore {
  const client = new CosmosClient({ endpoint: config.endpoint, key: config.key });

  let containersPromise: Promise<Containers> | null = null;

  // 컨테이너 3종을 최초 1회만 lazy 생성
  const getContainers = (): Promise<Containers> => {
    containersPromise ??= (async () => {
      const { database } = await client.databases.createIfNotExists({ id: config.databaseId });
      const [executions, metrics, drafts] = await Promise.all([
        database.containers.createIfNotExists({ id: "executions", partitionKey: "/userId" }),
        database.containers.createIfNotExists({ id: "metrics", partitionKey: "/userId" }),
        database.containers.createIfNotExists({ id: "drafts", partitionKey: "/userId" }),
      ]);
      return { executions: executions.container, metrics: metrics.container, drafts: drafts.container };
    })();
    return containersPromise;
  };

  return {
    async createExecution(execution: Execution) {
      const { executions } = await getContainers();
      try {
        await executions.items.create(execution);
      } catch (error) {
        if (statusOf(error) === 409) throw new Error(`execution already exists: ${execution.id}`);
        throw error;
      }
    },

    async getExecution(userId: string, executionId: string) {
      const { executions } = await getContainers();
      const { resource } = await executions.item(executionId, userId).read<Record<string, unknown>>();
      return resource ? stripSystemProps<Execution>(resource) : null;
    },

    async updateExecution(userId: string, executionId: string, patch: Partial<Execution>) {
      const { executions } = await getContainers();
      const item = executions.item(executionId, userId);
      const { resource } = await item.read<Record<string, unknown>>();
      if (!resource) throw new Error(`execution not found: ${executionId}`);
      const merged = { ...stripSystemProps<Execution>(resource), ...patch };
      await item.replace(merged);
      return merged;
    },

    async transitionStatus(userId: string, executionId: string, from: ExecutionStatus, to: ExecutionStatus) {
      const { executions } = await getContainers();
      const item = executions.item(executionId, userId);
      const { resource, etag } = await item.read<Record<string, unknown>>();
      if (!resource) return false;
      const existing = stripSystemProps<Execution>(resource);
      if (existing.status !== from || !canTransition(from, to)) return false;
      try {
        // ETag 조건부 replace로 동시 전이 경합 방지
        await item.replace(
          { ...existing, status: to },
          { accessCondition: { type: "IfMatch", condition: etag ?? "" } },
        );
        return true;
      } catch (error) {
        if (statusOf(error) === 412) return false;
        throw error;
      }
    },

    async appendMetricEvent(event: MetricEvent) {
      const { metrics } = await getContainers();
      await metrics.items.create(event);
    },

    async listMetricEvents(userId: string, date?: string) {
      const { metrics } = await getContainers();
      const query =
        date === undefined
          ? {
              query: "SELECT * FROM c WHERE c.userId = @userId",
              parameters: [{ name: "@userId", value: userId }],
            }
          : {
              query: "SELECT * FROM c WHERE c.userId = @userId AND c.date = @date",
              parameters: [
                { name: "@userId", value: userId },
                { name: "@date", value: date },
              ],
            };
      const { resources } = await metrics.items
        .query<Record<string, unknown>>(query, { partitionKey: userId })
        .fetchAll();
      return resources.map((doc) => stripSystemProps<MetricEvent>(doc));
    },

    async saveCommentDraft(draft: CommentDraft) {
      const { drafts } = await getContainers();
      await drafts.items.upsert(draft);
    },

    async getCommentDraft(id: string) {
      const { drafts } = await getContainers();
      const { resources } = await drafts.items
        .query<Record<string, unknown>>({
          query: "SELECT * FROM c WHERE c.id = @id",
          parameters: [{ name: "@id", value: id }],
        })
        .fetchAll();
      const doc = resources[0];
      return doc ? stripSystemProps<CommentDraft>(doc) : null;
    },
  };
}
