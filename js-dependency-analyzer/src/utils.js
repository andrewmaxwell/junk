export const nodesWhere = (cond, node, path = []) =>
  Object.keys(node && typeof node === 'object' ? node : []).reduce(
    (res, key) => res.concat(nodesWhere(cond, node[key], path.concat(key))),
    cond(node, path) ? [node] : []
  );

export const deepWithout = (props, ob) =>
  Array.isArray(ob)
    ? ob.map(el => deepWithout(props, el))
    : ob && typeof ob === 'object'
    ? Object.keys(ob).reduce(
        (res, key) =>
          props.includes(key)
            ? res
            : {...res, [key]: deepWithout(props, ob[key])},
        Array.isArray(ob) ? [] : {}
      )
    : ob;

export const logJSON = (...args) => {
  console.log(
    ...args.map(el =>
      el && typeof el === 'object' ? JSON.stringify(el, null, 2) : el
    )
  );
};
