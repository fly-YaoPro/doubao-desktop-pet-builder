import { mkdir, open, readFile, rename, stat } from 'node:fs/promises';
import path from 'node:path';

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(file, 'utf8')) as T; }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return fallback;
    throw error;
  }
}

export async function atomicWriteJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  const handle = await open(temp, 'wx');
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temp, file);
}

export async function uniqueDestination(directory: string, fileName: string): Promise<string> {
  const parsed = path.parse(path.basename(fileName));
  for (let index = 0; index < 10000; index += 1) {
    const suffix = index === 0 ? '' : ` (${index})`;
    const candidate = path.join(directory, `${parsed.name}${suffix}${parsed.ext}`);
    try { await stat(candidate); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return candidate;
      throw error;
    }
  }
  throw new Error('Unable to allocate a unique file name');
}
