/**
 * Prompt Evasion Techniques
 *
 * Transforms text using various unicode/encoding tricks to test
 * prompt moderation filters. Ported from prompt_moderation_test.py.
 */

// Leetspeak character map
const LEET_MAP: Record<string, string> = {
  a: "4", e: "3", i: "1", o: "0",
  s: "5", t: "7", b: "8", g: "9",
  l: "1", z: "2",
};

// Cyrillic homoglyphs (look like Latin but are different codepoints)
const CYRILLIC_MAP: Record<string, string> = {
  a: "\u0430", c: "\u0441", e: "\u0435", o: "\u043E",
  p: "\u0440", x: "\u0445", y: "\u0443", k: "\u043A",
  i: "\u0456", h: "\u04BB", s: "\u0455", n: "\u0578",
};

// Combining diacritics cycle
const COMBINING_MARKS = ["\u0301", "\u0302", "\u0308", "\u030C", "\u0327", "\u0328"];

export type EvasionTechnique =
  | "leetspeak"
  | "cyrillic"
  | "fullwidth"
  | "enclosed"
  | "mathBold"
  | "zwsp"
  | "zwj"
  | "softHyphen"
  | "diacritics"
  | "dotSeparated"
  | "spaceSeparated"
  | "mixedCase"
  | "reversed"
  | "all";

export const TECHNIQUE_LABELS: Record<EvasionTechnique, string> = {
  leetspeak: "Leetspeak (n4k3d)",
  cyrillic: "Cyrillic Homoglyphs",
  fullwidth: "Fullwidth Characters",
  enclosed: "Enclosed (circled)",
  mathBold: "Math Bold",
  zwsp: "Zero-Width Spaces",
  zwj: "Zero-Width Joiners",
  softHyphen: "Soft Hyphens",
  diacritics: "Diacritics",
  dotSeparated: "Dot Separated (n.a.k.e.d)",
  spaceSeparated: "Space Separated (n a k e d)",
  mixedCase: "MiXeD cAsE",
  reversed: "Reversed",
  all: "All Variants",
};

export function toLeetspeak(text: string): string {
  return Array.from(text)
    .map((c) => LEET_MAP[c.toLowerCase()] ?? c)
    .join("");
}

export function toCyrillic(text: string): string {
  return Array.from(text)
    .map((c) => CYRILLIC_MAP[c.toLowerCase()] ?? c)
    .join("");
}

export function toFullwidth(text: string): string {
  return Array.from(text)
    .map((c) => {
      const code = c.charCodeAt(0);
      return code >= 0x21 && code <= 0x7e
        ? String.fromCharCode(code + 0xfee0)
        : c;
    })
    .join("");
}

export function toEnclosed(text: string): string {
  return Array.from(text)
    .map((c) => {
      const lower = c.toLowerCase();
      if (lower >= "a" && lower <= "z") {
        return String.fromCodePoint(0x24d0 + lower.charCodeAt(0) - "a".charCodeAt(0));
      }
      if (lower >= "0" && lower <= "9") {
        return String.fromCodePoint(0x2460 + lower.charCodeAt(0) - "0".charCodeAt(0));
      }
      return c;
    })
    .join("");
}

export function toMathBold(text: string): string {
  return Array.from(text)
    .map((c) => {
      const lower = c.toLowerCase();
      if (lower >= "a" && lower <= "z") {
        return String.fromCodePoint(0x1d41a + lower.charCodeAt(0) - "a".charCodeAt(0));
      }
      return c;
    })
    .join("");
}

export function insertZwsp(text: string): string {
  return Array.from(text).join("\u200B");
}

export function insertZwj(text: string): string {
  return Array.from(text).join("\u200D");
}

export function insertSoftHyphen(text: string): string {
  return Array.from(text).join("\u00AD");
}

export function addDiacritics(text: string): string {
  return Array.from(text)
    .map((c, i) => {
      if (/[a-zA-Z]/.test(c)) {
        return c + COMBINING_MARKS[i % COMBINING_MARKS.length];
      }
      return c;
    })
    .join("");
}

export function dotSeparated(text: string): string {
  return Array.from(text).join(".");
}

export function spaceSeparated(text: string): string {
  return Array.from(text).join(" ");
}

export function mixedCase(text: string): string {
  return Array.from(text)
    .map((c, i) => (i % 2 === 0 ? c.toLowerCase() : c.toUpperCase()))
    .join("");
}

export function reverseText(text: string): string {
  return Array.from(text).reverse().join("");
}

const TECHNIQUE_FNS: Record<Exclude<EvasionTechnique, "all">, (text: string) => string> = {
  leetspeak: toLeetspeak,
  cyrillic: toCyrillic,
  fullwidth: toFullwidth,
  enclosed: toEnclosed,
  mathBold: toMathBold,
  zwsp: insertZwsp,
  zwj: insertZwj,
  softHyphen: insertSoftHyphen,
  diacritics: addDiacritics,
  dotSeparated: dotSeparated,
  spaceSeparated: spaceSeparated,
  mixedCase: mixedCase,
  reversed: reverseText,
};

/**
 * Apply a single evasion technique or all of them.
 * When "all", returns each variant on a new line with a label.
 */
export function applyEvasion(text: string, technique: EvasionTechnique): string {
  if (technique === "all") {
    return Object.entries(TECHNIQUE_FNS)
      .map(([key, fn]) => `[${TECHNIQUE_LABELS[key as EvasionTechnique]}]\n${fn(text)}`)
      .join("\n\n");
  }
  const fn = TECHNIQUE_FNS[technique];
  return fn ? fn(text) : text;
}
