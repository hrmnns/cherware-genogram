import Ajv2020 from 'ajv/dist/2020.js';
import schema from './genogram-archive.schema.json';
import type { GenogramDetail } from '../domain/savedGenogram';
import type { GenogramAppearance } from '../genograms/appearance';

export interface GenogramArchiveV1 {
  format: 'cherware-genogram';
  formatVersion: 1 | 2;
  exportedAt: string;
  genogram: { title: string; createdAt: string; sourceFormat: string };
  people: GenogramDetail['people'];
  partnerships: GenogramDetail['partnerships'];
  parentChildLinks: GenogramDetail['parentChildLinks'];
  appearance?: GenogramAppearance;
}

const validator = new Ajv2020({ allErrors: true, strict: true }).compile<GenogramArchiveV1>(schema);

export function createGenogramArchive(genogram: GenogramDetail): GenogramArchiveV1 {
  return {
    format: 'cherware-genogram',
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    genogram: {
      title: genogram.summary.title,
      createdAt: genogram.summary.createdAt,
      sourceFormat: genogram.summary.sourceFormat,
    },
    people: genogram.people,
    partnerships: genogram.partnerships,
    parentChildLinks: genogram.parentChildLinks,
  };
}

export function parseGenogramArchive(text: string): GenogramArchiveV1 {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new Error('Die Datei enthält kein gültiges JSON.');
  }
  return validateGenogramArchive(value);
}

export function validateGenogramArchive(value: unknown): GenogramArchiveV1 {
  if (!validator(value)) {
    throw new Error('Die Datei entspricht nicht dem Genogramm-Archivformat v1 oder v2.');
  }
  if (!value.genogram.title.trim() || !value.genogram.sourceFormat.trim()
    || !isIsoDateTime(value.exportedAt) || !isIsoDateTime(value.genogram.createdAt)) {
    throw new Error('Das Archiv enthält ungültige Metadaten.');
  }
  const personIds = new Set<string>();
  for (const person of value.people) {
    if (personIds.has(person.id)) throw new Error('Das Archiv enthält doppelte Personen-IDs.');
    personIds.add(person.id);
    if (!person.name.trim()) throw new Error('Ein Personenname im Archiv ist leer.');
    validateDatePair(person.birthDate, person.birthDatePrecision);
    validateDatePair(person.deathDate, person.deathDatePrecision);
  }
  if (value.appearance) {
    for (const id of [...Object.keys(value.appearance.personColors), ...Object.keys(value.appearance.branchColors)]) {
      if (!personIds.has(id)) throw new Error('Gestaltungsdaten verweisen auf eine Person, die im Archiv fehlt.');
    }
  }
  const partnershipIds = new Set<string>();
  const partnershipPairs = new Set<string>();
  for (const partnership of value.partnerships) {
    if (partnershipIds.has(partnership.id)) throw new Error('Das Archiv enthält doppelte Partnerschafts-IDs.');
    partnershipIds.add(partnership.id);
    if (!personIds.has(partnership.personAId) || !personIds.has(partnership.personBId)
      || partnership.personAId === partnership.personBId) {
      throw new Error('Eine Partnerschaft verweist auf ungültige Personen.');
    }
    const pairKey = [partnership.personAId, partnership.personBId].sort().join('\u0000');
    if (partnershipPairs.has(pairKey)) throw new Error('Das Archiv enthält eine doppelte Partnerschaft.');
    partnershipPairs.add(pairKey);
    validateDatePair(partnership.startDate, partnership.startDatePrecision);
  }
  const linkIds = new Set<string>();
  const parentChildPairs = new Set<string>();
  const childrenByParent = new Map<string, string[]>();
  for (const link of value.parentChildLinks) {
    if (linkIds.has(link.id)) throw new Error('Das Archiv enthält doppelte Verbindungs-IDs.');
    linkIds.add(link.id);
    if (!personIds.has(link.parentId) || !personIds.has(link.childId) || link.parentId === link.childId) {
      throw new Error('Eine Eltern-Kind-Verbindung verweist auf ungültige Personen.');
    }
    const pairKey = `${link.parentId}\u0000${link.childId}`;
    if (parentChildPairs.has(pairKey)) throw new Error('Das Archiv enthält eine doppelte Eltern-Kind-Verbindung.');
    parentChildPairs.add(pairKey);
    const children = childrenByParent.get(link.parentId) ?? [];
    children.push(link.childId);
    childrenByParent.set(link.parentId, children);
  }
  assertAcyclicParentage(childrenByParent);
  return {
    ...value,
    people: value.people.map((person) => ({ ...person, gender: person.gender ?? 'unknown' })),
  };
}

export function serializeGenogramArchive(archive: GenogramArchiveV1): string {
  return `${JSON.stringify(archive, null, 2)}\n`;
}

function validateDatePair(value: string | null, precision: 'day' | 'month' | 'year' | null): void {
  if ((value === null) !== (precision === null)) throw new Error('Ein Datum hat eine inkonsistente Genauigkeitsangabe.');
  if (!value) return;
  if (precision === 'year') {
    if (!/^\d{4}$/.test(value)) throw new Error('Ein Jahresdatum im Archivformat ist ungültig.');
    return;
  }
  if (precision === 'month') {
    const match = /^(\d{4})-(\d{2})$/.exec(value);
    if (!match || Number(match[1]) < 1 || Number(match[2]) < 1 || Number(match[2]) > 12) {
      throw new Error('Ein Monat im Archivformat ist ungültig.');
    }
    return;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error('Ein Datum entspricht nicht dem Archivformat.');
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error('Das Archiv enthält ein ungültiges Datum.');
  }
}

function isIsoDateTime(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

function assertAcyclicParentage(childrenByParent: Map<string, string[]>): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(personId: string): void {
    if (visiting.has(personId)) throw new Error('Das Archiv enthält einen Zyklus in der Eltern-Kind-Struktur.');
    if (visited.has(personId)) return;
    visiting.add(personId);
    for (const childId of childrenByParent.get(personId) ?? []) visit(childId);
    visiting.delete(personId);
    visited.add(personId);
  }

  for (const personId of childrenByParent.keys()) visit(personId);
}
