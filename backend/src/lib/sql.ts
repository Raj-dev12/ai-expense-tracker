/**
 * Escaping a value that is about to sit inside a LIKE pattern.
 *
 * `%` and `_` are wildcards, so a search for "50%" would otherwise match far
 * more than anybody asked for, and a backslash is escaped too because a
 * backslash is what does the escaping.
 *
 * This lives here rather than beside its first caller because there are two of
 * them now, and this exact rule has already been wrong once: it was written as
 * `` `\${character}` `` inside a template literal, where the backslash escapes
 * the dollar sign instead of producing one — so every search replaced its
 * wildcards with the eleven literal characters `${character}` and found nothing,
 * ever. A rule that subtle should exist once.
 *
 * The value is still sent as a query parameter, never glued into the SQL.
 */
export function likeEscape(value: string): string {
  return value.replace(/[\%_]/g, (character) => `\${character}`);
}

/** An escaped value wrapped for a "contains" match. */
export function likePattern(value: string): string {
  return `%${likeEscape(value)}%`;
}
