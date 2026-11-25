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
- When working inside a subdirectory, read the nearest `AGENTS.md` in that directory first.
- Do not default-read generated or dependency folders: `node_modules/`, `dist/`, `src-tauri/target/`, `src-tauri/gen/schemas/`.
- Prefer `rg` to locate handlers/functions before opening high-context files such as `AppLayout.tsx`, `storage.ts`, and `cloud.ts`.

---

# Common Commands

- Install dependencies: `npm install`.
- Web dev server: `npm run dev`.
- Web build: `npm run build:web`.
- Lint: `npm run lint`.
- Desktop dev server: `npm run desktop:dev`.
- Desktop build: `npm run desktop:build`.
- Desktop updater manifest: `npm run desktop:manifest`.

---

# Execution Boundaries

- Keep each execution turn to one coherent, verifiable work unit. If a request spans multiple workflows, modules, or risk areas, create a short staged plan first and execute one stage at a time.
- Before file edits, run `git status --short`. If dirty changes overlap the target files or make the change boundary unclear, stop and ask or split the task. If dirty changes are unrelated, leave them untouched and report that they were not modified.
- Edit source files, not generated outputs. Do not hand-edit `dist/`, `src-tauri/target/`, or generated Tauri schema files unless the task is explicitly about generated artifacts.
- Before major UI, information architecture, data model, sync, auth, export, or desktop packaging changes, state what will move, hide, be removed, or change semantically; identify what existing data/settings remain intact; then proceed only when the risk is understood.

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

# Validation Checklist

- Always run `git diff --check` before reporting completion after file edits.
- Documentation-only changes: no build required unless the edited docs change commands, release rules, or setup instructions.
- Frontend source changes: run `npm run build:web`; run `npm run lint` when the change touches imports, hooks, state, or shared utilities.
- Persistence, sync, export, editor content, or system diary changes: run `npm run build:web` and manually smoke-check the affected flow where feasible.
- Desktop/Tauri changes: run `npm run desktop:build`; also confirm `npm run build:web` still passes when shared frontend code changed.
- If validation cannot be run, state exactly why and what risk remains.

---

# Git / Commit Discipline

- Do not push or deploy unless explicitly requested.
- Do not create commits unless the user explicitly asks for a commit or checkpoint.
- One conversation is not one commit. Split commits by coherent product or maintenance purpose when committing is requested.
- Stage intentionally. When unrelated dirty changes exist, inspect the diff and stage only the files or hunks for the current work.
- Commit messages must be in English and should describe the user-visible or maintainer-visible outcome.
- Do not create broad `misc`, `update`, or `fix things` commits.
- User-visible behavior changes should update the appropriate product or progress documentation when the lesson is durable.

---

# Privacy Boundary

- This repository is public on GitHub. Everything committed here is published.
- Analysis derived from the user's own diaries or conversations (writing habits, usage stats, personal events) goes in `docs/private/`, which is gitignored, never in tracked docs.
- Public repo files must not contain credentials, tokens, private diary content, generated user exports, local machine paths, production secrets, or private workflow notes.
- Keep private material in ignored local files or directories such as `.env`, `docs/private/`, local exports, local logs, and generated data folders.
- Configuration templates may be committed only with blank values, dummy placeholders, or local-only examples.
- When producing analysis from personal data, summarize patterns and decisions; do not paste raw private content unless the user explicitly asks for excerpts.

---

# Agent Notes Maintenance

- Keep this file as a routing and behavior layer, not a long manual.
- Add rules here only for repeated mistakes, structural boundaries, validation changes, privacy boundaries, release decisions, or long-lived workflow decisions.
- If a rule needs long examples, tables, procedures, or domain reference, move the details into a focused document under `docs/` and keep only the trigger and link here.
- If this file grows too large to scan quickly, prefer pruning or moving detail into focused docs before adding more rules.
