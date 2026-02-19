/**
 * Prompt Evasion Techniques
 *
 * Transforms text using various unicode/encoding tricks to test
 * prompt moderation filters. Ported from prompt_moderation_test.py.
 */

// ---------------------------------------------------------------------------
// Character maps
// ---------------------------------------------------------------------------

const LEET_MAP: Record<string, string> = {
  a: "4", e: "3", i: "1", o: "0",
  s: "5", t: "7", b: "8", g: "9",
  l: "1", z: "2",
};

const CYRILLIC_MAP: Record<string, string> = {
  a: "\u0430", c: "\u0441", e: "\u0435", o: "\u043E",
  p: "\u0440", x: "\u0445", y: "\u0443", k: "\u043A",
  i: "\u0456", h: "\u04BB", s: "\u0455", n: "\u0578",
};

const GREEK_MAP: Record<string, string> = {
  a: "\u03B1", b: "\u03B2", e: "\u03B5", h: "\u03B7",
  i: "\u03B9", k: "\u03BA", n: "\u03B7", o: "\u03BF",
  p: "\u03C1", t: "\u03C4", u: "\u03C5", v: "\u03BD",
  x: "\u03C7", y: "\u03B3",
};

const SUPERSCRIPT_MAP: Record<string, string> = {
  a: "\u1D43", b: "\u1D47", c: "\u1D9C", d: "\u1D48",
  e: "\u1D49", f: "\u1DA0", g: "\u1D4D", h: "\u02B0",
  i: "\u2071", j: "\u02B2", k: "\u1D4F", l: "\u02E1",
  m: "\u1D50", n: "\u207F", o: "\u1D52", p: "\u1D56",
  r: "\u02B3", s: "\u02E2", t: "\u1D57", u: "\u1D58",
  v: "\u1D5B", w: "\u02B7", x: "\u02E3", y: "\u02B8",
  z: "\u1DBB",
};

const SMALL_CAPS_MAP: Record<string, string> = {
  a: "\u1D00", b: "\u0299", c: "\u1D04", d: "\u1D05",
  e: "\u1D07", f: "\u0493", g: "\u0262", h: "\u029C",
  i: "\u026A", j: "\u1D0A", k: "\u1D0B", l: "\u029F",
  m: "\u1D0D", n: "\u0274", o: "\u1D0F", p: "\u1D18",
  q: "\u01EB", r: "\u0280", s: "\u0455", t: "\u1D1B",
  u: "\u1D1C", v: "\u1D20", w: "\u1D21", y: "\u028F",
  z: "\u1D22",
};

const UPSIDE_DOWN_MAP: Record<string, string> = {
  a: "\u0250", b: "q", c: "\u0254", d: "p",
  e: "\u01DD", f: "\u025F", g: "\u0183", h: "\u0265",
  i: "\u0131", j: "\u027E", k: "\u029E", l: "\u006C",
  m: "\u026F", n: "u", o: "o", p: "d",
  q: "b", r: "\u0279", s: "s", t: "\u0287",
  u: "n", v: "\u028C", w: "\u028D", x: "x",
  y: "\u028E", z: "z",
};

const COMBINING_MARKS = ["\u0301", "\u0302", "\u0308", "\u030C", "\u0327", "\u0328"];

// ---------------------------------------------------------------------------
// Math Alphanumeric Unicode offsets (lowercase a offset)
// ---------------------------------------------------------------------------

const MATH_OFFSETS: Record<string, number> = {
  mathBold: 0x1D41A,
  mathItalic: 0x1D44E,
  mathBoldItalic: 0x1D482,
  mathScript: 0x1D4B6,
  mathBoldScript: 0x1D4EA,
  mathFraktur: 0x1D51E,
  mathBoldFraktur: 0x1D586,
  mathDoubleStruck: 0x1D552,
  mathSanSerif: 0x1D5BA,
  mathSanBold: 0x1D5EE,
  mathSanItalic: 0x1D622,
  mathSanBoldItalic: 0x1D656,
  mathMonospace: 0x1D68A,
};

