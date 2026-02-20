"use client";

import { useCallback, useMemo } from "react";
import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { useWorkflowStore } from "@/store/workflowStore";
import { PromptEvasionNodeData } from "@/types";
import {
  EvasionTechnique,
  TECHNIQUE_LABELS,
  applyEvasion,
} from "@/utils/promptEvasion";
import { InfoTooltip } from "./InfoTooltip";

/** Invisible character technique keys — output looks identical to input */
const INVISIBLE_TECHNIQUES = new Set<string>([
  "zwsp", "zwj", "zwnj", "softHyphen", "wordJoiner",
  "invisibleSeparator", "variationSelectors",
]);

const TECHNIQUES = Object.entries(TECHNIQUE_LABELS) as [EvasionTechnique, string][];

/** Short descriptions for each technique */
const TECHNIQUE_DESCRIPTIONS: Partial<Record<EvasionTechnique, string>> = {
  // Invisible
  variationSelectors: "Appends Unicode Variation Selectors (U+FE00–FE0F) after each character. Text looks identical but tokenization breaks.",
  zwsp: "Inserts Zero-Width Space (U+200B) between every character. Invisible but breaks word boundaries for tokenizers.",
  zwj: "Inserts Zero-Width Joiner (U+200D) between characters. Used in emoji sequences, confuses text classifiers.",
  zwnj: "Inserts Zero-Width Non-Joiner (U+200C) between characters. Prevents ligature formation, breaks tokenization.",
  wordJoiner: "Inserts Word Joiner (U+2060) between characters. Prevents line breaks and confuses word splitting.",
  invisibleSeparator: "Inserts Invisible Separator (U+2063) between characters. Mathematical separator that's invisible in text.",
  softHyphen: "Inserts Soft Hyphens (U+00AD) between characters. Only visible when line breaks, otherwise invisible.",
  // Homoglyphs
  cyrillic: "Replaces Latin letters with visually identical Cyrillic characters (e.g., 'a' → 'а' U+0430).",
  greek: "Replaces Latin letters with similar Greek characters (e.g., 'a' → 'α', 'e' → 'ε').",
  smallCaps: "Converts text to Unicode Small Capitals block. Looks like small uppercase letters.",
  superscript: "Converts text to Unicode superscript characters. Text appears raised and smaller.",
  // Math variants
  mathItalic: "Uses Mathematical Italic Unicode block (U+1D44E+). Looks like italic but different codepoints.",
  mathScript: "Uses Mathematical Script block. Looks like cursive handwriting.",
  mathBoldScript: "Uses Mathematical Bold Script block. Bold cursive style.",
  mathFraktur: "Uses Mathematical Fraktur block. Gothic/blackletter style characters.",
  mathDoubleStruck: "Uses Mathematical Double-Struck block. Characters with double lines.",
  mathBold: "Uses Mathematical Bold block. Bold characters from a different Unicode range.",
  mathBoldItalic: "Uses Mathematical Bold Italic block. Combines bold and italic from math range.",
  mathBoldFraktur: "Uses Mathematical Bold Fraktur block. Bold gothic style.",
  mathSanSerif: "Uses Mathematical Sans-Serif block.",
  mathSanBold: "Uses Mathematical Sans-Serif Bold block.",
  mathSanItalic: "Uses Mathematical Sans-Serif Italic block.",
  mathSanBoldItalic: "Uses Mathematical Sans-Serif Bold Italic block.",
  mathMonospace: "Uses Mathematical Monospace block. Fixed-width characters from math range.",
  // Encoding
  rot13: "Shifts each letter by 13 positions in the alphabet. Simple substitution cipher.",
  base64: "Encodes entire text as Base64 string. Model may decode it internally.",
  hex: "Converts each character to its hexadecimal byte value, space-separated.",
  htmlEntities: "Converts each character to HTML numeric entity format (&#NNN;).",
  urlEncoding: "Converts each character to URL percent-encoding (%XX).",
  morse: "Converts text to Morse code (dots and dashes).",
  binary: "Converts each character to 8-bit binary representation.",
  // Advanced
  bidiOverride: "Wraps text in Right-to-Left Override (U+202E). Text displays reversed visually.",
  zalgo: "Adds multiple combining diacritical marks above and below each character. Creates 'glitchy' text.",
  whitespaceVariants: "Replaces regular spaces with various Unicode whitespace characters (en/em space, thin space, etc.).",
  fullwidth: "Converts ASCII to Fullwidth Unicode variants. Characters are wider (Ｆｕｌｌｗｉｄｔｈ).",
  enclosed: "Wraps each letter in a circle using Enclosed Alphanumerics block (ⓐⓑⓒ).",
  negativeSquared: "Uses Negative Squared Latin letters block (🅰🅱🅲). Emoji-style characters.",
  upsideDown: "Replaces characters with upside-down Unicode equivalents and reverses the string.",
  // Linguistic
  strategicMisspell: "Swaps adjacent characters in each word (transposition). Humans can still read it.",
  vowelRemoval: "Removes all vowels from the text. Consonant-only output.",
  pigLatin: "Applies Pig Latin rules — moves leading consonants to end and adds 'ay'.",
  charDoubling: "Doubles every alphabetic character in the text.",
  // Separators
  diacritics: "Adds combining diacritical marks (accent, circumflex, umlaut, etc.) to each letter.",
  hyphenated: "Inserts hyphens between every character.",
  underscored: "Inserts underscores between every character.",
  dotSeparated: "Inserts dots between every character.",
  interleavedNoise: "Inserts random punctuation symbols (*#!@$~^&) between characters.",
  spaceSeparated: "Inserts spaces between every character.",
  // Well-known
  leetspeak: "Classic leetspeak — replaces letters with similar numbers (a→4, e→3, s→5, etc.).",
  mixedCase: "Alternates lowercase and uppercase for each character.",
  reversed: "Reverses the entire string character by character.",
};

