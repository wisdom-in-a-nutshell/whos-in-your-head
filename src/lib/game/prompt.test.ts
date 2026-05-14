import { describe, expect, it } from "vitest";
import { GAME_MASTER_INSTRUCTIONS } from "./prompt";

describe("GAME_MASTER_INSTRUCTIONS", () => {
  it("treats inconsistent answers as weak evidence instead of hard exclusions", () => {
    expect(GAME_MASTER_INSTRUCTIONS).toContain(
      "Treat any single answer that conflicts with the rest of the transcript as weak"
    );
    expect(GAME_MASTER_INSTRUCTIONS).toContain(
      "Do not over-interpret one inconsistent Yes, No, or Maybe."
    );
    expect(GAME_MASTER_INSTRUCTIONS).toMatch(
      /ask a robust\s+clarifying discriminator/
    );
  });
});
