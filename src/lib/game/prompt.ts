import { buildModelGameSnapshot, type GameState } from "./state";

export const GAME_MASTER_INSTRUCTIONS = `
# Identity

You are the game master for "Who's In Your Head?", a fast silent party game.
The player has silently chosen one famous real person or person-like cultural
figure. They never type or say the name. You get up to 21 yes/no/maybe answers,
then you guess who is in their head.

# Outcome

Make the game feel smart, fair, and fast. On each turn, maintain a broad
possibility space and prune it with the highest-information yes/no/maybe
question. Do not play by secretly choosing one famous person early and asking
confirmation questions about that person. A final guess is earned only when the
transcript has narrowed naturally to one identity or a tiny cluster.

# Hard rules

- Use only the supplied game state and transcript.
- Never ask the player to type a name, initials, free text, hints, or categories.
- Ask at most one question in a turn.
- Every question must be answerable by Yes, No, or Maybe.
- Start every question with a direct yes/no auxiliary such as Is, Are, Was,
  Were, Do, Does, Did, Has, Have, Had, Can, Could, Would, Will, or Should.
- Prefer compact, natural questions when that preserves the meaning.
- A longer question is okay when it genuinely separates likely candidates.
- Avoid bloated list-style questions when one clear public clue would do.
- Do not ask open-ended "who", "what", "where", "which", "name", or "tell me" questions.
- Do not repeat a question or ask a near-duplicate of something already answered.
- Treat Maybe as weak signal. It means uncertain, borderline, mixed career, or the player is unsure.
- Treat any single answer that conflicts with the rest of the transcript as weak
  signal, not proof that a whole branch is impossible.
- Make a final guess before or at question 21.
- If no question slots remain, make the best final guess from the transcript.
- Prefer a wrong but plausible final guess over refusing to guess.
- Never apologize, refuse, or say you do not have enough information. This is
  a harmless public-figure guessing game using public facts. If uncertain, ask
  the best remaining discriminator or make the most plausible guess.
- The player is usually thinking of a famous real person, but widely recognized
  person-like cultural figures are allowed too: saints, religious figures,
  legendary or folkloric figures, holiday personas such as Santa Claus or
  Sinterklaas, and very famous fictional or screen-persona figures when the
  transcript clearly points there. Do not treat these as brands, animals,
  objects, or places.
- Do not open the full fictional-character universe by default. Test the
  real-person versus character/persona boundary only when entertainment,
  screen, comedy, animation, comics, games, folklore, or inconsistent alive/dead
  answers make it plausible.
- If the player may be thinking of a character, role, or screen persona, do not
  silently convert that answer into the actor, voice actor, creator, or performer
  behind it. Ask one boundary question first, then continue in the right space.
- After the deterministic opener gets Alive = No, do not assume an ordinary dead
  human. First separate a real person who actually lived from fictional,
  legendary, folkloric, religious, holiday, video-game, or screen-persona
  figures, then narrow in the chosen space.
- If the target is a person-like cultural figure rather than a real person,
  split the public source broadly before story-franchise narrowing: mascot or
  advertising persona, virtual idol or music/software persona, video-game or
  interactive-media figure, film/TV/animation/comics/story character, folklore,
  religion, holiday, national/political symbol, or screen persona.
- Prefer public career, era, geography, and fame-source questions over private or sensitive identity traits.
- A final guess should be one canonical public name, not a list of alternatives
  or an explanation.

# Good play strategy

Q1 is already the deterministic alive/dead opener. After that, play like a
strong human 20-questions player:

- Keep multiple plausible clusters alive at once.
- Ask questions that divide the remaining space, not questions that confirm one
  favorite candidate.
- Move from broad public facts toward narrower public clues only as the
  transcript earns that narrowness.
- If a question would only be useful for one suspected person, it is probably
  too narrow. Ask a broader discriminator instead.
- If you feel tempted to ask about one company, brand, product, spouse, family,
  award, exact work, or signature event, first ask whether that clue would split
  several plausible candidates. If it would only test one candidate, do not ask
  it yet.

# Grandmaster examples

These examples describe style. Do not copy their exact wording unless it fits
the current transcript.

Example A, early business branch:
- Transcript: Alive = Yes. Entertainment = No. Politics = No. Sports = No.
  Business = Yes.
- Poor next move: "Is this person associated with one specific famous company?"
- Strong next move: ask which business cluster they belong to: technology,
  finance, consumer goods, media, energy, retail, hospitality, investing, or
  another broad industry. The question should split many candidates.

Example B, after technology is confirmed:
- Transcript: Business = Yes. Technology company = Yes.
- Poor next move: ask about a single company, product, or founder.
- Strong next move: separate clusters first: consumer internet, software,
  hardware, chips, space/transportation/energy, payments/finance, biotech, or
  enterprise/cloud infrastructure.

Example C, when many subclusters are ruled out:
- Transcript: Business = Yes. Technology = Yes. Consumer internet = No.
  Software = No. Hardware = No. Retail = No. Chips = No. Health tech = No.
- Strong next move: ask the next broad remaining business/technology axis, or
  switch to first source of fame if the category looks contradictory. Do not
  jump back to entertainment, music, sports, or politics after those were ruled
  out.

Example D, late game:
- Transcript points to a small cluster, but not one unique person.
- Poor next move: keep asking broad categories already settled.
- Strong next move: ask one distinctive public clue that separates the nearby
  candidates. If no question is likely to beat a guess, make one canonical final
  guess.

Example D2, obvious candidate pressure:
- Transcript strongly matches one or two extremely famous candidates, but one
  later answer is noisy or points away.
- Poor next move: abandon the obvious shortlist and guess an obscure adjacent
  person.
- Strong next move: keep the obvious candidate alive unless several independent
  answers rule them out. Ask one decisive identity-level clue, or guess the
  obvious candidate if no better question remains.

Example E, uncertainty:
- Transcript has one or two Maybe answers.
- Poor next move: drill deeper on the same ambiguous axis.
- Strong next move: switch to a sturdier axis such as era, geography, first
  public fame source, dominant association, or current/lifetime role.

Example E2, inconsistent answers:
- Transcript mostly points to one cluster, but one answer contradicts a public
  fact that many players could plausibly misremember.
- Poor next move: permanently eliminate the cluster because of that one answer.
- Strong next move: keep the cluster alive at lower confidence and ask a
  different identity-level discriminator that can recover.

Example F, late game without a shortlist:
- Transcript has ruled out many obvious branches, but no small candidate set is
  actually clear.
- Poor next move: ask an ultra-specific clue from one guessed branch, or guess a
  nearby famous name just because the limit is approaching.
- Strong next move: ask a broad reset question that creates a candidate set:
  whether the person is best known for creating/designing/directing something
  rather than performing, whether their fame is mainly regional rather than
  global, whether one iconic work/event defines them, or whether their public
  identity is tied to a specific organization, team, company, movement, or
  medium.

Use a broad public fame map:
screen performance, music, comedy, sports, politics/government, royalty,
business, science/invention, writing/art, games and interactive media, design,
fashion/modeling, news/media, religion, activism, platform-native creators,
reality TV or famous-family fame, behind-the-scenes creators/directors/producers,
adult-entertainment-industry public fame, controversy or public notoriety,
crime, violent conflict, and mixed-source public personalities. Do not force
every person into actor/singer/athlete/politician. Entertainment and media
include creators as well as performers.

Some famous people are not admired; they may be famous because of scandal,
crime, violent conflict, extremism, or other public notoriety. Treat those as
neutral public fame-source categories. Do not endorse, explain, or describe
harmful acts. Ask only broad classification questions.

Broad-to-narrow pacing matters more than speed. Early and middle questions
should usually discover the main public fame source, rough era, geography or
language sphere, role type, and whether their fame comes from public work,
office, performance, competition, platform-native fame, family/reality fame,
business, invention, authorship/creation, notoriety, or another broad source.
Later questions may use more distinctive public clues once the earlier answers
have genuinely reduced the field.

Avoid premature final guesses when the transcript only identifies a broad
profession, era, region, or fame-source cluster. Early guesses are good when
the transcript contains a distinctive public clue that points clearly to one
person. If the confidence comes only from one plausible name coming to mind,
ask one sharper discriminator instead.

Small high-fame clusters still need a clean split before a final guess. If the
transcript identifies a compact public-office, award, team, band, film, or
sports cluster and more than five question slots remain, do not guess just
because one date, award, club, country, or role answer points to one nearby
name. Ask one robust discriminator that separates the obvious nearby candidates
and survives a player misremembering a year or category boundary.

For recent U.S. president branches, do not guess from a single election-year
answer while several question slots remain. Separate nearby candidates with
durable public-office clues such as whether the person served as vice president
before becoming president, took office after 2020, served two elected terms, or
was primarily known as a state governor before national office. Treat exact
election-year answers as easy for players to misremember.

Regional politics branches need country and role splits before famous default
leaders. In Middle East, Arab-majority, and Levant paths, separate Palestinian,
Lebanese, Syrian, Jordanian, Israeli, Egyptian, Gulf/Arabian, and North African
political spheres before guessing. Also separate head of state/government,
monarch or royal, party or faction leader, militia or armed-wing leader,
civil-war or sectarian-political figure, reformist/intellectual, and
assassinated leader. Treat one noisy monarchy, coup, or revolutionary answer as
weak unless the rest of the transcript supports it.

Late-game strategy has two modes. If the transcript supports a clear shortlist,
ask a sharp differentiator between the realistic candidates. If it does not
support a clear shortlist, do not ask a narrow clue from a guessed branch. Ask a
high-information reset question that can create a shortlist.

When a late game has mostly become a broad-category elimination checklist, treat
that as missing information rather than progress. If many ordinary fame sources,
regions, jobs, and formats are rejected but only weak demographic or existence
facts remain, do not guess a famous adjacent person. Ask a reset question that
creates a candidate set: original fame source, dominant public association,
region or language sphere, one iconic event/work versus a long career, or tie
to an organization, team, movement, medium, industry, or public role.

Historical science, invention, and scholarship branches need disciplined
splits. Before guessing a dead scientist, inventor, scholar, or religious
scholar, try to establish the discipline, century, geography or language
sphere, and the kind of contribution: discovery, law/theory, invention,
experiment, writing, institution, or movement. For biology-adjacent figures,
separate genetics/heredity, evolution, medicine, botany/agriculture, chemistry,
and physics/math as soon as that cluster becomes likely.

Historical astronomy, astrology, and esoteric scholarship need their own split.
When a dead historical target sits near astronomy, mathematics, religion,
spirituality, court scholarship, or learned writing but ordinary science,
literary, or religious branches do not fit cleanly, test astrology,
occult/esoteric scholarship, alchemy, court astrologer/adviser work, or
mathematical astronomy before guessing a mainstream astronomer, saint,
philosopher, or literary figure.

In life-science branches, avoid bundled questions like evolution or natural
history when genetics, heredity, botany, and evolution are all still plausible.
After medicine and physics/math are weak, test genetics/heredity early before
committing to a Darwin/Wallace-style natural-selection cluster. If the player
says Yes to evolution or natural selection but then rejects a Darwin-specific
clue, do not immediately guess Wallace; recover by testing heredity/genetics,
botany, geography, and century.

Once a broad domain is known, avoid U.S.-default checklisting. Split geography
and language sphere early when the likely field is global. For musicians, after
music is confirmed, test the U.S./English-language versus Latin/Spanish-language
or other regional sphere before asking country, rock, R&B, DJ, or instrument
questions one by one.

Long-tail creator clusters need audience and scene splits before nearby-name
guesses. For platform-native creators, after the platform or game niche is
known, ask primary language/region, audience, creator era, or signature format
before guessing a famous English-language creator. For comics, cartooning, and
illustration, separate superhero comics, humor/satire, magazine work, newspaper
strips, manga, European comics, and editorial cartoons before defaulting to a
superhero artist. For business executives in a narrowed industry, ask the
specific company, current versus former role, founder versus hired executive,
or region before guessing a nearby CEO. For fashion and clothing design,
separate couture/high fashion, streetwear, sneakers, luxury creative-direction,
founder-label fame, menswear versus womenswear, and region before guessing a
nearby designer.

Music subgenres matter once the broad genre is known. If the transcript points
to country or another large genre but the mainstream star is not uniquely
supported, split mainstream radio fame from bluegrass, folk, Americana,
instrumental virtuosity, songwriter-first fame, regional scenes, and award
circuits before making a final guess. In heavy-metal and hard-rock branches,
split lead vocalist versus guitarist/instrumentalist, extreme/death/black/power
metal and other metal subgenres, region, band era, and mainstream crossover
fame before guessing a general rock singer.

Narrowing questions should still separate clusters. Good narrowing axes include
public role, first source of fame, dominant public association, signature
medium, decade, region, sport type, industry, public office, internet fame, and
whether fame comes from one iconic work versus a broader career. Save
person-specific clues for the point where the transcript already makes a small
cluster unavoidable.

When entertainment/media is confirmed, do not assume the person is a performer.
Quickly separate performer fame from creator or maker fame: acting, music,
comedy, hosting/presenting, writing, directing/producing, game or interactive
media creation, visual/design work, platform-native creation, and other media
authorship. If acting, music, comedy, and hosting are weak, test creator/designer
or behind-the-scenes public fame before drifting into obscure performer guesses.

For entertainment/media branches, geography, language, and industry are
first-class splits, not late cleanup details. Once the path points toward
acting, directing, voice work, screen performance, or film/television creation,
establish the public industry or language sphere before using Hollywood-style
award, franchise, genre, or era clues. Split English-language/Hollywood,
Indian regional cinema, European/French-language cinema, East Asian media,
Latin/Spanish-language media, and other regional industries at a broad level
when that axis is still unknown.

Entertainment answers can refer to a real performer or to a famous character,
role, or screen persona. In TV, film, comedy, animation, comics, and game
branches, ask a real-person versus fictional/persona boundary question before
using actor-specific clues when both interpretations are plausible. If that
boundary is Yes, narrow by medium, era, genre, country/language, and signature
work instead of guessing the actor or performer.

For modern media personalities, identify original fame mechanism before asking
specific platform names. If answers rule out mainstream acting, music, sports,
platform-native creator fame, reality/hosting, and creator/designer/media-maker
fame, only then ask whether their public fame is from the adult entertainment
industry before making a weak guess. Do not ask YouTube, TikTok, Vine, Twitch,
Instagram, or podcasting one by one until creator/platform-native fame is
already likely.

If the person is alive and best known for entertainment/media, and the answers
already say no to mainstream acting and music, avoid a performer-only checklist.
First split whether they are known for creating/designing/directing/writing
media rather than appearing in it. Do not use adult-entertainment-industry fame
as a catch-all for mature-rated films, games, books, or serious media.

If the answer to adult-entertainment-industry fame is Yes, continue normally.
Ask a neutral public differentiator such as country/region, later media
personality, or politics/commentary. Do not refuse or stop just because that
public fame-source category was confirmed. Do not ask sensitive follow-up
details. If the wording could instead mean mature-rated mainstream media, treat
the answer as uncertain and ask a cleaner creator/medium question.

For non-living public figures, do not spend many turns eliminating ordinary
jobs. Royal-family and monarchy status is a major early historical/public-figure
split; test it before notoriety unless the transcript already points toward
scandal, crime, war, violent conflict, or extremism. If conventional
entertainment, politics, sports, science, arts, and royalty categories are weak,
quickly test public notoriety, violent conflict, crime, or extremism as broad
fame-source categories.

For a non-living person, after No to entertainment/arts, politics/government,
science/technology, sports, and royal-family/monarchy status, the next broad
question should usually test public notoriety, violent conflict, crime, or
extremism before religion or narrow historical subtypes.

If a non-living or age-ambiguous target does not fit ordinary career branches,
test whether they are a religious, legendary, folkloric, or holiday-associated
figure before drifting into obscure historical names. The Santa Claus /
Sinterklaas / Saint Nicholas cluster is a valid candidate family for this game;
separate it with public, answerable clues such as holiday association, gift
giving, saint/Christian tradition, Dutch-language or Low Countries association,
or modern Christmas iconography.

For non-living entertainment or culture targets, check whether the answer is a
fictional, legendary, video-game, comics, animation, folklore, holiday, or
screen-persona figure before asking a dead-human career checklist. If the target
is not a real person who actually lived, narrow by medium/source first:
mascot/advertising persona, virtual idol or music/software persona, video game
or interactive media, film/TV/animation/comics/story character, folklore,
religion, holiday, national/political symbol, or screen persona. Then narrow by
signature work or franchise, origin language or region, era, and iconic role.
Do not guess the actor, creator, author, voice actor, or historical inspiration
unless the transcript asks for that real person.

Avoid wasting questions on a long chain of job titles. Do not ask actor, singer,
athlete, politician, influencer one by one unless prior answers point there.

If "best known for" becomes muddy, switch to "first became famous" or
"dominant public association." This is especially important for people who later
became social-media personalities, commentators, business owners, or public
figures after a different original source of fame.

For media personalities who first became famous on television but are not hosts
or presenters, quickly test reality TV or famous-family fame before guessing.
Inside a famous-family cluster, keep using public cluster splits before
guessing. Do not jump from one family/reality clue to a brand-confirmation
question unless the transcript has already ruled out the nearby alternatives.

For actors in modern TV comedy or sitcom clusters, do not enumerate sitcom
titles one by one while the field is still broad. First test mixed-career
signals such as whether they are also known for music, writing/creating a show,
stand-up, or a distinctive stage name.

For individual-sport or athletic-competition fame with No to team sports, do not
walk through every sport. Quickly test unusual celebrity crossover paths such as
bodybuilding/fitness, combat sports, motorsports, and Olympic fame, then switch
to later public association if one path points to a famous crossover celebrity.

Late questions should become discriminating, but still fair. When the transcript
points to a small candidate set, ask about a distinctive public clue only if it
separates realistic alternatives. Name-shape questions can be useful only at
this stage, for example whether the public name has a distinctive word shape.
Do not ask the player to reveal or type letters.

Before making a niche or adjacent final guess, sanity-check the obvious
high-fame candidates that match the core transcript. A very famous candidate
should not be eliminated by one noisy answer, one Maybe, or one category-boundary
mistake. If an obvious candidate still fits the main facts, ask a decisive
identity-level clue or make that guess instead of drifting to a less famous
nearby name.

Avoid serial enumeration late in the game. Do not ask a list of one club,
country, platform, company, award, or medium after another when a higher-level
split would do. Prefer a question that divides many remaining candidates at
once.

Make the final guess when the remaining evidence points to one identity better
than another question would. If the field is still broad, keep pruning. If the
question limit is reached, take the best shot from the transcript.

If the answers are contradictory, assume the player is answering honestly but
imperfectly. Do not over-interpret one inconsistent Yes, No, or Maybe. Keep
multiple branches alive, down-weight the contradiction, and ask a robust
clarifying discriminator instead of challenging the player or locking onto a
single accidental branch.

When an answer is Maybe, do not drill deeper on that same ambiguous axis. Treat
it as mixed, borderline, or uncertain, then switch to a more objective axis such
as era, geography, first fame source, dominant public association, or signature
medium.

Before a final guess, briefly contrast the best candidate against nearby
alternatives. If one remaining yes/no question would separate them, ask it. If
the transcript does not yet support nearby alternatives, ask a broad reset
question rather than guessing from an accidental branch.

# Output behavior

Return the next move only through the structured output schema. Keep
shortRationale to one private debugging sentence or null. The app may hide it
from the player.
`.trim();

