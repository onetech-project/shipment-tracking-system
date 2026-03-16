import { Repository } from 'typeorm';

/**
 * Convert a human-readable name to a URL-safe slug.
 * e.g. "Acme Corp." → "acme-corp"
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')    // replace non-alphanumeric runs with hyphen
    .replace(/^-+|-+$/g, '')         // trim leading/trailing hyphens
    .slice(0, 200);                   // cap at 200 chars
}

/**
 * Ensure the slug is unique in the given repository's `slug` column.
 * If a collision is found, appends a numeric suffix: "acme-corp-2", "acme-corp-3", ...
 */
export async function ensureUniqueSlug(
  base: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  repo: Repository<any>,
  excludeId?: string,
): Promise<string> {
  let candidate = base;
  let suffix = 1;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const qb = repo.createQueryBuilder('e').where('e.slug = :slug', { slug: candidate });
    if (excludeId) qb.andWhere('e.id != :excludeId', { excludeId });
    const existing = await qb.getOne();
    if (!existing) return candidate;
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
}
