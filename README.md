# ApplyWise — Evidence-Based Career Readiness Copilot

**Live demo:** https://applywise-career-agent.netlify.app
**Demo login:** `demo@applywise.local` / `applywise-demo`
**License:** [MIT](LICENSE)

ApplyWise helps job seekers and students see how ready they really are for a role. Skill status (`verified`, `declared`, `missing`) is **computed in code from attached proof** (GitHub repos, certificates, project files, URLs), never guessed by an LLM. On top of that deterministic layer sits an **AI Career Readiness Copilot powered by NVIDIA Nemotron models served through Nebius Token Factory**.

Hackathon track: NVIDIA Nemotron + Nebius Token Factory.

---

## How we use NVIDIA Nemotron

All LLM calls go through `server/nebiusAi.ts` and use two Nemotron models, routed by task:

| Tier | Model (env var) | Used for |
|---|---|---|
| **Ultra** | `nvidia/nemotron-3-ultra-550b-a55b` (`NEMOTRON_ULTRA_MODEL`) | Role comparisons (e.g. product engineer vs. government scientist tracks), 2-hour weekend project design, the 7-day "Close the gap" proof roadmap, and any chat question about planning, comparing, roadmaps, "why" or "how" |
| **Fast** | `nvidia/nemotron-3-nano-omni` (`NEMOTRON_FAST_MODEL`) | Suggestion chips, honest résumé phrasing and "Honest Rewrite", "Why this score?", recruiter summaries for the Proof Passport, and short explanations |

Routing lives in `src/utils/copilotEngine.ts` (`resolveCopilotModelRoute`, `routeQuestionModelTier`). If the Ultra model is unavailable, requests fall back to the Fast model with a visible notice.

**Grounding.** Every Copilot answer is built from the logged-in user's *Proof Vault* (verified proofs, declared skills, target role). The system prompt tells the model to separate what is proven from what is only claimed, so it does not inflate résumés.

**Transparency.** An *Inference Inspector* in the UI shows which model tier handled each call and why it was chosen.

## Where Nebius Token Factory helped

Nebius Token Factory is the only Nebius service we use. It served the Nemotron models as an OpenAI-compatible API, which shaped the build in these ways:

- **One integration, both models.** The official `openai` SDK is pointed at `https://api.tokenfactory.nebius.com/v1/`. Switching between the Ultra and Fast Nemotron models is a model-ID change, so the fast/deep routing logic stayed small.
- **Config instead of code.** Base URL and both model IDs come from environment variables, so we could swap or retune models without touching code.
- **Startup verification.** On boot the server calls `GET /v1/models`, logs whether each configured model exists, and falls back to an available Nemotron model with a clear warning if one is missing (`verifyNebiusModelsOnStartup`).
- **Streaming.** `POST /api/ai/chat` streams tokens to the browser over Server-Sent Events, so long Ultra-model answers start appearing right away.
- **Structured output.** `POST /api/ai/structured` requests JSON for the suggestion chips and AI boosts, with deterministic fallbacks built in code if a call fails.
- **Safety rails.** Per-user rate limiting (30 requests per 60 seconds) and timeouts around every model call. The API key stays on the server and is never sent to the browser.

An NVIDIA API key (`nvapi-...`) is also supported: the server then routes to NVIDIA's OpenAI-compatible endpoint (`https://integrate.api.nvidia.com/v1`).

## Other services

- **Tavily** (`server/tavily.ts`): live job search (`GET /api/jobs`), job-description extraction when a site blocks scraping (`POST /api/jd-fetch-url`), web context for the Copilot, and market demand for missing skills (`POST /api/skill-demand`).
- **Netlify** (static hosting + Functions via `serverless-http`).

## Features

- Skill evidence matrix with computed `verified` / `declared` / `missing` status
- Role readiness score and tier, with a 7-day proof plan and 4-phase career roadmap
- Job description match analysis and live job search
- Résumé Studio with honest, evidence-backed rewrites
- Document and image upload checks, GitHub repo proof review
- **Proof Passport**: a public, read-only, revocable page (`/p/:token`) that shows verified skills only, with no contact details, résumé text or unverified skill names

## Tech stack

React 19, Vite, Tailwind CSS 4, Express, SQLite (`better-sqlite3`), OpenAI SDK (for Token Factory), Tavily, Netlify Functions.

## Setup (local)

Requirements: Node.js 22 and a Nebius Token Factory API key.

```bash
git clone https://github.com/nivi20062712/applywise.git
cd applywise
npm install
cp .env.example .env     # then fill in your keys
npm run dev              # http://localhost:3000
```

Environment variables (see `.env.example`):

| Variable | Purpose |
|---|---|
| `NEBIUS_API_KEY` | Nebius Token Factory key (server-side only) |
| `NEBIUS_BASE_URL` | `https://api.tokenfactory.nebius.com/v1/` |
| `NEMOTRON_ULTRA_MODEL` | `nvidia/nemotron-3-ultra-550b-a55b` |
| `NEMOTRON_FAST_MODEL` | `nvidia/nemotron-3-nano-omni` |
| `TAVILY_API_KEY` | Live web search and extraction |
| `APP_URL` | Public URL of the app (e.g. `http://localhost:3000`) |

Without `NEBIUS_API_KEY` the app still runs, but AI features are offline.

Other commands:

```bash
npm test        # unit tests (skill matching, evidence model, copilot routing, passport)
npm run lint    # type-check
npm run build   # production build into dist/
```

## Deploy to Netlify

1. Push this repo to GitHub and import it in Netlify. Build settings come from `netlify.toml`.
2. Add the six environment variables above (mark the two API keys as secret).
3. Deploy. Use the demo login above.

Note: SQLite runs from `/tmp` on Netlify, so new accounts reset on cold starts. The seeded demo account always returns.

## API overview

- `POST /api/ai/chat`: streaming Copilot chat (SSE), grounded in the Proof Vault
- `POST /api/ai/structured`: chips (`chip_fastest_skills`, `chip_weekend_project`, `chip_compare_roles`, `chip_honest_resume`) and boosts (`honest_rewrite`, `why_this_score`, `close_the_gap`)
- `GET /api/ai/models-status`: startup model verification state
- `GET /api/public/passport/:token`: public Proof Passport data (allow-listed fields only)

## License

Released under the [MIT License](LICENSE).
