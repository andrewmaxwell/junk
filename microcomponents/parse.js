const nestChildElements = (elements) => {
  const stack = [{children: []}];
  for (const t of elements) {
    if (t.close) {
      stack.pop(); // go up a level
    } else if (!t.selfClosing && typeof t === 'object') {
      t.children = [];
      stack[stack.length - 1].children.push(t); // add t to parent
      stack.push(t); // go down a level
    } else {
      stack[stack.length - 1].children.push(t); // add t to parent
      delete t.selfClosing;
    }
  }
  return stack[0].children;
};

const parseTag = (tag) => {
  if (!Array.isArray(tag)) return tag;
  if (tag[0] === '/') return {tag: tag[1], close: true};
  const element = {tag: tag[0]};
  if (tag[tag.length - 1] === '/') {
    tag.pop();
    element.selfClosing = true;
  }
  for (let i = 1; i < tag.length; i += 2) element[tag[i]] = tag[i + 1];
  return element;
};

const parseTags = (tokens) => {
  const result = [];
  let inTag = false;
  for (const token of tokens) {
    if (token === '<') {
      inTag = true;
      result.push([]);
    } else if (token === '>') {
      inTag = false;
    } else {
      (inTag ? result[result.length - 1] : result).push(token);
    }
  }
  return result.map(parseTag);
};

export const parse = (templateParts, ...args) => {
  const tokens = [];
  for (let i = 0; i < templateParts.length; i++) {
    const templateTokens = templateParts[i]
      .match(/[</>]|(?<==")[^"]*(?=")|[a-z0-9]+/gi)
      .map((t) => t.trim())
      .filter((t) => t);
    tokens.push(...templateTokens);
    if (args[i]) tokens.push(args[i]);
  }
  return nestChildElements(parseTags(tokens));
};
