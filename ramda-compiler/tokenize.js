const {ifElse, isEmpty, always, pipe, slice, prepend} = window.R;

// const esc = string => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const tokenTypes = [
  {type: 'comment', regex: /^\/\/(.+)/},
  {type: 'number', regex: /^\d+/},
  {type: 'space', regex: /^\s+/},
  {type: 'boolean', regex: /^true|false/},
  ...'const var let function if else for while try catch class do return break continue'
    .split(' ')
    .map(type => ({type, regex: new RegExp(`^${type}\\b`)})),
  ...'( ) [ ] { } , => ... . === == = !== != ! || |= | && &= & += ++ + -= -- - **= ** *= * /= / ^= ^ : ; >= > <= <'.split(
    ' '
  ),
  {type: 'id', regex: /^[a-z]\w*/gi},
  {type: 'string', regex: /^'([^']*)'/},
  {type: 'string', regex: /^"([^"]*)"/}
];

export const tokenize = ifElse(isEmpty, always([]), str => {
  var tt = tokenTypes.find(t =>
    t.regex ? t.regex.test(str) : str.startsWith(t)
  );
  if (!tt) throw new Error(`No matching token for "${str}"`);
  var m = tt.regex ? str.match(tt.regex) : [tt];
  return pipe(
    slice(m[0].length, Infinity),
    tokenize,
    prepend({type: tt.type || tt, value: m[1] || m[0]})
  )(str);
});