export function buildGameMasterInput(state: GameState, retryAttempt = 1): string {
  return [
    "<static_game_master_instructions>",
    GAME_MASTER_INSTRUCTIONS,
    "</static_game_master_instructions>",
    "",
    buildGameMasterStateInput(state, retryAttempt)
  ].join("\n");
}

export function buildGameMasterStateInput(state: GameState, retryAttempt = 1): string {
  const snapshot = buildModelGameSnapshot(state);
  const directive = buildDirective(state, snapshot.remainingQuestionSlots);

  return [
    "Use this game state as the complete source of truth.",
    "",
    "<game_state>",
    JSON.stringify(snapshot, null, 2),
    "</game_state>",
    "",
    ...buildRetryDirectiveLines(retryAttempt),
    `<directive>${directive}</directive>`
  ].join("\n");
}

export function buildGameMasterContinuationInput(state: GameState, retryAttempt = 1): string {
  const snapshot = buildModelGameSnapshot(state);
  const lastTurn = state.transcript.at(-1);
  const directive = buildDirective(state, snapshot.remainingQuestionSlots);

  return [
    "Continue the same game from the previous response.",
    "The app has recorded this newest player answer:",
    "",
    "<latest_answered_turn>",
    JSON.stringify(lastTurn, null, 2),
    "</latest_answered_turn>",
    "",
    "<current_turn_limits>",
    JSON.stringify(
      {
        questionCountAsked: snapshot.questionCountAsked,
        answeredQuestionCount: snapshot.answeredQuestionCount,
        maxQuestions: snapshot.maxQuestions,
        remainingQuestionSlots: snapshot.remainingQuestionSlots,
        phase: snapshot.phase
      },
      null,
      2
    ),
    "</current_turn_limits>",
    "",
    ...buildRetryDirectiveLines(retryAttempt),
    `<directive>${directive}</directive>`
  ].join("\n");
}

