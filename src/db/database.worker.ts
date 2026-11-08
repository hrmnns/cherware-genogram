/// <reference lib="webworker" />

import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type { ImportEntryDraft, ImportSummary } from '../domain/model';
import type { DateValue } from '../domain/model';
import type { DatabaseRequest, DatabaseWorkerMessage } from './protocol';
import type { GenogramDetail, GenogramSummary } from '../domain/savedGenogram';
import { createGenogramArchive, validateGenogramArchive } from '../backup/archive';

const workerScope = self as DedicatedWorkerGlobalScope;
let database: Awaited<ReturnType<typeof initializeDatabase>> | null = null;

workerScope.addEventListener('message', (event: MessageEvent<DatabaseRequest>) => {
  const request = event.data;
  if (!database) {
    notify({ type: request.type === 'import' ? 'import-failed' : 'query-failed', requestId: request.requestId });
    return;
  }
  try {
    if (request.type === 'import') {
      const summary = importEntries(database, request.entries);
      notify({ type: 'imported', requestId: request.requestId, summary });
    } else if (request.type === 'list-genograms') {
      notify({ type: 'genograms-listed', requestId: request.requestId, genograms: listGenograms(database) });
    } else if (request.type === 'get-genogram') {
      notify({
        type: 'genogram-loaded',
        requestId: request.requestId,
        genogram: getGenogram(database, request.genogramId),
      });
    } else if (request.type === 'rename-genogram') {
      renameGenogram(database, request.genogramId, request.title);
      notify({ type: 'genogram-renamed', requestId: request.requestId });
    } else if (request.type === 'update-family-node') {
      updateFamilyNode(database, request.correction);
      notify({ type: 'family-node-updated', requestId: request.requestId });
    } else if (request.type === 'add-family-member') {
      addFamilyMember(database, request.input);
      notify({ type: 'family-member-added', requestId: request.requestId });
    } else if (request.type === 'create-genogram') {
      const genogramId = createGenogram(database, request.input);
      notify({ type: 'genogram-created', requestId: request.requestId, genogramId });
    } else if (request.type === 'export-genogram') {
      const detail = getGenogram(database, request.genogramId);
      notify({
        type: 'genogram-exported',
        requestId: request.requestId,
        archive: detail ? createGenogramArchive(detail) : null,
      });
    } else if (request.type === 'import-genogram') {
      const archive = validateGenogramArchive(request.archive);
      const genogramId = importGenogramArchive(database, archive);
      notify({ type: 'genogram-imported', requestId: request.requestId, genogramId });
    } else if (request.type === 'delete-family-branch') {
      deleteFamilyBranch(database, request.genogramId, request.rootPersonIds);
      notify({ type: 'family-branch-deleted', requestId: request.requestId });
    } else {
      deleteGenogram(database, request.genogramId);
      notify({ type: 'genogram-deleted', requestId: request.requestId });
    }
  } catch {
    notify({ type: request.type === 'import' ? 'import-failed' : 'query-failed', requestId: request.requestId });
  }
});

function notify(message: DatabaseWorkerMessage): void {
  workerScope.postMessage(message);
}

