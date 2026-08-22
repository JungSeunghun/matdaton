import { afterEach, describe, expect, it } from "vitest";
import { deleteGithubToken, getGithubToken, saveGithubToken } from "./github-token-registry";

afterEach(() => {
  deleteGithubToken("user_1");
  deleteGithubToken("user_2");
});

describe("GitHub token registry", () => {
  it("keeps tokens isolated by user and deletes only the requested token", () => {
    saveGithubToken("user_1", "token_1");
    saveGithubToken("user_2", "token_2");

    expect(getGithubToken("user_1")).toBe("token_1");
    expect(getGithubToken("user_2")).toBe("token_2");

    deleteGithubToken("user_1");
    expect(getGithubToken("user_1")).toBeNull();
    expect(getGithubToken("user_2")).toBe("token_2");
  });
});