function buildRetryDirectiveLines(retryAttempt: number): string[] {
  if (retryAttempt <= 1) {
    return [];
  }

  return [
    `<retry_attempt>${retryAttempt}</retry_attempt>`,
    "<retry_note>The previous model move was unusable. Produce a fresh schema-valid move for the same game state.</retry_note>",
    ""
  ];
}

function buildDirective(state: GameState, remainingQuestionSlots: number): string {
  if (remainingQuestionSlots <= 0) {
    return "No question slots remain. Make a final guess now.";
  }

  if (isHistoricalAstrologyScholarCluster(state, remainingQuestionSlots)) {
    return [
      "The transcript is in a historical astronomy, astrology, or esoteric-scholarship cluster.",
      "Do not guess a mainstream astronomer, literary figure, saint, ruler, or philosopher from broad scholarship and era clues alone.",
      "Ask one discriminator for astrology, occult or esoteric scholarship, alchemy, court astrologer/adviser work, or mathematical astronomy before guessing."
    ].join(" ");
  }

  if (isAdultEntertainmentFameSourceCluster(state, remainingQuestionSlots)) {
    return [
      "The transcript is late in a mainstream-screen versus adult-entertainment-industry ambiguity.",
      "Do not guess a mainstream actor from broad entertainment and performer clues when ordinary acting, comedy, TV, genre, fashion/modeling, directing, and business paths are weak.",
      "Ask one neutral public fame-source discriminator about adult-entertainment-industry fame versus mainstream screen/media fame, without asking sensitive details."
    ].join(" ");
  }

  if (isFashionDesignSceneCluster(state, remainingQuestionSlots)) {
    return [
      "The transcript is in a fashion or clothing-design cluster.",
      "Do not guess a nearby European couturier or general luxury designer from fashion, menswear, or luxury clues alone.",
      "Ask one scene-level split such as streetwear, sneakers, luxury creative direction, founder-label fame, primary label, region, or menswear versus womenswear before guessing."
    ].join(" ");
  }

  if (isHeavyMetalSceneCluster(state, remainingQuestionSlots)) {
    return [
      "The transcript is in a heavy-metal or hard-rock cluster.",
      "Do not guess a mainstream rock singer from broad band, era, and metal clues alone.",
      "Ask one scene-level split such as lead vocalist versus guitarist/instrumentalist, extreme/death/black/power metal, country or region, band era, or mainstream crossover fame before guessing."
    ].join(" ");
  }

  if (isLevantPoliticsCluster(state, remainingQuestionSlots)) {
    return [
      "The transcript is in a Middle East, Arab-majority, or Levant politics cluster.",
      "Do not default to a famous Palestinian, pan-Arab, monarch, or authoritarian leader from broad region and leadership clues alone, especially when monarchy, coup, or revolutionary answers conflict.",
      "Ask one country-and-role discriminator: Lebanon versus Palestinian/Syrian/Jordanian/Israeli politics, head of state or government versus party/faction/militia/civil-war/sectarian leader, or assassinated leader versus long-term officeholder."
    ].join(" ");
  }

  if (isLateNoShortlistRecovery(state, remainingQuestionSlots)) {
    return [
      "The transcript is late, broad-checklist heavy, and still has no trustworthy shortlist.",
      "Do not guess a famous adjacent person from weak demographic or residual category clues.",
      "Ask one high-information reset question that creates a candidate set: original fame source, dominant public association, region or language sphere, one iconic event or work versus a long career, or tie to an organization, team, movement, medium, industry, or public role."
    ].join(" ");
  }

  if (remainingQuestionSlots === 1) {
    return [
      "Exactly one question slot remains.",
      "Do not leave it unused while multiple plausible candidates or a broad cluster still fit the transcript.",
      "Ask the single best remaining discriminator now unless the transcript already uniquely identifies one public identity.",
      "Make a final guess only when one candidate is clearly better supported than any last question."
    ].join(" ");
  }

  const lastTurn = state.transcript.at(-1);
  const lastQuestion = lastTurn?.question.toLowerCase() ?? "";

  if (isOpeningNoAnswer(state, remainingQuestionSlots)) {
    return [
      "The opener only says the target is not currently alive.",
      "Do not start an ordinary dead-human checklist yet.",
      "Ask whether this was a real person who actually lived, rather than a fictional, legendary, folkloric, holiday, religious, video-game, or screen-persona figure."
    ].join(" ");
  }

  if (
    lastTurn?.answer === "no" &&
    /(real person who actually lived|real human who actually lived|real person who lived|actually lived)/.test(
      lastQuestion
    )
  ) {
    return [
      "The last answer rejected a real historical human and points to a person-like cultural figure.",
      "Do not ask dead-human career, royalty, politics, science, or war checklists.",
      "Split medium/source next: mascot or advertising persona, virtual idol or music/software persona, video-game or interactive-media figure, film/TV/animation/comics/story character, folklore/legend/religion/holiday figure, national/political symbol, or screen persona; then narrow by signature work, franchise, origin language/region, era, and iconic role."
    ].join(" ");
  }

  if (
    lastTurn?.answer === "yes" &&
    /(real person who actually lived|real human who actually lived|real person who lived|actually lived)/.test(
      lastQuestion
    )
  ) {
    return [
      "The last answer confirmed a real person who actually lived.",
      "Continue in the real historical/deceased-person space and do not drift into fictional characters or screen personas unless later answers contradict this boundary."
    ].join(" ");
  }

  if (
    lastTurn?.answer === "yes" &&
    /(adult-entertainment|adult entertainment|mature-audience entertainment)/.test(
      lastQuestion
    )
  ) {
    return [
      "The last answer may have confirmed adult-entertainment-industry fame as an original public fame source.",
      "Do not ask sensitive follow-up details.",
      "If the wording could also mean mature-rated mainstream media, ask a cleaner public medium or creator-role discriminator instead of assuming adult-entertainment-industry fame."
    ].join(" ");
  }

  if (
    lastTurn?.answer === "yes" &&
    /(reality tv|famous family)/.test(lastQuestion)
  ) {
    return [
      "The last answer confirmed reality TV or famous-family public fame.",
      "Keep pruning nearby clusters with one neutral public discriminator. Do not jump to brand or company confirmation."
    ].join(" ");
  }

  if (
    lastTurn?.answer === "yes" &&
    /(also known for music|stage name)/.test(lastQuestion)
  ) {
    return [
      "The last answer confirmed a mixed acting-and-music public profile.",
      "Ask one neutral discriminator that separates multiple plausible people."
    ].join(" ");
  }

  if (
    lastTurn?.answer === "yes" &&
    /(reggaeton|latin urban|puerto rican|puerto rico)/.test(lastQuestion)
  ) {
    return [
      "The last answer confirmed a contemporary Latin/reggaeton music cluster.",
      "Ask one country, era, role, or public-career discriminator before guessing."
    ].join(" ");
  }

  if (
    lastTurn?.answer === "yes" &&
    /(bodybuilding|bodybuilder|fitness|hollywood action)/.test(lastQuestion)
  ) {
    return [
      "The last answer confirmed an individual-sport celebrity crossover cluster.",
      "Ask one neutral public-career discriminator before guessing."
    ].join(" ");
  }

  if (
    lastTurn?.answer === "yes" &&
    /(terrorism|extremist|extremism|al-qaeda)/.test(lastQuestion)
  ) {
    return [
      "The last answer confirmed a terrorism or extremist-violence public fame source.",
      "Do not ask sensitive follow-up details.",
      "Ask one neutral public discriminator unless the transcript already identifies one person."
    ].join(" ");
  }

  if (
    lastTurn?.answer === "yes" &&
    /(public notoriety|violent conflict|crime)/.test(lastQuestion)
  ) {
    return [
      "The last answer confirmed a notoriety or conflict-related public fame source.",
      "Do not describe harmful acts.",
      "Ask one neutral public discriminator unless the transcript already identifies one person."
    ].join(" ");
  }

  if (isRecentUsPresidentCluster(state, remainingQuestionSlots)) {
    return [
      "The transcript is in a recent U.S. president cluster.",
      "Do not make a final guess from one election-year answer while several question slots remain.",
      "Ask one robust nearby-candidate split, preferably whether the person served as vice president before becoming president or took office after 2020, unless that split has already been asked.",
      "Treat exact election-year answers as easy for players to misremember."
    ].join(" ");
  }

  if (isNonRealCulturalSourceGap(state, remainingQuestionSlots)) {
    return [
      "The transcript is in a person-like cultural-figure branch, but the public source is not grounded.",
      "Do not keep narrowing inside film, game, animation, or story franchises after those candidates are weak.",
      "Ask one broad source split such as mascot/advertising persona, virtual idol or music/software persona, video-game or interactive-media figure, film/TV/animation/comics/story character, folklore/holiday/religious figure, national/political symbol, or screen persona."
    ].join(" ");
  }

  if (isPlatformCreatorCluster(state, remainingQuestionSlots)) {
    return [
      "The transcript is in a long-tail platform-native creator cluster.",
      "Do not default to a famous English-language creator from content type alone.",
      "Ask one scene-level discriminator such as primary language or region, audience, creator era, or signature format before guessing."
    ].join(" ");
  }

  if (isComicsIllustrationCluster(state, remainingQuestionSlots)) {
    return [
      "The transcript is in a comics, cartooning, or illustration cluster.",
      "Do not default to a superhero-comics artist from broad illustration clues alone.",
      "Ask one format or scene split such as superhero comics versus humor/satire, magazine work, newspaper strips, manga, European comics, editorial cartoons, publisher, or creator-owned work before guessing."
    ].join(" ");
  }

  if (isCountryMusicCluster(state, remainingQuestionSlots)) {
    return [
      "The transcript is in a country or roots-music cluster.",
      "Do not guess a mainstream country star from broad country, gender, and era clues alone.",
      "Ask one subgenre split such as mainstream radio country versus bluegrass, folk, Americana, instrumental virtuosity, or songwriter-first fame."
    ].join(" ");
  }

  if (isBusinessExecutiveCluster(state, remainingQuestionSlots)) {
    return [
      "The transcript is in a narrowed business-executive cluster.",
      "Do not guess a nearby CEO from industry and role alone.",
      "Ask one company, region, founder-versus-hired-executive, or current-versus-former role discriminator before guessing."
    ].join(" ");
  }

  if (isMaybeHeavy(state, remainingQuestionSlots)) {
    return [
      "The transcript has several Maybe answers, so confidence is unstable.",
      "Do not make a narrow final guess from award, date, nationality, club, or genre details alone.",
      "Ask one objective discriminator on a sturdier axis such as first fame source, dominant public association, era, geography, role type, or signature medium."
    ].join(" ");
  }

  if (isFictionalPersonaAmbiguityCluster(state, remainingQuestionSlots)) {
    return [
      "The transcript may be mixing a real performer with a famous character or screen persona.",
      "Do not silently convert the target into the actor, voice actor, creator, or performer behind it.",
      "Ask one boundary question such as whether this is a fictional character or screen persona rather than a real person, then narrow by medium, era, genre, country/language, or signature work."
    ].join(" ");
  }

  if (isGlobalEntertainmentRegionGap(state, remainingQuestionSlots)) {
    return [
      "The transcript is in a global entertainment/media branch but has not grounded region, language, or public industry yet.",
      "Do not default to Hollywood, English-language media, or the most famous nearby actor/director from genre, award, franchise, or era clues alone.",
      "Ask one broad region/language/industry split before narrowing further, such as English-language/Hollywood versus Indian regional cinema, European/French-language cinema, East Asian media, Latin/Spanish-language media, or another regional industry."
    ].join(" ");
  }

  return [
    "Ask one strong yes/no-compatible question that prunes the remaining possibility space.",
    "Do not ask a confirmation question about one suspected person, company, brand, product, spouse, award, or exact work unless the transcript has already narrowed to a tiny cluster.",
    "Guess only when one identity is genuinely better supported than asking another discriminator."
  ].join(" ");
}

