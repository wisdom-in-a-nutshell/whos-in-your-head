# Bootstrap Brief — Who's In Your Head?

## Product in one line

**Who's In Your Head?** is a tiny playable AI guessing game: the user thinks of a famous person, answers yes/no/maybe, and the AI has 21 questions to guess who it is.

## Current decision

Start with a **simple text-first web app** using the OpenAI **Responses API**. Do not start with Realtime voice. Voice can be added later only if the basic game is fun.

## Why this is worth doing

This is not a startup idea yet. Treat it as a small builder-track artifact:

- ship a playful AI demo quickly
- practice clean OpenAI app patterns
- make one public post/video from it
- learn if the loop is actually fun

Timebox: **one day or one weekend max for v0**. If it starts expanding, cut scope.

## MVP flow

1. Landing page:
   - Title: `Who's In Your Head?`
   - Subtitle: `Think of a famous person. The AI has 21 questions.`
   - Start button.
2. User silently thinks of a famous person.
3. AI asks one yes/no-compatible question at a time.
4. User answers with buttons:
   - Yes
   - No
   - Maybe / Not sure
5. App tracks `Question n / 21`.
6. AI makes a final guess before or at question 21.
7. User marks whether the guess was correct.
8. Result screen: win/loss + transcript + restart.

## Recommended implementation

Use the smallest boring stack:

- Next.js
- TypeScript
- OpenAI official JS SDK
- Server route for model calls
- No auth
- No database for v0
- In-memory/local client state is fine for v0

## Core architecture rule

The model is not the game engine. The app owns the rules.

Code should enforce:

- max 21 questions
- only one question per model turn
- allowed user answers
- phase transitions
- final guess path

The model should only propose the next question or final guess in structured JSON.

## Suggested structured model output

```ts
type AiTurn =
  | {
      action: "ask_question";
      question: string;
      confidence?: number;
    }
  | {
      action: "make_guess";
      guess: string;
      confidence?: number;
      reasoningForUser?: string;
    };
```

Keep `reasoningForUser` short and non-spoilery. Do not expose hidden chain-of-thought.

## Prompt intent

The AI should behave like a sharp, playful 20-questions host:

- Ask discriminating yes/no questions.
- Prefer high-information questions early.
- Do not ask open-ended questions.
- Do not ask multiple questions at once.
- Use the transcript to narrow down possibilities.
- Make a guess when confident or when the question limit is reached.

## First coding session goal

Do not touch OpenAI first. Build the mocked loop:

- app shell
- landing page
- game state reducer
- answer buttons
- transcript
- mocked AI questions
- result screen

Only after the local game feels good, wire the model.

## Resume pointer

Start from:

- `/Users/dobby/GitHub/whos-in-your-head/AGENTS.md`
- `/Users/dobby/GitHub/whos-in-your-head/README.md`
