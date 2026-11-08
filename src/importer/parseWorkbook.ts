import type { DateFieldDraft, DateValue, ImportEntryDraft, ImportPersonDraft } from '../domain/model';

export interface WorkbookParseResult {
  entries: ImportEntryDraft[];
  sheetCount: number;
  sourceRowCount: number;
}

export type WorkbookParseFailure =
  | 'unsupported-format'
  | 'unreadable-workbook'
  | 'unexpected-columns'
  | 'unrecognized-header'
  | 'no-person-rows';

export class WorkbookParseError extends Error {
  constructor(readonly code: WorkbookParseFailure) {
    super(code);
    this.name = 'WorkbookParseError';
  }
}

type WorkerReply =
  | { ok: true; result: WorkbookParseResult }
  | { ok: false; code: WorkbookParseFailure };

export function parseWorkbookFile(file: File): Promise<WorkbookParseResult> {
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    return Promise.reject(new WorkbookParseError('unsupported-format'));
  }
  if (file.size > 25 * 1024 * 1024) {
    return Promise.reject(new WorkbookParseError('unsupported-format'));
  }

  return file.arrayBuffer().then(
    (buffer) =>
      new Promise<WorkbookParseResult>((resolve, reject) => {
        const worker = new Worker(new URL('./parseWorkbook.worker.ts', import.meta.url), {
          type: 'module',
        });

        worker.addEventListener('message', (event: MessageEvent<WorkerReply>) => {
          worker.terminate();
          if (event.data.ok) {
            resolve(event.data.result);
          } else {
            reject(new WorkbookParseError(event.data.code));
          }
        });
        worker.addEventListener('error', () => {
          worker.terminate();
          reject(new WorkbookParseError('unreadable-workbook'));
        });
        worker.postMessage(buffer, [buffer]);
      }),
    () => Promise.reject(new WorkbookParseError('unreadable-workbook')),
  );
}

export function normalizeDateInput(input: string): DateValue | null {
  const value = input.trim();
  if (!value) return null;

  const yearMatch = /^(\d{4})$/.exec(value);
  if (yearMatch) return { value: yearMatch[1]!, precision: 'year' };

  const numericMonthMatch = /^(\d{1,2})\.(\d{4})$/.exec(value);
  if (numericMonthMatch) {
    const month = Number(numericMonthMatch[1]);
    if (month >= 1 && month <= 12) {
      return { value: `${numericMonthMatch[2]}-${month.toString().padStart(2, '0')}`, precision: 'month' };
    }
    return null;
  }

  const namedMonthMatch = /^([\p{L}]+)\s+(\d{4})$/u.exec(value);
  if (namedMonthMatch) {
    const monthNames = ['januar', 'februar', 'märz', 'maerz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
    const month = monthNames.indexOf(namedMonthMatch[1]!.toLocaleLowerCase('de-DE'));
    if (month >= 0) return { value: `${namedMonthMatch[2]}-${(month + 1).toString().padStart(2, '0')}`, precision: 'month' };
  }

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (isoMatch && isValidDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]))) {
    return { value, precision: 'day' };
  }

  const localMatch = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value);
  if (!localMatch) return null;

  const day = Number(localMatch[1]);
  const month = Number(localMatch[2]);
  const year = Number(localMatch[3]);
  if (!isValidDate(year, month, day)) return null;

  return {
    value: `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day
      .toString()
      .padStart(2, '0')}`,
    precision: 'day',
  };
}