// ---------------------------------------------------------------------------
// Technique type & labels
// ---------------------------------------------------------------------------

export type EvasionTechnique =
  // Original techniques
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
  // Unicode math variants
  | "mathItalic"
  | "mathBoldItalic"
  | "mathScript"
  | "mathBoldScript"
  | "mathFraktur"
  | "mathBoldFraktur"
  | "mathDoubleStruck"
  | "mathSanSerif"
  | "mathSanBold"
  | "mathSanItalic"
  | "mathSanBoldItalic"
  | "mathMonospace"
  // Homoglyph variants
  | "greek"
  | "superscript"
  | "smallCaps"
  | "upsideDown"
  | "negativeSquared"
  // Invisible character tricks
  | "zwnj"
  | "wordJoiner"
  | "invisibleSeparator"
  | "variationSelectors"
  | "whitespaceVariants"
  // Encoding tricks
  | "rot13"
  | "base64"
  | "hex"
  | "morse"
  | "urlEncoding"
  | "htmlEntities"
  | "binary"
  // Linguistic tricks
  | "pigLatin"
  | "vowelRemoval"
  | "charDoubling"
  | "strategicMisspell"
  | "hyphenated"
  | "underscored"
  | "interleavedNoise"
  // Advanced
  | "zalgo"
  | "bidiOverride"
  // Meta
  | "all";

export const TECHNIQUE_LABELS: Record<EvasionTechnique, string> = {
  // --- Original ---
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
  // --- Unicode Math Variants ---
  mathItalic: "Math Italic (𝑛𝑎𝑘𝑒𝑑)",
  mathBoldItalic: "Math Bold Italic (𝒏𝒂𝒌𝒆𝒅)",
  mathScript: "Math Script (𝓃𝒶𝓀𝑒𝒹)",
  mathBoldScript: "Math Bold Script (𝓷𝓪𝓴𝓮𝓭)",
  mathFraktur: "Math Fraktur (𝔫𝔞𝔨𝔢𝔡)",
  mathBoldFraktur: "Math Bold Fraktur (𝖓𝖆𝖐𝖊𝖉)",
  mathDoubleStruck: "Math Double-Struck (𝕟𝕒𝕜𝕖𝕕)",
  mathSanSerif: "Math Sans-Serif",
  mathSanBold: "Math Sans Bold",
  mathSanItalic: "Math Sans Italic",
  mathSanBoldItalic: "Math Sans Bold Italic",
  mathMonospace: "Math Monospace (𝚗𝚊𝚔𝚎𝚍)",
  // --- Homoglyph Variants ---
  greek: "Greek Homoglyphs (αlρhα)",
  superscript: "Superscript (ⁿᵃᵏᵉᵈ)",
  smallCaps: "Small Caps (ɴᴀᴋᴇᴅ)",
  upsideDown: "Upside Down (pǝʞɐu)",
  negativeSquared: "Negative Squared (🅽🅰🅺🅴🅳)",
  // --- Invisible Characters ---
  zwnj: "Zero-Width Non-Joiner",
  wordJoiner: "Word Joiner (U+2060)",
  invisibleSeparator: "Invisible Separator (U+2063)",
  variationSelectors: "Variation Selectors",
  whitespaceVariants: "Unicode Whitespace Mix",
  // --- Encoding ---
  rot13: "ROT13 (anxrq)",
  base64: "Base64 (bmFrZWQ=)",
  hex: "Hex (6e 61 6b 65 64)",
  morse: "Morse Code (-. .- -.-)",
  urlEncoding: "URL Encoding (%6E%61...)",
  htmlEntities: "HTML Entities (&#110;...)",
  binary: "Binary (01101110...)",
  // --- Linguistic ---
  pigLatin: "Pig Latin (akednay)",
  vowelRemoval: "Vowel Removal (nkd)",
  charDoubling: "Char Doubling (nnakkedd)",
  strategicMisspell: "Strategic Misspell",
  hyphenated: "Hyphenated (n-a-k-e-d)",
  underscored: "Underscored (n_a_k_e_d)",
  interleavedNoise: "Interleaved Noise (n*a#k!e@d)",
  // --- Advanced ---
  zalgo: "Zalgo Text (ṋ̸̢a̷͎̓k̵̰̈e̴̝̊d̵̰̈)",
  bidiOverride: "Bidi Override (RTL)",
  // --- Meta ---
  all: "All Variants",
};

