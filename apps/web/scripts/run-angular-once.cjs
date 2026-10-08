const { createRequire } = require('node:module');
const path = require('node:path');

const fromWorkspace = createRequire(path.resolve(__dirname, '../../../package.json'));

async function main() {
  try {
    const cli = fromWorkspace('@angular/cli').default;
    process.exitCode = (await cli({ cliArgs: process.argv.slice(2) })) ?? 0;
  } finally {
    fromWorkspace('esbuild').stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
