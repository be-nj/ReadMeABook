# Fork CI/CD (multilib → homelab)

**Status:** ✅ Implemented | GitHub Actions builds ghcr image on branch push; deploy is one manual Komodo call

## Overview
The multi-library fork deploys from the public GitHub fork only — no Forgejo repo, no secrets beyond `GITHUB_TOKEN`. Push to the working branch → tests → image on ghcr. Deploy is deliberate: one Komodo `DeployStack` call pulls `:multilib` and restarts the service.

## Key Details
- **Workflow:** `.github/workflows/deploy-multilib.yml`, trigger `push` to `feat/multi-library-owned` (+ `workflow_dispatch`), `concurrency: deploy-multilib`.
- **Jobs:** `test` (reuses `run-tests.yml`, no Discord notification) → `build-and-push` (`dockerfile.unified`, `linux/amd64` only, GHA cache).
- **Image:** `ghcr.io/be-nj/readmeabook` — tags `multilib` (moving) + `sha-<short7>` (pinned). Build args `APP_VERSION=<package.json version>-multilib`, `GIT_COMMIT`, `BUILD_DATE` → shown by `GET /api/version`.
- **Deploy (manual):** the homelab Komodo stack (name, server and URL live in the private ops notes), service `readmeabook`, compose image `ghcr.io/be-nj/readmeabook:multilib`, `auto_pull: true` (no `auto_update`). After the Actions run is green:
  ```bash
  set -a; . ~/.config/komodo/credentials; set +a
  curl -s -X POST "$KOMODO_URL/execute" -H "X-Api-Key: $KOMODO_API_KEY" -H "X-Api-Secret: $KOMODO_API_SECRET" \
    -H "Content-Type: application/json" -d '{"type":"DeployStack","params":{"stack":"<stack>","services":["readmeabook"]}}'
  ```
  Poll `{"type":"GetUpdate","params":{"id":"<_id.$oid>"}}` on `/read` until `status: Complete`. No GitHub→Komodo call (Komodo is LAN-only).
- **Rollback:** set the compose image to `ghcr.io/be-nj/readmeabook:sha-<short7>` via Komodo API `UpdateStack` + `DeployStack {"stack":"arr","services":["readmeabook"]}`; switch back to `:multilib` before the next regular deploy.
- **Verify:** `<public URL>/api/version` (`version`, `commit`, `buildDate`).
- **Upstream tag workflow** (`build-unified-image.yml`, `v*` tags, multi-arch) is unchanged; `v<upstream>-multilib.N` tags still publish semver tags but deploy nothing.
- **Local build check** stays `docker compose -f docker-compose.local.yml build readmeabook` (CLAUDE.md gate).

## Related: [unified.md](unified.md), [docker.md](docker.md)
