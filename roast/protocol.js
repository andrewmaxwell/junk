// Kaleido serial protocol: message encoding and parsing.
//   to machine:   {[TAG VALUE]}\n   (or {[TAG]}\n for a query)
//   from machine: {sid[,VAR:value]*}\n

import {s} from './state.js';

export const INT_VARS = new Set(['HP', 'FC', 'RC', 'AH', 'HS', 'EV', 'CS']);
export const STR_VARS = new Set(['TU', 'SC', 'CL', 'SN']);

export function createMsg(tag, value) {
  if (value == null) return `{[${tag}]}\n`;
  let v = String(value);
  if (!STR_VARS.has(tag)) {
    const n = parseFloat(v);
    // Only reformat numeric values; keep strings like "A0" / "AR" intact.
    if (!isNaN(n))
      v = INT_VARS.has(tag)
        ? String(Math.round(n))
        : n.toFixed(1).replace(/\.?0+$/, '');
  }
  return `{[${tag} ${v}]}\n`;
}

// Parse a machine message and fold it into shared state.
export function parseMessage(msg) {
  if (!msg.startsWith('{') || !msg.endsWith('}')) return;
  const parts = msg.slice(1, -1).split(',');
  const sid = Math.round(parseFloat(parts[0]));
  if (!isNaN(sid)) s.sid = sid;
  for (const part of parts.slice(1)) {
    const colon = part.indexOf(':');
    if (colon < 1) continue;
    const key = part.slice(0, colon);
    const val = part.slice(colon + 1);
    if (INT_VARS.has(key)) s[key] = Math.round(parseFloat(val));
    else if (STR_VARS.has(key)) s[key] = val;
    else {
      const f = parseFloat(val);
      s[key] = isNaN(f) ? val : f;
    }
  }
}