type PromptEvasionNodeType = Node<PromptEvasionNodeData, "promptEvasion">;

export function PromptEvasionNode({ id, data, selected }: NodeProps<PromptEvasionNodeType>) {
  const nodeData = data;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const inputText = e.target.value;
      const technique = nodeData.technique as EvasionTechnique;
      const outputText = inputText ? applyEvasion(inputText, technique) : null;
      updateNodeData(id, { inputText, outputText });
    },
    [id, nodeData.technique, updateNodeData]
  );

  const handleTechniqueChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const technique = e.target.value as EvasionTechnique;
      const outputText = nodeData.inputText
        ? applyEvasion(nodeData.inputText, technique)
        : null;
      updateNodeData(id, { technique, outputText });
    },
    [id, nodeData.inputText, updateNodeData]
  );

  const handleOutputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateNodeData(id, { outputText: e.target.value || null });
    },
    [id, updateNodeData]
  );

  const isInvisible = INVISIBLE_TECHNIQUES.has(nodeData.technique);
  const charInfo = useMemo(() => {
    if (!nodeData.inputText || !nodeData.outputText) return null;
    const inLen = Array.from(nodeData.inputText).length;
    const outLen = Array.from(nodeData.outputText).length;
    const diff = outLen - inLen;
    if (diff <= 0 && !isInvisible) return null;
    return { inLen, outLen, diff };
  }, [nodeData.inputText, nodeData.outputText, isInvisible]);

  return (
    <BaseNode
      id={id}
      title="Prompt Evasion"
      customTitle={nodeData.customTitle}
      comment={nodeData.comment}
      onCustomTitleChange={(title) => updateNodeData(id, { customTitle: title || undefined })}
      onCommentChange={(comment) => updateNodeData(id, { comment: comment || undefined })}
      selected={selected}
    >
      {/* Text input from connected node */}
      <Handle
        type="target"
        position={Position.Left}
        id="text"
        data-handletype="text"
      />
      {/* Text output */}
      <Handle
        type="source"
        position={Position.Right}
        id="text"
        data-handletype="text"
      />

      <div className="flex-1 flex flex-col min-h-0 gap-2">
        {/* Input text area */}
        <textarea
          value={nodeData.inputText}
          onChange={handleTextChange}
          placeholder="Enter normal prompt text..."
          className="nodrag nopan nowheel w-full flex-1 min-h-[80px] text-[10px] p-1.5 border border-neutral-700 rounded bg-neutral-900/50 text-neutral-300 resize-none focus:outline-none focus:ring-1 focus:ring-neutral-600"
        />

        {/* Technique selector + info tooltip */}
        <div className="flex items-center gap-1 shrink-0">
          <select
            value={nodeData.technique}
            onChange={handleTechniqueChange}
            className="flex-1 text-[10px] py-1 px-1.5 border border-neutral-700 rounded bg-neutral-900/50 focus:outline-none focus:ring-1 focus:ring-neutral-600 text-neutral-300"
          >
            {TECHNIQUES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {nodeData.technique !== "all" && TECHNIQUE_DESCRIPTIONS[nodeData.technique as EvasionTechnique] && (
            <InfoTooltip
              text={TECHNIQUE_DESCRIPTIONS[nodeData.technique as EvasionTechnique]!}
            />
          )}
        </div>

        {/* Char diff info for invisible techniques */}
        {charInfo && (
          <div className="text-[9px] px-1 text-neutral-500 flex items-center gap-1.5 shrink-0">
            {isInvisible && (
              <span className="text-amber-500/80 font-medium">
                +{charInfo.diff} invisible chars
              </span>
            )}
            <span>{charInfo.inLen} → {charInfo.outLen} chars</span>
            {isInvisible && (
              <span className="ml-auto text-neutral-600" title="Output looks identical but contains hidden characters that break tokenization">
                ?
              </span>
            )}
          </div>
        )}

        {/* Editable output */}
        <textarea
          value={nodeData.outputText ?? ""}
          onChange={handleOutputChange}
          placeholder="Transformed output"
          className="nodrag nopan nowheel w-full flex-1 min-h-[60px] text-[10px] p-1.5 border border-dashed border-neutral-600 rounded bg-neutral-900/30 text-neutral-300 resize-none focus:outline-none focus:ring-1 focus:ring-neutral-600 font-mono break-all"
        />
      </div>
    </BaseNode>
  );
}
