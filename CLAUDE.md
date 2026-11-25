# Project Overview

## Purpose
Glimmer is a diary and personal knowledge management web app focused on smooth writing, structured organization, and reliable export. It supports rich-text editing, folders, tags, calendar-based browsing, optional cloud sync, and multiple export formats.

## Primary User
People who want a calm, local-first writing space for diaries, notes, and lightweight knowledge management, with optional cross-device sync.

## Core Success Criteria
- Writing and editing feel fast, intuitive, and interruption-free.
- Diary data remains reliable across refreshes, exports, and optional cloud sync.
- Core flows such as creating, finding, organizing, and exporting diaries stay simple enough to use without explanation.

---

# Tech Stack

- Framework: React with Vite
- Language: TypeScript
- Package Manager: npm
- Database: localStorage by default, Supabase for optional cloud sync
- Deployment: Vercel for web deployment

---

# Project Structure

```text
src/                          Application source
src/components/               UI components and reusable interface modules
src/components/Editor/        Rich-text editor, toolbar, table interactions
src/components/Layout/        App-level layout and state orchestration
src/components/Sidebar/       Folder, tag, calendar, and task side panels
src/components/UI/            Shared UI primitives and modals
src/hooks/                    State and business logic hooks
src/utils/                    Storage, export, sync, and helper utilities
src/types/                    TypeScript domain types
public/                       Static assets
scripts/                      Local automation and launcher scripts
docs/                         Documentation if added later
tests/                        Tests if added later
```

---

# Context Navigation

- Before opening large source files, read `docs/ai-handoff/CODEBASE_MAP.md` to locate the smallest relevant entry.
- When working inside a subdirectory, read the nearest `CLAUDE.md` in that directory first.
- Do not default-read generated or dependency folders: `node_modules/`, `dist/`, `src-tauri/target/`, `src-tauri/gen/schemas/`.
- Prefer Grep to locate handlers/functions before opening high-context files such as `AppLayout.tsx`, `storage.ts`, and `cloud.ts`.

---

# Release Boundaries

- Web deployment and desktop app packaging are separate release paths.
- Vercel is Web-only and must use `npm run build:web`.
- Desktop packaging is Tauri-only and must use `npm run desktop:build`.
- Do not mix Web fixes and desktop packaging artifacts in the same release unless both paths are intentionally being changed and validated.
- The detailed boundary rules live in `docs/RELEASE_BOUNDARIES.md`.

---

# UI / Window Rules

- Any new modal, drawer, floating panel, or major window redesign must be evaluated against the whole product, not only in isolation.
- Always check three things before finalizing a window-style UI change:
  - size relative to the surrounding product
  - visual style consistency with the existing product
  - whether the window is stealing too much attention from the main workspace
- Do not optimize a dialog as if it were an independent landing page or visual experiment.
- Prefer matching the current Glimmer language first:
  - light glass surfaces
  - restrained blue accent usage
  - soft borders and low-contrast shadows
  - calm hierarchy over dramatic contrast
- If a window looks good on its own but feels too large, too dark, too saturated, or too stylistically independent compared with the rest of the app, it is considered wrong and must be revised.

---

# Context Budget Rules

Always exclude these paths from searches and broad reads unless the task explicitly needs them:

- `node_modules/`
- `dist/`
- `.git/`
- `package-lock.json`
- `.DS_Store`
- `src-tauri/target/`
- `src-tauri/gen/schemas/`

Prefer targeted Grep or Glob over reading large files whole. Before opening `AppLayout.tsx` or `storage.ts`, locate the relevant function or handler first.

---

# Change Boundaries

Match verification effort to change risk:

- CSS or copy tweaks: visual check usually enough
- Type, prop, or import changes: `npx tsc -b` + `npm run build:web` (the root tsconfig only has references, so `tsc --noEmit` checks nothing)
- State, persistence, sync, or editor behavior changes: full build + manual smoke of the affected flow
- Tauri/desktop changes: `npm run desktop:build`, verify Web build is not broken
- Documentation-only changes: no verification needed

Web and desktop are separate release paths. Do not mix their artifacts.

---

# Privacy Boundary

- This repository is public on GitHub. Everything committed here is published.
- Never commit credentials, private diary content, user exports, or analysis derived from the user's own diaries or conversations. Put such material in `docs/private/` (gitignored).

---

# Reply Language

- Always reply to the user in Chinese, including status updates, summaries, and reports on finished work. Code, commands, file paths, and commit messages stay in English.
- Long sessions with lots of English tool output have caused replies to drift into English. Before sending each reply, check that it is written in Chinese.
