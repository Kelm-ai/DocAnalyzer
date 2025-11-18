# Monorepo Workflow

This repository now keeps the backend FastAPI service (everything at the repo root) and the Vite frontend (`frontend/`) in a single workspace so Codex and your editors can load both projects at once. Deployment still happens from the original, separate GitHub repositories via `git subtree` commands.

## Directory Layout
- **Backend**: repo root (`api`, `scripts`, migrations, etc.). This still deploys from `origin` → `Kelm-ai/DocAnalyzer`.
- **Frontend**: `frontend/` (checked in from `Kelm-ai/frontend-docanalyzer`).

## Add the Frontend Remote (once per clone)
```bash
git remote add frontend git@github.com:Kelm-ai/frontend-docanalyzer.git
git fetch frontend main
```
> The extra remote name (`frontend`) is arbitrary; keep it consistent so the commands below work everywhere.

## Grafting the Existing Frontend History
After your first commit in this monorepo, run a one‑time pull to graft the real frontend history onto `frontend/`.
```bash
git subtree pull --prefix frontend frontend main --squash -m "Sync frontend repo"
```
Because the files already match `frontend/main`, the merge completes without touching your working tree but records the upstream history so future pushes are fast‑forwards.

## Publishing Frontend Changes to Its Repo
1. Make backend + frontend edits together as usual, then commit in this repo.
2. Push backend updates normally (`git push origin main`).
3. Push the frontend subtree to its GitHub repo:
   ```bash
   git subtree push --prefix frontend frontend main
   ```
   This command takes the committed contents under `frontend/` and publishes them to the `main` branch of `Kelm-ai/frontend-docanalyzer`.

## Pulling New Frontend Work Back In
When teammates land changes directly in `Kelm-ai/frontend-docanalyzer`:
```bash
git fetch frontend main
git subtree pull --prefix frontend frontend main --squash -m "Update frontend subtree"
```
The `--squash` flag keeps your monorepo history compact (a single merge commit per sync) while preserving the true history inside the standalone frontend repo.

## Notes
- Always run subtree commands on clean working trees (commit or stash first).
- You can replace `main` with any branch name if you deploy different environments.
- Railway configuration now expects the backend root at `.` and the frontend root at `frontend/` (see `docs/deployment/railway.md`).
- The helper scripts (`start-system.sh`, `status.sh`, `stop-system.sh`) already point at `frontend/` so nothing else changes for local development.
