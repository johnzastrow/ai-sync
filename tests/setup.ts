/**
 * Global test setup: give git a deterministic author/committer identity.
 *
 * Several integration tests commit through the product code (init command,
 * commitFiles). CI runners have no global git `user.name` / `user.email`, so
 * those commits fail with "Author identity unknown" -- even though they pass
 * locally where a developer's global git config supplies one.
 *
 * We set the identity via env vars rather than `git config --global` so we
 * never mutate the real user's git configuration, and so every git child
 * process -- both execSync() and simple-git -- inherits it automatically.
 * The `??=` guards let a caller override the identity if they ever need to.
 */
process.env.GIT_AUTHOR_NAME ??= "ai-sync test";
process.env.GIT_AUTHOR_EMAIL ??= "test@ai-sync.invalid";
process.env.GIT_COMMITTER_NAME ??= "ai-sync test";
process.env.GIT_COMMITTER_EMAIL ??= "test@ai-sync.invalid";