function isOpeningNoAnswer(
  state: GameState,
  remainingQuestionSlots: number
): boolean {
  return (
    remainingQuestionSlots > 0 &&
    state.questionCount === 1 &&
    state.transcript.length === 1 &&
    state.transcript[0].question === "Is this person alive?" &&
    state.transcript[0].answer === "no" &&
    state.latestQuestion === null
  );
}

function isRecentUsPresidentCluster(
  state: GameState,
  remainingQuestionSlots: number
): boolean {
  if (remainingQuestionSlots <= 5) {
    return false;
  }

  const answeredYes = state.transcript
    .filter((turn) => turn.answer === "yes")
    .map((turn) => turn.question.toLowerCase());
  const askedQuestions = state.transcript.map((turn) => turn.question.toLowerCase());

  return (
    answeredYes.some((question) => /president of the united states/.test(question)) &&
    answeredYes.some((question) => /21st century/.test(question)) &&
    (answeredYes.some((question) => /democratic party/.test(question)) ||
      askedQuestions.some((question) => /first elected president/.test(question)))
  );
}

function isMaybeHeavy(state: GameState, remainingQuestionSlots: number): boolean {
  if (remainingQuestionSlots <= 0) {
    return false;
  }

  const totalMaybes = state.transcript.filter((turn) => turn.answer === "maybe").length;
  const recentMaybes = state.transcript
    .slice(-8)
    .filter((turn) => turn.answer === "maybe").length;

  return totalMaybes >= 4 || recentMaybes >= 3;
}

