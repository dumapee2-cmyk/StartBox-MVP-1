# StartBox MVP

StartBox is an MVP for a text-prompt-to-app generator with a basic browser UI.

## Scope (v1)

- Single stack: `nextjs-tailwind-supabase`
- `POST /generate`: prompt to generated files
- `POST /regenerate-file`: one-file iterative regeneration
- `GET /export-zip/:projectId`: download generated files as zip
- `GET /preview/:projectId`: browser preview of generated app UI

## Quick start

```bash
cd StartBox
npm install
npm run dev
```

Server runs on `http://localhost:4000` by default.
Open `http://localhost:4000` to use the UI.

## Endpoints

### API Overview

`GET /api`

### Health

`GET /health`

### Generate

`POST /generate`

Request:

```json
{
  "prompt": "Build a SaaS landing page with auth and a dashboard",
  "stack": "nextjs-tailwind-supabase"
}
```

### Regenerate file

`POST /regenerate-file`

Request:

```json
{
  "projectId": "prj_abc123",
  "path": "app/page.tsx",
  "instruction": "Make the hero section more concise"
}
```

### Export zip

`GET /export-zip/:projectId`

Example:

```bash
curl -L "http://localhost:4000/export-zip/<projectId>" -o startbox-project.zip
```

### Preview

`GET /preview/:projectId`

Open in browser to view the generated app UI directly.

## Notes

- If `OPENAI_API_KEY` is set, generation uses a two-step LLM flow:
  1. English prompt -> reasoned intent JSON
  2. intent plan -> validated app spec JSON
- If OpenAI is unavailable, generation falls back to deterministic planning logic.
- Project data is in-memory in `src/lib/store.ts`.
