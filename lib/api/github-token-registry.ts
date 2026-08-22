const TOKEN_REGISTRY_KEY = "__firstMoveGithubTokenRegistry";

type TokenRegistryGlobal = typeof globalThis & {
  [TOKEN_REGISTRY_KEY]?: Map<string, string>;
};

function getRegistry(): Map<string, string> {
  const globalRef = globalThis as TokenRegistryGlobal;
  globalRef[TOKEN_REGISTRY_KEY] ??= new Map<string, string>();
  return globalRef[TOKEN_REGISTRY_KEY];
}

export function saveGithubToken(userId: string, token: string): void {
  getRegistry().set(userId, token);
}

export function getGithubToken(userId: string): string | null {
  return getRegistry().get(userId) ?? null;
}

export function deleteGithubToken(userId: string): void {
  getRegistry().delete(userId);
}