async function initializeDatabase() {
  const sqlite3 = await sqlite3InitModule();
  if (!sqlite3.installOpfsSAHPoolVfs) throw new UnsupportedStorageError();

  const pool = await sqlite3.installOpfsSAHPoolVfs({
    name: 'cherware-genogram',
    directory: '.cherware-genogram',
    preserveOnInitFailure: true,
  });
  const db = new pool.OpfsSAHPoolDb('/genogram.sqlite3');
  db.exec('PRAGMA foreign_keys = ON;');

  const version = db.selectValue('PRAGMA user_version') as number;
  if (version > 3) {
    db.close();
    throw new Error('Unsupported database schema version');
  }

  db.exec('BEGIN IMMEDIATE;');
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS genogram (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        source_format TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS person (
        id TEXT PRIMARY KEY,
        genogram_id TEXT NOT NULL REFERENCES genogram(id) ON DELETE CASCADE,
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        family_name TEXT,
        birth_date TEXT,
        birth_date_precision TEXT CHECK (birth_date_precision IN ('day', 'year')),
        death_date TEXT,
        death_date_precision TEXT CHECK (death_date_precision IN ('day', 'year')),
        gender TEXT NOT NULL DEFAULT 'unknown' CHECK (gender IN ('female', 'male', 'nonbinary', 'unknown')),
        UNIQUE (genogram_id, id),
        CHECK ((birth_date IS NULL) = (birth_date_precision IS NULL)),
        CHECK ((death_date IS NULL) = (death_date_precision IS NULL))
      ) STRICT;

      CREATE TABLE IF NOT EXISTS partnership (
        id TEXT PRIMARY KEY,
        genogram_id TEXT NOT NULL REFERENCES genogram(id) ON DELETE CASCADE,
        person_a_id TEXT NOT NULL,
        person_b_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('married', 'unknown')),
        start_date TEXT,
        start_date_precision TEXT CHECK (start_date_precision IN ('day', 'year')),
        CHECK (person_a_id <> person_b_id),
        CHECK ((start_date IS NULL) = (start_date_precision IS NULL)),
        FOREIGN KEY (genogram_id, person_a_id) REFERENCES person(genogram_id, id),
        FOREIGN KEY (genogram_id, person_b_id) REFERENCES person(genogram_id, id),
        UNIQUE (genogram_id, person_a_id, person_b_id)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS parent_child (
        id TEXT PRIMARY KEY,
        genogram_id TEXT NOT NULL REFERENCES genogram(id) ON DELETE CASCADE,
        parent_id TEXT NOT NULL,
        child_id TEXT NOT NULL,
        relationship_type TEXT NOT NULL DEFAULT 'unspecified',
        CHECK (parent_id <> child_id),
        FOREIGN KEY (genogram_id, parent_id) REFERENCES person(genogram_id, id),
        FOREIGN KEY (genogram_id, child_id) REFERENCES person(genogram_id, id),
        UNIQUE (genogram_id, parent_id, child_id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS person_by_genogram ON person(genogram_id);
      CREATE INDEX IF NOT EXISTS child_by_parent ON parent_child(genogram_id, parent_id);
    `);
    if (version === 1) {
      db.exec("ALTER TABLE person ADD COLUMN gender TEXT NOT NULL DEFAULT 'unknown' CHECK (gender IN ('female', 'male', 'nonbinary', 'unknown'));");
    }
    if (version < 3) {
      db.exec(`ALTER TABLE person ADD COLUMN birth_date_is_month INTEGER NOT NULL DEFAULT 0 CHECK (birth_date_is_month IN (0, 1));
        ALTER TABLE person ADD COLUMN death_date_is_month INTEGER NOT NULL DEFAULT 0 CHECK (death_date_is_month IN (0, 1));
        ALTER TABLE partnership ADD COLUMN start_date_is_month INTEGER NOT NULL DEFAULT 0 CHECK (start_date_is_month IN (0, 1));`);
    }
    db.exec('PRAGMA user_version = 3;');
    db.exec('COMMIT;');
  } catch (error) {
    db.exec('ROLLBACK;');
    db.close();
    throw error;
  }

  return { db, sqliteVersion: sqlite3.version.libVersion };
}

function importEntries(
  connection: NonNullable<typeof database>,
  entries: ImportEntryDraft[],
): ImportSummary {
  const { db } = connection;
  if (entries.length === 0) throw new Error('No import entries');

  const entryByRow = new Map(entries.map((entry) => [entry.sourceRow, entry]));
  const personIds = new Map<number, { personId: string; spouseId: string | null }>();
  for (const entry of entries) {
    if (!entry.generationValid) throw new Error('Generation column is ambiguous');
    if (!entry.person.name.trim()) throw new Error('Missing person name');
    if (entry.generation > 1) {
      const parent = entry.parentSourceRow ? entryByRow.get(entry.parentSourceRow) : undefined;
      if (!parent || parent.generation !== entry.generation - 1) {
        throw new Error('Missing parent');
      }
    }
    if (entry.marriageStatus === 'married' && !entry.spouse?.name.trim()) {
      throw new Error('Missing spouse name');
    }
    personIds.set(entry.sourceRow, {
      personId: crypto.randomUUID(),
      spouseId: entry.spouse?.name.trim() ? crypto.randomUUID() : null,
    });
  }

  const genogramId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const personInsert = db.prepare(`
    INSERT INTO person (
      id, genogram_id, name, family_name,
      birth_date, birth_date_precision, birth_date_is_month,
      death_date, death_date_precision, death_date_is_month, gender
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const partnershipInsert = db.prepare(`
    INSERT INTO partnership (
      id, genogram_id, person_a_id, person_b_id, status, start_date, start_date_precision, start_date_is_month
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const parentChildInsert = db.prepare(`
    INSERT INTO parent_child (id, genogram_id, parent_id, child_id, relationship_type)
    VALUES (?, ?, ?, ?, 'unspecified')
  `);

  db.exec('BEGIN IMMEDIATE;');
  try {
    db.exec({
      sql: 'INSERT INTO genogram (id, title, created_at, source_format) VALUES (?, ?, ?, ?)',
      bind: [genogramId, 'Importierter Fall', createdAt, 'legacy-excel'],
    });

    for (const entry of entries) {
      const ids = personIds.get(entry.sourceRow)!;
      insertPerson(personInsert, genogramId, ids.personId, entry.person);
      if (entry.spouse && ids.spouseId) {
        insertPerson(personInsert, genogramId, ids.spouseId, entry.spouse);
        const date = entry.marriageDate;
        partnershipInsert.bind([
          crypto.randomUUID(),
          genogramId,
          ids.personId,
          ids.spouseId,
          entry.marriageStatus ?? 'unknown',
          ...databaseDate(toPersistableDate(date)),
        ]);
        partnershipInsert.step();
        partnershipInsert.reset();
      }
    }

    let parentChildLinkCount = 0;
    for (const entry of entries) {
      if (entry.parentSourceRow === null) continue;
      const parentIds = personIds.get(entry.parentSourceRow);
      const childIds = personIds.get(entry.sourceRow);
      if (!parentIds || !childIds) throw new Error('Missing parent or child IDs');

      parentChildInsert.bind([
        crypto.randomUUID(),
        genogramId,
        parentIds.personId,
        childIds.personId,
      ]);
      parentChildInsert.step();
      parentChildInsert.reset();
      parentChildLinkCount += 1;

      if (parentIds.spouseId && entry.parentAssignment === 'primary-and-partner') {
        parentChildInsert.bind([
          crypto.randomUUID(),
          genogramId,
          parentIds.spouseId,
          childIds.personId,
        ]);
        parentChildInsert.step();
        parentChildInsert.reset();
        parentChildLinkCount += 1;
      }
    }

    db.exec('COMMIT;');
    return {
      personCount: entries.length + entries.filter((entry) => entry.spouse?.name.trim()).length,
      partnershipCount: entries.filter((entry) => entry.spouse?.name.trim()).length,
      parentChildLinkCount,
    };
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  } finally {
    personInsert.finalize();
    partnershipInsert.finalize();
    parentChildInsert.finalize();
  }
}

function listGenograms(connection: NonNullable<typeof database>): GenogramSummary[] {
  return connection.db.selectObjects(`
    SELECT g.id, g.title, g.created_at AS createdAt, g.source_format AS sourceFormat,
      (SELECT COUNT(*) FROM person p WHERE p.genogram_id = g.id) AS personCount,
      (SELECT COUNT(*) FROM partnership r WHERE r.genogram_id = g.id) AS partnershipCount,
      (SELECT COUNT(*) FROM parent_child pc WHERE pc.genogram_id = g.id) AS parentChildLinkCount
    FROM genogram g
    ORDER BY g.created_at DESC, g.rowid DESC
  `).map((row) => ({
    id: String(row.id),
    title: String(row.title),
    createdAt: String(row.createdAt),
    sourceFormat: String(row.sourceFormat),
    personCount: Number(row.personCount),
    partnershipCount: Number(row.partnershipCount),
    parentChildLinkCount: Number(row.parentChildLinkCount),
  }));
}

function renameGenogram(connection: NonNullable<typeof database>, genogramId: string, title: string): void {
  const normalizedTitle = title.trim();
  if (!normalizedTitle || normalizedTitle.length > 200) throw new Error('Invalid genogram title');
  const { db } = connection;
  const exists = Number(db.selectValue('SELECT COUNT(*) FROM genogram WHERE id = ?', [genogramId]));
  if (exists !== 1) throw new Error('Genogram not found');
  db.exec({ sql: 'UPDATE genogram SET title = ? WHERE id = ?', bind: [normalizedTitle, genogramId] });
}

function createGenogram(
  connection: NonNullable<typeof database>,
  input: import('../domain/savedGenogram').NewGenogramInput,
): string {
  const title = input.title.trim();
  const person = input.rootPerson;
  if (!title || title.length > 200 || !person.name.trim()
    || !['female', 'male', 'nonbinary', 'unknown'].includes(person.gender)) {
    throw new Error('Invalid new genogram');
  }

  const genogramId = crypto.randomUUID();
  const { db } = connection;
  db.exec('BEGIN IMMEDIATE;');
  try {
    db.exec({
      sql: 'INSERT INTO genogram (id, title, created_at, source_format) VALUES (?, ?, ?, ?)',
      bind: [genogramId, title, new Date().toISOString(), 'manual'],
    });
    db.exec({
      sql: `INSERT INTO person (id, genogram_id, name, family_name, birth_date, birth_date_precision, birth_date_is_month,
        death_date, death_date_precision, death_date_is_month, gender) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      bind: [
        person.id, genogramId, person.name.trim(), normalizeNullable(person.familyName),
        ...databaseDate(person.birthDate), ...databaseDate(person.deathDate), person.gender,
      ],
    });
    db.exec('COMMIT;');
    return genogramId;
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }
}

function getGenogram(
  connection: NonNullable<typeof database>,
  genogramId: string,
): GenogramDetail | null {
  const { db } = connection;
  const summaryRow = db.selectObjects(`
    SELECT g.id, g.title, g.created_at AS createdAt, g.source_format AS sourceFormat,
      (SELECT COUNT(*) FROM person p WHERE p.genogram_id = g.id) AS personCount,
      (SELECT COUNT(*) FROM partnership r WHERE r.genogram_id = g.id) AS partnershipCount,
      (SELECT COUNT(*) FROM parent_child pc WHERE pc.genogram_id = g.id) AS parentChildLinkCount
    FROM genogram g WHERE g.id = ?
  `, [genogramId])[0];
  if (!summaryRow) return null;

  const summary: GenogramSummary = {
    id: String(summaryRow.id),
    title: String(summaryRow.title),
    createdAt: String(summaryRow.createdAt),
    sourceFormat: String(summaryRow.sourceFormat),
    personCount: Number(summaryRow.personCount),
    partnershipCount: Number(summaryRow.partnershipCount),
    parentChildLinkCount: Number(summaryRow.parentChildLinkCount),
  };
  const people = db.selectObjects(`
    SELECT id, name, family_name AS familyName, birth_date AS birthDate,
      birth_date_precision AS birthDatePrecision, birth_date_is_month AS birthDateIsMonth,
      death_date AS deathDate, death_date_precision AS deathDatePrecision,
      death_date_is_month AS deathDateIsMonth, gender
    FROM person WHERE genogram_id = ? ORDER BY rowid
  `, [genogramId]).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    familyName: nullableString(row.familyName),
    birthDate: externalDate(row.birthDate, row.birthDateIsMonth),
    birthDatePrecision: externalPrecision(row.birthDatePrecision, row.birthDateIsMonth),
    deathDate: externalDate(row.deathDate, row.deathDateIsMonth),
    deathDatePrecision: externalPrecision(row.deathDatePrecision, row.deathDateIsMonth),
    gender: nullableGender(row.gender),
  }));
  const partnerships = db.selectObjects(`
    SELECT id, person_a_id AS personAId, person_b_id AS personBId, status,
      start_date AS startDate, start_date_precision AS startDatePrecision,
      start_date_is_month AS startDateIsMonth
    FROM partnership WHERE genogram_id = ? ORDER BY rowid
  `, [genogramId]).map((row) => ({
    id: String(row.id),
    personAId: String(row.personAId),
    personBId: String(row.personBId),
    status: row.status === 'married' ? 'married' as const : 'unknown' as const,
    startDate: externalDate(row.startDate, row.startDateIsMonth),
    startDatePrecision: externalPrecision(row.startDatePrecision, row.startDateIsMonth),
  }));
  const parentChildLinks = db.selectObjects(`
    SELECT id, parent_id AS parentId, child_id AS childId, relationship_type AS relationshipType
    FROM parent_child WHERE genogram_id = ? ORDER BY rowid
  `, [genogramId]).map((row) => ({
    id: String(row.id),
    parentId: String(row.parentId),
    childId: String(row.childId),
    relationshipType: String(row.relationshipType),
  }));

  return { summary, people, partnerships, parentChildLinks };
}