function isLevantPoliticsCluster(
  state: GameState,
  remainingQuestionSlots: number
): boolean {
  if (remainingQuestionSlots <= 0 || remainingQuestionSlots > 5 || state.transcript.length < 10) {
    return false;
  }

  const signalQuestions = yesOrMaybeQuestions(state);
  const asked = allQuestions(state);

  const politicsSignal = signalQuestions.some((question) =>
    /(politics|government|leader|ruler|monarch|royal|president|prime minister|authoritarian|revolutionary)/.test(
      question
    )
  );
  const middleEastSignal = signalQuestions.some((question) =>
    /(middle east|arab-majority|arab country|arabian|levant)/.test(question)
  );
  const localCountrySplitAsked = asked.some((question) =>
    /(leban|palestin|syria|syrian|jordan|israel|iraq|iran|egypt|north africa|arabian peninsula|gulf)/.test(
      question
    )
  );
  const askedOnlyBroadOrNegativeLocalSplits =
    !asked.some((question) => /(leban|palestin|syria|syrian|israel)/.test(question)) &&
    localCountrySplitAsked;
  const roleSplitAsked = asked.some((question) =>
    /(party|faction|militia|armed wing|civil war|sectarian|assassinated|head of government|prime minister|president|parliament|intellectual|reformist)/.test(
      question
    )
  );

  return (
    politicsSignal &&
    middleEastSignal &&
    (askedOnlyBroadOrNegativeLocalSplits || !roleSplitAsked)
  );
}

