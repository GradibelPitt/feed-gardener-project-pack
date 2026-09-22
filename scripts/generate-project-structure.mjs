import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const checkOnly = process.argv.includes('--check');
const privateDocs = new Set(['docs/instructionGoal.md', 'docs/currentProgress.md']);
const skippedDirectories = new Set([
  '.git',
  '.next',
  '.nyc_output',
  '.vercel',
  '.turbo',
  '.pnpm-store',
  '.cache',
  '.idea',
  'node_modules',
  'out',
  'build',
  'coverage',
  'playwright-report',
  'blob-report',
  'test-results',
]);
const skippedFiles = new Set(['.DS_Store', '.typesafe-api-key', 'next-env.d.ts']);

function isIgnored(relativePath, name, isDirectory) {
  if (privateDocs.has(relativePath)) return true;
  if (isDirectory && skippedDirectories.has(name)) return true;
  if (
    skippedFiles.has(name) ||
    name.endsWith('.tsbuildinfo') ||
    name.endsWith('.log') ||
    name.includes('.log.') ||
    name.endsWith('.pid') ||
    name.endsWith('.swp') ||
    name.endsWith('~')
  ) {
    return true;
  }
  if (name.startsWith('.env') && name !== '.env.example') return true;
  return false;
}

async function entriesFor(relativeDirectory = '') {
  const absoluteDirectory = path.join(root, relativeDirectory);
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  const visible = entries
    .filter((entry) => {
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      return !isIgnored(relativePath, entry.name, entry.isDirectory());
    })
    .sort((left, right) => {
      if (left.isDirectory() !== right.isDirectory()) return left.isDirectory() ? -1 : 1;
      return left.name.localeCompare(right.name, 'en');
    });

  return Promise.all(
    visible.map(async (entry) => {
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      return {
        name: entry.name,
        directory: entry.isDirectory(),
        children: entry.isDirectory() ? await entriesFor(relativePath) : [],
      };
    }),
  );
}

function renderEntries(entries, prefix = '') {
  const lines = [];
  entries.forEach((entry, index) => {
    const last = index === entries.length - 1;
    lines.push(`${prefix}${last ? '└──' : '├──'} ${entry.name}${entry.directory ? '/' : ''}`);
    if (entry.children.length) {
      lines.push(...renderEntries(entry.children, `${prefix}${last ? '    ' : '│   '}`));
    }
  });
  return lines;
}

function replaceReadmeTree(readme, tree) {
  const start = '<!-- PROJECT_STRUCTURE:START -->';
  const end = '<!-- PROJECT_STRUCTURE:END -->';
  const startIndex = readme.indexOf(start);
  const endIndex = readme.indexOf(end);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error('docs/README.md is missing project-structure markers.');
  }
  const generated = `${start}\n\`\`\`text\n${tree}\n\`\`\`\n${end}`;
  return `${readme.slice(0, startIndex)}${generated}${readme.slice(endIndex + end.length)}`;
}

async function writeOrCheck(file, nextContent) {
  let current = '';
  try {
    current = await readFile(file, 'utf8');
  } catch {}
  if (current === nextContent) return;
  if (checkOnly) {
    process.stderr.write(`${path.relative(root, file)} is out of date.\n`);
    process.exitCode = 1;
    return;
  }
  await writeFile(file, nextContent, 'utf8');
}

const tree = [`${path.basename(root)}/`, ...renderEntries(await entriesFor()).map((line) => `    ${line}`)].join(
  '\n',
);
const structurePath = path.join(root, 'docs/project_structure.md');
const structureContent = `# Project Structure\n\n此文件由 \`scripts/generate-project-structure.mjs\` 自动维护，请勿手动编辑目录树。被 Git 忽略的内部文档、依赖和构建产物不会出现在公开树中。\n\n\`\`\`text\n${tree}\n\`\`\`\n`;
const readmePath = path.join(root, 'docs/README.md');
const readme = await readFile(readmePath, 'utf8');

await writeOrCheck(structurePath, structureContent);
await writeOrCheck(readmePath, replaceReadmeTree(readme, tree));

if (!checkOnly && process.exitCode !== 1) {
  process.stdout.write('Updated docs/project_structure.md and docs/README.md.\n');
}
