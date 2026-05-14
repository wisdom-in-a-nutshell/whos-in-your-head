import { describe, expect, it } from "vitest";
import { createInitialGameState, type AnsweredTurn, type GameState } from "./state";
import { buildGameMasterStateInput, GAME_MASTER_INSTRUCTIONS } from "./prompt";

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

  it("adds a focused directive for recent U.S. president clusters", () => {
    const state = createAnsweredState([
      ["Is this person alive?", "yes"],
      ["Is this person primarily famous for entertainment or media work?", "no"],
      ["Is this person primarily known for politics or government?", "yes"],
      ["Has this person served as the head of government or head of state of a country?", "yes"],
      ["Is this person primarily associated with the United States?", "yes"],
      ["Has this person served as President of the United States?", "yes"],
      ["Was this person first elected president in the 21st century?", "yes"],
      ["Is this person a member of the Democratic Party?", "yes"],
      ["Was this person first elected president before 2010?", "no"]
    ]);

    const input = buildGameMasterStateInput(state);

    expect(input).toContain("recent U.S. president cluster");
    expect(input).toContain("served as vice president before becoming president");
    expect(input).toContain("Treat exact election-year answers as easy for players to misremember.");
  });

  it("adds a stabilizing directive when Maybe answers pile up", () => {
    const state = createAnsweredState([
      ["Is this person alive?", "yes"],
      ["Is this person primarily known for entertainment or media?", "yes"],
      ["Is this person best known as a performer?", "yes"],
      ["Is this person primarily known for acting?", "yes"],
      ["Is this person primarily known for television rather than films?", "maybe"],
      ["Has this person been a major Hollywood movie star since the 1990s or earlier?", "maybe"],
      ["Is this person strongly associated with action or superhero roles?", "maybe"],
      ["Has this person been nominated for an Academy Award for acting?", "maybe"]
    ]);

    const input = buildGameMasterStateInput(state);

    expect(input).toContain("confidence is unstable");
    expect(input).toContain("Do not make a narrow final guess");
    expect(input).toContain("Ask one objective discriminator");
  });

  it("allows person-like cultural figures without opening all fictional characters", () => {
    expect(GAME_MASTER_INSTRUCTIONS).toMatch(
      /widely recognized\s+person-like cultural figures are allowed/
    );
    expect(GAME_MASTER_INSTRUCTIONS).toContain("Santa Claus");
    expect(GAME_MASTER_INSTRUCTIONS).toContain("Sinterklaas");
    expect(GAME_MASTER_INSTRUCTIONS).toContain(
      "Do not open the full fictional-character universe by default."
    );
  });
});

function createAnsweredState(turns: Array<[string, AnsweredTurn["answer"]]>): GameState {
  return {
    ...createInitialGameState(),
    questionCount: turns.length,
    transcript: turns.map(([question, answer]) => ({
      question,
      answer
    }))
  };
}
