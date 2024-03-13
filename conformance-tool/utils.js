// @ts-check

const fs = require('fs/promises');
const path = require('path');

// These packages crash Flow somehow...
const excludeSet = new Set(['after-all-results', 'oracledb']);

/** @returns {Promise<readonly string[]>} */
async function listAllProjects() {
  const files = await fs.readdir('types');
  const filesAndIsDir = await Promise.all(
    files.map(
      async (file) => fs.stat(path.join('types', file)).then(
        /** @returns {[string, boolean]} */
        (stat) => [file, stat.isDirectory()]
      )
    )
  );
  return filesAndIsDir.filter(([file, isDir]) => isDir && !excludeSet.has(file)).map(([file]) => file);
}

function translatePackageName(/** @type {string} */ originalNameWithDoubleUnderscoreSeparator) {
  const packageParts = originalNameWithDoubleUnderscoreSeparator.split('__');
  if (packageParts.length === 1) {
    // good
    return originalNameWithDoubleUnderscoreSeparator;
  } else if (packageParts.length === 2) {
    // foo__bar -> @foo/bar
    return '@' + packageParts[0] + '/' + packageParts[1];
  } else {
    throw originalNameWithDoubleUnderscoreSeparator;
  }
}

function translatePath(/** @type {string} */ originalFile) {
  if (!originalFile.startsWith('types/')) {
    throw originalFile;
  }
  originalFile = path.relative('types', originalFile);
  let parts = originalFile.split('/');
  const packageName = translatePackageName(parts[0]);
  return path.join('..', 'translated', 'types', packageName, ...parts.slice(1));
}

module.exports = { listAllProjects, translatePackageName, translatePath }
