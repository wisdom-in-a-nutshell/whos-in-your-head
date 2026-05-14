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

  it("keeps obvious high-fame candidates alive late in the game", () => {
    expect(GAME_MASTER_INSTRUCTIONS).toContain("Example D2, obvious candidate pressure");
    expect(GAME_MASTER_INSTRUCTIONS).toContain(
      "Before making a niche or adjacent final guess"
    );
    expect(GAME_MASTER_INSTRUCTIONS).toMatch(
      /A very famous candidate\s+should not be eliminated by one noisy answer/
    );
  });
});
