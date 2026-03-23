# SQL Setup Guide

This repo currently runs on SQLite by default. SQL is reserved as a system-level server configuration and is intentionally not editable from the UI.

## Current rule

- Team members manage `OpenAI`, `Veo`, and personal `Google Drive` credentials in the UI under their own workspace profile.
- SQL stays in backend configuration only.
- If you later replace SQLite with your own SQL server, only the server maintainer changes environment settings.

## Reserved environment variables

These names are already reserved in [`config.py`](C:\Users\alvin\Desktop\社交工程內容生成平台\backend\app\config.py):

- `APP_DB_BACKEND`
- `APP_SQL_DSN`
- `APP_SQL_HOST`
- `APP_SQL_PORT`
- `APP_SQL_NAME`
- `APP_SQL_USER`
- `APP_SQL_PASSWORD`

## Recommended usage

### Option 1: Full DSN

Set:

```env
APP_DB_BACKEND=sql
APP_SQL_DSN=postgresql://app_user:strong_password@db.example.com:5432/social_training
```

### Option 2: Split fields

Set:

```env
APP_DB_BACKEND=sql
APP_SQL_HOST=db.example.com
APP_SQL_PORT=5432
APP_SQL_NAME=social_training
APP_SQL_USER=app_user
APP_SQL_PASSWORD=strong_password
```

## Operational rules

- Put SQL settings in backend `.env` only.
- Do not expose SQL passwords in the frontend.
- Do not let teammates change SQL connection settings from the provider UI.
- Keep one SQL environment per deployed backend, not one per teammate.

## Suggested rollout later

1. Prepare the target SQL database and credentials.
2. Add the SQL values to backend `.env`.
3. Implement the runtime switch from SQLite to SQL in the backend data layer.
4. Run schema migration and smoke tests.
5. Keep user-level model credentials in the UI unchanged.

## What the UI is for now

- `OpenAI` provider keys
- `Veo` or other video provider keys
- Personal `Google Drive` delivery settings

## What the UI is not for

- SQL connection strings
- Server-side secret storage for the main database
- System fallback storage