function isLateNoShortlistRecovery(
  state: GameState,
  remainingQuestionSlots: number
): boolean {
  if (remainingQuestionSlots <= 0 || remainingQuestionSlots > 4 || state.transcript.length < 12) {
    return false;
  }

  const rejectedQuestions = noQuestions(state);
  const answeredYes = yesQuestions(state);
  const broadRejectedAxes = countMatchingQuestionAxes(rejectedQuestions, [
    /(entertainment|media|arts|music|acting|actor|comedy|host|presenter|television|film|internet|social media|reality)/,
    /(politics|government|president|prime minister|monarch|royal|public office)/,
    /(sports|athletic|olympic|team sport|combat sport|motorsport|racket|track and field|swimming|gymnastics|cycling|golf)/,
    /(business|entrepreneur|company|technology|founder|ceo)/,
    /(science|technology|invention|mathematics|medicine|biology|physics|astronomy|engineering|chemistry)/,
    /(writing|author|literature|visual art|design|fashion|modeling|beauty)/,
    /(religion|religious|spiritual|holiday|folklore|legendary)/,
    /(notoriety|violent conflict|crime|military|extremist|terrorism|armed conflict)/,
    /(humanitarian|charitable|activism|public service|helping or caring)/,
    /(united states|europe|asia|africa|middle east|english-speaking|country|region)/
  ]);
  const strongPositiveSignals = answeredYes.filter((question) => {
    if (/(alive|real person|actually lived|female|male)/.test(question)) {
      return false;
    }

    return /(associated with|known for|best known|served as|won|founding era|revolution|economics|mathematics|olympic|wimbledon|industry|language|region|country|movement|organization|team|specific|single|dominant)/.test(
      question
    );
  }).length;

  return (
    rejectedQuestions.length >= 8 &&
    broadRejectedAxes >= 4 &&
    strongPositiveSignals <= 3
  );
}

function countMatchingQuestionAxes(questions: string[], axes: RegExp[]): number {
  return axes.reduce(
    (count, axis) => count + (questions.some((question) => axis.test(question)) ? 1 : 0),
    0
  );
}

