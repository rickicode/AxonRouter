#!/usr/bin/env bash
set -euo pipefail

# Usage: npm run publish <version>
# Example: npm run publish 0.1.9
#          npm run publish v0.1.9
#
# This script:
# 1. Bumps package.json + package-lock.json to the given version
# 2. Runs lint, typecheck, test, build
# 3. Commits the version bump
# 4. Creates a git tag (v<version>)
# 5. Publishes to npm
# 6. Pushes the commit + tag to origin

# npm run passes all extra args after script name directly
# so "npm run publish v0.1.9" passes "v0.1.9" as $1
VERSION="${1:-}"

# Strip leading "v" if present (accept both "v0.1.9" and "0.1.9")
VERSION="${VERSION#v}"

if [ -z "$VERSION" ]; then
  echo "Error: version argument required"
  echo "Usage: npm run publish <version>"
  echo "Example: npm run publish 0.1.9"
  echo "         npm run publish v0.1.9"
  exit 1
fi

# Validate semver format
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$'; then
  echo "Error: invalid semver format: $VERSION"
  echo "Expected format: X.Y.Z or X.Y.Z-pre.N"
  exit 1
fi

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
  echo "Error: working directory is not clean. Commit or stash changes first."
  exit 1
fi

echo "==> Bumping version to $VERSION"
npm version "$VERSION" --no-git-tag-version
npm install --package-lock-only

echo "==> Running lint"
npm run lint

echo "==> Running typecheck"
npm run typecheck

echo "==> Running tests"
npm run test

echo "==> Building"
npm run build

echo "==> Committing version bump"
git add package.json package-lock.json
git commit -m "chore: release v$VERSION"

echo "==> Creating tag v$VERSION"
git tag -a "v$VERSION" -m "Release v$VERSION"

echo "==> Publishing to npm"
npm publish --access public --ignore-scripts

echo "==> Pushing to origin"
git push origin HEAD
git push origin "v$VERSION"

echo ""
echo "Done! Published axonrouter@$VERSION to npm"
echo "Tag v$VERSION pushed to origin"
