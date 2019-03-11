const {curry, pipe, when, is, map} = window.R;

export const treeMap = curry((func, data) =>
  pipe(
    when(is(Object), map(treeMap(func))),
    func
  )(data)
);