function updateFamilyNode(
  connection: NonNullable<typeof database>,
  correction: import('../domain/savedGenogram').FamilyNodeCorrection,
): void {
  const { db } = connection;
  if (correction.people.length === 0 || correction.people.some((person) => !person.name.trim())) {
    throw new Error('Invalid person correction');
  }
  const allowedParentIds = new Set(correction.replaceParentIds);
  if (correction.childParentages.some((child) => child.links.some((link) =>
    !allowedParentIds.has(link.parentId)
      || !['unspecified', 'biological', 'adoptive', 'foster', 'step', 'social'].includes(link.relationshipType),
  ))) {
    throw new Error('Invalid parentage correction');
  }

  db.exec('BEGIN IMMEDIATE;');
  try {
    for (const person of correction.people) {
      const exists = Number(db.selectValue(
        'SELECT COUNT(*) FROM person WHERE genogram_id = ? AND id = ?',
        [correction.genogramId, person.id],
      ));
      if (exists !== 1) throw new Error('Person not found in genogram');
      db.exec({
        sql: `UPDATE person SET name = ?, family_name = ?, birth_date = ?, birth_date_precision = ?, birth_date_is_month = ?,
      death_date = ?, death_date_precision = ?, death_date_is_month = ?, gender = ? WHERE genogram_id = ? AND id = ?`,
        bind: [
          person.name.trim(),
          normalizeNullable(person.familyName),
          ...databaseDate(person.birthDate),
          ...databaseDate(person.deathDate),
          person.gender,
          correction.genogramId,
          person.id,
        ],
      });
    }

    for (const child of correction.childParentages) {
      const childExists = Number(db.selectValue(
        'SELECT COUNT(*) FROM person WHERE genogram_id = ? AND id = ?',
        [correction.genogramId, child.childId],
      ));
      if (childExists !== 1) throw new Error('Child not found in genogram');
      if (allowedParentIds.size > 0) {
        const placeholders = [...allowedParentIds].map(() => '?').join(', ');
        db.exec({
          sql: `DELETE FROM parent_child WHERE genogram_id = ? AND child_id = ? AND parent_id IN (${placeholders})`,
          bind: [correction.genogramId, child.childId, ...allowedParentIds],
        });
      }
      for (const link of child.links) {
        const parentExists = Number(db.selectValue(
          'SELECT COUNT(*) FROM person WHERE genogram_id = ? AND id = ?',
          [correction.genogramId, link.parentId],
        ));
        if (parentExists !== 1) throw new Error('Parent not found in genogram');
        db.exec({
          sql: 'INSERT INTO parent_child (id, genogram_id, parent_id, child_id, relationship_type) VALUES (?, ?, ?, ?, ?)',
          bind: [crypto.randomUUID(), correction.genogramId, link.parentId, child.childId, link.relationshipType],
        });
      }
    }

    if (correction.partnership) {
      const partnership = correction.partnership;
      const exists = Number(db.selectValue(
        'SELECT COUNT(*) FROM partnership WHERE genogram_id = ? AND id = ?',
        [correction.genogramId, partnership.id],
      ));
      if (exists !== 1) throw new Error('Partnership not found in genogram');
      db.exec({
        sql: `UPDATE partnership SET status = ?, start_date = ?, start_date_precision = ?, start_date_is_month = ?
          WHERE genogram_id = ? AND id = ?`,
        bind: [
          partnership.status,
          ...databaseDate(partnership.startDate),
          correction.genogramId,
          partnership.id,
        ],
      });
    }
    db.exec('COMMIT;');
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }
}

