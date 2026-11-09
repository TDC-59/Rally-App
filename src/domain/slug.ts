// Brand slugs: lowercase, URL-safe, immutable once public (DB trigger enforces the last part).

/** Paths the app owns at the top level. A brand can never take one. */
export const RESERVED_SLUGS = new Set([
  'app', 'api', 'auth', 'login', 'logout', 'near-me', 'healthz', 'spike',
  'css', 'js', 'fonts', 'media', 'static', 'vendor', 'assets', 'p', 'e', 'i', 's',
  'admin', 'rally', 'www', 'help', 'support', 'about', 'privacy', 'terms', 'pricing', 'blog',
  'favicon.ico', 'robots.txt', 'sw.js', 'manifest', 'feed', 'ics', 'map', 'signup', 'join',
]);

export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

export type SlugProblem = 'length' | 'characters' | 'reserved';

export function slugProblem(slug: string): SlugProblem | null {
  if (slug.length < 2 || slug.length > 40) return 'length';
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug) || slug.includes('--')) return 'characters';
  if (RESERVED_SLUGS.has(slug)) return 'reserved';
  return null;
}

export const SLUG_MESSAGES: Record<SlugProblem | 'taken', string> = {
  length: 'Use 2 to 40 characters.',
  characters: 'Use lowercase letters, numbers, and single hyphens. No hyphen at the start or end.',
  reserved: 'That address is reserved by Rally. Try another.',
  taken: 'Another brand already uses that address.',
};
