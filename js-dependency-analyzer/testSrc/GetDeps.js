import {transform} from 'babel-core';
import nodesWhere from './nodesWhere.js';

const EXCLUDED_PATH_ENDINGS = /(params,\d+|property|id|key|imported|local)$/;

const getDependencies = astNode =>
  nodesWhere(
    (val, path) =>
      val &&
      val.type === 'Identifier' &&
      !EXCLUDED_PATH_ENDINGS.test(path.join(',')),
    astNode
  )
    .map(o => o.name)
    .filter((val, i, arr) => arr.indexOf(val) === i)
    .sort();

export const GetDeps = origCode => {
  const result = transform(origCode, {
    babelrc: false,
    plugins: ['transform-react-jsx', 'transform-object-rest-spread'],
    code: false
  });

  return result.ast.program.body.map(astNode => ({
    code: origCode.slice(astNode.start, astNode.end),
    dependencies: getDependencies(astNode),
    astNode
  }));
};
