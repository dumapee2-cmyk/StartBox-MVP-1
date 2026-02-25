# StartBox Backend - AI Agent Instructions

## Architecture Overview
StartBox is an Express.js API that converts text prompts into Next.js app specifications and generates starter files. The system uses a pipeline: prompt → spec generation → file rendering → in-memory storage.

**Core Components:**
- `src/server.ts`: Express server with CORS and JSON middleware
- `src/lib/generator.ts`: Orchestrates spec building and file generation
- `src/lib/specFromPrompt.ts`: Creates app specs via OpenAI API or deterministic fallback
- `src/lib/templates.ts`: Renders hardcoded Next.js/Tailwind templates from specs
- `src/lib/store.ts`: In-memory Map-based project storage (no persistence)
- `src/routes/`: Zod-validated Express routes for generate/regenerate/export endpoints

## Development Workflow
- **Start dev server**: `npm run dev` (tsx watch mode, hot reload)
- **Build for production**: `npm run build` (outputs to `dist/`)
- **Run production**: `npm run start` (serves compiled JS)
- **Type check**: `npm run check` (noEmit mode)

## Key Patterns & Conventions
- **Modules**: ES modules only (`"type": "module"` in package.json)
- **Validation**: Use Zod schemas from `src/lib/schema.ts` for all API inputs
- **Project IDs**: Generated as `prj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
- **Stack**: Currently hardcoded to `"nextjs-tailwind-supabase"` only
- **Spec Generation**: OpenAI Responses API with JSON schema when `OPENAI_API_KEY` set, otherwise fallback to `buildFallbackSpec()`
- **File Rendering**: Templates in `src/lib/templates.ts` use string interpolation with escaped newlines (`\\n`)
- **Storage**: Pure in-memory Map - projects lost on restart
- **Error Handling**: ZodError → 400 with issues array, other errors → 500

## API Structure
- **POST /generate**: `generateRequestSchema` → `generateFromPrompt()` → `GenerationResult`
- **POST /regenerate-file**: `regenerateFileRequestSchema` → placeholder regeneration
- **GET /export-zip/:projectId**: Streams JSZip buffer of project files

## Adding Features
When extending:
1. Add Zod schema to `src/lib/schema.ts`
2. Implement logic in appropriate `src/lib/` file
3. Add Express route in `src/routes/`
4. Mount router in `src/server.ts`
5. Update types in `src/types/index.ts` if needed

## Testing Approach
Run `npm run dev` and test endpoints with curl/Postman. No formal test suite exists - validate manually against README examples.</content>
<parameter name="filePath">/Users/kevinzou/StartBox BackEnd. V1/StartBox/.github/copilot-instructions.md