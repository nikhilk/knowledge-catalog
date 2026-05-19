import * as path from 'path';
import * as fs from 'fs';
import * as cac from 'cac';
import { KnowledgeBase } from './kb.js';
import { runServer } from './server.js';


async function main() {
  const cli = cac.cac('kbtool').version('1.0.0').help();
  cli.option('--dir <dir>', 'Root directory for the knowledge base');

  const parsed = cli.parse(process.argv);
  if (parsed.options.help || parsed.options.version) {
    return;
  }
  if (!parsed.options.dir) {
    console.error('Error: --dir option is required');
    cli.outputHelp();
    process.exit(1);
  }

  const kbRoot = path.resolve(parsed.options.dir);
  if (!fs.existsSync(kbRoot) || !fs.statSync(kbRoot).isDirectory()) {
    console.error(`Error: Root directory "${kbRoot}" does not exist or is not a directory.`);
    process.exit(1);
  }

  const kb = new KnowledgeBase(kbRoot);
  await runServer(kb);
}

main();
