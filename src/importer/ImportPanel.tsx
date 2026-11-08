import { useState } from 'react';
import type { ChangeEvent } from 'react';
import type { ImportEntryDraft, ImportSummary, MarriageStatus, ImportedParentAssignment } from '../domain/model';
import type { LocalDatabaseClient } from '../db/database';
import {
  buildImportSummary,
  dateInputValue,
  editableDateInput,
  getDraftValidation,
  parseWorkbookFile,
  WorkbookParseError,
} from './parseWorkbook';

interface ImportPanelProps {
  databaseReady: boolean;
  database: LocalDatabaseClient | null;
  onImported: () => void;
}

interface PreviewDraft {
  entries: ImportEntryDraft[];
  sourceRowCount: number;
  sheetCount: number;
}

const parseErrorCopy: Record<WorkbookParseError['code'], string> = {
  'unsupported-format': 'Wähle eine .xlsx-Datei bis maximal 25 MB aus.',
  'unreadable-workbook': 'Die Arbeitsmappe konnte nicht gelesen werden.',
  'unexpected-columns': 'Die Tabelle hat nicht die erwarteten acht Spalten.',
  'unrecognized-header': 'Die Spaltenüberschriften passen nicht zum bekannten Format.',
  'no-person-rows': 'Die Tabelle enthält keine Personendatensätze.',
};

