# Current Project

Load this file when the task is about integrating Supabase into this repository rather than giving generic Supabase advice.

## Current State

- Backend data is currently centered on SQLite at `backend/data/app.db`.
- Storage has a provider abstraction with local, Google Drive mock, and Supabase mock entries.
- Frontend is a Vite + React app and does not currently include a Supabase SDK dependency.
- There is no repo-local `supabase/` directory or checked-in SQL migration structure yet.

## Relevant Files

- `backend/app/config.py`
  - Defines `DATA_DIR`, `STORAGE_DIR`, `GDRIVE_MOCK_DIR`, `SUPABASE_MOCK_DIR`, and `DB_PATH`.
- `backend/app/db.py`
  - Seeds provider configs, including `model = "supabase-storage"` and `name = "Supabase (Mock)"`.
  - Stores provider config details in `provider_configs.config_json`.
  - Seeds `storage_policies` with `data_strategy = "supabase_or_local"`.
  - Backfills storage modes such as `local`, `google_drive_mock`, and `supabase_mock`.
- `backend/app/services/storage_service.py`
  - Resolves the active data provider in `apply_storage_policy()`.
  - Prefers an active `supabase-storage` provider for data, otherwise falls back to local storage.
  - Uses `storage_bindings` to map each project to provider roots and modes.
  - Rebinds project storage with `rebind_project_storage()`.

## Practical Implications

- Real Supabase Storage integration should usually extend the existing storage-provider model first.
- Replacing SQLite with Supabase Postgres is a larger change and should be scoped explicitly.
- If a task only asks for Supabase support, start by determining whether the user means:
  - Supabase Storage
  - Supabase Postgres
  - Supabase Auth
  - a full-platform migration
- Preserve the provider policy and fallback model unless the user asks to simplify or remove it.

## Useful Search Terms

Search these terms before editing:

- `supabase-storage`
- `Supabase (Mock)`
- `storage_mode`
- `storage_policies`
- `storage_bindings`
- `provider_configs`