function addFamilyMember(
  connection: NonNullable<typeof database>,
  input: import('../domain/savedGenogram').AddFamilyMemberInput,
): void {
  const { db } = connection;
  const { person, relationship } = input;
  if (!person.name.trim() || !['female', 'male', 'nonbinary', 'unknown'].includes(person.gender)) {
    throw new Error('Invalid person');
  }
  const linkedPersonIds = relationship.kind === 'child'
    ? relationship.parents.map((parent) => parent.parentId)
    : [relationship.partnerId];
  if (linkedPersonIds.length === 0 || new Set(linkedPersonIds).size !== linkedPersonIds.length) {
    throw new Error('Invalid family relationship');
  }
  if (relationship.kind === 'child' && relationship.parents.some((parent) =>
    !['unspecified', 'biological', 'adoptive', 'foster', 'step', 'social'].includes(parent.relationshipType),
  )) throw new Error('Invalid parentage type');
  if (linkedPersonIds.some((id) => id === person.id || Number(db.selectValue(
    'SELECT COUNT(*) FROM person WHERE genogram_id = ? AND id = ?', [input.genogramId, id],
  )) !== 1)) throw new Error('Related person not found');
  if (Number(db.selectValue('SELECT COUNT(*) FROM genogram WHERE id = ?', [input.genogramId])) !== 1) {
    throw new Error('Genogram not found');
  }
  if (relationship.kind === 'partner' && Number(db.selectValue(
    `SELECT COUNT(*) FROM partnership WHERE genogram_id = ?
      AND ((person_a_id = ? AND person_b_id = ?) OR (person_a_id = ? AND person_b_id = ?))`,
    [input.genogramId, relationship.partnerId, person.id, person.id, relationship.partnerId],
  )) !== 0) throw new Error('Partnership already exists');

  db.exec('BEGIN IMMEDIATE;');
  try {
    db.exec({
      sql: `INSERT INTO person (id, genogram_id, name, family_name, birth_date, birth_date_precision, birth_date_is_month,
        death_date, death_date_precision, death_date_is_month, gender) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      bind: [
        person.id, input.genogramId, person.name.trim(), normalizeNullable(person.familyName),
        ...databaseDate(person.birthDate), ...databaseDate(person.deathDate), person.gender,
      ],
    });
    if (relationship.kind === 'child') {
      for (const parent of relationship.parents) {
        db.exec({
          sql: 'INSERT INTO parent_child (id, genogram_id, parent_id, child_id, relationship_type) VALUES (?, ?, ?, ?, ?)',
          bind: [crypto.randomUUID(), input.genogramId, parent.parentId, person.id, parent.relationshipType],
        });
      }
    } else {
      db.exec({
        sql: `INSERT INTO partnership (id, genogram_id, person_a_id, person_b_id, status, start_date, start_date_precision, start_date_is_month)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        bind: [
          crypto.randomUUID(), input.genogramId, relationship.partnerId, person.id, relationship.status,
          ...databaseDate(relationship.startDate),
        ],
      });
    }
    db.exec('COMMIT;');
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }
}

