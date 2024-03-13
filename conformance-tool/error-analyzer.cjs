// @ts-check

const fs = require('fs');
const readline = require('readline');
const events = require('events');

/** @type {Array<string>} */
const lines = [];
const mode = 'Error';

/** @type {Map<string, number>} */
const fileMap = new Map();

const rl = readline.createInterface({
  input: fs.createReadStream(process.argv[2]),
});
rl.on('line', line => {
  lines.push(line.trim());
});

events.once(rl, 'close').then(() => {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    /* Parse the error file line, which supports two formats:
     *
     * 1. When the filename is short:
     * Error ----- foo/bar/baz.js
     *
     * 2. When the filename is long:
     * Error --------------------
     * foo/bar/bazzzzzzzzzzzzz.js
     */
    if (line.startsWith(mode + ' -')) {
      /** @type {string} */
      let filenameWithPos;
      if (line.endsWith('--')) {
        // filename on the next line
        const nextLine = lines[i + 1];
        if (nextLine == null) break;
        filenameWithPos = nextLine.trim();
      } else {
        const segments = line.split(' ');
        filenameWithPos = segments[segments.length - 1].trim();
      }
      const filename = filenameWithPos.split(':')[0].trim();
      fileMap.set(filename, (fileMap.get(filename) || 0) + 1);
    }
  }

  function printStat(
    /** @type {Map<string, number>} */ map,
    /** @type {number | undefined} */ top
  ) {
    let sorted = Array.from(map.entries()).sort(([, c1], [, c2]) => c1 - c2);
    if (top != null) {
      sorted = sorted.slice(sorted.length - top);
    }
    sorted.forEach(([filename, count]) => console.log(`${filename}: ${count}`));
    console.log(
      `Total ${mode} Count:`,
      sorted.map(([, count]) => count).reduce((a, b) => a + b, 0),
    );
  }

  /** @type {Map<string, number>} */
  const dirMap = new Map();
  for (const [filename, count] of fileMap) {
    const parts = filename.split('/');
    const dirname = parts[1]?.startsWith('@')
      ? parts.slice(0, 3).join('/')
      : parts.slice(0, 2).join('/')
    dirMap.set(dirname, (dirMap.get(dirname) || 0) + count);
  }
  printStat(dirMap);
});
