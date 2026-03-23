# Subagent Ownership Guide

## Purpose

This document defines how to split work in this repo so multiple subagents can operate in parallel without colliding on the same files.

## Current Hotspots

- `frontend/src/App.tsx`
- `backend/app/routers/projects.py`
- `backend/app/services/project_flow.py`
- `backend/app/services/storage_service.py`
- `backend/app/db.py`

These files should not be edited by multiple subagents in the same batch.

## Default Split

### 3-agent mode

#### Agent A: Frontend

Owns:

- `frontend/src/App.tsx`
- `frontend/src/App.css`
- `frontend/src/main.tsx`
- `frontend/src/shared/**`
- `frontend/src/features/**`

Does not own:

- `backend/**`

Primary tasks:

- Split UI by feature.
- Move fetch logic into shared API helpers.
- Keep frontend contracts aligned with backend DTOs.

#### Agent B: Backend Workflow

Owns:

- `backend/app/main.py`
- `backend/app/routers/**`
- `backend/app/schemas.py`
- `backend/app/services/project_flow.py`
- `backend/app/services/text_service.py`
- `backend/app/services/video_service.py`
- `backend/app/services/cost_service.py`

Does not own:

- `backend/app/db.py`
- storage adapter internals unless explicitly assigned
- `frontend/**`

Primary tasks:

- Project creation.
- Text generation flow.
- Video prepare, render, rerun, merge.
- Cost flow tied to workflow execution.

#### Agent C: Data / Integrations

Owns:

- `backend/app/db.py`
- `backend/app/config.py`
- `backend/app/services/storage_service.py`
- `backend/app/services/provider_service.py`
- `backend/data/**`

Does not own:

- frontend UI
- workflow route composition unless explicitly assigned

Primary tasks:

- Schema and persistence.
- Storage binding and artifact layout.
- Google Drive, Supabase, and local storage integration.
- Provider normalization and health checks.

### 5-agent mode

Use this when work is broad and ownership can be narrower.

#### Agent 1: Frontend Shell

Owns:

- `frontend/src/App.tsx`
- `frontend/src/App.css`
- `frontend/src/main.tsx`
- `frontend/src/shared/**`

#### Agent 2: Text and Project Workflow

Owns:

- `backend/app/routers/projects.py`
- `backend/app/services/project_flow.py`
- `backend/app/services/text_service.py`
- workflow parts of `backend/app/schemas.py`

#### Agent 3: Video Workflow

Owns:

- `backend/app/services/video_service.py`
- video-related endpoints in `backend/app/routers/projects.py`

#### Agent 4: Storage / DB / Providers

Owns:

- `backend/app/db.py`
- `backend/app/config.py`
- `backend/app/services/storage_service.py`
- `backend/app/services/provider_service.py`
- provider and storage routes

#### Agent 5: Admin / Assets / Costs

Owns:

- `frontend/src/features/providers/**`
- `frontend/src/features/assets/**`
- `frontend/src/features/costs/**`
- `backend/app/routers/providers.py`
- `backend/app/routers/assets.py`
- `backend/app/routers/costs.py`
- `backend/app/services/cost_service.py`

## Shared File Rules

- `backend/app/db.py` has a single owner per batch.
- Shared DTO changes must be coordinated before implementation starts.
- If one subagent needs a new shared type, the main agent should integrate it.
- If one subagent needs to touch another owner's file, stop and reassign ownership first.
- Cross-owner integration changes are merged by the main agent only.

## Dispatch Checklist

Before spawning subagents, define:

- Goal of the batch.
- Owned files for each agent.
- Files each agent must not edit.
- Expected output or acceptance criteria.
- Whether the batch is 3-agent or 5-agent mode.

## Task Template

Use this structure when assigning a subagent:

1. Scope: one feature or one technical seam only.
2. Owned files: explicit path list.
3. Do not edit: explicit path list.
4. Deliverable: code, tests, docs, or refactor target.
5. Acceptance: what must be true when finished.

## Bug Triage Heuristics

- If the bug is visual or form-state related, start in `frontend/src/App.tsx` or the relevant `frontend/src/features/**` folder.
- If the bug is API response shape or endpoint behavior, start in `backend/app/routers/**`.
- If the bug is workflow logic, start in `backend/app/services/project_flow.py`, `text_service.py`, or `video_service.py`.
- If the bug is storage path, missing artifact, sync, or fallback behavior, start in `backend/app/services/storage_service.py`.
- If the bug is data corruption or schema mismatch, start in `backend/app/db.py`.

## Success Condition

This repo is considered subagent-ready when:

- Feature work can be assigned without overlapping file ownership.
- Shared contracts are stable and easy to locate.
- The main agent only needs to integrate seams, not untangle collisions.
