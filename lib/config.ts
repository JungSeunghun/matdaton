export type CosmosConfig = {
  endpoint: string;
  key: string;
  databaseId: string;
};

export type FoundryConfig = {
  endpoint: string;
  apiKey: string;
  deployment: string;
};

export type ServerConfig = {
  hmacSecret: string;
  approvalTtlSeconds: number;
  githubToken: string | null;
  judgeGithubToken: string | null;
  defaultRepoRef: string | null;
  defaultIcsUrl: string | null;
  cosmos: CosmosConfig | null;
  foundry: FoundryConfig | null;
};

const DEV_HMAC_SECRET = "dev-insecure-hmac-secret";

let cachedConfig: ServerConfig | null = null;

function readEnv(name: string): string | null {
  const value = process.env[name];
  return value !== undefined && value !== "" ? value : null;
}

// 서버 환경 변수를 파싱해 프로세스당 1회 캐싱한다
export function getServerConfig(): ServerConfig {
  if (cachedConfig) return cachedConfig;

  const hmacSecret = readEnv("FIRST_MOVE_HMAC_SECRET") ?? DEV_HMAC_SECRET;
  if (hmacSecret === DEV_HMAC_SECRET) {
    console.warn("[config] FIRST_MOVE_HMAC_SECRET 미설정 — 개발용 기본 시크릿을 사용합니다");
  }

  const ttlRaw = readEnv("APPROVAL_TTL_SECONDS");
  const ttlParsed = ttlRaw === null ? NaN : Number(ttlRaw);
  const approvalTtlSeconds = Number.isFinite(ttlParsed) && ttlParsed > 0 ? ttlParsed : 600;

  const githubToken = readEnv("GITHUB_TOKEN");
  const judgeGithubToken = readEnv("JUDGE_GITHUB_TOKEN") ?? githubToken;

  const cosmosEndpoint = readEnv("COSMOS_ENDPOINT");
  const cosmosKey = readEnv("COSMOS_KEY");
  const cosmos: CosmosConfig | null =
    cosmosEndpoint && cosmosKey
      ? { endpoint: cosmosEndpoint, key: cosmosKey, databaseId: readEnv("COSMOS_DATABASE") ?? "firstmove" }
      : null;

  const foundryEndpoint = readEnv("FOUNDRY_ENDPOINT");
  const foundryApiKey = readEnv("FOUNDRY_API_KEY");
  const foundryDeployment = readEnv("FOUNDRY_DEPLOYMENT");
  const foundry: FoundryConfig | null =
    foundryEndpoint && foundryApiKey && foundryDeployment
      ? { endpoint: foundryEndpoint, apiKey: foundryApiKey, deployment: foundryDeployment }
      : null;

  cachedConfig = {
    hmacSecret,
    approvalTtlSeconds,
    githubToken,
    judgeGithubToken,
    defaultRepoRef: readEnv("FIRST_MOVE_REPO"),
    defaultIcsUrl: readEnv("FIRST_MOVE_ICS_URL"),
    cosmos,
    foundry,
  };
  return cachedConfig;
}
