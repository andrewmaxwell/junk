import {transform} from '@babel/core';
import {nodesWhere, deepWithout, logJSON} from './utils.js';
import fs from 'fs';
import Path from 'path';

const EXCLUDED_PATH_ENDINGS = /(params,\d+|property|id|key|imported|local)$/;
const LOCAL_DECLARATION_PATH_ENDINGS = new RegExp(
  `
  (
    (
      (declarations,\\d+,id)
      (
        (,properties,\\d+,value)
        |
        (,elements,\\d+)
      )*
      (,argument)?
    ) | (
      (params,\\d+)
      (
        (,argument)
        |
        ((,left)?,properties,\\d+,value)+
        |
        (,elements,\\d+(,argument)?)
      )?
    ) | (handler,param)
  )
  (,left)?
  ,name$`.replace(/\s/g, '')
);
const DECLARATION_PATH = /^(declaration,)?declarations,\d+,id,(properties,\d+,value,(left,)?)?name$/;
const IMPORT_PATH = /source,value$/;
const builtIns = [
  'Array',
  'Boolean',
  'Date',
  'Error',
  'File',
  'FileReader',
  'FormData',
  'Function',
  'Infinity',
  'JSON',
  'Math',
  'NaN',
  'Number',
  'Object',
  'Promise',
  'RegExp',
  'Response',
  'Set',
  'String',
  'Symbol',
  '_extends',
  'arguments',
  'clearInterval',
  'clearTimeout',
  'console',
  'document',
  'encodeURIComponent',
  'decodeURIComponent',
  'fetch',
  'isNaN',
  'module',
  'parseFloat',
  'parseInt',
  'require',
  'setInterval',
  'setTimeout',
  'undefined',
  'window',
  'process',
  'escape',
].reduce((res, el) => ({...res, [el]: true}), {});

const isDeclaredIn = (name, astNode) =>
  nodesWhere(
    (val, path) =>
      val === name && LOCAL_DECLARATION_PATH_ENDINGS.test(path.join(',')),
    astNode
  ).length > 0;

const getBlockDeps = (astNode) =>
  [
    ...nodesWhere(
      (val, path) =>
        val &&
        val.type === 'Identifier' &&
        !EXCLUDED_PATH_ENDINGS.test(path.join(',')),
      astNode
    ).map((o) => o.name),
    ...nodesWhere((val) => val && val.computed && val.property, astNode).map(
      (o) => o.property.name
    ),
  ]
    .filter(
      (val, i, arr) =>
        !builtIns[val] && arr.indexOf(val) === i && !isDeclaredIn(val, astNode)
    )
    .sort();

const getDeclarations = (astNode) =>
  nodesWhere(
    (val, path) => val && DECLARATION_PATH.test(path.join(',')),
    astNode
  ).sort();

const getImportedFileNames = (astNode) =>
  nodesWhere(
    (val, path) =>
      val && /^\.(.+)\.js$/.test(val) && IMPORT_PATH.test(path.join(',')),
    astNode
  );

const normalize = (from, to) => Path.normalize(Path.dirname(from) + '/' + to);

const getFiles = (entryPoints) => {
  const queue = entryPoints.map((p) => Path.resolve(p));
  const result = [];

  for (let i = 0; i < queue.length; i++) {
    const fileName = queue[i];

    const code = fs.readFileSync(fileName).toString();
    const ast = transform(code, {
      babelrc: false,
      plugins: [
        '@babel/plugin-transform-react-jsx',
        // 'transform-object-rest-spread',
        // 'transform-class-properties',
      ],
      code: false,
    });
    console.log(ast);
    // .ast.program.body.map((item) =>
    //   deepWithout(['loc'], {...item, code: code.slice(item.start, item.end)})
    // );

    queue.push(
      ...getImportedFileNames(ast)
        .map((p) => normalize(fileName, p))
        .filter((val) => !queue.includes(val))
    );

    result[i] = {fileName, ast};
  }
  return result;
};

const toId = (fileName, imported) => imported + ':' + fileName;

export const GetDeps = (entryPoints) => {
  const deps = getFiles(entryPoints).reduce((res, {fileName, ast}) => {
    const importMapping = {};

    let idCounter = 0;
    ast.forEach((astNode) => {
      const declarations = getDeclarations(astNode);
      if (declarations[0] === '_extends') return;

      declarations.forEach((id) => {
        importMapping[id] = toId(fileName, id);
      });

      const data = {
        code: astNode.code,
        dependencies: getBlockDeps(astNode).map((dep) => {
          if (!importMapping[dep]) {
            logJSON(astNode);
            throw new Error('No mapping found for ' + dep);
          }
          return {id: importMapping[dep], as: dep};
        }),
        dependants: [],
      };

      // logJSON('\n********\n\nastNode', astNode, data.dependencies);

      if (astNode.type === 'ImportDeclaration') {
        const impFileName = astNode.source.value.startsWith('.')
          ? normalize(fileName, astNode.source.value)
          : astNode.source.value;

        astNode.specifiers.forEach((sp) => {
          importMapping[sp.local ? sp.local.name : sp.imported.name] = toId(
            impFileName,
            sp.imported ? sp.imported.name : 'default'
          );
        });
      } else if (!declarations.length) {
        res[
          toId(
            fileName,
            astNode.type === 'ExportDefaultDeclaration'
              ? 'default'
              : 'expr' + idCounter++
          )
        ] = data;
      }

      declarations.forEach((id) => {
        res[toId(fileName, id)] = data;
      });
    });
    return res;
  }, {});

  Object.keys(deps).forEach((id) => {
    deps[id].dependencies.forEach((dep) => {
      if (deps[dep.id]) {
        deps[dep.id].dependants.push(id);
      }
    });
  });

  Object.keys(deps).forEach((id) => {
    if (!deps[id].dependants.length && !id.startsWith('expr')) {
      console.log(id, 'has no dependants!');
    }
  });

  return deps;
};