function importGenogramArchive(
  connection: NonNullable<typeof database>,
  archive: ReturnType<typeof validateGenogramArchive>,
): string {
  const { db } = connection;
  const genogramId = crypto.randomUUID();
  const personIds = new Map(archive.people.map((person) => [person.id, crypto.randomUUID()]));
  const personInsert = db.prepare(`
    INSERT INTO person (
      id, genogram_id, name, family_name,
      birth_date, birth_date_precision, birth_date_is_month,
      death_date, death_date_precision, death_date_is_month, gender
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const partnershipInsert = db.prepare(`
    INSERT INTO partnership (
      id, genogram_id, person_a_id, person_b_id, status, start_date, start_date_precision, start_date_is_month
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const parentChildInsert = db.prepare(`
    INSERT INTO parent_child (id, genogram_id, parent_id, child_id, relationship_type)
    VALUES (?, ?, ?, ?, ?)
  `);
  db.exec('BEGIN IMMEDIATE;');
  try {
    db.exec({
      sql: 'INSERT INTO genogram (id, title, created_at, source_format) VALUES (?, ?, ?, ?)',
      bind: [genogramId, archive.genogram.title, new Date().toISOString(), 'cherware-json-v1'],
    });
    for (const person of archive.people) {
      personInsert.bind([
        personIds.get(person.id)!, genogramId, person.name, person.familyName,
        ...databasePersonDates(person), person.gender,
      ]);
      personInsert.step();
      personInsert.reset();
    }
    for (const partnership of archive.partnerships) {
      partnershipInsert.bind([
        crypto.randomUUID(), genogramId, personIds.get(partnership.personAId)!,
        personIds.get(partnership.personBId)!, partnership.status,
        ...databaseDate(partnership.startDate === null || partnership.startDatePrecision === null
          ? null
          : { value: partnership.startDate, precision: partnership.startDatePrecision }),
      ]);
      partnershipInsert.step();
      partnershipInsert.reset();
    }
    for (const link of archive.parentChildLinks) {
      parentChildInsert.bind([
        crypto.randomUUID(), genogramId, personIds.get(link.parentId)!,
        personIds.get(link.childId)!, link.relationshipType,
      ]);
      parentChildInsert.step();
      parentChildInsert.reset();
    }
    db.exec('COMMIT;');
    return genogramId;
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  } finally {
    personInsert.finalize();
    partnershipInsert.finalize();
    parentChildInsert.finalize();
  }
}

function deleteFamilyBranch(connection: NonNullable<typeof database>, genogramId: string, rootPersonIds: string[]): void {
  const { db } = connection;
  if (rootPersonIds.length === 0 || new Set(rootPersonIds).size !== rootPersonIds.length) throw new Error('Invalid branch roots');
  db.exec('BEGIN IMMEDIATE;');
  try {
    const people = new Set<string>();
    const pending = [...rootPersonIds];
    while (pending.length > 0) {
      const personId = pending.pop()!;
      if (people.has(personId)) continue;
      const exists = Number(db.selectValue('SELECT COUNT(*) FROM person WHERE genogram_id = ? AND id = ?', [genogramId, personId]));
      if (exists !== 1) throw new Error('Branch root not found');
      people.add(personId);
      const children = db.selectObjects('SELECT child_id AS childId FROM parent_child WHERE genogram_id = ? AND parent_id = ?', [genogramId, personId]);
      for (const child of children) {
        const childId = String(child.childId);
        if (!people.has(childId)) pending.push(childId);
      }
    }

    const ids = [...people];
    const placeholders = ids.map(() => '?').join(', ');
    db.exec({
      sql: `DELETE FROM parent_child WHERE genogram_id = ? AND (parent_id IN (${placeholders}) OR child_id IN (${placeholders}))`,
      bind: [genogramId, ...ids, ...ids],
    });
    db.exec({
      sql: `DELETE FROM partnership WHERE genogram_id = ? AND (person_a_id IN (${placeholders}) OR person_b_id IN (${placeholders}))`,
      bind: [genogramId, ...ids, ...ids],
    });
    db.exec({ sql: `DELETE FROM person WHERE genogram_id = ? AND id IN (${placeholders})`, bind: [genogramId, ...ids] });
    db.exec('COMMIT;');
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }
}

function deleteGenogram(connection: NonNullable<typeof database>, genogramId: string): void {
  const { db } = connection;
  const exists = Number(db.selectValue('SELECT COUNT(*) FROM genogram WHERE id = ?', [genogramId]));
  if (exists !== 1) throw new Error('Genogram not found');

  db.exec('BEGIN IMMEDIATE;');
  try {
    // Delete dependent records first so composite person foreign keys stay valid throughout the transaction.
    for (const table of ['parent_child', 'partnership', 'person']) {
      db.exec({ sql: `DELETE FROM ${table} WHERE genogram_id = ?`, bind: [genogramId] });
    }
    db.exec({ sql: 'DELETE FROM genogram WHERE id = ?', bind: [genogramId] });
    db.exec('COMMIT;');
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function nullablePrecision(value: unknown): 'day' | 'year' | null {
  return value === 'day' || value === 'year' ? value : null;
}

function externalPrecision(value: unknown, isMonth: unknown): 'day' | 'month' | 'year' | null {
  if (isMonth === 1) return 'month';
  return nullablePrecision(value);
}

function externalDate(value: unknown, isMonth: unknown): string | null {
  const stored = nullableString(value);
  return stored && isMonth === 1 ? stored.slice(0, 7) : stored;
}

function databaseDate(date: DateValue | null): [string | null, 'day' | 'year' | null, number] {
  if (!date) return [null, null, 0];
  if (date.precision === 'month') return [`${date.value}-01`, 'day', 1];
  return [date.value, date.precision, 0];
}

function databasePersonDates(person: {
  birthDate: string | null;
  birthDatePrecision: 'day' | 'month' | 'year' | null;
  deathDate: string | null;
  deathDatePrecision: 'day' | 'month' | 'year' | null;
}): [...ReturnType<typeof databaseDate>, ...ReturnType<typeof databaseDate>] {
  const birth = person.birthDate === null || person.birthDatePrecision === null
    ? null : { value: person.birthDate, precision: person.birthDatePrecision } as DateValue;
  const death = person.deathDate === null || person.deathDatePrecision === null
    ? null : { value: person.deathDate, precision: person.deathDatePrecision } as DateValue;
  return [...databaseDate(birth), ...databaseDate(death)];
}

function nullableGender(value: unknown): import('../domain/savedGenogram').GenogramGender {
  return value === 'female' || value === 'male' || value === 'nonbinary' ? value : 'unknown';
}

function insertPerson(
  statement: ReturnType<NonNullable<typeof database>['db']['prepare']>,
  genogramId: string,
  id: string,
  person: ImportEntryDraft['person'],
): void {
  statement.bind([
    id,
    genogramId,
    person.name.trim(),
    normalizeNullable(person.familyName),
    ...databaseDate(toPersistableDate(person.birthDate)),
    ...databaseDate(toPersistableDate(person.deathDate)),
    'unknown',
  ]);
  statement.step();
  statement.reset();
}

function toPersistableDate(date: ImportEntryDraft['person']['birthDate']): DateValue | null {
  if (!date) return null;
  if (date.precision === 'unparsed') throw new Error('Unparsed date cannot be persisted');
  return date;
}

function normalizeNullable(value: string | null): string | null {
  return value?.trim() ? value.trim() : null;
}

class UnsupportedStorageError extends Error {}

void initializeDatabase()
  .then((connection) => {
    database = connection;
    notify({ type: 'ready', sqliteVersion: connection.sqliteVersion });
  })
  .catch((error: unknown) => {
    notify({
      type: 'unavailable',
      reason: error instanceof UnsupportedStorageError ? 'unsupported' : 'initialization-failed',
    });
  });