export function dateInputValue(date: DateFieldDraft | null): string {
  if (!date) return '';
  if (date.precision === 'unparsed') return date.value;
  if (date.precision === 'year') return date.value;
  if (date.precision === 'month') {
    const match = /^(\d{4})-(\d{2})$/.exec(date.value);
    return match ? `${match[2]}.${match[1]}` : date.value;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : date.value;
}

export function getDraftValidation(entries: ImportEntryDraft[]): {
  errors: Array<{ sourceRow: number; message: string }>;
  warnings: Array<{ sourceRow: number; message: string }>;
} {
  const errors: Array<{ sourceRow: number; message: string }> = [];
  const warnings: Array<{ sourceRow: number; message: string }> = [];
  const entryByRow = new Map(entries.map((entry) => [entry.sourceRow, entry]));

  for (const entry of entries) {
    if (!entry.generationValid) {
      errors.push({
        sourceRow: entry.sourceRow,
        message: 'Die Zeile muss genau eine Generationenspalte enthalten.',
      });
    }
    if (!entry.person.name.trim()) {
      errors.push({ sourceRow: entry.sourceRow, message: 'Der Name der Person fehlt.' });
    }
    const dateValues = [
      entry.person.birthDate,
      entry.person.deathDate,
      entry.marriageDate,
      entry.spouse?.birthDate ?? null,
      entry.spouse?.deathDate ?? null,
    ];
    if (dateValues.some((date) => date?.precision === 'unparsed')) {
      errors.push({ sourceRow: entry.sourceRow, message: 'Ein Datumsfeld ist ungültig.' });
    }
    if (entry.generation > 1) {
      const parent = entry.parentSourceRow ? entryByRow.get(entry.parentSourceRow) : undefined;
      if (!parent || parent.generation !== entry.generation - 1) {
        errors.push({
          sourceRow: entry.sourceRow,
          message: 'Der vorherige Eintrag der Elterngeneration fehlt.',
        });
      }
    }
    if (entry.marriageStatus === 'married' && !entry.spouse?.name.trim()) {
      errors.push({
        sourceRow: entry.sourceRow,
        message: 'Eheschließung markiert, aber der Ehepartnername fehlt.',
      });
    }
    if (entry.spouse && entry.marriageStatus !== 'married') {
      warnings.push({
        sourceRow: entry.sourceRow,
        message: 'Ehepartner vorhanden, Eheschließungsstatus bleibt unbekannt.',
      });
    }
    if (entry.warnings.length) {
      for (const message of entry.warnings) warnings.push({ sourceRow: entry.sourceRow, message });
    }
  }

  return { errors, warnings };
}

export function buildImportSummary(entries: ImportEntryDraft[]) {
  const partnerEntries = entries.filter((entry) => entry.spouse?.name.trim());
  const entryBySourceRow = new Map(entries.map((entry) => [entry.sourceRow, entry]));
  const personCount = entries.length + partnerEntries.length;
  const partnershipCount = partnerEntries.length;
  const parentChildLinkCount = entries.reduce((total, entry) => {
    if (entry.parentSourceRow === null) return total;
    const parent = entryBySourceRow.get(entry.parentSourceRow);
    return total + 1 + Number(Boolean(
      parent?.spouse?.name.trim() && entry.parentAssignment === 'primary-and-partner',
    ));
  }, 0);
  return { personCount, partnershipCount, parentChildLinkCount };
}

export function parsePersonCell(value: string): {
  person: ImportPersonDraft;
  hasAmbiguousDateText: boolean;
} {
  const raw = value.trim();
  const pair = /^(.*?)\s+(\d{1,2}\.\d{1,2}\.\d{4})\s*-\s*(\d{1,2}\.\d{1,2}\.\d{4})\s*$/.exec(raw);
  if (pair) {
    const birthDate = normalizeDateInput(pair[2]!);
    const deathDate = normalizeDateInput(pair[3]!);
    if (birthDate && deathDate && pair[1]!.trim()) {
      return {
        person: {
          name: pair[1]!.trim(),
          familyName: null,
          birthDate,
          deathDate,
        },
        hasAmbiguousDateText: false,
      };
    }
  }

  const dateTokens = raw.match(/\d{1,2}\.\d{1,2}\.\d{4}/g) ?? [];
  return {
    person: {
      name: raw,
      familyName: null,
      birthDate: null,
      deathDate: null,
    },
    hasAmbiguousDateText: dateTokens.length > 0 || /geburtsdatum|todesdatum/i.test(raw),
  };
}

export function editableDateInput(value: string): DateFieldDraft | null {
  if (!value.trim()) return null;
  return normalizeDateInput(value) ?? { value, precision: 'unparsed' };
}

function isValidDate(year: number, month: number, day: number): boolean {
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
