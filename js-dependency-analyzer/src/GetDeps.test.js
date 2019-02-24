import {GetDeps} from './GetDeps.js';
import {expect} from 'chai';

const data = GetDeps(['./testSrc/main.js']);
// require('fs').writeFileSync('output.json', JSON.stringify(data, null, 2));

/* eslint-disable sonarjs/no-duplicate-string */
describe('GetDeps', () => {
  it('should build a dependency graph of a project', () => {
    expect(data).to.deep.equal({
      'abc:/Users/amaxw/junk/js-dependency-analyzer/testSrc/main.js': {
        code: "export const abc = (...args) => args.join('-');",
        dependencies: [],
        dependants: []
      },
      'res:/Users/amaxw/junk/js-dependency-analyzer/testSrc/main.js': {
        code:
          "const res = getDeps(fs.readFileSync('../ui/src/client/index.js').toString());",
        dependencies: [
          {
            id: 'default:fs',
            as: 'fs'
          },
          {
            id:
              'GetDeps:/Users/amaxw/junk/js-dependency-analyzer/testSrc/GetDeps.js',
            as: 'getDeps'
          }
        ],
        dependants: [
          'expr0:/Users/amaxw/junk/js-dependency-analyzer/testSrc/main.js'
        ]
      },
      'expr0:/Users/amaxw/junk/js-dependency-analyzer/testSrc/main.js': {
        code: "fs.writeFileSync('output.json', JSON.stringify(res, null, 2));",
        dependencies: [
          {
            id: 'default:fs',
            as: 'fs'
          },
          {
            id: 'res:/Users/amaxw/junk/js-dependency-analyzer/testSrc/main.js',
            as: 'res'
          }
        ],
        dependants: []
      },
      'EXCLUDED_PATH_ENDINGS:/Users/amaxw/junk/js-dependency-analyzer/testSrc/GetDeps.js': {
        code:
          'const EXCLUDED_PATH_ENDINGS = /(params,\\d+|property|id|key|imported|local)$/;',
        dependencies: [],
        dependants: [
          'getDependencies:/Users/amaxw/junk/js-dependency-analyzer/testSrc/GetDeps.js'
        ]
      },
      'getDependencies:/Users/amaxw/junk/js-dependency-analyzer/testSrc/GetDeps.js': {
        code:
          "const getDependencies = astNode =>\n  nodesWhere(\n    (val, path) =>\n      val &&\n      val.type === 'Identifier' &&\n      !EXCLUDED_PATH_ENDINGS.test(path.join(',')),\n    astNode\n  )\n    .map(o => o.name)\n    .filter((val, i, arr) => arr.indexOf(val) === i)\n    .sort();",
        dependencies: [
          {
            id:
              'EXCLUDED_PATH_ENDINGS:/Users/amaxw/junk/js-dependency-analyzer/testSrc/GetDeps.js',
            as: 'EXCLUDED_PATH_ENDINGS'
          },
          {
            id:
              'default:/Users/amaxw/junk/js-dependency-analyzer/testSrc/nodesWhere.js',
            as: 'nodesWhere'
          }
        ],
        dependants: [
          'GetDeps:/Users/amaxw/junk/js-dependency-analyzer/testSrc/GetDeps.js'
        ]
      },
      'GetDeps:/Users/amaxw/junk/js-dependency-analyzer/testSrc/GetDeps.js': {
        code:
          "export const GetDeps = origCode => {\n  const result = transform(origCode, {\n    babelrc: false,\n    plugins: ['transform-react-jsx', 'transform-object-rest-spread'],\n    code: false\n  });\n\n  return result.ast.program.body.map(astNode => ({\n    code: origCode.slice(astNode.start, astNode.end),\n    dependencies: getDependencies(astNode),\n    astNode\n  }));\n};",
        dependencies: [
          {
            id:
              'getDependencies:/Users/amaxw/junk/js-dependency-analyzer/testSrc/GetDeps.js',
            as: 'getDependencies'
          },
          {
            id: 'transform:babel-core',
            as: 'transform'
          }
        ],
        dependants: [
          'res:/Users/amaxw/junk/js-dependency-analyzer/testSrc/main.js'
        ]
      },
      'nodesWhere:/Users/amaxw/junk/js-dependency-analyzer/testSrc/nodesWhere.js': {
        code:
          "export const nodesWhere = (cond, node, path = []) =>\n  Object.keys(node && typeof node === 'object' ? node : []).reduce(\n    (res, key) => res.concat(nodesWhere(cond, node[key], path.concat(key))),\n    cond(node, path) ? [node] : []\n  );",
        dependencies: [],
        dependants: [
          'default:/Users/amaxw/junk/js-dependency-analyzer/testSrc/nodesWhere.js'
        ]
      },
      'default:/Users/amaxw/junk/js-dependency-analyzer/testSrc/nodesWhere.js': {
        code: 'export default nodesWhere;',
        dependencies: [
          {
            id:
              'nodesWhere:/Users/amaxw/junk/js-dependency-analyzer/testSrc/nodesWhere.js',
            as: 'nodesWhere'
          }
        ],
        dependants: [
          'getDependencies:/Users/amaxw/junk/js-dependency-analyzer/testSrc/GetDeps.js'
        ]
      }
    });
  });
});
