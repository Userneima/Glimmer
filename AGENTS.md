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
