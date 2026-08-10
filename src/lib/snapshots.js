import fs from 'node:fs/promises';
import path from 'node:path';

export async function readSnapshot(snapshotFile) {
  try {
    return JSON.parse(await fs.readFile(snapshotFile, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

export async function writeSnapshot(snapshotFile, state) {
  await fs.mkdir(path.dirname(snapshotFile), { recursive: true });
  await fs.writeFile(snapshotFile, JSON.stringify(state, null, 2), 'utf8');
}
