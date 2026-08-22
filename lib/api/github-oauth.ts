import type { SessionUser } from "./session";

type GithubOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function getGithubOAuthConfig(requestUrl: string): GithubOAuthConfig {
  return {
    clientId: requiredEnv("GITHUB_OAUTH_CLIENT_ID"),
    clientSecret: requiredEnv("GITHUB_OAUTH_CLIENT_SECRET"),
    redirectUri: process.env.GITHUB_OAUTH_REDIRECT_URI ?? new URL("/api/auth/callback", requestUrl).toString(),
  };
}

export function createGithubAuthorizeUrl(config: GithubOAuthConfig, state: string): string {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", "read:user repo");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeGithubCode(config: GithubOAuthConfig, code: string): Promise<string> {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
    }),
    cache: "no-store",
  });
  const body = (await response.json()) as { access_token?: unknown; error?: unknown };
  if (!response.ok || typeof body.access_token !== "string") throw new Error("GitHub OAuth code exchange failed");
  return body.access_token;
}

export async function fetchGithubUser(accessToken: string): Promise<SessionUser> {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });
  const body = (await response.json()) as { id?: unknown; login?: unknown };
  if (!response.ok || (typeof body.id !== "number" && typeof body.id !== "string") || typeof body.login !== "string") {
    throw new Error("GitHub user lookup failed");
  }
  return { userId: String(body.id), login: body.login };
}