// ---------------------------------------------------------------------------
// Transform functions
// ---------------------------------------------------------------------------

// --- Original techniques ---

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

// --- Math Alphanumeric (generic for all math variants) ---

function toMathAlpha(text: string, offsetKey: string): string {
  const base = MATH_OFFSETS[offsetKey];
  if (!base) return text;
  return Array.from(text)
    .map((c) => {
      const lower = c.toLowerCase();
      if (lower >= "a" && lower <= "z") {
        return String.fromCodePoint(base + lower.charCodeAt(0) - "a".charCodeAt(0));
      }
      return c;
    })
    .join("");
}

export function toMathBold(text: string): string { return toMathAlpha(text, "mathBold"); }
export function toMathItalic(text: string): string { return toMathAlpha(text, "mathItalic"); }
export function toMathBoldItalic(text: string): string { return toMathAlpha(text, "mathBoldItalic"); }
export function toMathScript(text: string): string { return toMathAlpha(text, "mathScript"); }
export function toMathBoldScript(text: string): string { return toMathAlpha(text, "mathBoldScript"); }
export function toMathFraktur(text: string): string { return toMathAlpha(text, "mathFraktur"); }
export function toMathBoldFraktur(text: string): string { return toMathAlpha(text, "mathBoldFraktur"); }
export function toMathDoubleStruck(text: string): string { return toMathAlpha(text, "mathDoubleStruck"); }
export function toMathSanSerif(text: string): string { return toMathAlpha(text, "mathSanSerif"); }
export function toMathSanBold(text: string): string { return toMathAlpha(text, "mathSanBold"); }
export function toMathSanItalic(text: string): string { return toMathAlpha(text, "mathSanItalic"); }
export function toMathSanBoldItalic(text: string): string { return toMathAlpha(text, "mathSanBoldItalic"); }
export function toMathMonospace(text: string): string { return toMathAlpha(text, "mathMonospace"); }

// --- Homoglyph Variants ---

export function toGreek(text: string): string {
  return Array.from(text)
    .map((c) => GREEK_MAP[c.toLowerCase()] ?? c)
    .join("");
}

export function toSuperscript(text: string): string {
  return Array.from(text)
    .map((c) => SUPERSCRIPT_MAP[c.toLowerCase()] ?? c)
    .join("");
}

export function toSmallCaps(text: string): string {
  return Array.from(text)
    .map((c) => SMALL_CAPS_MAP[c.toLowerCase()] ?? c)
    .join("");
}

export function toUpsideDown(text: string): string {
  return Array.from(text)
    .map((c) => UPSIDE_DOWN_MAP[c.toLowerCase()] ?? c)
    .reverse()
    .join("");
}

export function toNegativeSquared(text: string): string {
  return Array.from(text)
    .map((c) => {
      const lower = c.toLowerCase();
      if (lower >= "a" && lower <= "z") {
        return String.fromCodePoint(0x1F170 + lower.charCodeAt(0) - "a".charCodeAt(0));
      }
      return c;
    })
    .join("");
}

// --- Invisible Character Tricks ---

export function insertZwnj(text: string): string {
  return Array.from(text).join("\u200C");
}

export function insertWordJoiner(text: string): string {
  return Array.from(text).join("\u2060");
}

export function insertInvisibleSeparator(text: string): string {
  return Array.from(text).join("\u2063");
}

export function insertVariationSelectors(text: string): string {
  // Cycle through VS1-VS16 (U+FE00-U+FE0F) after each character
  return Array.from(text)
    .map((c, i) => c + String.fromCharCode(0xFE00 + (i % 16)))
    .join("");
}

