import { describe, it, expect } from "vitest";
import { reviewCommitMarker, bodyWithMarker, findReviewByMarker } from "../../src/core/idempotency.js";

describe("idempotency", () => {
  it("embeds the head SHA in the marker", () => {
    expect(reviewCommitMarker("abc123")).toBe("<!-- revieweragent-commit:abc123 -->");
  });

  it("bodyWithMarker appends the marker to the summary", () => {
    const body = bodyWithMarker("All good", "abc123");
    expect(body).toContain("All good");
    expect(body).toContain(reviewCommitMarker("abc123"));
  });

  it("finds an existing review by its commit marker", () => {
    const reviews = [
      { id: 1, body: `Old summary\n\n${reviewCommitMarker("old-sha")}` },
      { id: 2, body: `Current summary\n\n${reviewCommitMarker("current-sha")}` },
    ];
    expect(findReviewByMarker(reviews, "current-sha")).toEqual({ id: 2, body: reviews[1]!.body });
  });

  it("returns undefined when no review matches the head SHA", () => {
    const reviews = [{ id: 1, body: `Old\n\n${reviewCommitMarker("old-sha")}` }];
    expect(findReviewByMarker(reviews, "new-sha")).toBeUndefined();
  });
});