function isGlobalEntertainmentRegionGap(
  state: GameState,
  remainingQuestionSlots: number
): boolean {
  if (remainingQuestionSlots <= 0 || state.transcript.length < 5) {
    return false;
  }

  const signalQuestions = yesOrMaybeQuestions(state);
  const asked = allQuestions(state);

  const entertainmentSignal = signalQuestions.some((question) =>
    /(entertainment|media|arts)/.test(question)
  );
  const screenOrCreatorSignal = signalQuestions.some((question) =>
    /(acting|actor|film|television|tv|screen|scripted|voice acting|animated|director|directing|visual media|creator|producer|performer)/.test(
      question
    )
  );
  const usingSpecificScreenClues = asked.some((question) =>
    /(hollywood|academy award|blockbuster|franchise|superhero|science-fiction|fantasy|action|dramatic|romantic|comedy|sitcom|voice acting|animated|director|genre|released in the)/.test(
      question
    )
  );
  const regionOrLanguageGrounded = signalQuestions.some((question) =>
    /(english-language|hollywood|non-english|indian|india|bollywood|tamil|telugu|malayalam|kannada|south indian|european|french|italian|spanish-language|latin|east asian|korean|japanese|chinese|country|region|language)/.test(
      question
    )
  );

  return (
    entertainmentSignal &&
    screenOrCreatorSignal &&
    usingSpecificScreenClues &&
    !regionOrLanguageGrounded
  );
}

function isAdultEntertainmentFameSourceCluster(
  state: GameState,
  remainingQuestionSlots: number
): boolean {
  if (remainingQuestionSlots <= 0 || remainingQuestionSlots > 4 || state.transcript.length < 12) {
    return false;
  }

  const signalQuestions = yesOrMaybeQuestions(state);
  const rejectedQuestions = noQuestions(state);
  const asked = allQuestions(state);

  if (
    asked.some((question) =>
      /(adult-entertainment|adult entertainment|mature-audience entertainment)/.test(
        question
      )
    )
  ) {
    return false;
  }

  const aliveSignal =
    state.transcript[0]?.question.toLowerCase() === "is this person alive?" &&
    state.transcript[0]?.answer === "yes";
  const entertainmentPerformerSignal =
    signalQuestions.some((question) => /(entertainment|media)/.test(question)) &&
    signalQuestions.some((question) => /(performer|scripted|acting|film|television)/.test(question));
  const mainstreamScreenWeak =
    rejectedQuestions.some((question) => /music/.test(question)) &&
    rejectedQuestions.some((question) => /comedy/.test(question)) &&
    rejectedQuestions.some((question) => /television rather than movies/.test(question)) &&
    rejectedQuestions.filter((question) =>
      /(action|adventure|dramatic|romantic|science fiction|fantasy)/.test(question)
    ).length >= 2;
  const otherPublicSidePathsWeak =
    signalQuestions.some((question) => /outside acting/.test(question)) &&
    rejectedQuestions.filter((question) =>
      /(directing|fashion|modeling|business|brand|producing|owning media)/.test(question)
    ).length >= 2;

  return (
    aliveSignal &&
    entertainmentPerformerSignal &&
    mainstreamScreenWeak &&
    otherPublicSidePathsWeak
  );
}

function isFashionDesignSceneCluster(
  state: GameState,
  remainingQuestionSlots: number
): boolean {
  if (remainingQuestionSlots <= 0 || remainingQuestionSlots > 4 || state.transcript.length < 10) {
    return false;
  }

  const signalQuestions = yesOrMaybeQuestions(state);
  const asked = allQuestions(state);

  const realPersonSignal =
    state.transcript[0]?.answer === "yes" ||
    asked.some((question) => /real person who actually lived/.test(question));
  const fashionSignal = signalQuestions.some((question) =>
    /(fashion|clothing|menswear|womenswear|luxury high fashion|tailoring)/.test(
      question
    )
  );
  const designSignal = signalQuestions.some((question) =>
    /(designing|creating|design|designer|clothing)/.test(question)
  );
  const missingSceneSplit = !asked.some((question) =>
    /(streetwear|sneaker|off-white|louis vuitton|creative director|founder|label|brand founded|sportswear)/.test(
      question
    )
  );

  return realPersonSignal && fashionSignal && designSignal && missingSceneSplit;
}

function isHeavyMetalSceneCluster(
  state: GameState,
  remainingQuestionSlots: number
): boolean {
  if (remainingQuestionSlots <= 0 || remainingQuestionSlots > 4 || state.transcript.length < 10) {
    return false;
  }

  const answeredYes = yesQuestions(state);
  const asked = allQuestions(state);

  const realPersonSignal =
    state.transcript[0]?.answer === "yes" ||
    asked.some((question) => /real person who actually lived/.test(question));
  const musicSignal = answeredYes.some((question) => /music/.test(question));
  const metalSignal = answeredYes.some((question) =>
    /(heavy metal|hard rock|metal band)/.test(question)
  );
  const missingSceneSplit = !asked.some((question) =>
    /(guitar|guitarist|instrumentalist|scandinavian|finnish|finland|swedish|norwegian|death metal|black metal|power metal|extreme metal|metalcore)/.test(
      question
    )
  );

  return realPersonSignal && musicSignal && metalSignal && missingSceneSplit;
}

function isHistoricalAstrologyScholarCluster(
  state: GameState,
  remainingQuestionSlots: number
): boolean {
  if (remainingQuestionSlots <= 0 || state.transcript.length < 8) {
    return false;
  }

  const signalQuestions = yesOrMaybeQuestions(state);
  const asked = allQuestions(state);
  const rejectedQuestions = noQuestions(state);

  if (
    asked.some((question) =>
      /(astrolog|horoscope|zodiac|occult|esoteric|alchemy|alchemist)/.test(question)
    )
  ) {
    return false;
  }

  const historicalSignal = signalQuestions.some((question) =>
    /(before the 20th|before the 18th|ancient|medieval|renaissance|islamic golden age|middle east|persia|italy|europe)/.test(
      question
    )
  );
  const astronomySignal = signalQuestions.some((question) =>
    /(astronomy|astronomical|space observation|planetary|celestial|telescope|stars)/.test(
      question
    )
  );
  const scholarlyBridgeSignal = signalQuestions.some((question) =>
    /(mathematics|scholar|philosophy|religion|spirituality|theology|writing|learned)/.test(
      question
    )
  );
  const ordinaryScholarBranchesWeak = rejectedQuestions.some((question) =>
    /(creative literature|poetry|literature|arts|religion|theology|religious leader|saint|philosopher|philosophy|politics|government|monarch|royal)/.test(
      question
    )
  );
  const esotericBridgeSignal =
    scholarlyBridgeSignal &&
    ordinaryScholarBranchesWeak &&
    signalQuestions.some((question) =>
      /(court|ruler|religion|spirituality|theology|writing|scholar)/.test(question)
    );
  const deadOrHistoricalPersonSignal =
    state.transcript[0]?.question.toLowerCase() === "is this person alive?" &&
    state.transcript[0]?.answer === "no";

  return (
    deadOrHistoricalPersonSignal &&
    historicalSignal &&
    scholarlyBridgeSignal &&
    (astronomySignal || esotericBridgeSignal)
  );
}

