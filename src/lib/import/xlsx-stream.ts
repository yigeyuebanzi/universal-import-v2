import { createReadStream } from 'node:fs';
import { SaxesParser } from 'saxes';
import unzipper from 'unzipper';

export interface XlsxSheetInfo {
  index: number;
  name: string;
  path: string;
  rId: string;
}

export type RowCallback = (row: (string | number | null)[], rowNumber: number) => boolean | void;

function tagName(node: unknown): string {
  return String((node as { name?: unknown }).name ?? '');
}

function colIndexFromRef(ref: string): number {
  const letters = ref.replace(/\d+$/, '').toUpperCase();
  let col = 0;
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 64);
  }
  return col - 1;
}

/**
 * Iterates the xlsx zip stream and hands the matching entry to `consume`.
 * unzipper only starts flowing when its async iterator is consumed, so the
 * target entry is fully processed inside the same loop before we stop.
 */
async function withZipEntry(
  ref: string,
  entryPath: string,
  consume: (entry: unzipper.Entry) => Promise<void>
): Promise<void> {
  const input = createReadStream(ref);
  const zip = unzipper.Parse({ forceStream: true });
  input.pipe(zip);

  let settled = false;
  await new Promise<void>((resolve, reject) => {
    const fail = (err: Error) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    };
    zip.on('error', fail);

    (async () => {
      try {
        for await (const entry of zip) {
          if (entry.path === entryPath) {
            await consume(entry);
            settled = true;
            resolve();
            return;
          }
          entry.autodrain();
        }
        fail(new Error(`xlsx entry not found: ${entryPath}`));
      } catch (err) {
        fail(err instanceof Error ? err : new Error(String(err)));
      } finally {
        input.destroy();
      }
    })();
  });
}

async function readEntry(ref: string, entryPath: string): Promise<string> {
  let result = '';
  await withZipEntry(ref, entryPath, async (entry) => {
    const chunks: Buffer[] = [];
    for await (const chunk of entry as AsyncIterable<Buffer>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    result = Buffer.concat(chunks).toString('utf8');
  });
  return result;
}

export async function getXlsxSheets(ref: string): Promise<XlsxSheetInfo[]> {
  const workbookXml = await readEntry(ref, 'xl/workbook.xml');
  const relsXml = await readEntry(ref, 'xl/_rels/workbook.xml.rels');

  const sheets: XlsxSheetInfo[] = [];
  const relMap = new Map<string, string>();
  const relRe = /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = relRe.exec(relsXml)) !== null) {
    relMap.set(m[1], m[2]);
  }

  const sheetRe = /<sheet[^>]*sheetId="(\d+)"[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g;
  let index = 0;
  while ((m = sheetRe.exec(workbookXml)) !== null) {
    const target = relMap.get(m[3]) ?? '';
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    sheets.push({ index, name: m[2], path, rId: m[3] });
    index++;
  }
  return sheets;
}

export async function loadSharedStrings(ref: string): Promise<string[]> {
  const strings: string[] = [];
  try {
    await withZipEntry(ref, 'xl/sharedStrings.xml', async (entry) => {
      const parser = new SaxesParser();
      let current: string[] | null = null;
      let inText = false;
      let buf = '';

      parser.on('opentag', (node) => {
        const name = tagName(node);
        if (name === 'si') {
          current = [];
        } else if (name === 't') {
          inText = true;
          buf = '';
        }
      });
      parser.on('text', (text) => {
        if (inText) buf += text;
      });
      parser.on('closetag', (tag) => {
        const name = tagName(tag);
        if (name === 't') {
          if (current) current.push(buf);
          inText = false;
        } else if (name === 'si') {
          strings.push((current ?? []).join(''));
          current = null;
        }
      });

      for await (const chunk of entry as AsyncIterable<Buffer>) {
        parser.write(chunk);
      }
      parser.close();
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes('entry not found')) {
      return [];
    }
    throw err;
  }
  return strings;
}

/**
 * Streams a worksheet XML file row by row. `onRow` may return true to stop
 * early. Cell values are resolved through shared strings when present.
 */
export async function streamSheetRows(
  ref: string,
  sheetPath: string,
  onRow: RowCallback,
  sharedStrings: string[] = []
): Promise<void> {
  await withZipEntry(ref, sheetPath, async (entry) => {
    const parser = new SaxesParser();

    let currentRow: (string | number | null)[] | null = null;
    let currentRowNumber = 0;
    let lastRowNumber = 0;
    let cellRef = '';
    let cellType = '';
    let captureValue = false;
    let valueBuf = '';
    let stopped = false;

    parser.on('opentag', (node) => {
      const name = tagName(node);
      if (name === 'row') {
        const attrR = (node.attributes as Record<string, string>).r;
        lastRowNumber = currentRowNumber = attrR ? Number(attrR) : lastRowNumber + 1;
        currentRow = [];
      } else if (name === 'c') {
        const attrs = node.attributes as Record<string, string>;
        cellRef = attrs.r ?? '';
        cellType = attrs.t ?? '';
      } else if (name === 'v' || name === 't') {
        captureValue = true;
        valueBuf = '';
      }
    });

    parser.on('text', (text) => {
      if (captureValue) valueBuf += text;
    });

    parser.on('closetag', (tag) => {
      const name = tagName(tag);
      if (name === 'v' || name === 't') {
        if (currentRow && cellRef) {
          const col = colIndexFromRef(cellRef);
          let value: string | number | null = valueBuf;
          if (cellType === 's' && value !== '') {
            const idx = Number(value);
            value = sharedStrings[idx] ?? '';
          } else if (
            cellType !== 'inlineStr' &&
            cellType !== 'str' &&
            value !== '' &&
            !Number.isNaN(Number(value))
          ) {
            value = Number(value);
          }
          currentRow[col] = value;
        }
        captureValue = false;
        valueBuf = '';
      } else if (name === 'c') {
        cellRef = '';
        cellType = '';
      } else if (name === 'row') {
        if (currentRow) {
          const row = currentRow;
          currentRow = null;
          if (onRow(row, currentRowNumber) === true) {
            stopped = true;
          }
        }
      }
    });

    for await (const chunk of entry as AsyncIterable<Buffer>) {
      parser.write(chunk);
      if (stopped) break;
    }
    // When we stop early (batch boundary), the parser is intentionally left
    // mid-document; calling close() would raise "unclosed tag".
    if (!stopped) parser.close();
  });
}
