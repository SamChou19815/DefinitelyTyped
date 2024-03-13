// @ts-check

const translator = require('flow-api-translator');
const fs = require('fs/promises');
const path = require('path');
const { listAllProjects, translatePackageName, translatePath } = require('./utils');

async function writeTo(/** @type {string} */ originalFile, /** @type {string} */ content) {
  const newFile = translatePath(originalFile);
  await fs.mkdir(path.dirname(newFile), {recursive: true});
  await fs.writeFile(newFile, content);
}

function sourceCodeLightTransform(/** @type {string} */ sourceCode) {
  sourceCode = sourceCode.replaceAll(/import(?= ([_A-Za-z0-9]+ = require\())/g, 'const');
  sourceCode = sourceCode.replaceAll(/@ts-ignore/g, '$FlowFixMe');
  sourceCode = sourceCode.replaceAll(/@ts-expect-error/g, '$FlowFixMe');
  return sourceCode;
}

async function runOnProjectFiles(
  /** @type {string} */ projectName,
  /** @type {Set<string>} */ externalDeps,
) {
  let success = 0;
  let failure = 0;
  let failed = false;
  /** @type {{[k: string]: string}} */
  const translatedFiles = {};

  const onPackageJson = async (/** @type {string} */ file) => {
    const packageJson = JSON.parse(await fs.readFile(file, 'utf8'));
    /** @type {{[k: string]: string}} */
    const allDependencies = {...packageJson.dependencies, ...packageJson.devDependencies};
    const toDelete = [];
    // For now, we are not going to stress test how Flow handles workspaces yet. We are just going
    // to do some trick to make all @types package available everywhere, and only install additional
    // dependencies as needed. (probably not going to work for now)
    for (const k of Object.keys(allDependencies)) {
      if (k.startsWith("@types/")) {
        toDelete.push(k);
      }
    }
    for (const k of toDelete) {
      delete allDependencies[k];
    }
    Object.keys(allDependencies).forEach(k => externalDeps.add(k));
    const content = JSON.stringify(
      { name: packageJson.name, dependencies: allDependencies },
      undefined,
      2,
    ) + '\n';
    translatedFiles[file] = content;
  };
  const onTS = async (/** @type {string} */ file) => {
    const sourceCode = await fs.readFile(file, 'utf8');
    try {
      if (path.basename(file).includes('test')) {
        // test code usually contains expression, which is not handled by the translator.
        // we feed them directly to flow with some light transform, and hope for the best
        translatedFiles[file] = sourceCodeLightTransform(sourceCode);
        success++;
      } else {
        const code = await translator.unstable_translateTSDefToFlowDef(
          sourceCode,
        );
        translatedFiles[file] = code;
        if (!(code.includes('export ') || code.includes('import ') || code.includes('module.exports'))) {
          // A file without export and import is considered to be a script.
          // A .d.ts script will be interpreted by TS as a global libdef
          // throw 'global declaration'
        }
        success++;
      }
    } catch (e) {
      console.error(`Failed to translate ${file}`, e);
      translatedFiles[file] = sourceCodeLightTransform(sourceCode);
      failure++;
      failed = true;
    }
  };

  async function walk(/** @type {string} */ dir) {
    const entries = await fs.readdir(dir);
    await Promise.all(entries.map(async (entry) => {
      const file = path.join(dir, entry);
      if ((await fs.stat(file)).isDirectory()) {
        if (file.includes('node_modules')) {
          return;
        }
        await walk(file);
      } else {
        if (file.endsWith('ts') || file.endsWith('tsx')) {
          await onTS(file);
        }
      }
    }));
  }
  await walk(path.join('types', projectName));
  const packageJsonFile = path.join('types', projectName, 'package.json');
  if (!failed) {
    try {
      await fs.access(packageJsonFile);
      await onPackageJson(packageJsonFile);
    } catch {}
  }
  console.log(
    '%s: S: %d, F: %d',
    projectName,
    success,
    failure,
  );
  if (!failed) {
    await Promise.all(
      Object.entries(translatedFiles).map(([file, code]) => writeTo(file, code))
    );
  }
  return !failed;
}

(async () => {
  const projects = await listAllProjects();
  /** @type {Set<string>} */
  const externalDeps = new Set();
  let withoutFailure = 0;
  let withFailure = 0;
  let moduleMappings = '';
  for (const project of projects) {
    if (await runOnProjectFiles(project, externalDeps)) {
      withoutFailure++;
    } else {
      withFailure++;
    }
    const name = translatePackageName(project);
    moduleMappings += `module.name_mapper='^${name.replaceAll('/', '\\/')}$' -> '<PROJECT_ROOT>/types/${name}'\n`;
    moduleMappings += `module.name_mapper='^${name.replaceAll('/', '\\/')}\\/\\(.*\\)$' -> '<PROJECT_ROOT>/types/${name}/\\1'\n`;
    // Generate mapping similar to:
    // module.name_mapper='^react-native\(.*\)$' -> '<PROJECT_ROOT>/packages/react-native\1'
  }
  await fs.writeFile(
    path.join('..', 'translated', 'external-deps.js'),
    Array.from(externalDeps, k => `declare module '${k}' { declare module.exports: any }\n`).join('\n'),
  );
  await fs.writeFile(path.join('..', 'translated', '.flowconfig'), `[options]
all=true
casting_syntax=both
experimental.ts_syntax=true
experimental.namespaces=true
module.file_ext=.d.ts
module.file_ext=.ts
module.file_ext=.tsx
module.file_ext=.js

${moduleMappings}

[libs]
external-deps.js
`);
  console.log('translate without failure', withoutFailure);
  console.log('translate with failure', withFailure);
})()
