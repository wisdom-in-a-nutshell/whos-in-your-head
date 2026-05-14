# Learnings

Append project-specific learnings here when implementation reveals missing docs, weak tooling, prompt issues, or architecture decisions that future agents should remember.

## 2026-05-14 Closeout

- Keep the MVP tracker archived as history, not active execution state. The app is already playable, deployed, instrumented, and publicly launched.
- For future work, prefer focused tasks around one behavior: prompt quality, model routing, telemetry/stats performance, deployment, or share/launch polish.
- When production behavior looks odd, check `npm run logs:prod` and the public aggregate stats before changing prompts. Several useful fixes came from real game transcripts, provider status shapes, and LiteLLM cache behavior rather than from one-off prompt tweaks.

## 2026-05-14 Reddit distribution follow-up

- Posted the broad AI play-first link to r/artificial with Project flair: https://reddit.com/r/artificial/comments/1td4r4f/i_built_an_ai_mindreader_game_where_it_gets_21/ ; first comment: https://reddit.com/r/artificial/comments/1td4r4f/i_built_an_ai_mindreader_game_where_it_gets_21/olsoln1/
- Posted the broad AI play-first link to r/ArtificialInteligence with Project / Build flair: https://reddit.com/r/ArtificialInteligence/comments/1td4r5q/i_built_an_ai_mindreader_game_where_it_gets_21/ ; first comment: https://reddit.com/r/ArtificialInteligence/comments/1td4r5q/i_built_an_ai_mindreader_game_where_it_gets_21/olsolvj/
- Posted the broad AI play-first link to r/AIAssisted with Wins flair: https://reddit.com/r/AIAssisted/comments/1td4r70/i_built_an_ai_mindreader_game_where_it_gets_21/ ; first comment: https://reddit.com/r/AIAssisted/comments/1td4r70/i_built_an_ai_mindreader_game_where_it_gets_21/olsom4j/
