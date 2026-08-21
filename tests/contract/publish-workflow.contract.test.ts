import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

describe("publish.yml trusted-publisher path", () => {
  const yaml = readFileSync(".github/workflows/publish.yml", "utf8");
  const doc = parseYaml(yaml);
  const job = doc.jobs.npm;
  const publishStep = job.steps.find((s: { name?: string }) => s.name === "Publish to npm");
  const setupNode = job.steps.find((s: { uses?: string }) => s.uses?.includes("actions/setup-node"));

  it("requests an OIDC id-token so npm trusted publishing can run", () => {
    expect(doc.permissions["id-token"]).toBe("write");
  });

  it("uses Node 24 so the bundled npm is new enough for OIDC (11.5.1+)", () => {
    expect(String(setupNode.with["node-version"])).toBe("24");
  });

  it("strips setup-node's empty _authToken before OIDC publish", () => {
    expect(publishStep.run).toMatch(/_authToken/);
    expect(publishStep.run).toMatch(/sed/);
    expect(publishStep.run).toMatch(/OIDC trusted publisher/);
  });

  it("still publishes with NPM_TOKEN when that secret is set", () => {
    expect(publishStep.run).toContain("Publishing with NPM_TOKEN");
    expect(publishStep.env.NODE_AUTH_TOKEN).toBe("${{ secrets.NPM_TOKEN }}");
  });
});
