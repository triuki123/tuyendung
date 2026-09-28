import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';

// Execute actual project TypeScript, with optional boundary mocks, in memory.
export function cvTestLoader(mocks = {}) {
  const cache = new Map();
  return function load(file) {
    const absolute = path.resolve(file);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const module = { exports: {} }; cache.set(absolute, module);
    const source = ts.transpileModule(readFileSync(absolute, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText;
    const nodeRequire = createRequire(absolute);
    const require = name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.startsWith('@/')) return load(path.join('src', `${name.slice(2)}.ts`));
      if (name.startsWith('.') && !path.extname(name)) return load(path.resolve(path.dirname(absolute), `${name}.ts`));
      return nodeRequire(name);
    };
    new Function('module', 'exports', 'require', source)(module, module.exports, require);
    return module.exports;
  };
}
