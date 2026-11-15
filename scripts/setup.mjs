import { execFileSync, spawnSync } from 'node:child_process';
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const hosts = {
  'claude-code': { cli: 'claude', verb: 'install', plugin: 'methodical@methodical', file: 'CLAUDE.md' },
  codex: { cli: 'codex', verb: 'add', plugin: 'methodical@methodical-codex', file: 'AGENTS.md' },
};
const heading = '## Methodical coordinator';
const instructions = `${heading}

When the native Methodical plugin is active and the user has approved substantial work, act as the coordinator. Give named workers the approved implementation and material review fixes. Launch all ready workers whose scopes and dependencies allow parallel work, then refill available slots as tasks finish.

Check worker progress. When one stalls, verify that it resumes or safely reassign it while independent work continues. Integrate only verified patches and run Methodical’s review gates. The user approves the plan and decides what merges.`;

function withExistingFile(file, flags, action) {
  const stats = lstatSync(file, { throwIfNoEntry: false });
  if (!stats) return undefined;
  if (!stats.isFile() || stats.nlink !== 1) throw new Error(`Expected a regular project file at ${file}.`);
  const fd = openSync(file, flags | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const opened = fstatSync(fd);
    if (opened.dev !== stats.dev || opened.ino !== stats.ino || opened.nlink !== 1) {
      throw new Error(`${file} changed during setup. Run setup again.`);
    }
    return action(fd);
  } finally {
    closeSync(fd);
  }
}

async function offerInstructions(file) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return;
  const previous = withExistingFile(file, constants.O_RDONLY, fd => readFileSync(fd));
  if (previous?.toString('utf8').split(/\r?\n/).includes(heading)) {
    console.log(`Methodical coordinator instructions already exist in ${file}.`);
    return;
  }

  console.log(`\nMethodical can ${previous ? 'append to' : 'create'} ${file} with this section:\n\n${instructions}\n`);
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question('Add these instructions? [y/N] ').finally(() => prompt.close());
  if (!/^y(?:es)?$/i.test(answer.trim())) return;

  if (!previous) {
    writeFileSync(file, instructions + '\n', { flag: 'wx' });
  } else {
    const written = withExistingFile(file, constants.O_RDWR | constants.O_APPEND, fd => {
      if (!readFileSync(fd).equals(previous)) return false;
      const text = previous.toString('utf8');
      const newline = text.includes('\r\n') ? '\r\n' : '\n';
      const gap = !text || text.endsWith(newline.repeat(2)) ? '' :
        text.endsWith(newline) ? newline : newline.repeat(2);
      writeFileSync(fd, gap + instructions.replaceAll('\n', newline) + newline);
      return true;
    });
    if (!written) throw new Error(`${file} changed while you were deciding. Run setup again.`);
  }
  console.log(`Added coordinator instructions to ${file}. Start a fresh session in this project.`);
}

async function main() {
  const [host, option, ...extra] = process.argv.slice(2);
  if (!Object.hasOwn(hosts, host) || (option && option !== '--instructions-only') || extra.length) {
    throw new Error('Usage: node /path/to/methodical/scripts/setup.mjs <claude-code|codex> [--instructions-only]');
  }
  const { cli, verb, plugin, file } = hosts[host];
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trimEnd();
  if (!option) {
    const checkout = fileURLToPath(new URL('..', import.meta.url));
    for (const args of [['plugin', 'marketplace', 'add', '.'], ['plugin', verb, plugin]]) {
      const result = spawnSync(cli, args, { cwd: checkout, stdio: 'inherit' });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(`${cli} ${args.join(' ')} failed. Project instructions were skipped.`);
    }
  }
  await offerInstructions(join(root, file));
}

try {
  await main();
} catch (error) {
  console.error(`Methodical setup: ${error.message}`);
  process.exitCode = 1;
}
