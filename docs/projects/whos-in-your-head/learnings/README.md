# Learnings

Append project-specific learnings here when implementation reveals missing docs, weak tooling, prompt issues, or architecture decisions that future agents should remember.

## 2026-05-14 Closeout

- Keep the MVP tracker archived as history, not active execution state. The app is already playable, deployed, instrumented, and publicly launched.
- For future work, prefer focused tasks around one behavior: prompt quality, model routing, telemetry/stats performance, deployment, or share/launch polish.
- When production behavior looks odd, check `npm run logs:prod` and the public aggregate stats before changing prompts. Several useful fixes came from real game transcripts, provider status shapes, and LiteLLM cache behavior rather than from one-off prompt tweaks.
