const escape = (str) =>
  ('' + str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const collapse = (obj) =>
  Array.isArray(obj.value) && obj.value.length === 1
    ? collapse({
        ...obj,
        type: `${obj.type} / ${obj.value[0].type}`,
        value: obj.value[0].value,
      })
    : obj;

export const renderAst = (obj, odd = false) => {
  if (Array.isArray(obj)) return obj.map((el) => renderAst(el, odd)).join('');
  if (obj && typeof obj === 'object') {
    obj = collapse(obj);
    return `<div class="obj ${odd ? 'odd' : 'even'}">
      <label>${escape(obj.type)}</label>
      <div>${renderAst(obj.value, !odd)}</div>
    </div>`;
  }
  return `<div class="value">${escape(obj)}</div>`;
};
