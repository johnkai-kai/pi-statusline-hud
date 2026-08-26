import { type Palette, paint, truncateAnsi, visibleLength } from "../palette.ts";
import { sanitizeText } from "../sanitize.ts";

const RULE = "─";
const ELLIPSIS = "…";
const REVERSE_ON = "\u001b[7m";
const RESET = "\u001b[0m";

// Three cells of rule are always kept at the end so the label never touches the edge.
const TAIL_RULE = 3;
// Below this length the leading rule stops looking like a rule; draw nothing instead.
const MIN_HEAD_RULE = 4;
// One space either side of the label so the inverse block does not bite the text.
const PADDING = 2;
const ID_CHARS = 6;

/** Session name first; falls back to the first six of the id, empty string if neither. */
export function sessionLabel(name: string | undefined, id: string | undefined): string {
  // The session name is written by the agent (session_info): the least trustworthy of these.
  const trimmed = sanitizeText(name ?? "").trim();
  if (trimmed !== "") return trimmed;
  // Sanitise before truncating: cutting through an escape sequence leaves debris.
  const shortId = sanitizeText(id ?? "").trim().slice(0, ID_CHARS);
  return shortId === "" ? "" : `#${shortId}`;
}

/**
 * The line pinned above the input box: a rule with an inverse session label near the right.
 *
 * The label is inverse video rather than a background colour — inverse is an ANSI
 * attribute, needs no truecolor, and stays visible under the mono palette. Colour only
 * makes it easier to spot; it is not what makes it exist.
 */
export function renderSessionBar(label: string, width: number, palette: Palette): string {
  if (!Number.isFinite(width) || width <= 0) return "";
  // This function is exported, so callers are not guaranteed to have sanitised.
  const text = sanitizeText(label).trim();
  if (text === "") return "";

  const chrome = MIN_HEAD_RULE + TAIL_RULE + PADDING;
  if (width < chrome + 1) return "";

  let shown = text;
  const room = width - chrome;
  if (visibleLength(shown) > room) {
    shown = truncateAnsi(shown, room - visibleLength(ELLIPSIS)) + ELLIPSIS;
  }

  const head = width - TAIL_RULE - PADDING - visibleLength(shown);
  return (
    paint(palette.dim, RULE.repeat(head)) +
    REVERSE_ON +
    paint(palette.cyan, ` ${shown} `) +
    RESET +
    paint(palette.dim, RULE.repeat(TAIL_RULE))
  );
}
