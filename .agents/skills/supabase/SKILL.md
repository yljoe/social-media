---
name: supabase
description: Plan, implement, migrate, and debug Supabase integrations for this repository, including Postgres schema design, Row Level Security, Auth, Storage, client/server wiring, environment configuration, and migration from the repo's current SQLite or mock-storage setup. Use when a user asks to add Supabase, replace mock Supabase or local storage with real Supabase services, create migrations or policies, connect the frontend or backend to Supabase, or troubleshoot Supabase-related code and configuration.
---

# Supabase

Use this skill to add real Supabase support without breaking the repository's current provider abstraction or local fallback paths. Treat Supabase as an integration target that must fit the existing backend storage-policy flow, not as a reason to rewrite unrelated layers.

## Quick Start

1. Read `references/current-project.md` before editing.
2. Classify the request:
   - storage adapter or bucket work
   - database schema or migration work
   - auth or session work
   - frontend client wiring
   - debugging an existing Supabase integration
3. Keep local fallback behavior unless the user explicitly asks for a hard cutover.
4. Keep service-role credentials on the server only.

## Workflow

### 1. Build context from the repo

Read only the files needed for the task.

- Always inspect the backend provider and storage-policy code first.
- If the task touches schema or persistence, inspect the API and data model files that consume the data.
- If the task touches the frontend, inspect package manifests and environment handling before adding any SDK.
- Search for `supabase-storage`, `storage_mode`, `provider_configs`, and `storage_policies` before inventing new abstractions.

### 2. Choose the integration shape

Prefer the smallest change that solves the request.

- For storage tasks, extend the existing storage-provider flow instead of bypassing it.
- For database tasks, decide whether the repo needs:
  - a staged migration from SQLite to Supabase Postgres
  - dual-read or dual-write compatibility
  - a direct replacement with explicit data migration steps
- For frontend tasks, use the public anon key only in browser code.
- For privileged operations, create or reuse backend-only code paths instead of calling Supabase directly from the client.

### 3. Implement conservatively

- Centralize Supabase URL, keys, bucket names, and schema settings in one config layer.
- Prefer deterministic migration files over ad hoc SQL embedded in app code.
- If the repo lacks a `supabase/` directory and the task requires schema or RLS work, create one with a clear layout instead of scattering SQL files.
- Reuse existing provider IDs, policy structures, and binding concepts where possible.
- Preserve local or mock behavior for development if the task does not explicitly remove it.

### 4. Validate the right risks

Validate the integration at the layer you changed.

- Confirm browser code does not expose service-role credentials.
- Confirm RLS or bucket policies exist for newly exposed tables or storage paths.
- Confirm the fallback path still works if the repo still supports local mode.
- Run targeted tests, lint, or smoke checks when available.
- Call out any required manual Supabase dashboard steps in the final response.

## Repository Guidance

Use `references/current-project.md` for the current integration points. At the time this skill was created, the repository already had a mock Supabase storage concept in the backend, which makes storage-provider work the natural first integration path.

## Guardrails

- Do not place service-role secrets in frontend code, `.env.example`, or checked-in test fixtures.
- Do not remove local fallback behavior unless the user asks for that migration explicitly.
- Do not add full Supabase Auth or database complexity when the request is only about storage.
- Do not invent a second parallel storage abstraction if `provider_configs`, `storage_policies`, and `storage_bindings` already cover the use case.
- Explain assumptions when project-specific Supabase details are missing, such as project URL, keys, bucket names, schema names, or auth provider choices.

## Deliverables

When using this skill, leave the repo in a state another engineer can continue from quickly.

- Name the backend, frontend, schema, auth, or storage layers changed.
- List any environment variables added or renamed.
- List any SQL migration, policy, or bucket-related files added.
- State any required manual Supabase dashboard or secret-management steps.