export function whitespaceVariants(text: string): string {
  // Cycle through different Unicode whitespace characters
  const spaces = [
    "\u2000", // en quad
    "\u2001", // em quad
    "\u2002", // en space
    "\u2003", // em space
    "\u2004", // three-per-em space
    "\u2005", // four-per-em space
    "\u2006", // six-per-em space
    "\u2007", // figure space
    "\u2008", // punctuation space
    "\u2009", // thin space
    "\u200A", // hair space
  ];
  return Array.from(text)
    .map((c, i) => {
      if (c === " ") return spaces[i % spaces.length];
      return c;
    })
    .join("");
}

// --- Encoding Tricks ---

export function toRot13(text: string): string {
  return Array.from(text)
    .map((c) => {
      const code = c.charCodeAt(0);
      if (code >= 65 && code <= 90) return String.fromCharCode(((code - 65 + 13) % 26) + 65);
      if (code >= 97 && code <= 122) return String.fromCharCode(((code - 97 + 13) % 26) + 97);
      return c;
    })
    .join("");
}

export function toBase64(text: string): string {
  try {
    return btoa(unescape(encodeURIComponent(text)));
  } catch {
    return btoa(text);
  }
}

export function toHex(text: string): string {
  return Array.from(text)
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
    .join(" ");
}

const MORSE_MAP: Record<string, string> = {
  a: ".-", b: "-...", c: "-.-.", d: "-..", e: ".", f: "..-.",
  g: "--.", h: "....", i: "..", j: ".---", k: "-.-", l: ".-..",
  m: "--", n: "-.", o: "---", p: ".--.", q: "--.-", r: ".-.",
  s: "...", t: "-", u: "..-", v: "...-", w: ".--", x: "-..-",
  y: "-.--", z: "--..",
  "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-",
  "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
  " ": "/",
};

export function toMorse(text: string): string {
  return Array.from(text.toLowerCase())
    .map((c) => MORSE_MAP[c] ?? c)
    .join(" ");
}

