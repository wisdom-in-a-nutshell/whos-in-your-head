import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { shouldTryContentFilterFallback } from "./route";

describe("game turn retry policy", () => {
  it("retries the primary model before trying content-filter fallbacks", () => {
    expect(shouldTryContentFilterFallback(1, 2)).toBe(false);
    expect(shouldTryContentFilterFallback(2, 2)).toBe(true);
  });
});
