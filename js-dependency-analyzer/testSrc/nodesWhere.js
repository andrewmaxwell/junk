export const nodesWhere = (cond, node, path = []) =>
  Object.keys(node && typeof node === 'object' ? node : []).reduce(
    (res, key) => res.concat(nodesWhere(cond, node[key], path.concat(key))),
    cond(node, path) ? [node] : []
  );

export default nodesWhere;