export function toUrlEncoding(text: string): string {
  return Array.from(text)
    .map((c) => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"))
    .join("");
}

export function toHtmlEntities(text: string): string {
  return Array.from(text)
    .map((c) => `&#${c.charCodeAt(0)};`)
    .join("");
}

export function toBinary(text: string): string {
  return Array.from(text)
    .map((c) => c.charCodeAt(0).toString(2).padStart(8, "0"))
    .join(" ");
}

// --- Linguistic Tricks ---

export function toPigLatin(text: string): string {
  return text
    .split(/(\s+)/)
    .map((word) => {
      if (/^\s+$/.test(word)) return word;
      const lower = word.toLowerCase();
      const vowelIdx = lower.search(/[aeiou]/);
      if (vowelIdx === 0) return word + "way";
      if (vowelIdx > 0) return word.slice(vowelIdx) + word.slice(0, vowelIdx) + "ay";
      return word + "ay";
    })
    .join("");
}

export function vowelRemoval(text: string): string {
  return text.replace(/[aeiouAEIOU]/g, "");
}

export function charDoubling(text: string): string {
  return Array.from(text)
    .map((c) => (/[a-zA-Z]/.test(c) ? c + c : c))
    .join("");
}

export function strategicMisspell(text: string): string {
  // Swap adjacent characters in each word (transposition)
  return text
    .split(/(\s+)/)
    .map((word) => {
      if (/^\s+$/.test(word) || word.length < 3) return word;
      const chars = Array.from(word);
      // Swap chars at position 1 and 2
      const idx = Math.min(1, chars.length - 2);
      [chars[idx], chars[idx + 1]] = [chars[idx + 1], chars[idx]];
      return chars.join("");
    })
    .join("");
}

export function hyphenated(text: string): string {
  return Array.from(text)
    .map((c) => (c === " " ? " " : c))
    .join("-")
    .replace(/-( )-/g, " ");
}

export function underscored(text: string): string {
  return Array.from(text)
    .map((c) => (c === " " ? " " : c))
    .join("_")
    .replace(/_( )_/g, " ");
}

export function interleavedNoise(text: string): string {
  const noise = ["*", "#", "!", "@", "$", "~", "^", "&"];
  return Array.from(text)
    .map((c, i) => {
      if (c === " ") return " ";
      return c + noise[i % noise.length];
    })
    .join("")
    .replace(/[*#!@$~^&]$/, ""); // strip trailing noise char
}

// --- Advanced ---

export function toZalgo(text: string): string {
  const zalgoMarks = [
    "\u0300", "\u0301", "\u0302", "\u0303", "\u0304", "\u0305",
    "\u0306", "\u0307", "\u0308", "\u0309", "\u030A", "\u030B",
    "\u030C", "\u030D", "\u030E", "\u030F", "\u0310", "\u0311",
    "\u0312", "\u0313", "\u0314", "\u0315",
    "\u0316", "\u0317", "\u0318", "\u0319", "\u031A",
    "\u031B", "\u031C", "\u031D", "\u031E", "\u031F",
    "\u0320", "\u0321", "\u0322", "\u0323", "\u0324",
    "\u0325", "\u0326", "\u0327", "\u0328", "\u0329",
    "\u032A", "\u032B", "\u032C", "\u032D", "\u032E",
    "\u032F", "\u0330", "\u0331", "\u0332", "\u0333",
    "\u0334", "\u0335", "\u0336", "\u0337", "\u0338",
  ];
  return Array.from(text)
    .map((c) => {
      if (/[a-zA-Z]/.test(c)) {
        // Add 3-6 random combining marks above and below
        const count = 3 + Math.floor(Math.abs(c.charCodeAt(0) * 7) % 4);
        let result = c;
        for (let i = 0; i < count; i++) {
          result += zalgoMarks[(c.charCodeAt(0) + i * 13) % zalgoMarks.length];
        }
        return result;
      }
      return c;
    })
    .join("");
}

export function bidiOverride(text: string): string {
  // Wrap with Right-to-Left Override so text displays reversed
  // Store the reversed text so the model reads it left-to-right as the original
  return "\u202E" + Array.from(text).reverse().join("") + "\u202C";
}

// ---------------------------------------------------------------------------
// Technique function map
// ---------------------------------------------------------------------------

const TECHNIQUE_FNS: Record<Exclude<EvasionTechnique, "all">, (text: string) => string> = {
  // Original
  leetspeak: toLeetspeak,
  cyrillic: toCyrillic,
  fullwidth: toFullwidth,
  enclosed: toEnclosed,
  mathBold: toMathBold,
  zwsp: insertZwsp,
  zwj: insertZwj,
  softHyphen: insertSoftHyphen,
  diacritics: addDiacritics,
  dotSeparated,
  spaceSeparated,
  mixedCase,
  reversed: reverseText,
  // Math variants
  mathItalic: toMathItalic,
  mathBoldItalic: toMathBoldItalic,
  mathScript: toMathScript,
  mathBoldScript: toMathBoldScript,
  mathFraktur: toMathFraktur,
  mathBoldFraktur: toMathBoldFraktur,
  mathDoubleStruck: toMathDoubleStruck,
  mathSanSerif: toMathSanSerif,
  mathSanBold: toMathSanBold,
  mathSanItalic: toMathSanItalic,
  mathSanBoldItalic: toMathSanBoldItalic,
  mathMonospace: toMathMonospace,
  // Homoglyphs
  greek: toGreek,
  superscript: toSuperscript,
  smallCaps: toSmallCaps,
  upsideDown: toUpsideDown,
  negativeSquared: toNegativeSquared,
  // Invisible
  zwnj: insertZwnj,
  wordJoiner: insertWordJoiner,
  invisibleSeparator: insertInvisibleSeparator,
  variationSelectors: insertVariationSelectors,
  whitespaceVariants,
  // Encoding
  rot13: toRot13,
  base64: toBase64,
  hex: toHex,
  morse: toMorse,
  urlEncoding: toUrlEncoding,
  htmlEntities: toHtmlEntities,
  binary: toBinary,
  // Linguistic
  pigLatin: toPigLatin,
  vowelRemoval,
  charDoubling,
  strategicMisspell,
  hyphenated,
  underscored,
  interleavedNoise,
  // Advanced
  zalgo: toZalgo,
  bidiOverride,
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
