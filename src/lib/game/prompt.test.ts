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

  it("uses the final question slot before a premature broad-cluster guess", () => {
    const state = createAnsweredState([
      ["Is this person alive?", "yes"],
      ["Is this person primarily known for entertainment or media?", "yes"],
      ["Is this person primarily known as a performer?", "yes"],
      ["Is this person primarily known for music?", "yes"],
      ["Is this person part of a globally famous group?", "yes"],
      ["Is this person associated with South Korea?", "yes"],
      ["Is this person female?", "yes"],
      ["Is this person also known for fashion or modeling?", "maybe"],
      ["Is this person primarily a rapper?", "maybe"],
      ["Is this person also known for acting?", "maybe"],
      ["Did this person have major solo releases?", "yes"],
      ["Is this person associated with English-language solo music?", "maybe"],
      ["Was this person born outside South Korea?", "maybe"],
      ["Is this person known for a distinctive singing voice?", "no"],
      ["Is this person in a four-member group?", "yes"],
      ["Is this person older than the other members?", "no"],
      ["Is this person strongly associated with luxury fashion?", "yes"],
      ["Is this person the group's main vocalist?", "no"],
      ["Is this person the group's main dancer?", "maybe"],
      ["Is this person known primarily as a rapper rather than a vocalist?", "maybe"]
    ]);

    const input = buildGameMasterStateInput(state);

    expect(input).toContain("Exactly one question slot remains");
    expect(input).toContain("Do not leave it unused");
    expect(input).toContain("Ask the single best remaining discriminator");
  });

  it("asks for scene splits in long-tail platform creator clusters", () => {
    const state = createAnsweredState([
      ["Is this person alive?", "yes"],
      ["Is this person primarily known for entertainment or media?", "yes"],
      ["Is this person best known as a performer rather than a creator?", "no"],
      ["Is this person primarily known for online video platforms?", "yes"],
      ["Is this person primarily associated with YouTube rather than Twitch?", "yes"],
      ["Is this person primarily associated with Minecraft content?", "yes"],
      ["Is this person known for challenge videos?", "yes"]
    ]);

    const input = buildGameMasterStateInput(state);

    expect(input).toContain("long-tail platform-native creator cluster");
    expect(input).toContain("primary language or region");
    expect(input).toContain("signature format");
  });

  it("asks for format splits in comics and illustration clusters", () => {
    const state = createAnsweredState([
      ["Is this person alive?", "yes"],
      ["Is this person primarily known for entertainment or media?", "yes"],
      ["Is this person best known as a performer?", "no"],
      ["Is this person primarily known for visual art or design?", "yes"],
      ["Is this person primarily known for comics, cartoons, or illustration?", "yes"],
      ["Is this person primarily associated with Japanese manga?", "no"]
    ]);

    const input = buildGameMasterStateInput(state);

    expect(input).toContain("comics, cartooning, or illustration cluster");
    expect(input).toContain("superhero comics versus humor/satire");
    expect(input).toContain("magazine work");
  });

  it("asks for subgenre splits in country and roots music clusters", () => {
    const state = createAnsweredState([
      ["Is this person alive?", "yes"],
      ["Is this person primarily known for entertainment or media?", "yes"],
      ["Is this person best known as a performer?", "yes"],
      ["Is this person primarily known for music?", "yes"],
      ["Is this person primarily associated with country music?", "yes"],
      ["Is this person female?", "yes"],
      ["Did this person break through in the 2020s?", "yes"]
    ]);

    const input = buildGameMasterStateInput(state);

    expect(input).toContain("country or roots-music cluster");
    expect(input).toContain("mainstream radio country versus bluegrass");
    expect(input).toContain("songwriter-first fame");
  });

  it("asks for company or role splits in business-executive clusters", () => {
    const state = createAnsweredState([
      ["Is this person alive?", "yes"],
      ["Is this person primarily known for business or technology?", "yes"],
      ["Is this person primarily associated with healthcare or pharmaceuticals?", "yes"],
      ["Is this person mainly associated with pharmaceuticals or biotechnology?", "yes"]
    ]);

    const input = buildGameMasterStateInput(state);

    expect(input).toContain("narrowed business-executive cluster");
    expect(input).toContain("company, region");
    expect(input).toContain("current-versus-former role");
  });

  it("asks a neutral adult-entertainment fame-source split before weak actor guesses", () => {
    const state = createAnsweredState([
      ["Is this person alive?", "yes"],
      ["Is this person best known for entertainment or media?", "yes"],
      [
        "Is this person primarily known as a performer rather than as a creator or behind-the-scenes media figure?",
        "yes"
      ],
      ["Is this person primarily known for music?", "no"],
      ["Is this person primarily known for acting in film or television?", "maybe"],
      ["Did this person first become famous through comedy?", "no"],
      ["Is this person primarily known from television rather than movies?", "no"],
      ["Did this person become famous before 2000?", "maybe"],
      [
        "Is this person primarily known for scripted entertainment rather than sports, news, reality TV, or online-platform fame?",
        "yes"
      ],
      ["Is this person strongly associated with action or adventure films?", "no"],
      ["Is this person female?", "yes"],
      ["Has this person won an Academy Award for acting?", "maybe"],
      ["Did this person first become famous as an adult rather than as a child performer?", "yes"],
      ["Is this person primarily known for dramatic roles rather than comedic or romantic ones?", "no"],
      ["Is this person especially associated with romantic comedy films?", "no"],
      ["Is this person widely associated with science fiction or fantasy films?", "no"],
      [
        "Is this person also well known for work outside acting, such as modeling, directing, or business ventures?",
        "yes"
      ],
      ["Is this person known for directing films as well as acting?", "no"],
      ["Is this person strongly associated with the fashion or modeling world?", "no"],
      [
        "Is this person especially known for producing or owning media-related businesses or brands?",
        "no"
      ]
    ]);

    const input = buildGameMasterStateInput(state);

    expect(input).toContain("mainstream-screen versus adult-entertainment-industry");
    expect(input).toContain("neutral public fame-source discriminator");
    expect(input).not.toContain("Exactly one question slot remains");
  });

  it("asks for scene-level splits in fashion design clusters", () => {
    const state = createAnsweredState([
      ["Is this person alive?", "no"],
      ["Was this a real person who actually lived?", "yes"],
      ["Was this person primarily known for politics or government leadership?", "no"],
      ["Was this person primarily known for science, mathematics, or invention?", "no"],
      ["Was this person primarily known for entertainment or the arts?", "yes"],
      ["Was this person primarily known for music?", "no"],
      ["Was this person primarily known as an actor or screen performer?", "no"],
      ["Was this person primarily known as a writer or author?", "no"],
      ["Was this person primarily known for visual art such as painting or sculpture?", "no"],
      ["Was this person primarily known for creating or directing media rather than performing in it?", "yes"],
      ["Was this person primarily associated with film or television rather than another medium?", "no"],
      ["Was this person primarily associated with comics, animation, or illustrated characters?", "no"],
      ["Was this person primarily known for comedy or humor-related work?", "no"],
      ["Was this person primarily known for designing or creating things rather than writing or directing performances?", "yes"],
      ["Was this person primarily associated with architecture or industrial/product design?", "no"],
      ["Was this person primarily associated with games or interactive entertainment?", "no"],
      ["Was this person primarily associated with fashion or clothing design?", "yes"],
      ["Was this person primarily associated with European fashion rather than American fashion?", "no"],
      ["Was this person primarily associated with women's fashion rather than men's fashion?", "no"],
      ["Was this person primarily associated with luxury high fashion rather than mass-market or casual clothing?", "yes"]
    ]);

    const input = buildGameMasterStateInput(state);

    expect(input).toContain("fashion or clothing-design cluster");
    expect(input).toContain("streetwear");
    expect(input).toContain("luxury creative direction");
    expect(input).not.toContain("Exactly one question slot remains");
  });

  it("asks for scene-level splits in heavy metal clusters", () => {
    const state = createAnsweredState([
      ["Is this person alive?", "no"],
      ["Was this a real person who actually lived?", "yes"],
      ["Was this person primarily known for politics or government leadership?", "no"],
      ["Was this person primarily known for entertainment or the arts?", "yes"],
      ["Was this person primarily known for music?", "yes"],
      ["Was this person primarily associated with rock or pop music?", "no"],
      ["Was this person primarily associated with classical music?", "no"],
      ["Was this person primarily associated with jazz or blues music?", "no"],
      ["Was this person primarily associated with country, folk, or Americana music?", "no"],
      ["Was this person primarily associated with hip-hop or rap music?", "no"],
      ["Was this person primarily associated with music outside the English-speaking world?", "no"],
      ["Was this person primarily known as a solo performer rather than as part of a group or band?", "no"],
      ["Was this group primarily associated with electronic or dance music?", "no"],
      ["Was this person primarily associated with heavy metal or hard rock music?", "yes"],
      ["Was this person primarily known as the lead singer of their band?", "yes"],
      ["Was this person primarily associated with a British band?", "no"],
      ["Was this person primarily associated with a band formed before 1980?", "no"],
      ["Was this person primarily associated with grunge or alternative rock rather than traditional heavy metal?", "no"],
      ["Was this person primarily associated with glam or hair metal?", "no"],
      ["Was this person primarily associated with a band that became famous in the 1990s or later?", "yes"]
    ]);

    const input = buildGameMasterStateInput(state);

    expect(input).toContain("heavy-metal or hard-rock cluster");
    expect(input).toContain("guitarist/instrumentalist");
    expect(input).toContain("country or region");
    expect(input).not.toContain("Exactly one question slot remains");
  });

  it("asks for astrology and esoteric-scholar splits in historical astronomy clusters", () => {
    const state = createAnsweredState([
      ["Is this person alive?", "no"],
      ["Was this a real person who actually lived?", "yes"],
      ["Is this person primarily known for science, mathematics, or scholarly work?", "yes"],
      ["Was this person active before the 20th century?", "yes"],
      ["Is this person mainly associated with physics or mathematics?", "no"],
      ["Is this person connected to astronomy or space observation?", "yes"],
      ["Was this person active before the 18th century?", "yes"],
      ["Is this person mainly known for developing a solar-system model?", "no"],
      ["Was this person associated with the Islamic Golden Age or medieval Middle East?", "yes"],
      ["Was this person primarily a religious leader or theologian?", "maybe"],
      ["Was this person mainly known for writing rather than experiments?", "maybe"],
      ["Was this person associated with a court or ruler?", "maybe"],
      ["Was this person from Europe?", "no"],
      ["Was this person from Persia or the broader Middle East?", "yes"],
      ["Was this person primarily known for medicine?", "no"],
      ["Was this person primarily known for algebra?", "no"],
      ["Was this person known for observational instruments?", "maybe"],
      ["Was this person active before 1000 CE?", "yes"],
      ["Was this person primarily known for poetry or literature?", "no"],
      ["Was this person primarily known as a philosopher?", "no"]
    ]);

    const input = buildGameMasterStateInput(state);

    expect(input).toContain(
      "historical astronomy, astrology, or esoteric-scholarship cluster"
    );
    expect(input).toContain("court astrologer/adviser");
    expect(input).toContain("mathematical astronomy");
    expect(input).not.toContain("Exactly one question slot remains");
  });

  it("does not ask the historical astrology split after that axis has already been tested", () => {
    const state = createAnsweredState([
      ["Is this person alive?", "no"],
      ["Was this a real person who actually lived?", "yes"],
      ["Is this person primarily known for science, mathematics, or scholarly work?", "yes"],
      ["Was this person active before the 20th century?", "yes"],
      ["Is this person connected to astronomy or space observation?", "yes"],
      ["Was this person associated with the Islamic Golden Age or medieval Middle East?", "yes"],
      ["Was this person primarily known for astrology or horoscope work?", "no"],
      ["Was this person primarily known for medicine?", "no"]
    ]);

    const input = buildGameMasterStateInput(state);

    expect(input).not.toContain(
      "historical astronomy, astrology, or esoteric-scholarship cluster"
    );
  });

  it("allows person-like cultural figures without opening all fictional characters", () => {
    expect(GAME_MASTER_INSTRUCTIONS).toMatch(
      /widely recognized\s+person-like cultural figures are allowed/
    );
    expect(GAME_MASTER_INSTRUCTIONS).toContain("Santa Claus");
    expect(GAME_MASTER_INSTRUCTIONS).toContain("Sinterklaas");
    expect(GAME_MASTER_INSTRUCTIONS).toContain(
      "very famous fictional or screen-persona figures"
    );
    expect(GAME_MASTER_INSTRUCTIONS).toContain(
      "Do not open the full fictional-character universe by default."
    );
    expect(GAME_MASTER_INSTRUCTIONS).toContain(
      "silently convert that answer into the actor"
    );
  });

  it("asks for a real-lived boundary immediately after Alive = No", () => {
    const state = createAnsweredState([["Is this person alive?", "no"]]);

    const input = buildGameMasterStateInput(state);

    expect(input).toContain("not currently alive");
    expect(input).toContain("real person who actually lived");
    expect(input).toContain("video-game");
    expect(input).toContain("screen-persona");
  });

  it("stays out of dead-human checklists after the real-lived boundary is rejected", () => {
    const state = createAnsweredState([
      ["Is this person alive?", "no"],
      [
        "Was this a real person who actually lived, rather than a fictional, legendary, or screen-persona figure?",
        "no"
      ]
    ]);

    const input = buildGameMasterStateInput(state);

    expect(input).toContain("person-like cultural figure");
    expect(input).toContain("Do not ask dead-human career");
    expect(input).toContain("video-game character");
    expect(input).toContain("signature work");
  });

  it("asks a real-person versus persona boundary in screen-comedy clusters", () => {
    const state = createAnsweredState([
      ["Is this person alive?", "yes"],
      ["Is this person primarily known for entertainment or media?", "yes"],
      ["Is this person best known as a performer rather than a creator?", "yes"],
      ["Is this person primarily known for acting?", "yes"],
      ["Is this person primarily known for television rather than films?", "yes"],
      ["Is this person primarily associated with comedy rather than drama?", "yes"],
      ["Is this person best known for a scripted sitcom rather than sketch comedy?", "yes"]
    ]);

    const input = buildGameMasterStateInput(state);

    expect(input).toContain(
      "mixing a real performer with a famous character or screen persona"
    );
    expect(input).toContain(
      "Do not silently convert the target into the actor"
    );
    expect(input).toContain("fictional character or screen persona");
  });

  it("does not ask the persona boundary in generic real-actor branches", () => {
    const state = createAnsweredState([
      ["Is this person alive?", "yes"],
      ["Is this person primarily known for entertainment or media?", "yes"],
      ["Is this person best known as a performer rather than a creator?", "yes"],
      ["Is this person primarily known for music rather than acting or comedy?", "no"],
      ["Is this person primarily known for acting in films or television?", "yes"],
      ["Is this person primarily known for television rather than movies?", "yes"],
      ["Is this person primarily associated with drama rather than comedy?", "yes"]
    ]);

    const input = buildGameMasterStateInput(state);

    expect(input).not.toContain(
      "mixing a real performer with a famous character or screen persona"
    );
    expect(input).not.toContain("fictional character or screen persona");
  });

  it("does not ask the persona boundary just because a music split mentions acting", () => {
    const state = createAnsweredState([
      ["Is this person alive?", "yes"],
      ["Is this person primarily famous for entertainment or media?", "yes"],
      ["Is this person best known as a performer rather than a creator?", "yes"],
      [
        "Is this person primarily known for music rather than acting, comedy, or hosting?",
        "yes"
      ],
      ["Is this person primarily associated with English-language music?", "yes"],
      ["Did this person first become famous before 2010?", "no"]
    ]);

    const input = buildGameMasterStateInput(state);

    expect(input).not.toContain(
      "mixing a real performer with a famous character or screen persona"
    );
    expect(input).not.toContain("fictional character or screen persona");
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
