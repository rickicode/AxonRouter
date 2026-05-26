#!/usr/bin/env bash
set -euo pipefail

# Usage: npm run publish <version> [--allow-dirty|--auto-commit-dirty|--require-clean]
# Example: npm run publish 0.1.9
#          npm run publish v0.1.9
#          npm run publish 0.1.9 --allow-dirty
#          npm run publish 0.1.9 --auto-commit-dirty
#
# This script:
# 1. Optionally auto-commits or allows existing dirty changes
# 2. Bumps package.json + package-lock.json to the given version
# 3. Runs lint, typecheck, test, build
# 4. Commits the version bump
# 5. Creates a git tag (v<version>)
# 6. Publishes to npm
# 7. Pushes the commit + tag to origin
#
# On failure at any step, rolls back version bump, commit, and tag
# so the publish can be safely retried.

# ── Arg parsing ──────────────────────────────────────────────
VERSION="${1:-}"
ALLOW_DIRTY="${ALLOW_DIRTY:-0}"
AUTO_COMMIT_DIRTY="${AUTO_COMMIT_DIRTY:-1}"
REQUIRE_CLEAN="${REQUIRE_CLEAN:-0}"

shift || true

while [ "$#" -gt 0 ]; do
  case "$1" in
    --allow-dirty)
      ALLOW_DIRTY=1
      AUTO_COMMIT_DIRTY=0
      ;;
    --auto-commit-dirty)
      AUTO_COMMIT_DIRTY=1
      ALLOW_DIRTY=0
      ;;
    --require-clean)
      REQUIRE_CLEAN=1
      AUTO_COMMIT_DIRTY=0
      ALLOW_DIRTY=0
      ;;
    *)
      echo "Error: unknown option: $1"
      echo "Usage: npm run publish <version> [--allow-dirty|--auto-commit-dirty|--require-clean]"
      exit 1
      ;;
  esac
  shift
done

# Strip leading "v" if present (accept both "v0.1.9" and "0.1.9")
VERSION="${VERSION#v}"

if [ -z "$VERSION" ]; then
  echo "Error: version argument required"
  echo "Usage: npm run publish <version> [--allow-dirty|--auto-commit-dirty|--require-clean]"
  echo "Example: npm run publish 0.1.9"
  echo "         npm run publish v0.1.9"
  echo "         npm run publish 0.1.9 --allow-dirty"
  echo "         npm run publish 0.1.9 --auto-commit-dirty"
  exit 1
fi

# Validate semver format
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$'; then
  echo "Error: invalid semver format: $VERSION"
  echo "Expected format: X.Y.Z or X.Y.Z-pre.N"
  exit 1
fi

# ── Dirty-tree handling ─────────────────────────────────────
if [ -n "$(git status --porcelain)" ]; then
  if [ "$REQUIRE_CLEAN" = "1" ]; then
    echo "Error: working directory is not clean. Commit or stash changes first."
    exit 1
  fi

  if [ "$AUTO_COMMIT_DIRTY" = "1" ]; then
    echo "==> Auto-committing dirty changes before release"
    git add -A
    git commit -m "chore: prepare release v$VERSION"
  elif [ "$ALLOW_DIRTY" = "1" ]; then
    echo "==> Continuing with dirty working tree (--allow-dirty)"
  else
    echo "==> Continuing with dirty working tree"
  fi
fi

# ── Save pre-publish state for rollback ──────────────────────
PREV_VERSION=$(node -e "console.log(require('./package.json').version)")
PREV_HEAD=$(git rev-parse HEAD)
DID_VERSION_BUMP=0
DID_COMMIT=0
DID_TAG=0

rollback() {
  echo ""
  echo "!! Publish failed — rolling back all changes !!"

  if [ "$DID_TAG" = "1" ]; then
    echo "==> Removing tag v$VERSION"
    git tag -d "v$VERSION" 2>/dev/null || true
  fi

  if [ "$DID_COMMIT" = "1" ]; then
    echo "==> Removing release commit"
    git reset --soft HEAD~1 2>/dev/null || true
  fi

  if [ "$DID_VERSION_BUMP" = "1" ]; then
    echo "==> Reverting version to $PREV_VERSION"
    npm version "$PREV_VERSION" --no-git-tag-version 2>/dev/null || true
    npm install --package-lock-only 2>/dev/null || true
  fi

  # If we got back to a different HEAD than we started, unstage the version files
  if [ "$(git rev-parse HEAD)" != "$PREV_HEAD" ] && [ "$DID_COMMIT" = "0" ]; then
    git checkout "$PREV_HEAD" -- package.json package-lock.json 2>/dev/null || true
  fi

  echo "!! Rollback complete — you can safely retry npm run publish $VERSION !!"
}

# ── Step 1: Version bump ────────────────────────────────────
if [ "$VERSION" = "$PREV_VERSION" ]; then
  echo "==> Version is already $VERSION — skipping bump"
else
  echo "==> Bumping version to $VERSION"
  npm version "$VERSION" --no-git-tag-version
  npm install --package-lock-only
  DID_VERSION_BUMP=1
fi

# ── Step 2: Lint ────────────────────────────────────────────
echo "==> Running lint"
if ! npm run lint; then
  rollback
  exit 1
fi

# ── Step 3: Typecheck ───────────────────────────────────────
echo "==> Running typecheck"
if ! npm run typecheck; then
  rollback
  exit 1
fi

# ── Step 4: Tests ───────────────────────────────────────────
echo "==> Running tests"
if ! npm run test; then
  rollback
  exit 1
fi

# ── Step 5: Build ───────────────────────────────────────────
echo "==> Building"
if ! npm run build; then
  rollback
  exit 1
fi

# ── Step 6: Commit version bump ─────────────────────────────
echo "==> Committing version bump"
git add package.json package-lock.json
git commit -m "chore: release v$VERSION"
DID_COMMIT=1

# ── Step 7: Tag ─────────────────────────────────────────────
echo "==> Creating tag v$VERSION"
git tag -a "v$VERSION" -m "Release v$VERSION"
DID_TAG=1

# ── Step 8: Publish to npm ──────────────────────────────────
echo "==> Publishing to npm"
if ! npm publish --access public --ignore-scripts; then
  rollback
  exit 1
fi

# ── Step 9: Push to origin ──────────────────────────────────
echo "==> Pushing to origin"
if ! git push origin HEAD; then
  echo "!! npm publish succeeded but git push failed !!"
  echo "!! Tag v$VERSION exists locally — push manually: git push origin HEAD v$VERSION !!"
  exit 1
fi
if ! git push origin "v$VERSION"; then
  echo "!! npm publish succeeded but tag push failed !!"
  echo "!! Push tag manually: git push origin v$VERSION !!"
  exit 1
fi

echo ""
echo "Done! Published axonrouter@$VERSION to npm"
echo "Tag v$VERSION pushed to origin"
