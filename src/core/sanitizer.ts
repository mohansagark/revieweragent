// SPEC.md §10: PR titles, bodies, filenames, diffs, review threads, and
// issue comments are untrusted data, never instructions. This sanitizer
// is defense-in-depth (Constitution Principle IV) — the primary controls
// are structural (no tools, no PR-head checkout, base-branch config, a
// code-side gate). Required vectors, per SPEC.md §10's reference to
// anthropics/claude-code-action's docs/security.md: HTML comments,
// invisible characters, markdown image alt-text, hidden HTML attributes,
// and HTML entities.

const NAMED_ENTITIES: Record<string, string> = {
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (match, name: string) => NAMED_ENTITIES[name] ?? match);
}

function stripHtmlComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, "");
}

// Zero-width/invisible formatting characters (U+200B-U+200F zero-width
// space/joiners/marks, U+202A-U+202E bidi overrides, U+2060-U+2064 word
// joiner and invisible operators, U+FEFF BOM, U+00AD soft hyphen),
// Unicode "tag" characters (U+E0000-U+E007F, used in real-world
// prompt-injection PoCs to hide text inside emoji), and non-printable
// ASCII control characters other than tab/newline/carriage-return.
const INVISIBLE_CHARS = new RegExp(
  [
    "[\\u200B-\\u200F]", // zero-width space/joiners, LTR/RTL marks
    "[\\u202A-\\u202E]", // bidi embedding/override controls
    "[\\u2060-\\u2064]", // word joiner, invisible operators
    "\\uFEFF", // byte-order mark / zero-width no-break space
    "\\u00AD", // soft hyphen
    "[\\u{E0000}-\\u{E007F}]", // Unicode tag characters
    "[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]", // ASCII control chars (not tab/LF/CR)
  ].join("|"),
  "gu",
);

function stripInvisibleCharacters(text: string): string {
  return text.replace(INVISIBLE_CHARS, "");
}

function stripImageAltText(text: string): string {
  return text.replace(/!\[[^\]]*\]\(([^)]*)\)/g, "![image]($1)");
}

function stripHiddenHtmlAttributes(text: string): string {
  return text.replace(/<([a-zA-Z][a-zA-Z0-9-]*)\s+[^<>]*>/g, "<$1>");
}

export function sanitize(text: string): string {
  let result = decodeEntities(text);
  result = stripHtmlComments(result);
  result = stripInvisibleCharacters(result);
  result = stripImageAltText(result);
  result = stripHiddenHtmlAttributes(result);
  return result;
}

export const UNTRUSTED_DATA_OPEN = "<UNTRUSTED_PR_DATA>";
export const UNTRUSTED_DATA_CLOSE = "</UNTRUSTED_PR_DATA>";

export function wrapUntrustedData(fields: Record<string, string>): string {
  const body = Object.entries(fields)
    .map(([key, value]) => `${key}:\n${sanitize(value)}`)
    .join("\n\n");
  return `${UNTRUSTED_DATA_OPEN}\n${body}\n${UNTRUSTED_DATA_CLOSE}`;
}
