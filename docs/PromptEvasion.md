# Prompt Evasion Node

Prompt Evasion je node v Node Banana, který transformuje textový prompt pomocí různých Unicode a encoding triků. Slouží k testování robustnosti moderačních filtrů AI modelů — jak dobře dokážou detekovat závadný obsah, když je text obfuskovaný.

## Jak to funguje

1. Do nodu přijde textový prompt (buď ručně zadaný, nebo připojený z Prompt nodu)
2. Uživatel vybere evasion techniku z dropdownu
3. Text se okamžitě transformuje a výstup jde dál do pipeline (např. do NanoBanana generate nodu)

Node má **text input** (levý handle) a **text output** (pravý handle). Výstupní textarea je editovatelná — transformovaný text lze ručně doladit.

## Kategorie technik

Techniky jsou seřazené podle odhadované bypass rate (jak často projdou moderací).

### Invisible Characters (~85–95%)

Nejvyšší bypass rate. Výstup vypadá vizuálně identicky jako vstup, ale obsahuje neviditelné Unicode znaky mezi písmeny, které rozbíjí tokenizaci.

| Technika | Unicode znak | Bypass |
|----------|-------------|--------|
| Variation Selectors | U+FE00–U+FE0F | ~95% |
| Zero-Width Spaces | U+200B | ~90% |
| Zero-Width Joiners | U+200D | ~90% |
| Zero-Width Non-Joiner | U+200C | ~90% |
| Word Joiner | U+2060 | ~88% |
| Invisible Separator | U+2063 | ~85% |
| Soft Hyphens | U+00AD | ~85% |

Node zobrazuje u invisible technik info o počtu přidaných neviditelných znaků (např. `+15 invisible chars, 15 → 30 chars`).

### Homoglyphs (~70–80%)

Nahrazují latinské znaky vizuálně podobnými znaky z jiných Unicode bloků.

| Technika | Příklad | Bypass |
|----------|---------|--------|
| Cyrillic Homoglyphs | `nаkеd` (а=U+0430, е=U+0435) | ~80% |
| Greek Homoglyphs | `nαkεd` | ~78% |
| Small Caps | `ɴᴀᴋᴇᴅ` | ~75% |
| Superscript | `ⁿᵃᵏᵉᵈ` | ~70% |

### Unicode Math Variants (~65–75%)

Využívají Mathematical Alphanumeric Symbols blok (U+1D400–U+1D7FF).

| Technika | Příklad | Bypass |
|----------|---------|--------|
| Math Italic | `𝑛𝑎𝑘𝑒𝑑` | ~75% |
| Math Script | `𝓃𝒶𝓀𝑒𝒹` | ~75% |
| Math Bold Script | `𝓷𝓪𝓴𝓮𝓭` | ~73% |
| Math Fraktur | `𝔫𝔞𝔨𝔢𝔡` | ~73% |
| Math Double-Struck | `𝕟𝕒𝕜𝕖𝕕` | ~72% |
| Math Bold | `𝐧𝐚𝐤𝐞𝐝` | ~70% |
| Math Bold Italic | `𝒏𝒂𝒌𝒆𝒅` | ~70% |
| Math Bold Fraktur | `𝖓𝖆𝖐𝖊𝖉` | ~70% |
| Math Sans-Serif | — | ~68% |
| Math Sans Bold | — | ~68% |
| Math Sans Italic | — | ~68% |
| Math Sans Bold Italic | — | ~68% |
| Math Monospace | `𝚗𝚊𝚔𝚎𝚍` | ~65% |

### Encoding (~40–70%)

Převádějí text do jiného kódování.

| Technika | Příklad | Bypass |
|----------|---------|--------|
| ROT13 | `anxrq` | ~70% |
| Base64 | `bmFrZWQ=` | ~65% |
| Hex | `6e 61 6b 65 64` | ~60% |
| HTML Entities | `&#110;&#97;...` | ~60% |
| URL Encoding | `%6E%61%6B%65%64` | ~55% |
| Morse Code | `-. .- -.- . -..` | ~50% |
| Binary | `01101110 01100001...` | ~40% |

### Advanced Unicode (~45–70%)

| Technika | Popis | Bypass |
|----------|-------|--------|
| Bidi Override | RTL override — text se zobrazí pozpátku | ~70% |
| Zalgo | Combining marks nad/pod znaky | ~65% |
| Unicode Whitespace | Nahrazuje mezery různými Unicode mezerami | ~60% |
| Fullwidth | `ｎａｋｅｄ` — znaky z Fullwidth bloku | ~55% |
| Enclosed | `ⓝⓐⓚⓔⓓ` — znaky v kroužku | ~50% |
| Negative Squared | `🅽🅰🅺🅴🅳` | ~50% |
| Upside Down | `pǝʞɐu` — obrácené + reversed | ~45% |

### Linguistic (~45–60%)

Lingvistické transformace, které mění strukturu slov.

| Technika | Příklad | Bypass |
|----------|---------|--------|
| Strategic Misspell | Prohození sousedních znaků ve slovech | ~60% |
| Vowel Removal | `nkd` — odstranění samohlásek | ~55% |
| Pig Latin | `akednay` | ~50% |
| Char Doubling | `nnakkedd` | ~45% |

### Separators & Structural (~30–50%)

| Technika | Příklad | Bypass |
|----------|---------|--------|
| Diacritics | `ńâk̈ěḑ` — přidané diakritické znaménka | ~50% |
| Hyphenated | `n-a-k-e-d` | ~40% |
| Underscored | `n_a_k_e_d` | ~40% |
| Dot Separated | `n.a.k.e.d` | ~35% |
| Interleaved Noise | `n*a#k!e@d` | ~35% |
| Space Separated | `n a k e d` | ~30% |

### Well-known (~15–25%)

Nejčastěji zachycené techniky — moderační systémy na ně jsou většinou připravené.

| Technika | Příklad | Bypass |
|----------|---------|--------|
| Leetspeak | `n4k3d` | ~25% |
| MiXeD cAsE | `nAkEd` | ~20% |
| Reversed | `dekan` | ~15% |

### Meta

- **All Variants** — vygeneruje výstup všech technik najednou, každou s labelem. Užitečné pro rychlé porovnání.

## Soubory

| Soubor | Účel |
|--------|------|
| `src/components/nodes/PromptEvasionNode.tsx` | UI komponenta nodu |
| `src/utils/promptEvasion.ts` | Všechny transformační funkce a character mapy |

## Použití v pipeline

```
[Prompt] → text → [Prompt Evasion] → text → [NanoBanana / LLM Generate]
```

Typický workflow: napíšeš prompt, připojíš ho do Prompt Evasion nodu, vybereš techniku, a transformovaný text pošleš do generačního modelu. Tím otestuješ, jestli model danou evasion techniku odchytí nebo ne.