export default function ImportPanel({ databaseReady, database, onImported }: ImportPanelProps) {
  const [preview, setPreview] = useState<PreviewDraft | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [imported, setImported] = useState<ImportSummary | null>(null);

  const validation = preview ? getDraftValidation(preview.entries) : null;
  const summary = preview ? buildImportSummary(preview.entries) : null;
  const entryBySourceRow = new Map(preview?.entries.map((entry) => [entry.sourceRow, entry]) ?? []);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;

    setErrorMessage(null);
    setImported(null);
    setPreview(null);
    setConfirmed(false);
    setParsing(true);
    try {
      const result = await parseWorkbookFile(file);
      setPreview({
        entries: result.entries,
        sourceRowCount: result.sourceRowCount,
        sheetCount: result.sheetCount,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof WorkbookParseError
          ? parseErrorCopy[error.code]
          : 'Beim lokalen Einlesen ist ein Fehler aufgetreten.',
      );
    } finally {
      setParsing(false);
    }
  }

  function updateEntry(index: number, update: Partial<ImportEntryDraft>) {
    setConfirmed(false);
    setPreview((current) =>
      current
        ? {
            ...current,
            entries: current.entries.map((entry, entryIndex) =>
              entryIndex === index ? { ...entry, ...update } : entry,
            ),
          }
        : current,
    );
  }

  function updatePersonField(
    index: number,
    personKind: 'person' | 'spouse',
    field: 'name' | 'familyName' | 'birthDate' | 'deathDate',
    value: string,
  ) {
    setConfirmed(false);
    setPreview((current) => {
      if (!current) return current;
      return {
        ...current,
        entries: current.entries.map((entry, entryIndex) => {
          if (entryIndex !== index) return entry;
          const existing = entry[personKind];
          const person = existing ?? {
            name: '',
            familyName: null,
            birthDate: null,
            deathDate: null,
          };
          const fieldValue =
            field === 'birthDate' || field === 'deathDate'
              ? editableDateInput(value)
              : field === 'familyName'
                ? value || null
                : value;
          const updatedPerson = { ...person, [field]: fieldValue };
          return { ...entry, [personKind]: updatedPerson };
        }),
      };
    });
  }

  async function commitImport() {
    if (!preview || !database || !databaseReady || !validation || validation.errors.length > 0) return;
    setSaving(true);
    setErrorMessage(null);
    try {
      const result = await database.importEntries(preview.entries);
      setImported(result);
      setPreview(null);
      setConfirmed(false);
      onImported();
    } catch {
      setErrorMessage('Die geprüften Daten konnten nicht in der lokalen Datenbank gespeichert werden.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="import-section" aria-labelledby="import-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">DATEI HINZUFÜGEN</p>
          <h2 id="import-title">Excel-Datei importieren</h2>
          <p className="section-intro">
            Die Datei wird nur in diesem Browser gelesen. Prüfe und korrigiere erkannte
            Personen und Beziehungen, bevor du sie lokal speicherst.
          </p>
        </div>
        <label className={`file-button ${!databaseReady || parsing ? 'is-disabled' : ''}`}>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={handleFileChange}
            disabled={!databaseReady || parsing || saving}
            aria-label="Excel-Datei auswählen"
          />
          {parsing ? 'Wird lokal eingelesen …' : 'Excel-Datei auswählen'}
        </label>
      </div>

      {!databaseReady && !imported && (
        <p className="inline-notice">Import erst möglich, sobald der persistente Speicher bereit ist.</p>
      )}
      {errorMessage && <p className="inline-error" role="alert">{errorMessage}</p>}

      {imported && (
        <div className="import-success" role="status">
          <strong>Import lokal abgeschlossen.</strong>
          <span>
            {imported.personCount} Personen, {imported.partnershipCount} Partnerschaften und{' '}
            {imported.parentChildLinkCount} Eltern-Kind-Verbindungen gespeichert.
          </span>
        </div>
      )}

      {preview && summary && validation && (
        <div className="preview-shell">
          <div className="preview-summary">
            <div><strong>{preview.sourceRowCount}</strong><span>Tabellenzeilen</span></div>
            <div><strong>{summary.personCount}</strong><span>Personen, falls übernommen</span></div>
            <div><strong>{summary.partnershipCount}</strong><span>Partnerschaften</span></div>
            <div><strong>{summary.parentChildLinkCount}</strong><span>Eltern-Kind-Verbindungen</span></div>
          </div>

          {preview.sheetCount > 1 && (
            <p className="inline-notice">
              Die Arbeitsmappe enthält mehrere Tabellenblätter. Für diese Vorschau wurde das erste verwendet.
            </p>
          )}

          <div className="validation-summary">
            <span className={validation.errors.length ? 'validation-error' : 'validation-good'}>
              {validation.errors.length
                ? `${validation.errors.length} Fehler müssen vor dem Speichern behoben werden.`
                : 'Keine blockierenden Strukturfehler erkannt.'}
            </span>
            <span>{validation.warnings.length} Hinweise zur Prüfung</span>
          </div>

          {preview.entries.some((entry) => entry.parentSourceRow !== null
            && entryBySourceRow.get(entry.parentSourceRow)?.spouse?.name.trim()) && (
            <p className="inline-notice">
              Wenn für eine Elterngeneration ein Partner eingetragen ist, ist dieser zunächst als zweiter Elternteil vorausgewählt. Prüfe die Zuordnung pro Kind unten; du kannst den Partner abwählen.
            </p>
          )}

          <div className="entry-list">
            {preview.entries.map((entry, index) => (
              <ImportEntryEditor
                key={entry.sourceRow}
                entry={entry}
                index={index}
                allEntries={preview.entries}
                updateEntry={updateEntry}
                updatePersonField={updatePersonField}
              />
            ))}
          </div>

          <label className="review-check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.currentTarget.checked)}
              disabled={validation.errors.length > 0 || saving}
            />
            <span>Ich habe die Vorschau und die Hinweise geprüft.</span>
          </label>
          <button
            type="button"
            className="primary-button"
            onClick={commitImport}
            disabled={!databaseReady || validation.errors.length > 0 || !confirmed || saving}
          >
            {saving ? 'Wird lokal gespeichert …' : 'Geprüfte Daten lokal speichern'}
          </button>
          <p className="no-source-retention">
            Gespeichert werden nur Personen und Beziehungen. Die Arbeitsmappe selbst wird nicht gespeichert.
          </p>
        </div>
      )}
    </section>
  );
}

interface ImportEntryEditorProps {
  entry: ImportEntryDraft;
  index: number;
  allEntries: ImportEntryDraft[];
  updateEntry: (index: number, update: Partial<ImportEntryDraft>) => void;
  updatePersonField: (
    index: number,
    personKind: 'person' | 'spouse',
    field: 'name' | 'familyName' | 'birthDate' | 'deathDate',
    value: string,
  ) => void;
}

function ImportEntryEditor({
  entry,
  index,
  allEntries,
  updateEntry,
  updatePersonField,
}: ImportEntryEditorProps) {
  const parent = allEntries.find((candidate) => candidate.sourceRow === entry.parentSourceRow);
  const computedWarnings = getDraftValidation([entry]).warnings.map((item) => item.message);
  const warnings = [...entry.warnings, ...computedWarnings];

  return (
    <details className="entry-card" open={warnings.length > 0}>
      <summary>
        <span className="entry-generation">Generation {entry.generation}</span>
        <span>Excel-Zeile {entry.sourceRow}</span>
        <span className="entry-parent">
          {parent ? `Eltern: Generation ${parent.generation}, Zeile ${parent.sourceRow}` : 'Wurzeleintrag'}
        </span>
        {warnings.length > 0 && <span className="entry-warning-count">{warnings.length} Hinweise</span>}
      </summary>
      <div className="entry-fields">
        {parent?.spouse?.name.trim() && (
          <label>
            Eltern dieses Kindes
            <select
              value={entry.parentAssignment}
              onChange={(event) => updateEntry(index, { parentAssignment: event.currentTarget.value as ImportedParentAssignment })}
            >
              <option value="primary-and-partner">Hauptperson und deren Partner</option>
              <option value="primary-parent">Nur die Hauptperson</option>
            </select>
          </label>
        )}
        <label>
          Person
          <input
            value={entry.person.name}
            onChange={(event) => updatePersonField(index, 'person', 'name', event.currentTarget.value)}
          />
        </label>
        <label>
          Familienname
          <input
            value={entry.person.familyName ?? ''}
            onChange={(event) => updatePersonField(index, 'person', 'familyName', event.currentTarget.value)}
          />
        </label>
        <label>
          Geburtsdatum
          <input
            value={dateInputValue(entry.person.birthDate)}
            placeholder="TT.MM.JJJJ, MM.JJJJ oder JJJJ"
            onChange={(event) => updatePersonField(index, 'person', 'birthDate', event.currentTarget.value)}
          />
        </label>
        <label>
          Todesdatum
          <input
            value={dateInputValue(entry.person.deathDate)}
            placeholder="TT.MM.JJJJ, MM.JJJJ oder JJJJ"
            onChange={(event) => updatePersonField(index, 'person', 'deathDate', event.currentTarget.value)}
          />
        </label>
        <label>
          Ehepartner
          <input
            value={entry.spouse?.name ?? ''}
            onChange={(event) => updatePersonField(index, 'spouse', 'name', event.currentTarget.value)}
          />
        </label>
        <label>
          Geburtsdatum des Ehepartners
          <input
            value={dateInputValue(entry.spouse?.birthDate ?? null)}
            placeholder="TT.MM.JJJJ, MM.JJJJ oder JJJJ"
            onChange={(event) =>
              updatePersonField(index, 'spouse', 'birthDate', event.currentTarget.value)
            }
          />
        </label>
        <label>
          Todesdatum des Ehepartners
          <input
            value={dateInputValue(entry.spouse?.deathDate ?? null)}
            placeholder="TT.MM.JJJJ, MM.JJJJ oder JJJJ"
            onChange={(event) =>
              updatePersonField(index, 'spouse', 'deathDate', event.currentTarget.value)
            }
          />
        </label>
        <label>
          Eheschließungsstatus
          <select
            value={entry.marriageStatus ?? ''}
            onChange={(event) =>
              updateEntry(index, {
                marriageStatus: (event.currentTarget.value || null) as MarriageStatus | null,
              })
            }
          >
            <option value="">Nicht angegeben</option>
            <option value="married">Verheiratet</option>
            <option value="unknown">Unbekannt</option>
          </select>
        </label>
        <label>
          Eheschließungsdatum
          <input
            value={dateInputValue(entry.marriageDate)}
            placeholder="TT.MM.JJJJ, MM.JJJJ oder JJJJ"
            onChange={(event) => updateEntry(index, { marriageDate: editableDateInput(event.currentTarget.value) })}
          />
        </label>
      </div>
      {warnings.length > 0 && (
        <ul className="entry-warnings">
          {[...new Set(warnings)].map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      )}
    </details>
  );
}