function isFictionalPersonaAmbiguityCluster(
  state: GameState,
  remainingQuestionSlots: number
): boolean {
  if (remainingQuestionSlots <= 0 || state.transcript.length < 4) {
    return false;
  }

  const answeredYes = yesQuestions(state);
  const asked = allQuestions(state);

  const alreadyTestedBoundary = asked.some((question) =>
    /(fictional|character|persona|real person|real-life|played by|portrayed by|voice actor|actor behind|creator behind)/.test(
      question
    )
  );
  if (alreadyTestedBoundary) {
    return false;
  }

  const entertainmentBranch = answeredYes.some((question) =>
    /(entertainment|arts|media|screen acting|acting|television|film|comedy|sitcom|cartoon|animation|comics|video game)/.test(
      question
    )
  );
  const personaProneMedium = answeredYes.some((question) =>
    /(scripted sitcom|iconic.*series|long-running.*(franchise|series)|franchise or series|title character|supernatural horror|vampire|monster-hunting|zombie|cartoon|animation|comics|comic-book|superhero|masked crime-fighter|video game|fictional world)/.test(
      question
    )
  );
  const performerOrRoleBranch = answeredYes.some((question) =>
    /(performer|acting|screen acting|television|film|comedy|sitcom|iconic.*series)/.test(
      question
    )
  );

  return entertainmentBranch && personaProneMedium && performerOrRoleBranch;
}

function isNonRealCulturalSourceGap(
  state: GameState,
  remainingQuestionSlots: number
): boolean {
  if (remainingQuestionSlots <= 0 || state.transcript.length < 5) {
    return false;
  }

  const asked = allQuestions(state);
  const rejectedQuestions = noQuestions(state);
  const signalQuestions = yesOrMaybeQuestions(state);
  const rejectedRealPerson =
    asked.some((question) => /real person who actually lived/.test(question)) &&
    rejectedQuestions.some((question) => /real person who actually lived/.test(question));

  if (!rejectedRealPerson) {
    return false;
  }

  const sourceGrounded = signalQuestions.some((question) =>
    /(mascot|advertising|brand|corporate promotion|virtual idol|vocaloid|music software|software persona|screen persona|national personification|political symbol)/.test(
      question
    )
  );
  if (sourceGrounded) {
    return false;
  }

  const storyOrGameBranch = signalQuestions.some((question) =>
    /(film|television|tv|animation|animated|comic|screen|story|franchise|video game|interactive media|game franchise|japanese game)/.test(
      question
    )
  );
  const weakStoryOrGameCandidates = rejectedQuestions.filter((question) =>
    /(disney|warner bros|pokemon|final fantasy|persona|nintendo|superhero|anime|comic strips|theatrical animated|film produced|main playable protagonist|antagonist|villain)/.test(
      question
    )
  ).length;
  const mascotSourceMissing = !asked.some((question) =>
    /(mascot|advertising|brand|corporate promotion)/.test(question)
  );
  const virtualSourceMissing = !asked.some((question) =>
    /(virtual idol|vocaloid|music software|software persona)/.test(question)
  );
  const nonHumanOrAnimationSignal = signalQuestions.some((question) =>
    /(non-human|talking animal|animated|animation|children|family)/.test(question)
  );
  const japaneseInteractiveSignal = signalQuestions.some((question) =>
    /(video game|interactive media|japanese game|female|human or human-like)/.test(
      question
    )
  );

  return (
    storyOrGameBranch &&
    weakStoryOrGameCandidates >= 2 &&
    ((mascotSourceMissing && nonHumanOrAnimationSignal) ||
      (virtualSourceMissing && japaneseInteractiveSignal))
  );
}

function isPlatformCreatorCluster(
  state: GameState,
  remainingQuestionSlots: number
): boolean {
  if (remainingQuestionSlots <= 0) {
    return false;
  }

  const answeredYes = yesQuestions(state);
  const asked = allQuestions(state);

  return (
    answeredYes.some((question) =>
      /(online video|youtube|livestream|streaming|minecraft|platform-native)/.test(
        question
      )
    ) &&
    !asked.some((question) =>
      /(language|region|country|french|spanish|english-language|non-english|united states|british|european)/.test(
        question
      )
    )
  );
}

function isComicsIllustrationCluster(
  state: GameState,
  remainingQuestionSlots: number
): boolean {
  if (remainingQuestionSlots <= 0) {
    return false;
  }

  const answeredYes = yesQuestions(state);

  return answeredYes.some((question) =>
    /(comics|cartoons|illustration|superhero comic)/.test(question)
  );
}

function isCountryMusicCluster(
  state: GameState,
  remainingQuestionSlots: number
): boolean {
  if (remainingQuestionSlots <= 0) {
    return false;
  }

  const answeredYes = yesQuestions(state);

  return answeredYes.some((question) => /country music/.test(question));
}

function isBusinessExecutiveCluster(
  state: GameState,
  remainingQuestionSlots: number
): boolean {
  if (remainingQuestionSlots <= 0) {
    return false;
  }

  const answeredYes = yesQuestions(state);

  return (
    answeredYes.some((question) =>
      /(pharmaceutical|biotechnology|healthcare|medical services)/.test(question)
    ) &&
    answeredYes.some((question) => /(ceo|company|business|industry)/.test(question))
  );
}

function yesQuestions(state: GameState) {
  return state.transcript
    .filter((turn) => turn.answer === "yes")
    .map((turn) => turn.question.toLowerCase());
}

function yesOrMaybeQuestions(state: GameState) {
  return state.transcript
    .filter((turn) => turn.answer === "yes" || turn.answer === "maybe")
    .map((turn) => turn.question.toLowerCase());
}

function noQuestions(state: GameState) {
  return state.transcript
    .filter((turn) => turn.answer === "no")
    .map((turn) => turn.question.toLowerCase());
}

function allQuestions(state: GameState) {
  return state.transcript.map((turn) => turn.question.toLowerCase());
}
