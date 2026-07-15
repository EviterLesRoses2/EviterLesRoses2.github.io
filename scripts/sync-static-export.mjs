import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = process.cwd();
const exportDir = resolve(projectRoot, 'out');
const docsDir = resolve(projectRoot, 'docs');

await rm(docsDir, { recursive: true, force: true });
await mkdir(docsDir, { recursive: true });
await cp(exportDir, docsDir, { recursive: true });
