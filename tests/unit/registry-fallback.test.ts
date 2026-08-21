import { describe, expect, it } from "vitest";
import { listProvidersForCategory, providerRegistry } from "../../src/provider/registry.js";

describe("listProvidersForCategory", () => {
  it("lists Gemini in the Model category", () => {
    expect(listProvidersForCategory(providerRegistry, "Model").map((p) => p.id)).toEqual(["claude", "gemini"]);
  });

  it("omits the primary method from the fallback picker", () => {
    expect(
      listProvidersForCategory(providerRegistry, "Agent", { provider: "claude", auth: "subscription" }).map(
        (p) => p.id,
      ),
    ).toEqual(["cursor"]);
    expect(
      listProvidersForCategory(providerRegistry, "Model", { provider: "claude", auth: "subscription" }).map(
        (p) => p.id,
      ),
    ).toEqual(["claude", "gemini"]);
    expect(
      listProvidersForCategory(providerRegistry, "Model", { provider: "gemini", auth: "api-key" }).map((p) => p.id),
    ).toEqual(["claude"]);
  });
});
