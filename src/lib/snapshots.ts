import fs from 'node:fs/promises';
import path from 'node:path';

export async function readSnapshot<State>(snapshotFile: string): Promise<State | null> {
  try {
    return JSON.parse(await fs.readFile(snapshotFile, 'utf8')) as State;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

export async function writeSnapshot<State>(
  snapshotFile: string,
  state: State,
): Promise<void> {
  await fs.mkdir(path.dirname(snapshotFile), { recursive: true });
  await fs.writeFile(snapshotFile, JSON.stringify(state, null, 2), 'utf8');
}
