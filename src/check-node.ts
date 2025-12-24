#!/usr/bin/env node

// Check Node.js version BEFORE importing Stagehand
const nodeVersion = parseInt(process.versions.node.split('.')[0], 10);

if (nodeVersion >= 25) {
  console.error(`Error: Node.js ${process.versions.node} is not compatible with Stagehand.`);
  console.error('\nTo fix, use Node.js 22 LTS:');
  console.error('  brew install node@22');
  console.error('  /opt/homebrew/opt/node@22/bin/node dist/src/cli.js <command>');
  process.exit(1);
}

// Dynamic import to avoid loading Stagehand before version check
import('./cli.js').catch((err) => {
  console.error('Failed to load CLI:', err.message);
  process.exit(1);
});
