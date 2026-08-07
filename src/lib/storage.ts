import { put } from '@vercel/blob';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { importFiles } from '@/lib/db/schema';

export interface StoredFile {
  ref: string;
  url?: string;
  size: number;
}

function sanitizeFileName(fileName: string): string {
  const base = fileName.replace(/[^\w.\-]+/g, '_');
  return base.length > 120 ? base.slice(-120) : base;
}

export async function saveUpload(buffer: Buffer, originalName: string): Promise<StoredFile> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const name = sanitizeFileName(originalName);

  if (token) {
    const blob = await put(`imports/${Date.now()}-${randomUUID().slice(0, 8)}-${name}`, buffer, {
      access: 'public',
      token,
      addRandomSuffix: false,
    });
    return { ref: blob.url, url: blob.url, size: buffer.length };
  }

  if (process.env.FILE_STORAGE === 'db') {
    const [row] = await db
      .insert(importFiles)
      .values({ fileName: name, data: buffer, size: buffer.length })
      .returning({ id: importFiles.id });
    return { ref: `db://${row!.id}`, size: buffer.length };
  }

  const dir = path.resolve(process.env.UPLOAD_DIR ?? './data/uploads');
  await mkdir(dir, { recursive: true });
  const ref = path.join(dir, `${Date.now()}-${randomUUID().slice(0, 8)}-${name}`);
  await writeFile(ref, buffer);
  return { ref, size: buffer.length };
}

export async function readUpload(stored: StoredFile | { ref: string }): Promise<Buffer> {
  if (stored.ref.startsWith('db://')) {
    const id = stored.ref.slice('db://'.length);
    const rows = await db
      .select({ data: importFiles.data })
      .from(importFiles)
      .where(eq(importFiles.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) throw new Error(`stored file not found: ${stored.ref}`);
    return Buffer.from(row.data);
  }
  if (stored.ref.startsWith('http://') || stored.ref.startsWith('https://')) {
    const res = await fetch(stored.ref);
    if (!res.ok) {
      throw new Error(`failed to fetch stored file ${stored.ref}: ${res.status}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }
  return readFile(stored.ref);
}

export async function statUpload(stored: StoredFile | { ref: string }): Promise<number> {
  if (stored.ref.startsWith('http://') || stored.ref.startsWith('https://')) {
    return 0;
  }
  try {
    const s = await stat(stored.ref);
    return s.size;
  } catch {
    return 0;
  }
}

export async function deleteUpload(ref: string): Promise<void> {
  if (ref.startsWith('db://')) {
    const id = ref.slice('db://'.length);
    await db.delete(importFiles).where(eq(importFiles.id, id));
    return;
  }
  if (ref.startsWith('http://') || ref.startsWith('https://')) return;
  try {
    await rm(ref, { force: true });
  } catch {
    // best effort
  }
}
