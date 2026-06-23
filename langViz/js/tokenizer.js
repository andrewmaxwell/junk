// Word/punctuation tokenizer matching the Python training pipeline exactly:
//   regex  [A-Za-z]+ | [^A-Za-z\s]   (words keep case; each punct char is its own token)
// Words not in the vocab are spelled out as a first char + "##" continuation
// pieces (a character fallback), so there is no <UNK> in practice.
// Index<->token maps are built from config.vocab (index 0 == "<UNK>").

const TOKEN_RE = /[A-Za-z]+|[^A-Za-z\s]/g;

// Punctuation that should hug the previous token (no leading space).
const NO_SPACE_BEFORE = new Set([',', '.', ';', ':', '!', '?', ')', ']', '}', "'", '"']);
// Opening brackets: the next token hugs them (no space after).
const NO_SPACE_AFTER = new Set(['(', '[', '{']);

export const UNK = 0;
export const UNK_GLYPH = '◌';

export function makeTokenizer(vocab) {
  const stoi = new Map();
  vocab.forEach((tok, i) => stoi.set(tok, i));

  function splitTokens(text) {
    return text.match(TOKEN_RE) || [];
  }

  // One surface token -> ids. Whole word if known, else spelled out as the first
  // char + "##" continuation pieces (matches train.py's encode_token).
  function encodeToken(t) {
    if (stoi.has(t)) return [stoi.get(t)];
    const ids = [];
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      const key = i === 0 ? ch : '##' + ch;
      const id = stoi.has(key) ? stoi.get(key)
        : stoi.has('##' + ch) ? stoi.get('##' + ch)
          : stoi.has(ch) ? stoi.get(ch) : UNK;
      ids.push(id);
    }
    return ids;
  }

  // Encode raw text -> array of token ids.
  function encode(text) {
    const out = [];
    for (const t of splitTokens(text)) for (const id of encodeToken(t)) out.push(id);
    return out;
  }

  // Whether a leading space is needed before `tok` given the previous token.
  function needsSpaceBefore(prevTok, tok) {
    if (prevTok == null) return false;
    if (typeof tok === 'string' && tok.startsWith('##')) return false; // continuation glues on
    if (NO_SPACE_BEFORE.has(tok)) return false;
    if (NO_SPACE_AFTER.has(prevTok)) return false;
    return true;
  }

  return {
    vocab,
    stoi,
    encode,
    splitTokens,
    needsSpaceBefore,
    idToToken: (id) => vocab[id],
  };
}
