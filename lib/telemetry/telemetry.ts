import { getServerConfig } from "@/lib/config";

// ai.operation.id에 executionId를 넣어 App Insights에서 단일 trace로 묶는다
const OPERATION_ID_TAG = "ai.operation.id";

export type TelemetryClientLike = {
  trackEvent: (telemetry: {
    name: string;
    properties?: Record<string, string>;
    tagOverrides?: Record<string, string>;
  }) => void;
  trackException: (telemetry: {
    exception: Error;
    properties?: Record<string, string>;
    tagOverrides?: Record<string, string>;
  }) => void;
  flush: () => void;
};

export type Telemetry = {
  enabled: boolean;
  trackEvent: (name: string, executionId: string, properties?: Record<string, string>) => void;
  trackException: (error: Error, executionId: string, properties?: Record<string, string>) => void;
  flush: () => void;
};

export type CreateTelemetryOptions = {
  connectionString: string | null;
  clientFactory?: (connectionString: string) => TelemetryClientLike;
};

const NOOP_TELEMETRY: Telemetry = {
  enabled: false,
  trackEvent: () => {},
  trackException: () => {},
  flush: () => {},
};

function defaultClientFactory(connectionString: string): TelemetryClientLike {
  // Next.js 번들링·테스트에서 SDK를 조건부로만 로드
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { TelemetryClient } = require("applicationinsights") as typeof import("applicationinsights");
  return new TelemetryClient(connectionString);
}

export function createTelemetry(options: CreateTelemetryOptions): Telemetry {
  if (!options.connectionString) return NOOP_TELEMETRY;

  const client = (options.clientFactory ?? defaultClientFactory)(options.connectionString);

  return {
    enabled: true,
    trackEvent(name, executionId, properties) {
      client.trackEvent({
        name,
        properties: { executionId, ...properties },
        tagOverrides: { [OPERATION_ID_TAG]: executionId },
      });
    },
    trackException(error, executionId, properties) {
      client.trackException({
        exception: error,
        properties: { executionId, ...properties },
        tagOverrides: { [OPERATION_ID_TAG]: executionId },
      });
    },
    flush() {
      client.flush();
    },
  };
}

const TELEMETRY_KEY = "__firstMoveTelemetry";

type TelemetryGlobal = typeof globalThis & { [TELEMETRY_KEY]?: Telemetry };

// 연결 문자열 유무에 따라 실제/no-op 텔레메트리를 프로세스당 1회 생성
export function getTelemetry(): Telemetry {
  const globalRef = globalThis as TelemetryGlobal;
  globalRef[TELEMETRY_KEY] ??= createTelemetry({
    connectionString: getServerConfig().appInsightsConnectionString,
  });
  return globalRef[TELEMETRY_KEY];
}
