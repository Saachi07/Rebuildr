## What does this PR do?

<!-- Briefly describe the change. Link any related issues (e.g., "Closes #42"). -->



## Which part of Rebuildr does this touch?

- [ ] Backend (Flask)
- [ ] Frontend (Next.js)
- [ ] Tier A — Image classification / damage photos  
- [ ] Tier B — Document analysis / NLP pipeline
- [ ] Tier C — Personalized recovery / MDP action planner
- [ ] Tier A ↔ B ↔ C integration
- [ ] Database / migrations
- [ ] Config / environment / deployment

## How can the reviewer test it?

<!-- Step-by-step instructions to verify the change works. Include any setup needed (env vars, test files, sample uploads). -->

1. 
2. 
3. 

## Checklist

- [ ] No hard-coded secrets, API keys, or magic numbers
- [ ] Error responses don't leak internal details (column names, file paths, stack traces)
- [ ] New API routes return consistent JSON with appropriate status codes
- [ ] New UI components have `data-testid` attributes
- [ ] User-facing text is plain language (grade 8 reading level or below)
- [ ] Uploaded file inputs are validated for type and size server-side
- [ ] Loading and error states are handled in the UI
- [ ] Works on mobile viewport
- [ ] Tests added or updated

## Are there any breaking changes?

<!-- Does this change any API contracts, database schema, environment variables, or file storage paths that would affect other contributors? If yes, describe what needs to change and where. -->



## Anything else the reviewer should know?

<!-- Optional: tradeoffs you made, things you're unsure about, areas you'd like extra scrutiny on. -->
