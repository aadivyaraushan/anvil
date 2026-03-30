export function buildArchitectPrompt(
  ideaDescription: string,
  targetProfile: string
): string {
  return `You are a software architect designing a minimal functional MVP prototype.

Startup idea: ${ideaDescription}
Target users: ${targetProfile}

Design a minimal Next.js web app that demonstrates the core value proposition of this idea.
The prototype should be simple enough to build in under 200 lines of code total.

Output ONLY valid JSON (no markdown, no explanation) with this exact structure:
{
  "appName": "short name for the prototype",
  "tagline": "one-line description",
  "pages": [
    { "name": "string", "route": "/", "purpose": "string", "components": ["string"] }
  ],
  "features": ["string"],
  "mockData": {
    "description": "what mock data to use",
    "example": { }
  },
  "colorScheme": "dark | light",
  "techNotes": "any specific Next.js/React implementation notes"
}

Rules:
- Maximum 3 pages
- No real database or authentication needed — use hardcoded mock data
- Keep it visually impressive but technically minimal
- All pages must work with static mock data only`;
}

export function buildUxDesignerPrompt(architectSpec: string): string {
  return `You are a UX designer creating a design brief for a web app prototype.

Architect's spec:
${architectSpec}

Write a concise design brief (plain text, no JSON) covering:
1. Color palette: primary background, card background, accent color, text colors (use Tailwind class names)
2. Typography: font choices, heading sizes
3. Layout pattern for each page: describe component hierarchy and spacing
4. Key shadcn/ui components to use (e.g. Card, Badge, Button variants, Table, Chart)
5. Tone: professional/playful/technical — how should it feel?
6. One sentence describing the visual mood

Be specific with Tailwind class names and shadcn component names. No code — just the design brief.`;
}

export function buildDeveloperPrompt(
  architectSpec: string,
  designBrief: string,
  buildErrors: string | null
): string {
  const errorSection = buildErrors
    ? `\n## Build Errors to Fix\n\nThe previous build failed with these errors:\n\`\`\`\n${buildErrors}\n\`\`\`\n\nFix ALL of these errors in your updated file list.\n`
    : "";

  return `You are a senior Next.js developer building a prototype app.

## Architect Spec
${architectSpec}

## Design Brief
${designBrief}
${errorSection}
## Instructions

Generate a complete, working Next.js 16 App Router project. Output ONLY valid JSON (no markdown wrapper, no explanation outside the JSON):

{
  "files": [
    { "path": "relative/path/from/project/root", "content": "file content as string" },
    ...
  ]
}

## Required files to include:

1. \`package.json\` — Next.js 16, react 19, tailwindcss 4, shadcn-compatible. Include these exact dependencies:
   \`\`\`json
   {
     "name": "prototype",
     "version": "0.1.0",
     "scripts": { "dev": "next dev", "build": "next build", "start": "next start" },
     "dependencies": {
       "next": "16.2.1",
       "react": "^19",
       "react-dom": "^19",
       "clsx": "^2.1",
       "tailwind-merge": "^3",
       "class-variance-authority": "^0.7",
       "lucide-react": "^0.400.0"
     },
     "devDependencies": {
       "@types/node": "^20",
       "@types/react": "^19",
       "@types/react-dom": "^19",
       "typescript": "^5",
       "tailwindcss": "^4",
       "@tailwindcss/postcss": "^4",
       "postcss": "^8"
     }
   }
   \`\`\`

2. \`tsconfig.json\` — standard Next.js tsconfig with \`"@/*": ["./src/*"]\` path alias
3. \`next.config.ts\` — minimal: \`export default { output: "standalone" }\`
4. \`postcss.config.mjs\` — \`export default { plugins: { "@tailwindcss/postcss": {} } }\`
5. \`src/app/globals.css\` — Tailwind v4 import: \`@import "tailwindcss";\` plus CSS variables for the color scheme
6. \`src/app/layout.tsx\` — root layout with metadata, imports globals.css
7. \`src/app/page.tsx\` — landing/home page
8. Additional pages as specified in the architect spec (one file each)
9. \`src/components/\` — any shared UI components used across pages

## Rules:
- Use ONLY the packages listed in package.json above — no other npm packages
- All data must be hardcoded mock data — no API calls, no database
- Use Tailwind CSS classes for ALL styling — no inline styles, no CSS modules
- All components must be TypeScript (.tsx) with proper types
- The \`src\` directory is the source root (tsconfig paths alias @/* to src/*)
- Keep each file under 150 lines — split into smaller components if needed
- The app MUST compile with \`next build\` with zero TypeScript errors`;
}

export function buildReviewerPrompt(
  architectSpec: string,
  designBrief: string,
  codeFiles: string
): string {
  return `You are a code reviewer checking a prototype against its spec and design brief.

## Architect Spec
${architectSpec}

## Design Brief
${designBrief}

## Generated Code Files
${codeFiles}

Review the code and check:
1. Does each page from the spec exist and render the required components?
2. Does the design match the design brief (colors, layout, component choices)?
3. Are there any obvious runtime errors (missing imports, undefined variables)?
4. Is the mock data realistic enough to convey the value proposition?

If the code looks good enough to ship as a demo: respond with exactly the word "APPROVED" and nothing else.

If there are issues: respond with a brief feedback list (max 5 items) describing what to fix. Be specific — reference file names and line numbers if possible.`;
}
