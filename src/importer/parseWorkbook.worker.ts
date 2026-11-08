/// <reference lib="webworker" />

import { read, utils } from 'xlsx';
import type { DateValue, ImportEntryDraft } from '../domain/model';
import { normalizeDateInput, parsePersonCell } from './parseWorkbook';
import type { WorkbookParseFailure, WorkbookParseResult } from './parseWorkbook';

type WorkerRequest = ArrayBuffer;
type WorkerReply =
  | { ok: true; result: WorkbookParseResult }
  | { ok: false; code: WorkbookParseFailure };

const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  try {
    const result = parseWorkbook(event.data);
    workerScope.postMessage({ ok: true, result } satisfies WorkerReply);
  } catch (error) {
    const code = error instanceof ParseFailure ? error.code : 'unreadable-workbook';
    workerScope.postMessage({ ok: false, code } satisfies WorkerReply);
  }
});

class ParseFailure extends Error {
  constructor(readonly code: WorkbookParseFailure) {
    super(code);
  }
}

function parseWorkbook(buffer: ArrayBuffer): WorkbookParseResult {
  const workbook = read(buffer, { type: 'array', cellDates: true });
  if (workbook.SheetNames.length === 0) throw new ParseFailure('unreadable-workbook');

  const worksheet = workbook.Sheets[workbook.SheetNames[0]!];
  if (!worksheet) throw new ParseFailure('unreadable-workbook');
  const matrix = utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
  });

  const header = matrix[0];
  if (!header || header.length !== 8) throw new ParseFailure('unexpected-columns');
  if (!isExpectedHeader(header)) throw new ParseFailure('unrecognized-header');

  const entries: ImportEntryDraft[] = [];
  const rows = matrix.slice(1);
  const latestAtGeneration = new Map<number, number>();
  let sourceRowCount = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const sourceRow = index + 2;
    const cells = rows[index] ?? [];
    if (!cells.some(isPresent)) continue;
    sourceRowCount += 1;

    const generationColumns = cells
      .slice(0, 5)
      .flatMap((value, columnIndex) => (isPresent(value) ? [columnIndex + 1] : []));
    const warnings: string[] = [];
    if (generationColumns.length !== 1) {
      warnings.push(
        generationColumns.length === 0
          ? 'Es ist keine Generationenspalte befüllt.'
          : 'Mehr als eine Generationenspalte ist befüllt; die Zeile muss geprüft werden.',
      );
    }

    const generation = generationColumns[0] ?? 1;
    const personCell = generationColumns.length === 1 ? cellText(cells[generation - 1]) : '';
    const parsedPerson = parsePersonCell(personCell);
    if (parsedPerson.hasAmbiguousDateText) {
      warnings.push('Datumswerte im Personentext konnten nicht eindeutig aufgeteilt werden.');
    }

    const familyName = cellText(cells[7]);
    const person = { ...parsedPerson.person, familyName: familyName || null };
    const spouseCell = cellText(cells[6]);
    const parsedSpouse = spouseCell ? parsePersonCell(spouseCell) : null;
    if (parsedSpouse?.hasAmbiguousDateText) {
      warnings.push('Datumswerte im Ehepartnertext konnten nicht eindeutig aufgeteilt werden.');
    }

    const marriage = parseMarriageCell(cellText(cells[5]));
    if (marriage.warning) warnings.push(marriage.warning);
    if (marriage.status === 'married' && !parsedSpouse) {
      warnings.push('Eheschließung markiert, aber der Ehepartnername fehlt.');
    }

    let parentSourceRow: number | null = null;
    if (generation === 1) {
      latestAtGeneration.clear();
    } else {
      parentSourceRow = latestAtGeneration.get(generation - 1) ?? null;
      if (parentSourceRow === null) {
        warnings.push('Kein direkt vorheriger Eintrag der Elterngeneration gefunden.');
      }
    }
    for (const existingGeneration of [...latestAtGeneration.keys()]) {
      if (existingGeneration >= generation) latestAtGeneration.delete(existingGeneration);
    }
    latestAtGeneration.set(generation, sourceRow);

    entries.push({
      sourceRow,
      generation,
      generationValid: generationColumns.length === 1,
      parentSourceRow,
      parentAssignment: 'primary-and-partner',
      person,
      spouse: parsedSpouse?.person ?? null,
      marriageStatus: marriage.status,
      marriageDate: marriage.date,
      warnings,
    });
  }

  if (entries.length === 0) throw new ParseFailure('no-person-rows');

  return {
    entries,
    sheetCount: workbook.SheetNames.length,
    sourceRowCount,
  };
}

function isExpectedHeader(header: unknown[]): boolean {
  const normalize = (value: unknown) =>
    typeof value === 'string' ? value.trim().toLocaleLowerCase('de-DE').replace(/\s+/g, ' ') : '';
  const expected = [
    'name generation 1',
    'name generation 2',
    'name generation 3',
    'name generation 4',
    'name generation 5',
    'datum der eheschließung',
    'ehepartner',
    'familienname',
  ];
  return expected.every((name, index) => normalize(header[index]) === name);
}

function isPresent(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function cellText(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    const day = value.getUTCDate().toString().padStart(2, '0');
    const month = (value.getUTCMonth() + 1).toString().padStart(2, '0');
    return `${day}.${month}.${value.getUTCFullYear()}`;
  }
  return value === null || value === undefined ? '' : String(value).trim();
}

function parseMarriageCell(value: string): {
  status: 'married' | 'unknown' | null;
  date: DateValue | null;
  warning?: string;
} {
  if (!value) return { status: null, date: null };

  const match = /^\s*\u221e(?:\s*(\d{4}|\d{1,2}\.\d{1,2}\.\d{4}))?\s*$/.exec(value);
  if (!match) {
    return {
      status: 'unknown',
      date: null,
      warning: 'Eheschließungsangabe ist nicht als ∞ mit optionalem Jahr/Datum erkannt.',
    };
  }

  const date = match[1] ? normalizeDateInput(match[1]) : null;
  if (match[1] && !date) {
    return {
      status: 'married',
      date: null,
      warning: 'Eheschließungsdatum ist ungültig und muss geprüft werden.',
    };
  }
  return { status: 'married', date };
}
