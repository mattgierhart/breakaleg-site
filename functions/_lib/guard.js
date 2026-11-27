// Keeps repo plumbing (tests, tools, source, package files) from being served as site pages.
// Cloudflare Pages publishes the whole repo root because there is no build output directory.
// _routes.json sends only these paths (plus /api, /show, /.well-known) through the Functions.

export const BLOCKED_PREFIXES = [
  '/tools', '/tests', '/scripts', '/functions', '/.github', '/node_modules', '/.wrangler',
];
export const BLOCKED_FILES = [
  '/package.json', '/package-lock.json', '/wrangler.toml', '/wrangler.example.toml', '/.gitignore',
];

export function isBlockedPath(pathname) {
  const p = pathname.toLowerCase().replace(/\/+$/, '');
  if (BLOCKED_FILES.includes(p)) return true;
  return BLOCKED_PREFIXES.some((x) => p === x || p.startsWith(`${x}/`));
}
