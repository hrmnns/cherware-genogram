import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ChangeEvent } from 'react';
import { ArrowDownUp, ArrowLeftRight, ArrowRight, Baby, Check, ChevronsDown, ChevronsUp, Clock3, FolderOpen, GitFork, Heart, Maximize2, MoveLeft, MoveRight, Pencil, Plus, Printer, RotateCcw, Trash2, Upload, X, ZoomIn, ZoomOut, Layers3 } from 'lucide-react';
import type { LocalDatabaseClient } from '../db/database';
import { parseGenogramArchive, serializeGenogramArchive } from '../backup/archive';
import type { GenogramArchiveV1 } from '../backup/archive';
import { editableDateInput } from '../importer/parseWorkbook';
import ImportPanel from '../importer/ImportPanel';
import { buildFamilyTree } from '../domain/buildFamilyTree';
import { readLastGenogramId, readViewPreferences, writeLastGenogramId, writeViewPreferences } from './viewPreferences';
import type { GenerationCohort, GenogramViewPreferences, ViewOrientation } from './viewPreferences';
import { filterGenogramAppearance, readGenogramAppearance, writeGenogramAppearance } from './appearance';
import type { GenogramAppearance } from './appearance';
import { createGenogramPrintSvg, createPosterPrintPages } from './printSvg';
import type {
  AddFamilyMemberInput,
  EditableDate,
  FamilyNodeCorrection,
  FamilyTreeGroup,
  FamilyTreePerson,
  GenogramDetail,
  GenogramPerson,
  GenogramSummary,
  NewGenogramInput,
  ParentageType,
} from '../domain/savedGenogram';

interface SavedGenogramsProps {
  databaseReady: boolean;
  database: LocalDatabaseClient | null;
  refreshKey: number;
  fileMenuHost: HTMLDivElement | null;
  viewMenuHost: HTMLDivElement | null;
  caseMenuOpen: boolean;
  onCloseCaseMenu: () => void;
  onArchiveImported: () => void;
  onCaseDeleted: () => void;
}

export default function SavedGenograms({ databaseReady, database, refreshKey, fileMenuHost, viewMenuHost, caseMenuOpen, onCloseCaseMenu, onArchiveImported, onCaseDeleted }: SavedGenogramsProps) {
  const [genograms, setGenograms] = useState<GenogramSummary[]>([]);
  const [genogramsLoaded, setGenogramsLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(() => readLastGenogramId());
  const [selected, setSelected] = useState<GenogramDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailRevision, setDetailRevision] = useState(0);
  const [pendingArchive, setPendingArchive] = useState<GenogramArchiveV1 | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveMessage, setArchiveMessage] = useState<string | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [pendingChangeCounts, setPendingChangeCounts] = useState<Record<string, number>>(readPendingChangeCounts);
  const [deleteTarget, setDeleteTarget] = useState<GenogramSummary | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [newGenogramOpen, setNewGenogramOpen] = useState(false);
  const fileMenuRef = useRef<HTMLDetailsElement>(null);
  const archiveFileInputRef = useRef<HTMLInputElement>(null);
  const pendingChanges = selectedId ? pendingChangeCounts[selectedId] ?? 0 : 0;

  function recordDatasetChange(genogramId: string) {
    setPendingChangeCounts((current) => {
      const next = { ...current, [genogramId]: (current[genogramId] ?? 0) + 1 };
      persistPendingChangeCounts(next);
      return next;
    });
  }

  function clearDatasetChanges(genogramId: string) {
    setPendingChangeCounts((current) => {
      const next = { ...current };
      delete next[genogramId];
      persistPendingChangeCounts(next);
      return next;
    });
  }

  function handleGenogramCreated(genogramId: string) {
    writeLastGenogramId(genogramId);
    recordDatasetChange(genogramId);
    setSelectedId(genogramId);
    setNewGenogramOpen(false);
    onCloseCaseMenu();
    onArchiveImported();
  }

  useEffect(() => {
    if (!caseMenuOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onCloseCaseMenu();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [caseMenuOpen, onCloseCaseMenu]);

  useEffect(() => {
    function dismissFileMenu(event: PointerEvent | KeyboardEvent) {
      const menu = fileMenuRef.current;
      if (!menu?.open) return;
      if (event instanceof KeyboardEvent && event.key === 'Escape') {
        menu.open = false;
      } else if (event instanceof PointerEvent && event.target instanceof Node && !menu.contains(event.target)) {
        menu.open = false;
      }
    }
    document.addEventListener('pointerdown', dismissFileMenu);
    document.addEventListener('keydown', dismissFileMenu);
    return () => {
      document.removeEventListener('pointerdown', dismissFileMenu);
      document.removeEventListener('keydown', dismissFileMenu);
    };
  }, []);

  useEffect(() => {
    if (!databaseReady || !database) return;
    let active = true;
    database.listGenograms().then((items) => {
      if (!active) return;
      setGenograms(items);
      const preferredId = readLastGenogramId();
      setSelectedId(items.find((item) => item.id === preferredId)?.id ?? null);
      setGenogramsLoaded(true);
      setError(null);
    }).catch(() => {
      if (active) {
        setGenogramsLoaded(true);
        setError('Die lokal gespeicherten Fälle konnten nicht geladen werden.');
      }
    });
    return () => { active = false; };
  }, [databaseReady, database, refreshKey]);

  useEffect(() => {
    if (selectedId) writeLastGenogramId(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (!databaseReady || !database || !selectedId) {
      setSelected(null);
      return;
    }
    let active = true;
    setLoading(true);
    database.getGenogram(selectedId).then((genogram) => {
      if (!active) return;
      setSelected(genogram);
      setError(genogram ? null : 'Der ausgewählte Fall ist nicht mehr verfügbar.');
    }).catch(() => {
      if (active) setError('Die Details dieses Falls konnten nicht geladen werden.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [databaseReady, database, selectedId, refreshKey, detailRevision]);

  async function handleArchiveFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    setArchiveError(null);
    setArchiveMessage(null);
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      setArchiveError('Das Archiv ist größer als 25 MB.');
      return;
    }
    try {
      setPendingArchive(parseGenogramArchive(await file.text()));
    } catch (cause) {
      setPendingArchive(null);
      setArchiveError(cause instanceof Error ? cause.message : 'Das Archiv konnte nicht geprüft werden.');
    }
  }

  async function exportSelected() {
    if (!database || !databaseReady || !selectedId) return;
    setArchiveBusy(true);
    setArchiveError(null);
    setArchiveMessage(null);
    try {
      const archive = await database.exportGenogram(selectedId);
      if (!archive) throw new Error('Der ausgewählte Fall ist nicht verfügbar.');
      const portableArchive: GenogramArchiveV1 = {
        ...archive,
        formatVersion: 2,
        appearance: filterGenogramAppearance(readGenogramAppearance(selectedId), new Set(archive.people.map((person) => person.id))),
      };
      const blob = new Blob([serializeGenogramArchive(portableArchive)], { type: 'application/json;charset=utf-8' });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `cherware-genogram-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setArchiveMessage('Archiv wurde lokal heruntergeladen. Bewahre die Datei sicher auf.');
      clearDatasetChanges(selectedId);
      setExportDialogOpen(false);
    } catch {
      setArchiveError('Der Fall konnte nicht exportiert werden.');
    } finally {
      setArchiveBusy(false);
    }
  }

  async function importPendingArchive() {
    if (!database || !databaseReady || !pendingArchive) return;
    setArchiveBusy(true);
    setArchiveError(null);
    setArchiveMessage(null);
    try {
      const imported = await database.importGenogramArchive(pendingArchive);
      if (pendingArchive.appearance) {
        const rekeyColors = (colors: Record<string, string>) => Object.fromEntries(Object.entries(colors)
          .flatMap(([oldId, color]) => imported.personIdMap[oldId] ? [[imported.personIdMap[oldId]!, color]] : []));
        writeGenogramAppearance(imported.genogramId, {
          personColors: rekeyColors(pendingArchive.appearance.personColors),
          branchColors: rekeyColors(pendingArchive.appearance.branchColors),
        });
      }
      setPendingArchive(null);
      setArchiveMessage('Archiv wurde als neuer Fall lokal importiert. Vorhandene Fälle wurden nicht überschrieben.');
      onArchiveImported();
    } catch {
      setArchiveError('Das geprüfte Archiv konnte nicht lokal importiert werden.');
    } finally {
      setArchiveBusy(false);
    }
  }

  return (
    <section className="saved-section" aria-label="Gespeicherte Genogramme">
      {fileMenuHost && createPortal(
        <details className="header-menu" ref={fileMenuRef}>
          <summary>Datei</summary>
          <div className="header-menu-panel unified-file-menu-panel">
            <ImportPanel databaseReady={databaseReady} database={database} onImported={onArchiveImported} />
            <div className="file-menu-management">
              <div className="file-menu-copy">
                <h3>Sicherung &amp; Verwaltung</h3>
                <p>JSON-Archive sichern einen Fall oder fügen einen gesicherten Fall hinzu.</p>
              </div>
              <div className="file-menu-actions">
                <button type="button" className="file-menu-create-genogram" onClick={() => {
                  setNewGenogramOpen(true);
                  if (fileMenuRef.current) fileMenuRef.current.open = false;
                }} disabled={!databaseReady || !database || archiveBusy}><Plus size={14} /> Neues Genogramm anlegen</button>
                <button type="button" onClick={() => { setExportDialogOpen(true); if (fileMenuRef.current) fileMenuRef.current.open = false; }} disabled={!databaseReady || !selectedId || archiveBusy}>JSON sichern</button>
                <label className={!databaseReady || archiveBusy ? 'is-disabled' : ''}>JSON-Archiv öffnen
                  <input ref={archiveFileInputRef} type="file" accept=".json,application/json" onChange={handleArchiveFileChange} disabled={!databaseReady || archiveBusy} />
                </label>
              </div>
              <div className="file-menu-danger-row">
                <button type="button" className="menu-danger" disabled={!selected} onClick={() => {
                  setDeleteError(null);
                  if (selected) setDeleteTarget(selected.summary);
                }}>Fall löschen …</button>
                <span>Entfernt den ausgewählten Fall nach Bestätigung.</span>
              </div>
            </div>
          </div>
        </details>,
        fileMenuHost,
      )}

      {caseMenuOpen && (
        <div className="case-drawer-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) onCloseCaseMenu();
        }}>
          <aside id="case-drawer" className="case-drawer" role="dialog" aria-modal="true" aria-labelledby="case-drawer-title">
            <div className="case-drawer-heading">
              <div><p className="eyebrow">Lokale Fälle</p><h2 id="case-drawer-title">Genogramm öffnen</h2></div>
              <button type="button" className="icon-button" onClick={onCloseCaseMenu} aria-label="Fallmenü schließen">×</button>
            </div>
            <div className="case-drawer-body">
              <p className="case-drawer-note">Wähle einen gespeicherten Fall. Die Daten bleiben in diesem Browser.</p>
              <nav className="case-drawer-list" aria-label="Gespeicherte Fälle">
                {genograms.length === 0 && <p className="empty-state">Noch keine Fälle gespeichert.</p>}
                {genograms.map((genogram) => (
                  <button type="button" className={`case-menu-item ${selectedId === genogram.id ? 'is-selected' : ''}`} key={genogram.id} onClick={() => {
                    setSelectedId(genogram.id);
                    onCloseCaseMenu();
                  }} aria-current={selectedId === genogram.id ? 'true' : undefined}>
                    <strong>{genogram.title}</strong><span>Angelegt {formatDateTime(genogram.createdAt)}</span>
                    <small>{genogram.personCount} Personen · {genogram.partnershipCount} Partnerschaften</small>
                  </button>
                ))}
              </nav>
            </div>
            <footer className="case-drawer-footer">
              <button type="button" className="primary-button" onClick={() => setNewGenogramOpen(true)} disabled={!databaseReady || !database}><Plus size={15} /> Neues Genogramm</button>
              <button type="button" className="secondary-button" onClick={onCloseCaseMenu}>Schließen</button>
            </footer>
          </aside>
        </div>
      )}

      {archiveError && <p className="inline-error" role="alert">{archiveError}</p>}
      {archiveMessage && <p className="archive-message" role="status">{archiveMessage}</p>}
      <p className="archive-security-note">Archive enthalten Familiendaten unverschlüsselt. Nur an einem geschützten Ort aufbewahren.</p>
      {pendingArchive && (
        <div className="archive-preview">
          <div>
            <strong>Archiv geprüft: {pendingArchive.genogram.title}</strong>
            <span>{pendingArchive.people.length} Personen · {pendingArchive.partnerships.length} Partnerschaften · {pendingArchive.parentChildLinks.length} Eltern-Kind-Verbindungen</span>
            <small>Der Import erstellt einen zusätzlichen Fall und überschreibt keine vorhandenen Daten.</small>
          </div>
          <div className="editor-actions">
            <button type="button" className="secondary-button" onClick={() => setPendingArchive(null)} disabled={archiveBusy}>Abbrechen</button>
            <button type="button" className="primary-button" onClick={importPendingArchive} disabled={archiveBusy}>{archiveBusy ? 'Importiere …' : 'Als neuen Fall importieren'}</button>
          </div>
        </div>
      )}

      {!databaseReady && <p className="inline-notice">Die lokalen Fälle werden geladen, sobald der Speicher bereit ist.</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      {databaseReady && genogramsLoaded && !error && !selectedId && (
        <main className="welcome-screen" aria-labelledby="welcome-title">
          <section className="welcome-main">
            <p className="eyebrow">Willkommen bei Cherware Genogramm</p>
            <h1 id="welcome-title">Familienbeziehungen sichtbar machen.</h1>
            <p className="welcome-intro">Erstelle ein Genogramm Schritt für Schritt oder öffne ein vorhandenes Archiv. Personen, Partnerschaften und Generationen lassen sich anschließend übersichtlich erkunden.</p>
            <div className="welcome-actions">
              <button type="button" className="primary-button" onClick={() => setNewGenogramOpen(true)} disabled={!database}><Plus size={16} /> Neues Genogramm erstellen</button>
              <button type="button" className="secondary-button" onClick={() => archiveFileInputRef.current?.click()} disabled={!databaseReady || archiveBusy}><Upload size={15} /> JSON-Archiv öffnen</button>
            </div>
            <p className="welcome-local-note"><span className="welcome-local-mark" aria-hidden="true">✓</span><span><strong>Privat und lokal</strong>Fälle bleiben in diesem Browser. Mit einem JSON-Archiv kannst du sie sichern und auf ein anderes Gerät übertragen.</span></p>
          </section>
          <aside className="welcome-recent" aria-labelledby="welcome-recent-title">
            <div className="welcome-recent-heading"><div><p className="eyebrow">Deine Fälle</p><h2 id="welcome-recent-title">Zuletzt verwendet</h2></div><FolderOpen size={19} aria-hidden="true" /></div>
            {genograms.length > 0 ? <div className="welcome-case-list">{genograms.map((genogram) => <button type="button" className="welcome-case-item" key={genogram.id} onClick={() => setSelectedId(genogram.id)}>
              <span className="welcome-case-copy"><strong>{genogram.title}</strong><small>{genogram.personCount} {genogram.personCount === 1 ? 'Person' : 'Personen'} · {formatDateTime(genogram.createdAt)}</small></span><ArrowRight size={16} aria-hidden="true" />
            </button>)}</div> : <p className="welcome-no-cases">Hier erscheinen deine lokal gespeicherten Genogramme. Du kannst jederzeit ein neues anlegen oder ein Archiv öffnen.</p>}
          </aside>
        </main>
      )}

      {genograms.length > 0 && selectedId && (
        <div className="saved-layout">
          <div className="case-detail" aria-live="polite">
            {loading && (!selected || selected.summary.id !== selectedId) && <p className="empty-state">Fall wird geladen …</p>}
            {selected && selected.summary.id === selectedId && (
              <GenogramView
                key={selected.summary.id}
                genogram={selected}
                database={database}
                viewMenuHost={viewMenuHost}
                onRenamed={(title) => {
                  setSelected((current) => current?.summary.id === selected.summary.id
                    ? { ...current, summary: { ...current.summary, title } } : current);
                  setGenograms((current) => current.map((item) => item.id === selected.summary.id ? { ...item, title } : item));
                  recordDatasetChange(selected.summary.id);
                }}
                onDataChanged={() => {
                  recordDatasetChange(selected.summary.id);
                  setDetailRevision((current) => current + 1);
                }}
              />
            )}
          </div>
        </div>
      )}

      <footer className="workspace-footer" aria-label="Kennzahlen zum ausgewählten Fall">
        {selected ? <>
          <span className="footer-case-title">{selected.summary.title}</span>
          <div className="case-metrics">
            <div><strong>{selected.summary.personCount}</strong><span>Personen</span></div>
            <div><strong>{selected.summary.partnershipCount}</strong><span>Partnerschaften</span></div>
            <div><strong>{selected.summary.parentChildLinkCount}</strong><span>Eltern-Kind-Verbindungen</span></div>
          </div>
          <span className="footer-local-note">Lokal gespeichert</span>
          {pendingChanges > 0 && <button type="button" className="pending-changes-badge" onClick={() => { setArchiveError(null); setExportDialogOpen(true); }} aria-label={`${pendingChanges} ${pendingChanges === 1 ? 'Änderung' : 'Änderungen'} noch nicht als JSON gesichert. JSON-Export öffnen`}>
            <span className="pending-changes-dot" aria-hidden="true" />{pendingChanges} {pendingChanges === 1 ? 'Änderung' : 'Änderungen'} noch nicht gesichert
          </button>}
        </> : <span className="footer-local-note">Keine Familiendaten werden an einen Anwendungsserver übertragen.</span>}
      </footer>

      {exportDialogOpen && selected && (
        <div className="editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !archiveBusy) setExportDialogOpen(false); }}>
          <section className="json-export-dialog" role="dialog" aria-modal="true" aria-labelledby="json-export-title">
            <header className="node-editor-heading dialog-header">
              <div><p className="eyebrow">Datensicherung</p><h3 id="json-export-title">JSON-Archiv exportieren</h3></div>
              <button type="button" className="icon-button" onClick={() => setExportDialogOpen(false)} disabled={archiveBusy} aria-label="Exportdialog schließen">×</button>
            </header>
            <div className="dialog-body">
              <p>Der Fall <strong>{selected.summary.title}</strong> wird als JSON-Datei heruntergeladen. Das Archiv enthält alle Personen und Beziehungen und kann später wieder importiert werden.</p>
              {pendingChanges > 0 && <p className="export-pending-note">Damit sicherst du {pendingChanges} {pendingChanges === 1 ? 'Änderung' : 'Änderungen'} seit dem letzten JSON-Export.</p>}
              <p className="archive-security-note">Die JSON-Datei enthält Familiendaten unverschlüsselt. Bewahre sie nur an einem geschützten Ort auf.</p>
              {archiveError && <p className="inline-error" role="alert">{archiveError}</p>}
            </div>
            <footer className="dialog-footer">
              <button type="button" className="secondary-button" onClick={() => setExportDialogOpen(false)} disabled={archiveBusy}>Abbrechen</button>
              <button type="button" className="primary-button" onClick={exportSelected} disabled={!databaseReady || !selectedId || archiveBusy}>{archiveBusy ? 'JSON wird erstellt …' : 'JSON herunterladen'}</button>
            </footer>
          </section>
        </div>
      )}

      {deleteTarget && (
        <div className="editor-backdrop">
          <section className="delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-case-title" aria-describedby="delete-case-warning">
            <header className="node-editor-heading dialog-header">
              <div>
                <p className="eyebrow">Fall löschen</p>
                <h3 id="delete-case-title">„{deleteTarget.title}“ endgültig löschen?</h3>
              </div>
              <button type="button" className="icon-button" onClick={() => setDeleteTarget(null)} disabled={deleteBusy} aria-label="Löschbestätigung schließen">×</button>
            </header>
            <div className="dialog-body">
              <dl className="delete-case-details">
                <div><dt>Angelegt</dt><dd>{formatDateTime(deleteTarget.createdAt)}</dd></div>
                <div><dt>Umfang</dt><dd>{deleteTarget.personCount} Personen · {deleteTarget.partnershipCount} Partnerschaften · {deleteTarget.parentChildLinkCount} Eltern-Kind-Verbindungen</dd></div>
              </dl>
              <p id="delete-case-warning" className="delete-warning">Dieser Fall und alle zugehörigen Personen und Beziehungen werden aus diesem Browser gelöscht. Diese Aktion kann nicht rückgängig gemacht werden. Andere Fälle bleiben erhalten.</p>
              {deleteError && <p className="inline-error" role="alert">{deleteError}</p>}
            </div>
            <footer className="editor-actions dialog-footer">
              <button type="button" className="secondary-button" onClick={() => setDeleteTarget(null)} disabled={deleteBusy}>Abbrechen</button>
              <button type="button" className="danger-button" disabled={deleteBusy || !databaseReady || !database} onClick={async () => {
                if (!database) return;
                setDeleteBusy(true);
                setDeleteError(null);
                try {
                  await database.deleteGenogram(deleteTarget.id);
                  setDeleteTarget(null);
                  onCaseDeleted();
                } catch {
                  setDeleteError('Der Fall konnte nicht gelöscht werden. Es wurden keine anderen Fälle ausgewählt.');
                } finally {
                  setDeleteBusy(false);
                }
              }}>{deleteBusy ? 'Löscht …' : 'Diesen Fall endgültig löschen'}</button>
            </footer>
          </section>
        </div>
      )}

      {newGenogramOpen && <CreateGenogramDialog
        database={database}
        onCancel={() => setNewGenogramOpen(false)}
        onCreated={handleGenogramCreated}
      />}
    </section>
  );
}

function GenogramView({
  genogram,
  database,
  viewMenuHost,
  onRenamed,
  onDataChanged,
}: {
  genogram: GenogramDetail;
  database: LocalDatabaseClient | null;
  viewMenuHost: HTMLDivElement | null;
  onRenamed: (title: string) => void;
  onDataChanged: () => void;
}) {
  const [initialPreferences] = useState<GenogramViewPreferences>(() => readViewPreferences(genogram.summary.id));
  const baseTree = useMemo(() => buildFamilyTree(genogram), [genogram]);
  const [childOrder, setChildOrder] = useState(initialPreferences.childOrder);
  const tree = useMemo(() => applyChildOrder(baseTree, childOrder), [baseTree, childOrder]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState(genogram.summary.title);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);
  const [appearance, setAppearance] = useState<GenogramAppearance>(() => readGenogramAppearance(genogram.summary.id));
  const [appearanceTarget, setAppearanceTarget] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<ViewOrientation>(initialPreferences.orientation);
  const [wrapChildren, setWrapChildren] = useState(initialPreferences.wrapChildren);
  const [stackTerminalChildren, setStackTerminalChildren] = useState(initialPreferences.stackTerminalChildren);
  const [generationGap, setGenerationGap] = useState(initialPreferences.generationGap);
  const [hideLastNames, setHideLastNames] = useState(initialPreferences.hideLastNames);
  const [showGenerationCohorts, setShowGenerationCohorts] = useState(initialPreferences.showGenerationCohorts);
  const [generationCohorts, setGenerationCohorts] = useState(initialPreferences.generationCohorts);
  const [generationDialogOpen, setGenerationDialogOpen] = useState(false);
  const [collapsedGenogramNodes, setCollapsedGenogramNodes] = useState(() => initialPreferences.collapsedGenogramNodes);
  const [zoomByView, setZoomByView] = useState(initialPreferences.zoom);
  const zoom = zoomByView[orientation];
  const setZoom = (value: number | ((current: number) => number)) => {
    setZoomByView((current) => ({
      ...current,
      [orientation]: Math.min(1.25, Math.max(0.05, typeof value === 'function' ? value(current[orientation]) : value)),
    }));
  };
  const [connectors, setConnectors] = useState<{ width: number; height: number; paths: Array<{ d: string; relationshipType?: string }> }>({ width: 0, height: 0, paths: [] });
  const treeRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number; dragged: boolean } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const suppressPanClickRef = useRef(false);
  const [canvasContextMenu, setCanvasContextMenu] = useState<{ x: number; y: number; nodeId?: string; personId?: string; parentIds?: string[]; deleteRootIds?: string[]; orderGroupId?: string; timeline?: boolean } | null>(null);
  const canvasContextMenuRef = useRef<HTMLDivElement>(null);
  const [contextEditGroup, setContextEditGroup] = useState<FamilyTreeGroup | null>(null);
  const [addingMember, setAddingMember] = useState<{ kind: 'child' | 'partner'; personId?: string; parentIds: string[]; nodeId: string } | null>(null);
  const [branchDeleteTarget, setBranchDeleteTarget] = useState<{ rootPersonIds: string[]; label: string; peopleCount: number; descendantCount: number; partnershipsCount: number; linksCount: number } | null>(null);
  const [branchDeleteBusy, setBranchDeleteBusy] = useState(false);
  const [branchDeleteError, setBranchDeleteError] = useState<string | null>(null);
  useEffect(() => {
    setSelectedNodeId(null);
    setAppearance(readGenogramAppearance(genogram.summary.id));
  }, [genogram.summary.id]);

  useEffect(() => setTitleDraft(genogram.summary.title), [genogram.summary.title]);

  async function saveGenogramTitle(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = titleDraft.trim();
    if (!database || !title || title.length > 200) {
      setRenameError(!title ? 'Bitte gib einen Namen ein.' : 'Der Name darf höchstens 200 Zeichen lang sein.');
      return;
    }
    setRenameBusy(true);
    setRenameError(null);
    try {
      await database.renameGenogram(genogram.summary.id, title);
      onRenamed(title);
      setIsRenaming(false);
    } catch {
      setRenameError('Der Name konnte nicht gespeichert werden.');
    } finally {
      setRenameBusy(false);
    }
  }

  useEffect(() => {
    writeGenogramAppearance(genogram.summary.id, appearance);
  }, [genogram.summary.id, appearance]);

  function applyAppearance(color: string, scope: 'person' | 'descendants', frameBranch: boolean) {
    if (!appearanceTarget) return;
    const affected = new Set([appearanceTarget]);
    if (scope === 'descendants') {
      const childrenByParent = new Map<string, string[]>();
      genogram.parentChildLinks.forEach((link) => {
        const children = childrenByParent.get(link.parentId) ?? [];
        children.push(link.childId);
        childrenByParent.set(link.parentId, children);
      });
      const pending = [appearanceTarget];
      while (pending.length) {
        const parentId = pending.pop()!;
        for (const childId of childrenByParent.get(parentId) ?? []) {
          if (affected.has(childId)) continue;
          affected.add(childId);
          pending.push(childId);
        }
      }
    }
    setAppearance((current) => {
      const personColors = { ...current.personColors };
      affected.forEach((id) => { if (color) personColors[id] = color; else delete personColors[id]; });
      const branchColors = { ...current.branchColors };
      if (frameBranch && color) branchColors[appearanceTarget] = color;
      else delete branchColors[appearanceTarget];
      return { personColors, branchColors };
    });
    setAppearanceTarget(null);
  }

  useEffect(() => {
    if (!canvasContextMenu) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!canvasContextMenuRef.current?.contains(event.target as Node)) setCanvasContextMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCanvasContextMenu(null);
    };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [canvasContextMenu]);

  useEffect(() => {
    const latest = readViewPreferences(genogram.summary.id);
    writeViewPreferences(genogram.summary.id, {
      orientation,
      zoom: zoomByView,
      wrapChildren,
      stackTerminalChildren,
      generationGap,
      hideLastNames,
      showGenerationCohorts,
      generationCohorts,
      collapsedGenogramNodes,
      childOrder,
      scroll: latest.scroll,
    });
  }, [genogram.summary.id, orientation, zoomByView, wrapChildren, stackTerminalChildren, generationGap, hideLastNames, showGenerationCohorts, generationCohorts, collapsedGenogramNodes, childOrder]);

  useLayoutEffect(() => {
    const viewport = treeRef.current;
    if (!viewport) return;
    const position = readViewPreferences(genogram.summary.id).scroll[orientation];
    viewport.scrollLeft = position.left;
    viewport.scrollTop = position.top;
  }, [genogram.summary.id, orientation]);

  useEffect(() => {
    const viewport = treeRef.current;
    if (!viewport) return;
    let timeout: number | undefined;
    const persistScroll = () => {
      const latest = readViewPreferences(genogram.summary.id);
      latest.scroll[orientation] = { left: viewport.scrollLeft, top: viewport.scrollTop };
      writeViewPreferences(genogram.summary.id, latest);
    };
    const saveScroll = () => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(persistScroll, 120);
    };
    viewport.addEventListener('scroll', saveScroll, { passive: true });
    window.addEventListener('pagehide', persistScroll);
    return () => {
      window.clearTimeout(timeout);
      viewport.removeEventListener('scroll', saveScroll);
      window.removeEventListener('pagehide', persistScroll);
      persistScroll();
    };
  }, [genogram.summary.id, orientation]);

  useLayoutEffect(() => {
    if (orientation !== 'vertical' && orientation !== 'genogram') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let frame = 0;
    const refresh = () => {
      const canvasRect = canvas.getBoundingClientRect();
      const width = Math.max(1, canvasRect.width / zoom);
      const height = Math.max(1, canvasRect.height / zoom);
      const paths: Array<{ d: string; relationshipType?: string }> = [];
      const toCanvas = (value: number, origin: number) => (value - origin) / zoom;

      if (orientation === 'genogram') {
        canvas.querySelectorAll<HTMLDetailsElement>('.genogram-family[open]').forEach((group) => {
          if (hasClosedGenogramAncestor(group, canvas)) return;
          const summary = group.querySelector<HTMLElement>(':scope > summary');
          const children = group.querySelector<HTMLElement>(':scope > .genogram-children');
          if (!summary || !children) return;
          const unionLabel = summary.querySelector<HTMLElement>(':scope > .genogram-union-label');
          const partnerIds = (group.dataset.partnerIds ?? '').split(',').filter(Boolean);

          Array.from(children.children).forEach((branch) => {
            if (!(branch instanceof HTMLElement)) return;
            const childCard = branch.querySelector<HTMLElement>(
              ':scope > .genogram-family > summary > .genogram-person, :scope > .genogram-person',
            );
            if (!childCard || hasClosedGenogramAncestor(childCard, canvas)) return;
            const rect = childCard.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;
            const linkedParentIds = (branch.dataset.parentIds ?? '').split(',').filter(Boolean);
            const linkedParents = partnerIds.filter((id) => linkedParentIds.includes(id));
            if (linkedParents.length === 0) return;
            const coupleSource = Boolean(unionLabel && partnerIds.length > 1 && linkedParents.length === partnerIds.length);
            let parentTypes: Record<string, string> = {};
            try { parentTypes = JSON.parse(branch.dataset.parentTypes ?? '{}') as Record<string, string>; } catch { /* use unspecified relationship */ }
            const linkTypes = linkedParentIds.filter((id) => linkedParents.includes(id)).map((id) => parentTypes[id] ?? 'unspecified');
            const sameType = linkTypes.length > 0 && linkTypes.every((type) => type === linkTypes[0]);
            const centralCoupleLine = coupleSource && sameType;
            const sources = centralCoupleLine
              ? [{ element: unionLabel!, relationshipType: linkTypes[0] ?? 'unspecified' }]
              : linkedParents.map((id) => ({
                  element: summary.querySelector<HTMLElement>(`:scope > .genogram-person[data-person-id="${CSS.escape(id)}"]`),
                  relationshipType: parentTypes[id] ?? 'unspecified',
                })).filter((source): source is { element: HTMLElement; relationshipType: string } => Boolean(source.element));
            const targetX = toCanvas(rect.left + rect.width / 2, canvasRect.left);
            const targetY = toCanvas(rect.top, canvasRect.top);
            for (const source of sources) {
              const sourceRect = source.element.getBoundingClientRect();
              if (sourceRect.width === 0 || sourceRect.height === 0) continue;
              const sourceX = toCanvas(sourceRect.left + sourceRect.width / 2, canvasRect.left);
              const sourceY = toCanvas(sourceRect.bottom, canvasRect.top);
              const curve = Math.max(20, (targetY - sourceY) * 0.45);
              paths.push({
                d: `M ${sourceX} ${sourceY} C ${sourceX} ${sourceY + curve}, ${targetX} ${targetY - curve}, ${targetX} ${targetY}`,
                relationshipType: source.relationshipType,
              });
            }
          });
        });
      } else canvas.querySelectorAll<HTMLDetailsElement>('details[data-node-id][open]').forEach((group) => {
        const parentSummary = group.querySelector<HTMLElement>(':scope > summary');
        const childList = group.querySelector<HTMLElement>(':scope > .family-group-content > .children-branch > .children-list');
        if (!parentSummary || !childList) return;
        const parentRect = parentSummary.getBoundingClientRect();
        const parentX = toCanvas(parentRect.left + parentRect.width / 2, canvasRect.left);
        const parentBottom = toCanvas(parentRect.bottom, canvasRect.top);
        const rows = new Map<number, Array<{ x: number; top: number }>>();

        Array.from(childList.children).filter((child) => child instanceof HTMLElement && child.classList.contains('person-branch')).forEach((branch) => {
          branch.querySelectorAll<HTMLElement>(':scope > .family-group > summary, :scope > .person-summary').forEach((target) => {
            const rect = target.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;
            const row = Math.round(rect.top / 4) * 4;
            const rowTargets = rows.get(row) ?? [];
            rowTargets.push({ x: toCanvas(rect.left + rect.width / 2, canvasRect.left), top: toCanvas(rect.top, canvasRect.top) });
            rows.set(row, rowTargets);
          });
        });

        for (const targets of rows.values()) {
          if (targets.length === 0) continue;
          const centers = targets.map((target) => target.x).sort((a, b) => a - b);
          const first = targets[0];
          if (!first) continue;
          const busY = Math.max(parentBottom + 12, first.top - 9);
          const firstX = centers[0];
          const lastX = centers[centers.length - 1];
          paths.push({ d: `M ${parentX} ${parentBottom} V ${busY} H ${firstX} H ${lastX}` });
          targets.forEach((target) => paths.push({ d: `M ${target.x} ${busY} V ${target.top}` }));
        }
      });

      setConnectors((current) => {
        const next = { width, height, paths };
        return current.width === width && current.height === height && JSON.stringify(current.paths) === JSON.stringify(paths) ? current : next;
      });
    };
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(refresh);
    };
    const mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(canvas, { subtree: true, attributes: true, attributeFilter: ['open'] });
    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(canvas);
    canvas.querySelectorAll<HTMLElement>('summary, .person-summary, .genogram-person').forEach((node) => resizeObserver.observe(node));
    canvas.addEventListener('toggle', schedule, true);
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      window.cancelAnimationFrame(frame);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      canvas.removeEventListener('toggle', schedule, true);
      window.removeEventListener('resize', schedule);
    };
  }, [orientation, zoom, wrapChildren, stackTerminalChildren, generationGap, tree]);

  function setTreeExpansion(expanded: boolean, anchorId: string | null) {
    const root = treeRef.current;
    if (!root) return;
    const nodes = Array.from(root.querySelectorAll<HTMLDetailsElement>('details[data-node-id]'));
    const anchor = anchorId ? nodes.find((node) => node.dataset.nodeId === anchorId) : undefined;
    if (anchorId && !anchor) return;
    const affected = anchor
      ? [anchor, ...anchor.querySelectorAll<HTMLDetailsElement>('details[data-node-id]')]
      : nodes;
    affected.forEach((node) => { node.open = expanded; });
    if (orientation === 'genogram') {
      setCollapsedGenogramNodes(nodes.filter((node) => !node.open).map((node) => node.dataset.nodeId!).filter(Boolean));
    }
  }

  function fitWholeTree() {
    setTreeExpansion(true, null);
    setZoom(1);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const viewport = treeRef.current;
      const canvas = canvasRef.current;
      if (!viewport || !canvas) return;
      const width = canvas.scrollWidth;
      const height = canvas.scrollHeight;
      if (width === 0 || height === 0) return;
      const fit = Math.min(viewport.clientWidth / width, viewport.clientHeight / height, 1);
      setZoom(Math.max(0.05, fit));
    }));
  }

  function zoomWithWheel(event: React.WheelEvent<HTMLDivElement>) {
    if ((orientation !== 'genogram' && orientation !== 'timeline') || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const viewport = treeRef.current;
    if (!viewport) return;

    const rect = viewport.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const canvasX = (viewport.scrollLeft + pointerX) / zoom;
    const canvasY = (viewport.scrollTop + pointerY) / zoom;
    const nextZoom = Math.min(1.25, Math.max(0.05, zoom * Math.exp(-event.deltaY * 0.0015)));
    if (nextZoom === zoom) return;

    setZoom(nextZoom);
    window.requestAnimationFrame(() => {
      const currentViewport = treeRef.current;
      if (!currentViewport) return;
      currentViewport.scrollLeft = canvasX * nextZoom - pointerX;
      currentViewport.scrollTop = canvasY * nextZoom - pointerY;
    });
  }

  function startPan(event: React.PointerEvent<HTMLDivElement>) {
    if ((orientation !== 'genogram' && orientation !== 'timeline') || event.button !== 0 || event.pointerType === 'touch') return;
    if (event.target instanceof Element && event.target.closest('a, input, select, textarea, .genogram-legend')) return;
    const viewport = treeRef.current;
    if (!viewport) return;
    panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop, dragged: false };
  }

  function movePan(event: React.PointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    const viewport = treeRef.current;
    if (!pan || pan.pointerId !== event.pointerId || !viewport) return;
    const deltaX = event.clientX - pan.x;
    const deltaY = event.clientY - pan.y;
    if (!pan.dragged) {
      if (Math.hypot(deltaX, deltaY) < 4) return;
      pan.dragged = true;
      suppressPanClickRef.current = true;
      viewport.setPointerCapture(event.pointerId);
      setIsPanning(true);
      event.preventDefault();
    }
    viewport.scrollLeft = pan.left - deltaX;
    viewport.scrollTop = pan.top - deltaY;
  }

  function stopPan(event: React.PointerEvent<HTMLDivElement>) {
    if (!panRef.current || panRef.current.pointerId !== event.pointerId) return;
    const dragged = panRef.current.dragged;
    panRef.current = null;
    setIsPanning(false);
    if (treeRef.current?.hasPointerCapture(event.pointerId)) treeRef.current.releasePointerCapture(event.pointerId);
    if (dragged) window.setTimeout(() => { suppressPanClickRef.current = false; }, 0);
  }

  function moveChildInOrder(groupId: string, childId: string, delta: -1 | 1) {
    const group = findTreeGroup(tree, groupId);
    if (!group) return;
    const ids = group.children.map((child) => child.person.id);
    const index = ids.indexOf(childId);
    const nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || nextIndex >= ids.length) return;
    [ids[index], ids[nextIndex]] = [ids[nextIndex]!, ids[index]!];
    setChildOrder((current) => ({ ...current, [groupId]: ids }));
    setCanvasContextMenu(null);
  }

  const contextOrderGroup = canvasContextMenu?.orderGroupId ? findTreeGroup(tree, canvasContextMenu.orderGroupId) : null;
  const contextOrderIds = contextOrderGroup?.children.map((child) => child.person.id) ?? [];
  const contextOrderIndex = canvasContextMenu?.personId ? contextOrderIds.indexOf(canvasContextMenu.personId) : -1;

  return (
    <>
      {viewMenuHost && createPortal(
        <ViewMenu
          host={viewMenuHost}
          orientation={orientation}
          onOrientationChange={setOrientation}
          wrapChildren={wrapChildren}
          onWrapChildrenChange={setWrapChildren}
          stackTerminalChildren={stackTerminalChildren}
          onStackTerminalChildrenChange={setStackTerminalChildren}
          generationGap={generationGap}
          onGenerationGapChange={setGenerationGap}
          hideLastNames={hideLastNames}
          onHideLastNamesChange={setHideLastNames}
          showGenerationCohorts={showGenerationCohorts}
          onShowGenerationCohortsChange={setShowGenerationCohorts}
          onOpenGenerationDialog={() => setGenerationDialogOpen(true)}
          zoomPercent={Math.round(zoom * 100)}
          onZoomChange={(percent) => setZoom(percent / 100)}
          onFitWholeTree={fitWholeTree}
          onResetZoom={() => setZoom(1)}
          canApplyToSelection={selectedNodeId !== null}
          onExpandAll={() => setTreeExpansion(true, null)}
          onCollapseAll={() => setTreeExpansion(false, null)}
          onExpandFromSelection={() => selectedNodeId && setTreeExpansion(true, selectedNodeId)}
          onCollapseFromSelection={() => selectedNodeId && setTreeExpansion(false, selectedNodeId)}
        />,
        viewMenuHost,
      )}
      <div className="tree-heading">
        <div>
          {isRenaming ? <form className="genogram-title-edit" onSubmit={saveGenogramTitle}>
            <input autoFocus aria-label="Name des Genogramms" maxLength={200} value={titleDraft} onChange={(event) => setTitleDraft(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === 'Escape') { setTitleDraft(genogram.summary.title); setRenameError(null); setIsRenaming(false); } }} />
            <button type="submit" className="title-action-button is-save" disabled={renameBusy || !titleDraft.trim()} aria-label="Namen speichern" title="Speichern"><Check size={16} /></button>
            <button type="button" className="title-action-button" disabled={renameBusy} onClick={() => { setTitleDraft(genogram.summary.title); setRenameError(null); setIsRenaming(false); }} aria-label="Umbenennen abbrechen" title="Abbrechen"><X size={16} /></button>
            {renameError && <span className="genogram-title-error" role="alert">{renameError}</span>}
          </form> : <div className="genogram-title-row">
            <h3>{genogram.summary.title}</h3>
            <button type="button" className="title-action-button genogram-title-edit-button" onClick={() => { setTitleDraft(genogram.summary.title); setRenameError(null); setIsRenaming(true); }} aria-label="Genogramm umbenennen" title="Genogramm umbenennen"><Pencil size={14} /></button>
          </div>}
          <p>Familienstruktur · Äste mit dem Pfeil auf- und zuklappen · importiert {formatDateTime(genogram.summary.createdAt)}</p>
        </div>
        <div className="workspace-tools">
          <span className="tree-key"><span className="key-person" /> Person <span className="key-line" /> Beziehung</span>
          <button type="button" className="secondary-button genogram-print-button" onClick={() => setPrintDialogOpen(true)}><Printer size={15} /> PDF exportieren</button>
        </div>
      </div>
      {generationDialogOpen && <GenerationCohortDialog cohorts={generationCohorts} onClose={() => setGenerationDialogOpen(false)} onSave={(next) => { setGenerationCohorts(next); setGenerationDialogOpen(false); }} />}
      {printDialogOpen && <GenogramPrintDialog genogram={genogram} tree={tree} appearance={appearance} hideLastNames={hideLastNames} showGenerationCohorts={showGenerationCohorts} generationCohorts={generationCohorts} generationGap={generationGap} onClose={() => setPrintDialogOpen(false)} />}
      {tree.length === 0 ? (
        <p className="empty-state">In diesem Fall wurden keine darstellbaren Personen gefunden.</p>
      ) : (
        orientation === 'genogram' ? (
          <>
          <div className={`family-tree genogram-viewport${isPanning ? ' is-panning' : ''}`} aria-label="Genogramm" ref={treeRef}
            onPointerDown={startPan} onPointerMove={movePan} onPointerUp={stopPan} onPointerCancel={stopPan}
            onWheel={zoomWithWheel}
            onContextMenu={(event) => {
              event.preventDefault();
              const target = event.target instanceof Element ? event.target : null;
              const personCard = target?.closest('.genogram-person');
              // A standalone leaf sits inside its parent's <details>, but is
              // not a member of that couple node. Only cards inside a union
              // summary belong to that details node.
              const node = personCard?.closest('.genogram-union')?.closest<HTMLDetailsElement>('.genogram-family[data-node-id]');
              const branch = personCard?.closest<HTMLElement>('.genogram-person-branch');
              const personId = personCard?.getAttribute('data-person-id') ?? branch?.dataset.childId;
              const nodeId = node?.dataset.nodeId ?? (personId ? `solo-${personId}` : undefined);
              const parentIds = (node?.dataset.partnerIds ?? (personId ? personId : '')).split(',').filter(Boolean);
              const orderGroupId = branch?.dataset.parentGroupId;
              setCanvasContextMenu({
                x: Math.max(8, Math.min(event.clientX, window.innerWidth - 268)),
                y: Math.max(8, Math.min(event.clientY, window.innerHeight - 380)),
                ...(nodeId && personId ? { nodeId, personId, parentIds, ...(orderGroupId ? { orderGroupId } : {}) } : {}),
              });
            }}
            onClickCapture={(event) => {
              if (!suppressPanClickRef.current) return;
              suppressPanClickRef.current = false;
              event.preventDefault();
              event.stopPropagation();
            }}>
            <div className="genogram-canvas" style={{ zoom, '--generation-gap': `${generationGap}px` } as React.CSSProperties} ref={canvasRef}>
              {connectors.paths.length > 0 && <svg
                className="tree-connectors genogram-connectors"
                aria-hidden="true"
                width={connectors.width}
                height={connectors.height}
                viewBox={`0 0 ${connectors.width} ${connectors.height}`}
                preserveAspectRatio="none"
              >
                {connectors.paths.map((path, index) => <path key={index} d={path.d} className={`parentage-${path.relationshipType ?? 'unspecified'}`} />)}
              </svg>}
              {tree.map((group) => <GenogramGroupView key={group.id} group={group} hideLastNames={hideLastNames} collapsedNodes={collapsedGenogramNodes} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} appearance={appearance} showGenerationCohorts={showGenerationCohorts} generationCohorts={generationCohorts} onNodeToggle={(id, open) => {
                setCollapsedGenogramNodes((current) => open ? current.filter((nodeId) => nodeId !== id) : current.includes(id) ? current : [...current, id]);
              }} genogramId={genogram.summary.id} database={database} onDataChanged={onDataChanged} />)}
              <div className="genogram-legend" aria-label="Legende">
                <strong>Legende</strong>
                <span><i className="genogram-person-card unknown" aria-hidden="true">?</i> Symbol unbekannt</span>
                <span><i className="genogram-person-card female" aria-hidden="true" /> Weiblich</span>
                <span><i className="genogram-person-card male" aria-hidden="true" /> Männlich</span>
                <span><i className="genogram-person-card nonbinary" aria-hidden="true" /> Nicht-binär</span>
                <span><i className="genogram-legend-line" aria-hidden="true" /> Partnerschaft</span>
                <span><i className="genogram-legend-line" aria-hidden="true" /> Biologische / ungeklärte Elternschaft</span>
                <span><i className="genogram-legend-line genogram-legend-dashed" aria-hidden="true" /> Adoptiv- oder Stiefelternschaft</span>
                <span><i className="genogram-legend-line genogram-legend-dotted" aria-hidden="true" /> Pflege- oder soziale Elternschaft</span>
                {showGenerationCohorts && generationCohorts.length > 0 && <div className="genogram-generation-legend">
                  <strong>Generationen (Geburtsjahre)</strong>
                  {generationCohorts.map((cohort, index) => <span key={cohort.id}><i className="genogram-generation-swatch" style={{ backgroundColor: cohortColors[index % cohortColors.length] }} aria-hidden="true" />{cohort.name} · {cohort.fromYear}–{cohort.toYear}</span>)}
                </div>}
                <small>Geschlecht, biologische Elternschaft und nicht dokumentierte Beziehungsdetails werden nicht abgeleitet.</small>
              </div>
            </div>
          </div>
          {canvasContextMenu && createPortal(
            <div className="canvas-context-menu" role="menu" aria-label={canvasContextMenu.nodeId ? 'Knoten' : 'Genogramm-Arbeitsfläche'} ref={canvasContextMenuRef} style={{ left: canvasContextMenu.x, top: canvasContextMenu.y }}>
              <div className="canvas-context-menu-heading">{canvasContextMenu.nodeId ? 'Knoten' : 'Arbeitsfläche'}</div>
              {canvasContextMenu.nodeId && canvasContextMenu.personId && <button type="button" className="canvas-context-item" role="menuitem" onClick={() => {
                const findGroup = (groups: FamilyTreeGroup[], id: string): FamilyTreeGroup | null => {
                  for (const group of groups) {
                    if (group.id === id) return group;
                    const nested = findGroup(group.children.flatMap((child) => child.unions), id);
                    if (nested) return nested;
                  }
                  return null;
                };
                const person = genogram.people.find((item) => item.id === canvasContextMenu.personId);
                const group = findGroup(tree, canvasContextMenu.nodeId!) ?? (person ? { id: person.id, partnership: null, partners: [person], children: [] } : null);
                setContextEditGroup(group);
                setCanvasContextMenu(null);
              }}><span className="canvas-context-icon" aria-hidden="true"><Pencil size={16} strokeWidth={1.8} /></span><span>Bearbeiten</span></button>}
              {canvasContextMenu.nodeId && canvasContextMenu.personId && <>
                <button type="button" className="canvas-context-item" role="menuitem" onClick={() => { setAddingMember({ kind: 'child', parentIds: canvasContextMenu.parentIds ?? [], nodeId: canvasContextMenu.nodeId! }); setCanvasContextMenu(null); }}><span className="canvas-context-icon" aria-hidden="true"><Baby size={16} strokeWidth={1.8} /></span><span>Kind hinzufügen</span></button>
                {!genogram.partnerships.some((partnership) => partnership.personAId === canvasContextMenu.personId || partnership.personBId === canvasContextMenu.personId) && <button type="button" className="canvas-context-item" role="menuitem" onClick={() => { setAddingMember({ kind: 'partner', personId: canvasContextMenu.personId!, parentIds: [canvasContextMenu.personId!], nodeId: canvasContextMenu.nodeId! }); setCanvasContextMenu(null); }}><span className="canvas-context-icon" aria-hidden="true"><Heart size={16} strokeWidth={1.8} /></span><span>Partner hinzufügen</span></button>}
                <span className="canvas-context-menu-separator" />
              </>}
              {canvasContextMenu.personId && canvasContextMenu.orderGroupId && contextOrderIds.length > 1 && <>
                <button type="button" className="canvas-context-item" role="menuitem" disabled={contextOrderIndex <= 0} onClick={() => moveChildInOrder(canvasContextMenu.orderGroupId!, canvasContextMenu.personId!, -1)}><span className="canvas-context-icon" aria-hidden="true"><MoveLeft size={16} strokeWidth={1.8} /></span><span>Nach links verschieben</span></button>
                <button type="button" className="canvas-context-item" role="menuitem" disabled={contextOrderIndex < 0 || contextOrderIndex >= contextOrderIds.length - 1} onClick={() => moveChildInOrder(canvasContextMenu.orderGroupId!, canvasContextMenu.personId!, 1)}><span className="canvas-context-icon" aria-hidden="true"><MoveRight size={16} strokeWidth={1.8} /></span><span>Nach rechts verschieben</span></button>
                <span className="canvas-context-menu-separator" />
              </>}
              <button type="button" className="canvas-context-item" role="menuitem" onClick={() => { setTreeExpansion(true, canvasContextMenu.nodeId ?? null); setCanvasContextMenu(null); }}><span className="canvas-context-icon" aria-hidden="true"><ChevronsDown size={16} strokeWidth={1.8} /></span><span>{canvasContextMenu.nodeId ? 'Ab hier aufklappen' : 'Alles aufklappen'}</span></button>
              <button type="button" className="canvas-context-item" role="menuitem" onClick={() => { setTreeExpansion(false, canvasContextMenu.nodeId ?? null); setCanvasContextMenu(null); }}><span className="canvas-context-icon" aria-hidden="true"><ChevronsUp size={16} strokeWidth={1.8} /></span><span>{canvasContextMenu.nodeId ? 'Ab hier zuklappen' : 'Alles zuklappen'}</span></button>
              {canvasContextMenu.personId && <>
                <span className="canvas-context-menu-separator" />
                <button type="button" className="canvas-context-item" role="menuitem" onClick={() => { setAppearanceTarget(canvasContextMenu.personId!); setCanvasContextMenu(null); }}><span className="canvas-context-icon appearance-menu-swatch" aria-hidden="true" style={{ background: appearance.personColors[canvasContextMenu.personId] ?? '#ffffff' }} /><span>Gestaltung …</span></button>
              </>}
              {canvasContextMenu.nodeId && canvasContextMenu.parentIds && <>
                <span className="canvas-context-menu-separator" />
                <button type="button" className="canvas-context-item is-destructive" role="menuitem" onClick={() => {
                  const rootPersonIds = canvasContextMenu.deleteRootIds ?? canvasContextMenu.parentIds ?? [];
                  const counts = branchDeletionCounts(genogram, rootPersonIds);
                  const label = rootPersonIds.map((id) => genogram.people.find((person) => person.id === id)).filter((person): person is GenogramPerson => Boolean(person)).map(displayName).join(' + ');
                  setBranchDeleteTarget({ rootPersonIds, label, descendantCount: Math.max(0, counts.peopleCount - rootPersonIds.length), ...counts });
                  setBranchDeleteError(null);
                  setCanvasContextMenu(null);
                }}><span className="canvas-context-icon" aria-hidden="true"><Trash2 size={16} strokeWidth={1.8} /></span><span>Knoten und Kindknoten löschen</span></button>
              </>}
            </div>,
            document.body,
          )}
          {addingMember && <AddFamilyMemberDialog
            genogramId={genogram.summary.id}
            kind={addingMember.kind}
            partner={addingMember.personId ? genogram.people.find((person) => person.id === addingMember.personId) ?? null : null}
            parents={addingMember.parentIds.map((id) => genogram.people.find((person) => person.id === id)).filter((person): person is GenogramPerson => Boolean(person))}
            database={database}
            onCancel={() => setAddingMember(null)}
            onSaved={() => {
              setCollapsedGenogramNodes((current) => current.filter((id) => id !== addingMember.nodeId));
              setAddingMember(null);
              onDataChanged();
            }}
          />}
          {branchDeleteTarget && <div className="editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !branchDeleteBusy) setBranchDeleteTarget(null); }}>
            <section className="delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-branch-title" aria-describedby="delete-branch-warning">
              <header className="node-editor-heading dialog-header">
                <div><p className="eyebrow">Genogramm ändern</p><h3 id="delete-branch-title">{branchDeleteTarget.descendantCount > 0 ? 'Knoten und Kindknoten löschen?' : branchDeleteTarget.rootPersonIds.length > 1 ? 'Knoten und Partner löschen?' : 'Knoten löschen?'}</h3></div>
                <button type="button" className="icon-button" onClick={() => setBranchDeleteTarget(null)} disabled={branchDeleteBusy} aria-label="Löschen abbrechen">×</button>
              </header>
              <div className="dialog-body">
                <dl className="delete-case-details">
                  <div><dt>Ausgangspunkt</dt><dd>{branchDeleteTarget.label || 'Ausgewählter Knoten'}</dd></div>
                  <div><dt>Personen</dt><dd>{branchDeleteTarget.peopleCount}</dd></div>
                  <div><dt>Partnerschaften</dt><dd>{branchDeleteTarget.partnershipsCount}</dd></div>
                  <div><dt>Elternzuordnungen</dt><dd>{branchDeleteTarget.linksCount}</dd></div>
                </dl>
                <p id="delete-branch-warning" className="delete-warning">{branchDeleteTarget.descendantCount > 0
                  ? 'Der ausgewählte Knoten und alle von ihm abstammenden Kindknoten werden dauerhaft aus diesem Fall entfernt.'
                  : 'Für diesen Knoten sind keine Kindknoten gespeichert; gelöscht wird nur der ausgewählte Knoten und gegebenenfalls der zugehörige Partner.'} Auch zugehörige Partnerschaften und Elternzuordnungen werden entfernt, einschließlich Verbindungen zu Personen außerhalb dieses Zweigs. Diese Aktion lässt sich nicht rückgängig machen.</p>
                {branchDeleteError && <p className="inline-error" role="alert">{branchDeleteError}</p>}
              </div>
              <footer className="dialog-footer">
                <button type="button" className="secondary-button" onClick={() => setBranchDeleteTarget(null)} disabled={branchDeleteBusy}>Abbrechen</button>
                <button type="button" className="danger-button" disabled={branchDeleteBusy || !database} onClick={async () => {
                  if (!database) return;
                  setBranchDeleteBusy(true);
                  try {
                    await database.deleteFamilyBranch(genogram.summary.id, branchDeleteTarget.rootPersonIds);
                    setBranchDeleteTarget(null);
                    onDataChanged();
                  } catch {
                    setBranchDeleteError('Der Knoten-Zweig konnte nicht gelöscht werden. Der Datensatz blieb unverändert.');
                  } finally {
                    setBranchDeleteBusy(false);
                  }
                }}>{branchDeleteBusy ? 'Wird gelöscht …' : 'Zweig endgültig löschen'}</button>
              </footer>
            </section>
          </div>}
          {appearanceTarget && <AppearanceDialog
            personName={displayName(genogram.people.find((person) => person.id === appearanceTarget) ?? { id: appearanceTarget, name: 'Person', familyName: null, birthDate: null, birthDatePrecision: null, deathDate: null, deathDatePrecision: null, gender: 'unknown' })}
            initialColor={appearance.personColors[appearanceTarget] ?? appearance.branchColors[appearanceTarget] ?? ''}
            initialBranch={Boolean(appearance.branchColors[appearanceTarget])}
            onCancel={() => setAppearanceTarget(null)}
            onApply={applyAppearance}
          />}
          {contextEditGroup && <FamilyNodeEditor group={contextEditGroup} genogramId={genogram.summary.id} database={database} onCancel={() => setContextEditGroup(null)} onSaved={() => { setContextEditGroup(null); onDataChanged(); }} />}
          </>
        ) : orientation === 'timeline' ? <div className={`family-tree birth-timeline-viewport${isPanning ? ' is-panning' : ''}`} aria-label="Geburtsbasierte Zeitachse" ref={treeRef}
          onPointerDown={startPan} onPointerMove={movePan} onPointerUp={stopPan} onPointerCancel={stopPan}
          onWheel={zoomWithWheel}
          onClickCapture={(event) => {
            if (!suppressPanClickRef.current) return;
            suppressPanClickRef.current = false;
            event.preventDefault();
            event.stopPropagation();
          }}>
          <div className="birth-timeline-canvas" style={{ zoom }} ref={canvasRef}>
            <BirthTimelineView tree={tree} appearance={appearance} hideLastNames={hideLastNames} showGenerationCohorts={showGenerationCohorts} generationCohorts={generationCohorts} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} onOpenContextMenu={(menu) => setCanvasContextMenu({ ...menu, timeline: true })} genogramId={genogram.summary.id} database={database} onDataChanged={onDataChanged} />
          </div>
          {canvasContextMenu?.timeline && createPortal(
            <div className="canvas-context-menu" role="menu" aria-label="Knoten" ref={canvasContextMenuRef} style={{ left: canvasContextMenu.x, top: canvasContextMenu.y }}>
              <div className="canvas-context-menu-heading">Knoten</div>
              {canvasContextMenu.personId && <button type="button" className="canvas-context-item" role="menuitem" onClick={() => {
                const findGroup = (groups: FamilyTreeGroup[], id: string): FamilyTreeGroup | null => {
                  for (const group of groups) {
                    if (group.id === id) return group;
                    const nested = findGroup(group.children.flatMap((child) => child.unions), id);
                    if (nested) return nested;
                  }
                  return null;
                };
                const person = genogram.people.find((item) => item.id === canvasContextMenu.personId);
                const group = canvasContextMenu.nodeId ? findGroup(tree, canvasContextMenu.nodeId) : null;
                setContextEditGroup(group ?? (person ? { id: person.id, partnership: null, partners: [person], children: [] } : null));
                setCanvasContextMenu(null);
              }}><span className="canvas-context-icon" aria-hidden="true"><Pencil size={16} strokeWidth={1.8} /></span><span>Bearbeiten</span></button>}
              {canvasContextMenu.personId && <>
                <button type="button" className="canvas-context-item" role="menuitem" onClick={() => { setAddingMember({ kind: 'child', parentIds: canvasContextMenu.parentIds ?? [canvasContextMenu.personId!], nodeId: canvasContextMenu.nodeId ?? `solo-${canvasContextMenu.personId}` }); setCanvasContextMenu(null); }}><span className="canvas-context-icon" aria-hidden="true"><Baby size={16} strokeWidth={1.8} /></span><span>Kind hinzufügen</span></button>
                {!genogram.partnerships.some((partnership) => partnership.personAId === canvasContextMenu.personId || partnership.personBId === canvasContextMenu.personId) && <button type="button" className="canvas-context-item" role="menuitem" onClick={() => { setAddingMember({ kind: 'partner', personId: canvasContextMenu.personId!, parentIds: [canvasContextMenu.personId!], nodeId: canvasContextMenu.nodeId ?? `solo-${canvasContextMenu.personId}` }); setCanvasContextMenu(null); }}><span className="canvas-context-icon" aria-hidden="true"><Heart size={16} strokeWidth={1.8} /></span><span>Partner hinzufügen</span></button>}
                {canvasContextMenu.orderGroupId && contextOrderIds.length > 1 && <>
                  <button type="button" className="canvas-context-item" role="menuitem" disabled={contextOrderIndex <= 0} onClick={() => moveChildInOrder(canvasContextMenu.orderGroupId!, canvasContextMenu.personId!, -1)}><span className="canvas-context-icon" aria-hidden="true"><MoveLeft size={16} strokeWidth={1.8} /></span><span>Nach links verschieben</span></button>
                  <button type="button" className="canvas-context-item" role="menuitem" disabled={contextOrderIndex < 0 || contextOrderIndex >= contextOrderIds.length - 1} onClick={() => moveChildInOrder(canvasContextMenu.orderGroupId!, canvasContextMenu.personId!, 1)}><span className="canvas-context-icon" aria-hidden="true"><MoveRight size={16} strokeWidth={1.8} /></span><span>Nach rechts verschieben</span></button>
                  <span className="canvas-context-menu-separator" />
                </>}
                <span className="canvas-context-menu-separator" />
                <button type="button" className="canvas-context-item" role="menuitem" onClick={() => { setAppearanceTarget(canvasContextMenu.personId!); setCanvasContextMenu(null); }}><span className="canvas-context-icon appearance-menu-swatch" aria-hidden="true" style={{ background: appearance.personColors[canvasContextMenu.personId] ?? '#ffffff' }} /><span>Gestaltung …</span></button>
              </>}
              {canvasContextMenu.parentIds && <>
                <span className="canvas-context-menu-separator" />
                <button type="button" className="canvas-context-item is-destructive" role="menuitem" onClick={() => {
                  const rootPersonIds = canvasContextMenu.parentIds ?? [];
                  const counts = branchDeletionCounts(genogram, rootPersonIds);
                  const label = rootPersonIds.map((id) => genogram.people.find((person) => person.id === id)).filter((person): person is GenogramPerson => Boolean(person)).map(displayName).join(' + ');
                  setBranchDeleteTarget({ rootPersonIds, label, descendantCount: Math.max(0, counts.peopleCount - rootPersonIds.length), ...counts });
                  setBranchDeleteError(null);
                  setCanvasContextMenu(null);
                }}><span className="canvas-context-icon" aria-hidden="true"><Trash2 size={16} strokeWidth={1.8} /></span><span>Knoten und Kindknoten löschen</span></button>
              </>}
            </div>,
            document.body,
          )}
          {addingMember && <AddFamilyMemberDialog genogramId={genogram.summary.id} kind={addingMember.kind} partner={addingMember.personId ? genogram.people.find((person) => person.id === addingMember.personId) ?? null : null} parents={addingMember.parentIds.map((id) => genogram.people.find((person) => person.id === id)).filter((person): person is GenogramPerson => Boolean(person))} database={database} onCancel={() => setAddingMember(null)} onSaved={() => { setAddingMember(null); onDataChanged(); }} />}
          {appearanceTarget && <AppearanceDialog personName={displayName(genogram.people.find((person) => person.id === appearanceTarget) ?? { id: appearanceTarget, name: 'Person', familyName: null, birthDate: null, birthDatePrecision: null, deathDate: null, deathDatePrecision: null, gender: 'unknown' })} initialColor={appearance.personColors[appearanceTarget] ?? appearance.branchColors[appearanceTarget] ?? ''} initialBranch={Boolean(appearance.branchColors[appearanceTarget])} onCancel={() => setAppearanceTarget(null)} onApply={applyAppearance} />}
          {contextEditGroup && <FamilyNodeEditor group={contextEditGroup} genogramId={genogram.summary.id} database={database} onCancel={() => setContextEditGroup(null)} onSaved={() => { setContextEditGroup(null); onDataChanged(); }} />}
          {branchDeleteTarget && <div className="editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !branchDeleteBusy) setBranchDeleteTarget(null); }}><section className="delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="timeline-delete-title" aria-describedby="timeline-delete-warning"><header className="node-editor-heading dialog-header"><div><p className="eyebrow">Genogramm ändern</p><h3 id="timeline-delete-title">{branchDeleteTarget.descendantCount > 0 ? 'Knoten und Kindknoten löschen?' : 'Knoten löschen?'}</h3></div><button type="button" className="icon-button" onClick={() => setBranchDeleteTarget(null)} disabled={branchDeleteBusy} aria-label="Löschen abbrechen">×</button></header><div className="dialog-body"><dl className="delete-case-details"><div><dt>Ausgangspunkt</dt><dd>{branchDeleteTarget.label || 'Ausgewählter Knoten'}</dd></div><div><dt>Personen</dt><dd>{branchDeleteTarget.peopleCount}</dd></div><div><dt>Partnerschaften</dt><dd>{branchDeleteTarget.partnershipsCount}</dd></div><div><dt>Elternzuordnungen</dt><dd>{branchDeleteTarget.linksCount}</dd></div></dl><p id="timeline-delete-warning" className="delete-warning">Der ausgewählte Knoten-Zweig wird dauerhaft aus diesem Fall entfernt. Auch zugehörige Partnerschaften und Elternzuordnungen werden gelöscht. Diese Aktion lässt sich nicht rückgängig machen.</p>{branchDeleteError && <p className="inline-error" role="alert">{branchDeleteError}</p>}</div><footer className="dialog-footer"><button type="button" className="secondary-button" onClick={() => setBranchDeleteTarget(null)} disabled={branchDeleteBusy}>Abbrechen</button><button type="button" className="danger-button" disabled={branchDeleteBusy || !database} onClick={async () => { if (!database) return; setBranchDeleteBusy(true); try { await database.deleteFamilyBranch(genogram.summary.id, branchDeleteTarget.rootPersonIds); setBranchDeleteTarget(null); onDataChanged(); } catch { setBranchDeleteError('Der Knoten-Zweig konnte nicht gelöscht werden.'); } finally { setBranchDeleteBusy(false); } }}>{branchDeleteBusy ? 'Wird gelöscht …' : 'Zweig endgültig löschen'}</button></footer></section></div>}
        </div> : <div className="family-tree" aria-label="Aufklappbare Familienstruktur" ref={treeRef}>
          <div
            className={`family-tree-canvas${orientation === 'vertical' ? ' is-vertical' : ''}${wrapChildren && orientation === 'vertical' ? ' wraps-children' : ''}${stackTerminalChildren && orientation === 'vertical' ? ' stacks-terminal-children' : ''}`}
            ref={canvasRef}
            style={{ zoom }}
          >
            {orientation === 'vertical' && connectors.paths.length > 0 && (
              <svg
                className="tree-connectors"
                aria-hidden="true"
                width={connectors.width}
                height={connectors.height}
                viewBox={`0 0 ${connectors.width} ${connectors.height}`}
                preserveAspectRatio="none"
              >
                {connectors.paths.map((path, index) => <path key={index} d={path.d} className={`parentage-${path.relationshipType ?? 'unspecified'}`} />)}
              </svg>
            )}
            {tree.map((group, index) => (
              <FamilyGroup
                key={group.id}
                group={group}
                genogramId={genogram.summary.id}
                database={database}
                onDataChanged={onDataChanged}
                selectedNodeId={selectedNodeId}
                onSelectNode={setSelectedNodeId}
                onExpandFromNode={(nodeId) => setTreeExpansion(true, nodeId)}
                onCollapseFromNode={(nodeId) => setTreeExpansion(false, nodeId)}
                stackTerminalChildren={stackTerminalChildren}
                defaultOpen={index === 0}
                depth={0}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function hasClosedGenogramAncestor(element: HTMLElement, canvas: HTMLElement): boolean {
  let ancestor = element.parentElement;
  while (ancestor && ancestor !== canvas) {
    if (ancestor instanceof HTMLDetailsElement && !ancestor.open) {
      const summary = ancestor.querySelector<HTMLElement>(':scope > summary');
      // A closed <details> still displays its own summary/card. Only content
      // below that summary is hidden and must not contribute connector paths.
      if (!summary?.contains(element)) return true;
    }
    ancestor = ancestor.parentElement;
  }
  return false;
}

function GenogramGroupView({ group, hideLastNames, collapsedNodes, selectedNodeId, onSelectNode, appearance, showGenerationCohorts, generationCohorts, onNodeToggle, genogramId, database, onDataChanged }: {
  group: FamilyTreeGroup;
  hideLastNames: boolean;
  collapsedNodes: string[];
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  appearance: GenogramAppearance;
  showGenerationCohorts: boolean;
  generationCohorts: GenerationCohort[];
  onNodeToggle: (id: string, open: boolean) => void;
  genogramId: string;
  database: LocalDatabaseClient | null;
  onDataChanged: () => void;
}) {
  const hasChildren = group.children.length > 0;
  const [editing, setEditing] = useState(false);
  return (
    <>
    <details className={`genogram-family${group.partners.some((person) => appearance.branchColors[person.id]) ? ' has-branch-highlight' : ''}${selectedNodeId === group.id ? ' is-selected' : ''}`} style={branchAppearanceStyle(group.partners.map((person) => appearance.branchColors[person.id]).find(Boolean))} data-node-id={group.id} data-partner-ids={group.partners.map((person) => person.id).join(',')} open={!collapsedNodes.includes(group.id)} onToggle={(event) => onNodeToggle(group.id, event.currentTarget.open)}>
      <summary className="genogram-union" onClickCapture={(event) => {
        event.preventDefault();
        onSelectNode(group.id);
      }}>
        <span className="genogram-disclosure" aria-hidden="true" />
        {group.partners.map((person, index) => (
          <div className={`genogram-person ${genogramPersonCardClass(person.gender)}${person.deathDate ? ' deceased' : ''}`} data-person-id={person.id} key={person.id} style={{ ...personAppearanceStyle(appearance.personColors[person.id]), ...generationStyle(person.birthDate, showGenerationCohorts, generationCohorts) }}>
            {showGenerationCohorts && cohortForYear(person.birthDate, generationCohorts) && <span className="genogram-cohort-label">{cohortForYear(person.birthDate, generationCohorts)!.name}</span>}
            <button type="button" className="genogram-name-button" onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setEditing(true);
            }}>{genogramPersonName(person, hideLastNames)}</button>
            {person.birthDate && <small>geb. {formatDate(person.birthDate, person.birthDatePrecision)}</small>}
            {person.deathDate && <small>gest. {formatDate(person.deathDate, person.deathDatePrecision)}</small>}
            {index === 0 && group.partners.length > 1 && <span className="genogram-partner-line" aria-hidden="true" />}
          </div>
        ))}
        {group.partnership && (group.partnership.status === 'married' || group.partnership.startDate) && <span className="genogram-union-label" title={group.partnership.status === 'married' ? 'Eheschließung' : undefined}>
          {group.partnership.status === 'married' ? '∞' : ''}
          {group.partnership.startDate ? ` · ${formatDate(group.partnership.startDate, group.partnership.startDatePrecision)}` : ''}
        </span>}
        {hasChildren && <span className="genogram-child-count">{group.children.length} {group.children.length === 1 ? 'Kind' : 'Kinder'}</span>}
      </summary>
      {hasChildren && <div className="genogram-children">
        {group.children.map((child) => <GenogramPersonView key={child.person.id} branch={child} parentGroupId={group.id} hideLastNames={hideLastNames} collapsedNodes={collapsedNodes} selectedNodeId={selectedNodeId} onSelectNode={onSelectNode} appearance={appearance} showGenerationCohorts={showGenerationCohorts} generationCohorts={generationCohorts} onNodeToggle={onNodeToggle} genogramId={genogramId} database={database} onDataChanged={onDataChanged} />)}
      </div>}
    </details>
    {editing && <FamilyNodeEditor group={group} genogramId={genogramId} database={database} onCancel={() => setEditing(false)} onSaved={() => {
      setEditing(false);
      onDataChanged();
    }} />}
    </>
  );
}

interface BirthTimelineNode {
  person: GenogramPerson;
  editorGroup: FamilyTreeGroup;
  orderGroupId: string | null;
  x: number;
  birthYear: number | null;
  top: number;
}

interface BirthTimelineEdge {
  fromId: string;
  fromIds?: string[];
  toId: string;
  type: string;
  partnership?: boolean;
}

const timelineCardSize = 148;
const timelineCardGap = 36;
const timelineBranchGap = 28;
const timelinePixelsPerYear = 14;

function BirthTimelineView({ tree, appearance, hideLastNames, showGenerationCohorts, generationCohorts, selectedNodeId, onSelectNode, onOpenContextMenu, genogramId, database, onDataChanged }: {
  tree: FamilyTreeGroup[];
  appearance: GenogramAppearance;
  hideLastNames: boolean;
  showGenerationCohorts: boolean;
  generationCohorts: GenerationCohort[];
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  onOpenContextMenu: (menu: { x: number; y: number; nodeId: string; personId: string; parentIds: string[]; deleteRootIds: string[]; orderGroupId?: string }) => void;
  genogramId: string;
  database: LocalDatabaseClient | null;
  onDataChanged: () => void;
}) {
  const layout = useMemo(() => createBirthTimelineLayout(tree), [tree]);
  const branchFrames = Object.entries(appearance.branchColors).flatMap(([rootId, color]) => {
    const childrenByParent = new Map<string, string[]>();
    layout.edges.filter((edge) => !edge.partnership).forEach((edge) => {
      for (const parentId of edge.fromIds ?? [edge.fromId]) {
        const children = childrenByParent.get(parentId) ?? [];
        children.push(edge.toId);
        childrenByParent.set(parentId, children);
      }
    });
    const descendantIds = new Set<string>([rootId]);
    const pending = [...(childrenByParent.get(rootId) ?? [])];
    while (pending.length) {
      const id = pending.pop()!;
      if (descendantIds.has(id)) continue;
      descendantIds.add(id);
      pending.push(...(childrenByParent.get(id) ?? []));
    }
    const descendants = layout.nodes.filter((node) => descendantIds.has(node.person.id));
    if (!descendants.length) return [];
    const left = Math.min(...descendants.map((node) => node.x)) - 14;
    const top = Math.min(...descendants.map((node) => node.top)) - 14;
    const right = Math.max(...descendants.map((node) => node.x + timelineCardSize)) + 14;
    const bottom = Math.max(...descendants.map((node) => node.top + timelineCardSize)) + 14;
    return [{ rootId, color, x: left, y: top, width: right - left, height: bottom - top }];
  });
  const generationBands = showGenerationCohorts && layout.minYear !== null && layout.maxYear !== null ? generationCohorts.flatMap((cohort, index) => {
    const fromYear = Math.max(layout.minYear!, cohort.fromYear);
    const toYear = Math.min(layout.maxYear!, cohort.toYear);
    if (fromYear > toYear) return [];
    const top = layout.axisTop + (fromYear - layout.minYear!) * timelinePixelsPerYear - timelinePixelsPerYear / 2;
    const bottom = layout.axisTop + (toYear - layout.minYear!) * timelinePixelsPerYear + timelinePixelsPerYear / 2;
    return [{ cohort, top, height: bottom - top, fromYear, toYear, color: cohortColors[index % cohortColors.length] }];
  }) : [];
  return <div className="birth-timeline" style={{ width: layout.width, height: layout.height }}>
    <svg className="birth-timeline-lines" aria-hidden="true" width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`}>
      <text x="58" y="24" textAnchor="middle" className="birth-timeline-axis-title">Geburtsjahr</text>
      <line x1="58" y1="44" x2="58" y2={layout.hasUnknown ? layout.unknownTop - 32 : layout.height - 30} className="birth-timeline-axis" />
      {generationBands.map((band) => <g key={band.cohort.id}>
        <rect x="66" y={band.top} width={layout.width - 84} height={band.height} fill={band.color} fillOpacity=".065" />
        <line x1="58" y1={band.top} x2={layout.width - 18} y2={band.top} stroke={band.color} strokeOpacity=".3" strokeWidth="1" />
        {band.height >= 24 && <text x="72" y={band.top + 14} className="birth-timeline-generation-label" fill={band.color}>
          <title>{band.cohort.name} · {band.cohort.fromYear}–{band.cohort.toYear}</title>
          {`${band.cohort.name.length > 18 ? `${band.cohort.name.slice(0, 17)}…` : band.cohort.name} · ${band.cohort.fromYear}–${band.cohort.toYear}`}
        </text>}
      </g>)}
      {branchFrames.map((frame) => <rect key={frame.rootId} x={frame.x} y={frame.y} width={frame.width} height={frame.height} rx="12" fill={frame.color} fillOpacity=".07" stroke={frame.color} strokeOpacity=".72" strokeWidth="1.5" />)}
      {layout.ticks.map((tick) => <g key={tick.year}><line x1="52" y1={tick.y} x2={layout.width - 18} y2={tick.y} className="birth-timeline-gridline" /><line x1="51" y1={tick.y} x2="65" y2={tick.y} className="birth-timeline-tick" /><text x="46" y={tick.y + 4} textAnchor="end" className="birth-timeline-year">{tick.year}</text></g>)}
      {layout.hasUnknown && <line x1="58" y1={layout.unknownTop - 32} x2={layout.width - 18} y2={layout.unknownTop - 32} className="birth-timeline-unknown-divider" />}
      {layout.edges.map((edge, index) => {
        const to = layout.nodesById.get(edge.toId);
        const sources = (edge.fromIds ?? [edge.fromId]).map((id) => layout.nodesById.get(id)).filter((node): node is BirthTimelineNode => Boolean(node));
        const from = sources[0];
        if (!from || !to) return null;
        if (edge.partnership) {
          const startX = from.x + timelineCardSize;
          const endX = to.x;
          const startY = from.top + timelineCardSize / 2;
          const endY = to.top + timelineCardSize / 2;
          const curve = Math.max(18, (endX - startX) * .45);
          return <path key={index} d={`M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`} className="birth-timeline-partnership" />;
        }
        const sharedUnionSource = (edge.fromIds?.length ?? 0) > 1;
        const sourceX = sharedUnionSource
          ? sources.reduce((sum, node) => sum + node.x + timelineCardSize / 2, 0) / sources.length
          : from.x + timelineCardSize / 2;
        const sourceY = sharedUnionSource
          ? sources.reduce((sum, node) => sum + node.top + timelineCardSize / 2, 0) / sources.length
          : from.top + timelineCardSize / 2;
        const fromBelow = sourceY < to.top + timelineCardSize / 2;
        const startX = sourceX;
        const endX = to.x + timelineCardSize / 2;
        if (Math.abs(sourceY - (to.top + timelineCardSize / 2)) < 4) {
          const baseY = Math.max(...sources.map((node) => node.top + timelineCardSize));
          return <path key={index} d={`M ${startX} ${baseY} C ${startX} ${baseY + 24}, ${endX} ${baseY + 24}, ${endX} ${baseY}`} className={`parentage-${edge.type}`} />;
        }
        const startY = sharedUnionSource ? sourceY : from.top + (fromBelow ? timelineCardSize : 0);
        const endY = to.top + (fromBelow ? 0 : timelineCardSize);
        const curve = Math.max(20, Math.abs(endY - startY) * .45);
        const direction = fromBelow ? 1 : -1;
        return <path key={index} d={`M ${startX} ${startY} C ${startX} ${startY + curve * direction}, ${endX} ${endY - curve * direction}, ${endX} ${endY}`} className={`parentage-${edge.type}`} />;
      })}
      {layout.hasUnknown && <text x="72" y={layout.unknownTop - 39} className="birth-timeline-unknown-label">Geburtsjahr unbekannt</text>}
    </svg>
    {layout.nodes.map((node, index) => <BirthTimelinePerson key={`${node.person.id}-${index}`} node={node} appearance={appearance} hideLastNames={hideLastNames} selected={selectedNodeId === node.person.id} onSelect={() => onSelectNode(node.person.id)} onOpenContextMenu={onOpenContextMenu} genogramId={genogramId} database={database} onDataChanged={onDataChanged} />)}
  </div>;
}

function BirthTimelinePerson({ node, appearance, hideLastNames, selected, onSelect, onOpenContextMenu, genogramId, database, onDataChanged }: { node: BirthTimelineNode; appearance: GenogramAppearance; hideLastNames: boolean; selected: boolean; onSelect: () => void; onOpenContextMenu: (menu: { x: number; y: number; nodeId: string; personId: string; parentIds: string[]; deleteRootIds: string[]; orderGroupId?: string }) => void; genogramId: string; database: LocalDatabaseClient | null; onDataChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const person = node.person;
  return <>
    <div className={`genogram-person birth-timeline-person ${genogramPersonCardClass(person.gender)}${person.deathDate ? ' deceased' : ''}${node.birthYear === null ? ' birth-year-unknown' : ''}${selected ? ' is-selected' : ''}`} style={{ left: node.x, top: node.top, ...personAppearanceStyle(appearance.personColors[person.id]) }} data-person-id={person.id}
      onClickCapture={onSelect}
      onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); onSelect(); onOpenContextMenu({ x: Math.max(8, Math.min(event.clientX, window.innerWidth - 268)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 380)), nodeId: node.editorGroup.id, personId: person.id, parentIds: node.editorGroup.partners.map((partner) => partner.id), deleteRootIds: [person.id], ...(node.orderGroupId ? { orderGroupId: node.orderGroupId } : {}) }); }}>
      {node.birthYear === null && <span className="birth-timeline-unknown-badge">Ohne Geburtsjahr</span>}
      <button type="button" className="genogram-name-button" onClick={() => setEditing(true)}>{genogramPersonName(person, hideLastNames)}</button>
      {person.birthDate && <small>geb. {formatDate(person.birthDate, person.birthDatePrecision)}</small>}
      {person.deathDate && <small>gest. {formatDate(person.deathDate, person.deathDatePrecision)}</small>}
    </div>
    {editing && <FamilyNodeEditor group={node.editorGroup} genogramId={genogramId} database={database} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); onDataChanged(); }} />}
  </>;
}

function createBirthTimelineLayout(tree: FamilyTreeGroup[]) {
  const widths = new Map<FamilyTreeGroup, number>();
  const branchWidths = new Map<FamilyTreePerson, number>();
  const groupWidth = (group: FamilyTreeGroup): number => {
    const partners = group.partners.length * timelineCardSize + Math.max(0, group.partners.length - 1) * timelineCardGap;
    const children = group.children.reduce((sum, child) => sum + branchWidth(child), 0) + timelineBranchGap * Math.max(0, group.children.length - 1);
    const width = Math.max(partners, children, timelineCardSize);
    widths.set(group, width);
    return width;
  };
  const branchWidth = (branch: FamilyTreePerson): number => {
    const width = branch.unions.length
      ? branch.unions.reduce((sum, group) => sum + groupWidth(group), 0) + timelineBranchGap * Math.max(0, branch.unions.length - 1)
      : timelineCardSize;
    branchWidths.set(branch, width);
    return width;
  };
  tree.forEach(groupWidth);
  const nodes: BirthTimelineNode[] = [];
  const nodesById = new Map<string, BirthTimelineNode>();
  const edges: BirthTimelineEdge[] = [];
  const edgeKeys = new Set<string>();
  const addNode = (person: GenogramPerson, editorGroup: FamilyTreeGroup, x: number, orderGroupId: string | null) => {
    if (nodesById.has(person.id)) return;
    const parsedYear = person.birthDate ? Number(person.birthDate.slice(0, 4)) : NaN;
    const node: BirthTimelineNode = { person, editorGroup, orderGroupId, x, birthYear: Number.isInteger(parsedYear) && parsedYear > 0 ? parsedYear : null, top: 0 };
    nodes.push(node);
    nodesById.set(person.id, node);
  };
  const addEdge = (edge: BirthTimelineEdge) => {
    const key = `${edge.fromId}:${edge.toId}:${edge.type}:${edge.partnership ? 'partner' : 'parent'}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push(edge);
  };
  const placeGroup = (group: FamilyTreeGroup, x: number, orderGroupId: string | null = null) => {
    const width = widths.get(group) ?? timelineCardSize;
    const partnerWidth = group.partners.length * timelineCardSize + Math.max(0, group.partners.length - 1) * timelineCardGap;
    let partnerX = x + (width - partnerWidth) / 2;
    group.partners.forEach((person) => { addNode(person, group, partnerX, orderGroupId); partnerX += timelineCardSize + timelineCardGap; });
    if (group.partners.length > 1) {
      for (let index = 0; index < group.partners.length - 1; index += 1) addEdge({ fromId: group.partners[index]!.id, toId: group.partners[index + 1]!.id, type: 'unspecified', partnership: true });
    }
    const childrenWidth = group.children.reduce((sum, child) => sum + (branchWidths.get(child) ?? timelineCardSize), 0) + timelineBranchGap * Math.max(0, group.children.length - 1);
    let childX = x + (width - childrenWidth) / 2;
    for (const child of group.children) {
      const childWidth = branchWidths.get(child) ?? timelineCardSize;
      const childCenter = childX + childWidth / 2 - timelineCardSize / 2;
      const partnerIds = new Set(group.partners.map((person) => person.id));
      const allParentsInThisUnion = child.parentLinks.length > 1
        && child.parentLinks.every((link) => partnerIds.has(link.parentId))
        && group.partners.every((person) => child.parentLinks.some((link) => link.parentId === person.id));
      if (allParentsInThisUnion) {
        const types = child.parentLinks.map((link) => link.relationshipType);
        addEdge({
          fromId: child.parentLinks[0]!.parentId,
          fromIds: child.parentLinks.map((link) => link.parentId),
          toId: child.person.id,
          type: types.every((type) => type === types[0]) ? types[0]! : 'unspecified',
        });
      } else {
        child.parentLinks.forEach((link) => addEdge({ fromId: link.parentId, toId: child.person.id, type: link.relationshipType }));
      }
      if (child.unions.length) {
        const unionsWidth = child.unions.reduce((sum, union) => sum + (widths.get(union) ?? timelineCardSize), 0) + timelineBranchGap * Math.max(0, child.unions.length - 1);
        let unionX = childX + (childWidth - unionsWidth) / 2;
        child.unions.forEach((union) => { placeGroup(union, unionX, group.id); unionX += (widths.get(union) ?? timelineCardSize) + timelineBranchGap; });
      } else {
        const leafGroup: FamilyTreeGroup = { id: `timeline-${child.person.id}`, partnership: null, partners: [child.person], children: [] };
        addNode(child.person, leafGroup, childCenter, group.id);
      }
      childX += childWidth + timelineBranchGap;
    }
  };
  let rootX = 240;
  tree.forEach((group) => { placeGroup(group, rootX); rootX += (widths.get(group) ?? timelineCardSize) + 78; });

  const knownYears = nodes.flatMap((node) => node.birthYear === null ? [] : [node.birthYear]);
  const minYear = knownYears.length ? Math.min(...knownYears) : 0;
  const maxYear = knownYears.length ? Math.max(...knownYears) : 0;
  const axisTop = 84;
  const knownBottom = knownYears.length ? axisTop + (maxYear - minYear) * timelinePixelsPerYear + timelineCardSize : axisTop + timelineCardSize;
  const unknownTop = knownBottom + 64;
  nodes.forEach((node) => {
    node.top = node.birthYear === null
      ? unknownTop
      : axisTop + (node.birthYear - minYear) * timelinePixelsPerYear - timelineCardSize / 2;
  });
  const tickStart = Math.floor(minYear / 10) * 10;
  const tickEnd = Math.floor(maxYear / 10) * 10;
  const ticks = knownYears.length ? Array.from({ length: Math.floor((tickEnd - tickStart) / 10) + 1 }, (_, index) => {
    const year = tickStart + index * 10;
    return { year, y: axisTop + (year - minYear) * timelinePixelsPerYear };
  }) : [];
  const width = Math.max(720, rootX + 20);
  const hasUnknown = nodes.some((node) => node.birthYear === null);
  const height = hasUnknown ? unknownTop + timelineCardSize + 30 : knownBottom + 30;
  return { nodes, nodesById, edges, ticks, width, height, unknownTop, hasUnknown, minYear: knownYears.length ? minYear : null, maxYear: knownYears.length ? maxYear : null, axisTop };
}

function GenogramPersonView({ branch, parentGroupId, hideLastNames, collapsedNodes, selectedNodeId, onSelectNode, appearance, showGenerationCohorts, generationCohorts, onNodeToggle, genogramId, database, onDataChanged }: {
  branch: FamilyTreePerson;
  parentGroupId: string;
  hideLastNames: boolean;
  collapsedNodes: string[];
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  appearance: GenogramAppearance;
  showGenerationCohorts: boolean;
  generationCohorts: GenerationCohort[];
  onNodeToggle: (id: string, open: boolean) => void;
  genogramId: string;
  database: LocalDatabaseClient | null;
  onDataChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const hasFamily = branch.unions.some((union) => union.children.length > 0 || union.partnership);
  const parentTypes = Object.fromEntries(branch.parentLinks.map((link) => [link.parentId, link.relationshipType]));
  const personGroup: FamilyTreeGroup = { id: branch.person.id, partnership: null, partners: [branch.person], children: [] };
  return <>
  <div className="genogram-person-branch" data-child-id={branch.person.id} data-parent-group-id={parentGroupId}
    data-parent-ids={branch.parentLinks.map((link) => link.parentId).join(',')}
    data-parent-types={JSON.stringify(parentTypes)}>
    {hasFamily ? branch.unions.map((union) => <GenogramGroupView key={union.id} group={union} hideLastNames={hideLastNames} collapsedNodes={collapsedNodes} selectedNodeId={selectedNodeId} onSelectNode={onSelectNode} appearance={appearance} showGenerationCohorts={showGenerationCohorts} generationCohorts={generationCohorts} onNodeToggle={onNodeToggle} genogramId={genogramId} database={database} onDataChanged={onDataChanged} />) : <div className={`genogram-person genogram-leaf ${genogramPersonCardClass(branch.person.gender)}${branch.person.deathDate ? ' deceased' : ''}${appearance.branchColors[branch.person.id] ? ' has-branch-highlight' : ''}${selectedNodeId === `solo-${branch.person.id}` ? ' is-selected' : ''}`} data-person-id={branch.person.id} onClickCapture={(event) => { event.preventDefault(); onSelectNode(`solo-${branch.person.id}`); }} style={{ ...personAppearanceStyle(appearance.personColors[branch.person.id]), ...branchAppearanceStyle(appearance.branchColors[branch.person.id]), ...generationStyle(branch.person.birthDate, showGenerationCohorts, generationCohorts) }}>
      {showGenerationCohorts && cohortForYear(branch.person.birthDate, generationCohorts) && <span className="genogram-cohort-label">{cohortForYear(branch.person.birthDate, generationCohorts)!.name}</span>}
      <button type="button" className="genogram-name-button" onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setEditing(true);
      }}>{genogramPersonName(branch.person, hideLastNames)}</button>
      {branch.person.birthDate && <small>geb. {formatDate(branch.person.birthDate, branch.person.birthDatePrecision)}</small>}
      {branch.person.deathDate && <small>gest. {formatDate(branch.person.deathDate, branch.person.deathDatePrecision)}</small>}
    </div>}
  </div>
  {editing && <FamilyNodeEditor group={personGroup} genogramId={genogramId} database={database} onCancel={() => setEditing(false)} onSaved={() => {
    setEditing(false);
    onDataChanged();
  }} />}
  </>;
}

const appearanceColors = [
  { name: 'Salbei', value: '#72a889' },
  { name: 'Ozean', value: '#6b9fbd' },
  { name: 'Lavendel', value: '#9784b8' },
  { name: 'Rosé', value: '#c9818b' },
  { name: 'Apricot', value: '#d69a62' },
  { name: 'Gold', value: '#c4aa53' },
];

function AppearanceDialog({ personName, initialColor, initialBranch, onCancel, onApply }: {
  personName: string;
  initialColor: string;
  initialBranch: boolean;
  onCancel: () => void;
  onApply: (color: string, scope: 'person' | 'descendants', frameBranch: boolean) => void;
}) {
  const [color, setColor] = useState(initialColor);
  const [scope, setScope] = useState<'person' | 'descendants'>('person');
  const [frameBranch, setFrameBranch] = useState(initialBranch);
  return <div className="editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="appearance-dialog" role="dialog" aria-modal="true" aria-labelledby="appearance-title">
      <header className="dialog-header"><div><p className="eyebrow">Genogramm gestalten</p><h3 id="appearance-title">Farbe zuweisen</h3><p className="appearance-target">{personName}</p></div><button type="button" className="icon-button" onClick={onCancel} aria-label="Gestaltung schließen">×</button></header>
      <div className="dialog-body appearance-body">
        <fieldset className="appearance-palette"><legend>Farbton</legend>
          <button type="button" className={`appearance-color is-clear${color === '' ? ' is-active' : ''}`} onClick={() => setColor('')} aria-label="Farbe entfernen" title="Ohne Farbe"><span>×</span></button>
          {appearanceColors.map((item) => <button key={item.value} type="button" className={`appearance-color${color === item.value ? ' is-active' : ''}`} style={{ backgroundColor: item.value }} onClick={() => setColor(item.value)} aria-label={item.name} title={item.name} aria-pressed={color === item.value} />)}
        </fieldset>
        <fieldset className="appearance-scope"><legend>Anwenden auf</legend>
          <label><input type="radio" name="appearance-scope" checked={scope === 'person'} onChange={() => setScope('person')} /> Nur diese Person</label>
          <label><input type="radio" name="appearance-scope" checked={scope === 'descendants'} onChange={() => setScope('descendants')} /> Diese Person und alle Kindknoten</label>
        </fieldset>
        <label className="appearance-branch-toggle"><input type="checkbox" checked={frameBranch} onChange={(event) => setFrameBranch(event.currentTarget.checked)} /> Zweig einschließlich dieser Person mit Fläche und Umrandung hervorheben</label>
        <p className="appearance-note">Die Gestaltung wird für diesen Fall lokal in diesem Browser gespeichert. Sie verändert keine Familiendaten.</p>
      </div>
      <footer className="dialog-footer"><button type="button" className="secondary-button" onClick={onCancel}>Abbrechen</button><button type="button" className="primary-button" onClick={() => onApply(color, scope, frameBranch)}>Übernehmen</button></footer>
    </section>
  </div>;
}

function personAppearanceStyle(color: string | undefined): React.CSSProperties | undefined {
  return color ? { '--person-accent': color } as React.CSSProperties : undefined;
}

function branchAppearanceStyle(color: string | undefined): React.CSSProperties | undefined {
  return color ? { '--branch-color': color } as React.CSSProperties : undefined;
}

function GenogramPrintDialog({ genogram, tree, appearance, hideLastNames, showGenerationCohorts, generationCohorts, generationGap, onClose }: {
  genogram: GenogramDetail;
  tree: FamilyTreeGroup[];
  appearance: GenogramAppearance;
  hideLastNames: boolean;
  showGenerationCohorts: boolean;
  generationCohorts: GenerationCohort[];
  generationGap: number;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'single' | 'poster'>('single');
  const [width, setWidth] = useState(1000);
  const [height, setHeight] = useState(700);
  const [printGenerationGap, setPrintGenerationGap] = useState(generationGap);
  const [paperFormat, setPaperFormat] = useState<'A4' | 'A3'>('A4');
  const [overlapMm, setOverlapMm] = useState(10);
  const [showPosterInfo, setShowPosterInfo] = useState(true);
  const [showPosterMarks, setShowPosterMarks] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const posterPageWidth = paperFormat === 'A4' ? 210 : 297;
  const posterPageHeight = paperFormat === 'A4' ? 297 : 420;
  const validDimensions = mode === 'poster' || (Number.isFinite(width) && Number.isFinite(height) && width >= 200 && width <= 5000 && height >= 200 && height <= 5000);
  const layout = validDimensions ? createGenogramPrintSvg(genogram, tree, appearance, hideLastNames, showGenerationCohorts, generationCohorts, printGenerationGap, mode === 'poster' ? 1000 : width, mode === 'poster' ? 700 : height) : null;
  const poster = mode === 'poster' && layout ? createPosterPrintPages(layout, genogram.summary.title, posterPageWidth, posterPageHeight, overlapMm, showPosterInfo, showPosterMarks) : null;
  const posterTextPt = poster ? 10 * poster.scale * 72 / 25.4 : 0;

  function openPrintDialog() {
    if (!layout || (mode === 'poster' && !poster)) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setError('Das Druckfenster wurde blockiert. Bitte Pop-ups für diese App erlauben und erneut versuchen.');
      return;
    }
    const safeTitle = genogram.summary.title.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
    printWindow.document.open();
    const documentBody = mode === 'poster'
      ? poster!.pages.map((page) => `<section class="poster-sheet">${page}</section>`).join('')
      : layout.svg;
    const pageWidth = mode === 'poster' ? posterPageWidth : width;
    const pageHeight = mode === 'poster' ? posterPageHeight : height;
    const pageStyles = mode === 'poster'
      ? `.poster-sheet{width:${pageWidth}mm;height:${pageHeight}mm;break-after:page;page-break-after:always;overflow:hidden}.poster-sheet:last-child{break-after:auto;page-break-after:auto}.poster-sheet svg{display:block;width:${pageWidth}mm;height:${pageHeight}mm;print-color-adjust:exact;-webkit-print-color-adjust:exact}`
      : `body>svg{display:block;width:${pageWidth}mm;height:${pageHeight}mm;print-color-adjust:exact;-webkit-print-color-adjust:exact}`;
    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${safeTitle}</title><style>@page{size:${pageWidth}mm ${pageHeight}mm;margin:0}html,body{width:${pageWidth}mm;margin:0!important;padding:0!important;background:#fff}${pageStyles}</style></head><body>${documentBody}<script>window.addEventListener('load',function(){setTimeout(function(){window.print()},300)})</script></body></html>`);
    printWindow.document.close();
    // The print UI can keep the popup focused or block interaction with the
    // opener. Close our in-app dialog as soon as the print window is ready.
    onClose();
  }

  return <div className="editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="print-export-dialog" role="dialog" aria-modal="true" aria-labelledby="print-export-title">
      <header className="dialog-header"><div><p className="eyebrow">Druckexport</p><h3 id="print-export-title">Genogramm als PDF</h3></div><button type="button" className="icon-button" onClick={onClose} aria-label="PDF-Export schließen">×</button></header>
      <div className="dialog-body print-export-body">
        <div className="print-mode-switch" role="group" aria-label="Druckmodus">
          <button type="button" className={mode === 'single' ? 'is-active' : ''} aria-pressed={mode === 'single'} onClick={() => setMode('single')}>Einzelseite</button>
          <button type="button" className={mode === 'poster' ? 'is-active' : ''} aria-pressed={mode === 'poster'} onClick={() => setMode('poster')}>Poster auf mehreren Blättern</button>
        </div>
        <div className={`print-export-controls${mode === 'poster' ? ' is-poster' : ''}`}>
          {mode === 'single' ? <>
            <label>Breite (mm)<input type="number" min="200" max="5000" step="10" value={width} onChange={(event) => setWidth(Number(event.currentTarget.value))} /></label>
            <label>Höhe (mm)<input type="number" min="200" max="5000" step="10" value={height} onChange={(event) => setHeight(Number(event.currentTarget.value))} /></label>
            <p>Einseitiges Sonderformat · Vektorgrafik · alle Generationen</p>
          </> : <>
            <label className="poster-paper-format">Papierformat<select value={paperFormat} onChange={(event) => setPaperFormat(event.currentTarget.value as 'A4' | 'A3')}><option value="A4">A4 Hochformat</option><option value="A3">A3 Hochformat</option></select></label>
            <label className="print-gap-control poster-overlap-control"><span>Überlappung <output>{overlapMm} mm</output></span><input type="range" min="0" max="20" step="2" value={overlapMm} onChange={(event) => setOverlapMm(Number(event.currentTarget.value))} aria-label="Überlappung der Posterblätter" /></label>
            <div className="poster-info-options">
              <label className="print-poster-info-toggle"><input type="checkbox" checked={showPosterInfo} onChange={(event) => setShowPosterInfo(event.currentTarget.checked)} /><span>Seitentitel, Nummerierung und Montagehinweis einblenden</span></label>
              <label className="print-poster-info-toggle"><input type="checkbox" checked={showPosterMarks} onChange={(event) => setShowPosterMarks(event.currentTarget.checked)} /><span>Pass-/Schnittmarken an den Überlappungen einblenden</span></label>
            </div>
            <p className="poster-layout-note">Hochformat · {poster?.columns ?? 0} Blätter nebeneinander · von links nach rechts zusammenfügen</p>
          </>}
          <label className={`print-gap-control${mode === 'poster' ? ' poster-generation-gap' : ''}`}><span>Generationenabstand <output>{printGenerationGap} px</output></span><input type="range" min="30" max="180" step="5" value={printGenerationGap} onChange={(event) => setPrintGenerationGap(Number(event.currentTarget.value))} aria-label="Generationenabstand im PDF" /></label>
        </div>
        {mode === 'single' && layout && <div className="print-preview-frame" aria-label="Druckvorschau"><div className="print-preview-svg" dangerouslySetInnerHTML={{ __html: layout.svg }} /></div>}
        {mode === 'poster' && poster && <div className="poster-preview-strip" aria-label={`Poster-Vorschau mit ${poster.pages.length} Blättern`}>
          {poster.pages.map((page, index) => <div className="poster-preview-page" key={index} style={{ aspectRatio: `${posterPageWidth} / ${posterPageHeight}` }} dangerouslySetInnerHTML={{ __html: page }} />)}
        </div>}
        {!validDimensions && <p className="inline-error" role="alert">Breite und Höhe müssen zwischen 200 und 5.000 mm liegen.</p>}
        {mode === 'single' && layout && layout.smallestTextPt < 8 && <p className="print-size-warning" role="status">Bei diesem Format wird die Schrift voraussichtlich nur ca. {layout.smallestTextPt.toFixed(1)} pt groß. Für gute Lesbarkeit bitte das Endformat vergrößern.</p>}
        {mode === 'poster' && poster && posterTextPt < 8 && <p className="print-size-warning" role="status">Bei diesem Papierformat wird die Schrift voraussichtlich nur ca. {posterTextPt.toFixed(1)} pt groß. A3 kann die Lesbarkeit verbessern.</p>}
        {error && <p className="inline-error" role="alert">{error}</p>}
        <p className="print-export-note">Der PDF-Export öffnet den lokalen Druckdialog. Dort „Als PDF speichern“ wählen. Posterblätter werden hochkant ausgegeben und enthalten Überlappung zum Ausrichten. Browser-Kopf- und Fußzeilen im Druckdialog bitte deaktivieren.</p>
      </div>
      <footer className="dialog-footer"><button type="button" className="secondary-button print-dialog-button" onClick={onClose}>Abbrechen</button><button type="button" className="primary-button print-dialog-button" onClick={openPrintDialog} disabled={!layout || (mode === 'poster' && !poster)}>PDF erstellen</button></footer>
    </section>
  </div>;
}

function ViewMenu({
  host,
  orientation,
  onOrientationChange,
  wrapChildren,
  onWrapChildrenChange,
  stackTerminalChildren,
  onStackTerminalChildrenChange,
  generationGap,
  onGenerationGapChange,
  hideLastNames,
  onHideLastNamesChange,
  showGenerationCohorts,
  onShowGenerationCohortsChange,
  onOpenGenerationDialog,
  zoomPercent,
  onZoomChange,
  onFitWholeTree,
  onResetZoom,
  canApplyToSelection,
  onExpandAll,
  onCollapseAll,
  onExpandFromSelection,
  onCollapseFromSelection,
}: {
  host: HTMLDivElement;
  orientation: ViewOrientation;
  onOrientationChange: (orientation: ViewOrientation) => void;
  wrapChildren: boolean;
  onWrapChildrenChange: (wrap: boolean) => void;
  stackTerminalChildren: boolean;
  onStackTerminalChildrenChange: (stack: boolean) => void;
  generationGap: number;
  onGenerationGapChange: (gap: number) => void;
  hideLastNames: boolean;
  onHideLastNamesChange: (hide: boolean) => void;
  showGenerationCohorts: boolean;
  onShowGenerationCohortsChange: (show: boolean) => void;
  onOpenGenerationDialog: () => void;
  zoomPercent: number;
  onZoomChange: (percent: number) => void;
  onFitWholeTree: () => void;
  onResetZoom: () => void;
  canApplyToSelection: boolean;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onExpandFromSelection: () => void;
  onCollapseFromSelection: () => void;
}) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function dismiss(event: PointerEvent | KeyboardEvent) {
      const menu = menuRef.current;
      if (!menu?.open) return;
      if (event instanceof KeyboardEvent && event.key === 'Escape') menu.open = false;
      if (event instanceof PointerEvent && event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
    }
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', dismiss);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', dismiss);
    };
  }, []);

  function run(action: () => void) {
    action();
    if (menuRef.current) menuRef.current.open = false;
  }

  return createPortal(
    <details className="header-menu view-menu" ref={menuRef}>
      <summary>Ansicht</summary>
      <div className="header-menu-panel view-menu-panel">
        <section className="view-menu-section">
          <p className="view-menu-heading">Darstellung</p>
          <div className="orientation-options" role="group" aria-label="Darstellung">
            <button type="button" aria-pressed={orientation === 'timeline'} onClick={() => onOrientationChange('timeline')}><Clock3 size={15} /><span>Zeitachse</span></button>
            <button type="button" aria-pressed={orientation === 'horizontal'} onClick={() => onOrientationChange('horizontal')}><ArrowLeftRight size={15} /><span>Horizontal</span></button>
            <button type="button" aria-pressed={orientation === 'vertical'} onClick={() => onOrientationChange('vertical')}><ArrowDownUp size={15} /><span>Vertikal</span></button>
            <button type="button" aria-pressed={orientation === 'genogram'} onClick={() => onOrientationChange('genogram')}><GitFork size={15} /><span>Genogramm</span></button>
          </div>
          {orientation === 'vertical' && <div className="view-menu-options">
            <label className="wrap-children-option"><input type="checkbox" checked={wrapChildren} onChange={(event) => onWrapChildrenChange(event.currentTarget.checked)} /><span>Nachkommen kompakt auf mehrere Reihen verteilen</span></label>
            <label className="wrap-children-option"><input type="checkbox" checked={stackTerminalChildren} onChange={(event) => onStackTerminalChildrenChange(event.currentTarget.checked)} /><span>Kinder ohne sichtbare Nachkommen nach Geburtsdatum untereinander anordnen</span></label>
          </div>}
          {(orientation === 'genogram' || orientation === 'timeline') && <div className="view-menu-options">
            <label className="wrap-children-option"><input type="checkbox" checked={hideLastNames} onChange={(event) => onHideLastNamesChange(event.currentTarget.checked)} /><span>Nachnamen ausblenden</span></label>
            <label className="wrap-children-option"><input type="checkbox" checked={showGenerationCohorts} onChange={(event) => onShowGenerationCohortsChange(event.currentTarget.checked)} /><span>Generationen im Hintergrund anzeigen</span></label>
            <button type="button" className="generation-settings-button" onClick={onOpenGenerationDialog}><Layers3 size={14} /> Generationen bearbeiten …</button>
          </div>}
          {orientation === 'genogram' && <label className="generation-gap-control"><span>Abstand zwischen Generationen <output>{generationGap} px</output></span><input type="range" min="30" max="180" step="5" value={generationGap} onChange={(event) => onGenerationGapChange(Number(event.currentTarget.value))} aria-label="Abstand zwischen Generationen" /></label>}
        </section>
        <section className="view-menu-section">
          <p className="view-menu-heading">Zoom</p>
          <div className="zoom-controls">
            <button type="button" aria-label="Herauszoomen" title="Herauszoomen" disabled={zoomPercent <= 5} onClick={() => onZoomChange(Math.max(5, zoomPercent - 5))}><ZoomOut size={15} /></button>
            <input type="range" min="5" max="125" step="5" value={zoomPercent} onChange={(event) => onZoomChange(Number(event.currentTarget.value))} aria-label="Zoomstufe" />
            <button type="button" aria-label="Hineinzoomen" title="Hineinzoomen" disabled={zoomPercent >= 125} onClick={() => onZoomChange(Math.min(125, zoomPercent + 5))}><ZoomIn size={15} /></button>
            <output>{zoomPercent}%</output>
          </div>
          <div className="zoom-actions">
            <button type="button" onClick={onResetZoom}><RotateCcw size={13} /> 100 %</button>
            <button type="button" onClick={() => run(onFitWholeTree)}><Maximize2 size={13} /> Gesamtansicht</button>
          </div>
          <small className="view-menu-hint zoom-hint">{orientation === 'timeline' ? 'Mit dem Scrollrad an der Mausposition zoomen, mit gedrückter Maustaste verschieben.' : 'Im Genogramm kannst du mit dem Scrollrad an der Mausposition zoomen.'} Die Gesamtansicht passt alle Äste ein.</small>
        </section>
        {orientation !== 'timeline' && <>
          <section className="view-menu-section">
            <p className="view-menu-heading">Gesamter Baum</p>
            <div className="view-menu-action-grid">
              <button type="button" onClick={() => run(onExpandAll)}><ChevronsDown size={14} /> Alles aufklappen</button>
              <button type="button" onClick={() => run(onCollapseAll)}><ChevronsUp size={14} /> Alles zuklappen</button>
            </div>
          </section>
          <section className="view-menu-section">
            <p className="view-menu-heading">Markierter Knoten und Nachkommen</p>
            <div className="view-menu-action-grid">
              <button type="button" disabled={!canApplyToSelection} onClick={() => run(onExpandFromSelection)}><ChevronsDown size={14} /> Ab hier aufklappen</button>
              <button type="button" disabled={!canApplyToSelection} onClick={() => run(onCollapseFromSelection)}><ChevronsUp size={14} /> Ab hier zuklappen</button>
            </div>
            {!canApplyToSelection && <small className="view-menu-hint selection-hint">Markiere zuerst einen Knoten in der Arbeitsfläche.</small>}
          </section>
        </>}
      </div>
    </details>,
    host,
  );
}

function GenerationCohortDialog({ cohorts, onClose, onSave }: { cohorts: GenerationCohort[]; onClose: () => void; onSave: (cohorts: GenerationCohort[]) => void }) {
  const [draft, setDraft] = useState(() => cohorts.map((cohort) => ({ ...cohort })));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  function update(index: number, field: keyof GenerationCohort, value: string) {
    setDraft((current) => current.map((cohort, cohortIndex) => cohortIndex !== index ? cohort : {
      ...cohort,
      [field]: field === 'name' ? value : Number(value),
    }));
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.some((cohort) => !cohort.name.trim() || !Number.isInteger(cohort.fromYear) || !Number.isInteger(cohort.toYear) || cohort.fromYear < 1 || cohort.toYear > 9999 || cohort.fromYear > cohort.toYear)) {
      setError('Bitte prüfe Namen und Zeiträume. Das Von-Jahr muss kleiner oder gleich dem Bis-Jahr sein.');
      return;
    }
    const ordered = [...draft].sort((a, b) => a.fromYear - b.fromYear);
    if (ordered.some((cohort, index) => index > 0 && cohort.fromYear <= ordered[index - 1]!.toYear)) {
      setError('Die Zeiträume dürfen sich nicht überschneiden.');
      return;
    }
    onSave(draft.map((cohort) => ({ ...cohort, name: cohort.name.trim() })));
  }

  return <div className="editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="generation-dialog" role="dialog" aria-modal="true" aria-labelledby="generation-dialog-title" onSubmit={save}>
      <header className="dialog-header"><div><p className="eyebrow">Genogramm-Ansicht</p><h3 id="generation-dialog-title">Generationen festlegen</h3><p className="generation-dialog-intro">Die Zeiträume beziehen sich auf das Geburtsjahr und können angepasst werden.</p></div><button type="button" className="icon-button" aria-label="Dialog schließen" onClick={onClose}><X size={18} /></button></header>
      <div className="dialog-body generation-dialog-body">
        <div className="generation-list-header" aria-hidden="true"><span>Generation</span><span>Von</span><span>Bis</span><span /></div>
        {draft.map((cohort, index) => <div className="generation-editor-row" key={cohort.id}>
          <label><input aria-label={`Name der Generation ${index + 1}`} maxLength={60} value={cohort.name} onChange={(event) => update(index, 'name', event.currentTarget.value)} /></label>
          <label><input aria-label={`Geburtsjahr von ${cohort.name}`} type="number" min="1" max="9999" value={cohort.fromYear} onChange={(event) => update(index, 'fromYear', event.currentTarget.value)} /></label>
          <label><input aria-label={`Geburtsjahr bis ${cohort.name}`} type="number" min="1" max="9999" value={cohort.toYear} onChange={(event) => update(index, 'toYear', event.currentTarget.value)} /></label>
          <button type="button" className="generation-remove-button" aria-label={`${cohort.name} entfernen`} title="Generation entfernen" onClick={() => setDraft((current) => current.filter((_, i) => i !== index))}><Trash2 size={15} /></button>
        </div>)}
        {draft.length === 0 && <p className="generation-empty">Noch keine Generationen angelegt.</p>}
        <button type="button" className="generation-add-button" onClick={() => setDraft((current) => [...current, { id: `cohort-${crypto.randomUUID()}`, name: 'Neue Generation', fromYear: 2027, toYear: 2040 }])}><Plus size={15} /> Generation hinzufügen</button>
        {error && <p className="form-error" role="alert">{error}</p>}
        <small>Voreinstellungen orientieren sich an verbreiteten Kohortengrenzen. Diese unterscheiden sich je nach Quelle; sie sind keine festen fachlichen Definitionen.</small>
      </div>
      <footer className="dialog-footer"><button type="button" className="secondary-button" onClick={onClose}>Abbrechen</button><button type="submit" className="primary-button">Übernehmen</button></footer>
    </form>
  </div>;
}

function FamilyGroup({
  group,
  genogramId,
  database,
  onDataChanged,
  defaultOpen,
  depth,
  selectedNodeId,
  onSelectNode,
  onExpandFromNode,
  onCollapseFromNode,
  stackTerminalChildren,
}: {
  group: FamilyTreeGroup;
  genogramId: string;
  database: LocalDatabaseClient | null;
  onDataChanged: () => void;
  defaultOpen?: boolean;
  depth: number;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onExpandFromNode: (nodeId: string) => void;
  onCollapseFromNode: (nodeId: string) => void;
  stackTerminalChildren: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const label = group.partners.length > 0 ? group.partners.map(displayName).join(' + ') : 'Unbenannte Verbindung';
  const hasChildren = group.children.length > 0;
  const orderedChildren = stackTerminalChildren && !group.hasCustomChildOrder
    ? [...group.children].sort(compareBirthDates)
    : group.children;
  useEffect(() => {
    if (defaultOpen && detailsRef.current) detailsRef.current.open = true;
  }, [defaultOpen]);
  return (
    <details ref={detailsRef} className={`family-group depth-${Math.min(depth, 4)} ${selectedNodeId === group.id ? 'is-selected' : ''}`} data-node-id={group.id}>
      <summary onClickCapture={(event) => {
        if (event.target instanceof Element && event.target.closest('.node-actions')) {
          // Native <summary> activation can otherwise also toggle the details
          // element when one of its action buttons is clicked.
          event.preventDefault();
        }
      }}>
        {hasChildren ? <span className="disclosure-mark" aria-hidden="true" /> : <span className="disclosure-spacer" aria-hidden="true" />}
        <span className="couple-node" aria-label={label}>
          {group.partners.map((person, index) => (
            <span className="compact-person" key={person.id}>
              {index > 0 && <span className="couple-connector" aria-hidden="true" />}
              <PersonSummary person={person} />
            </span>
          ))}
        </span>
        <span className="group-status">
          {group.partnership && <>
            {group.partnership.status === 'married' ? 'verheiratet' : 'Status unbekannt'}
            {group.partnership.startDate ? ` · ${formatDate(group.partnership.startDate, group.partnership.startDatePrecision)}` : ''}
          </>}
        </span>
        <span className="child-count">{hasChildren ? `${group.children.length} ${group.children.length === 1 ? 'Kind' : 'Kinder'}` : ''}</span>
        <span className="node-actions" role="group" aria-label="Knotenaktionen">
          {hasChildren && <button
            type="button"
            className="node-toggle-button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (detailsRef.current) detailsRef.current.open = !detailsRef.current.open;
            }}
            aria-label={`Diesen Knoten auf- oder zuklappen: ${label}`}
            title="Diesen Knoten auf- oder zuklappen"
          >
            <span className="disclosure-mark" aria-hidden="true" />
          </button>}
          <button
            type="button"
            className={`node-select-button ${selectedNodeId === group.id ? 'is-selected' : ''}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSelectNode(group.id);
            }}
            aria-label={`${selectedNodeId === group.id ? 'Markierung entfernen' : 'Knoten markieren'}: ${label}`}
            aria-pressed={selectedNodeId === group.id}
            title={selectedNodeId === group.id ? 'Markierung entfernen' : 'Knoten für Ansichtsbefehle markieren'}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.2" /><circle cx="8" cy="8" r="1.5" /></svg>
          </button>
          <button type="button" className="node-expand-button" disabled={!hasChildren} onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onExpandFromNode(group.id);
          }} aria-label={`Diesen Knoten und alle Nachkommen aufklappen: ${label}`} title="Ab hier alles aufklappen">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 3 5 4 5-4M3 8l5 4 5-4" /></svg>
          </button>
          <button type="button" className="node-collapse-button" disabled={!hasChildren} onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onCollapseFromNode(group.id);
          }} aria-label={`Diesen Knoten und alle Nachkommen zuklappen: ${label}`} title="Ab hier alles zuklappen">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 5-4 5 4M3 13l5-4 5 4" /></svg>
          </button>
          <button
            type="button"
            className="node-edit-button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setEditing(true);
            }}
            aria-label={`Knoten bearbeiten: ${label}`}
            title="Knoten bearbeiten"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M11.7 2.3a1.4 1.4 0 0 1 2 2L6 12l-3 1 1-3 7.7-7.7Z" />
              <path d="m10.7 3.3 2 2" />
            </svg>
          </button>
        </span>
      </summary>
      <div className="family-group-content">
        {hasChildren && (
          <div className="children-branch">
            <div className={`children-list${stackTerminalChildren ? ' is-leaf-stack-option' : ''}`}>
              {orderedChildren.map((child) => (
                <PersonBranch
                  key={child.person.id}
                  branch={child}
                  depth={depth + 1}
                  genogramId={genogramId}
                  database={database}
                  onDataChanged={onDataChanged}
                  selectedNodeId={selectedNodeId}
                  onSelectNode={onSelectNode}
                  onExpandFromNode={onExpandFromNode}
                  onCollapseFromNode={onCollapseFromNode}
                  stackTerminalChildren={stackTerminalChildren}
                />
              ))}
            </div>
          </div>
        )}
      </div>
      {editing && (
        <FamilyNodeEditor
          group={group}
          genogramId={genogramId}
          database={database}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onDataChanged();
          }}
        />
      )}
    </details>
  );
}

function PersonBranch({
  branch,
  depth,
  genogramId,
  database,
  onDataChanged,
  selectedNodeId,
  onSelectNode,
  onExpandFromNode,
  onCollapseFromNode,
  stackTerminalChildren,
}: {
  branch: FamilyTreePerson;
  depth: number;
  genogramId: string;
  database: LocalDatabaseClient | null;
  onDataChanged: () => void;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onExpandFromNode: (nodeId: string) => void;
  onCollapseFromNode: (nodeId: string) => void;
  stackTerminalChildren: boolean;
}) {
  return (
    <div className="person-branch">
      {branch.unions.length > 0
        ? branch.unions.map((group) => (
            <FamilyGroup
              key={group.id}
              group={group}
              genogramId={genogramId}
              database={database}
              onDataChanged={onDataChanged}
              selectedNodeId={selectedNodeId}
              onSelectNode={onSelectNode}
              onExpandFromNode={onExpandFromNode}
              onCollapseFromNode={onCollapseFromNode}
              stackTerminalChildren={stackTerminalChildren}
              depth={depth}
            />
          ))
        : <PersonSummary person={branch.person} />}
    </div>
  );
}

function AddFamilyMemberDialog({ genogramId, kind, partner, parents, database, onCancel, onSaved }: {
  genogramId: string;
  kind: 'child' | 'partner';
  partner: GenogramPerson | null;
  parents: GenogramPerson[];
  database: LocalDatabaseClient | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [deathDate, setDeathDate] = useState('');
  const [gender, setGender] = useState<GenogramPerson['gender']>('unknown');
  const [parentLinks, setParentLinks] = useState(() => parents.map((person) => ({
    parentId: person.id, selected: true, relationshipType: 'unspecified' as ParentageType,
  })));
  const [status, setStatus] = useState<'married' | 'unknown'>('unknown');
  const [partnershipDate, setPartnershipDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedBirthDate = parseCorrectionDate(birthDate);
    const parsedDeathDate = parseCorrectionDate(deathDate);
    const parsedPartnershipDate = parseCorrectionDate(partnershipDate);
    if (!name.trim() || parsedBirthDate === undefined || parsedDeathDate === undefined || parsedPartnershipDate === undefined) {
      setError('Bitte einen Namen eingeben und Datumsangaben als TT.MM.JJJJ, MM.JJJJ oder JJJJ prüfen.');
      return;
    }
    const selectedParents = parentLinks.filter((link) => link.selected);
    if (kind === 'child' && selectedParents.length === 0) {
      setError('Wähle mindestens einen Elternteil aus.');
      return;
    }
    if (kind === 'partner' && !partner) {
      setError('Die ausgewählte Bezugsperson wurde nicht gefunden.');
      return;
    }
    if (!database) {
      setError('Der lokale Speicher ist nicht verfügbar.');
      return;
    }

    const input: AddFamilyMemberInput = {
      genogramId,
      person: {
        id: crypto.randomUUID(), name: name.trim(), familyName: familyName.trim() || null,
        birthDate: parsedBirthDate ?? null, deathDate: parsedDeathDate ?? null, gender,
      },
      relationship: kind === 'child'
        ? { kind: 'child', parents: selectedParents.map(({ parentId, relationshipType }) => ({ parentId, relationshipType })) }
        : { kind: 'partner', partnerId: partner!.id, status, startDate: parsedPartnershipDate ?? null },
    };
    setSaving(true);
    setError(null);
    try {
      await database.addFamilyMember(input);
      onSaved();
    } catch {
      setError('Die Person konnte nicht im lokalen Speicher angelegt werden.');
    } finally {
      setSaving(false);
    }
  }

  function updateParent(parentId: string, update: { selected?: boolean; relationshipType?: ParentageType }) {
    setParentLinks((current) => current.map((link) => link.parentId === parentId ? { ...link, ...update } : link));
  }

  return createPortal((
    <div className="editor-backdrop">
      <form className="add-member-dialog" role="dialog" aria-modal="true" aria-labelledby="add-member-title" onSubmit={save}>
        <header className="node-editor-heading dialog-header">
          <div><p className="eyebrow">Genogramm ergänzen</p><h3 id="add-member-title">{kind === 'child' ? 'Kind hinzufügen' : 'Partner hinzufügen'}</h3></div>
          <button type="button" className="icon-button" onClick={onCancel} aria-label="Dialog schließen">×</button>
        </header>
        <div className="dialog-body add-member-body">
          <div className="editor-fields">
            <label>Name<input autoFocus required value={name} onChange={(event) => setName(event.currentTarget.value)} /></label>
            <label>Familienname<input value={familyName} onChange={(event) => setFamilyName(event.currentTarget.value)} /></label>
            <label>Geburtsdatum<input placeholder="TT.MM.JJJJ, MM.JJJJ oder JJJJ" value={birthDate} onChange={(event) => setBirthDate(event.currentTarget.value)} /></label>
            <label>Todesdatum<input placeholder="TT.MM.JJJJ, MM.JJJJ oder JJJJ" value={deathDate} onChange={(event) => setDeathDate(event.currentTarget.value)} /></label>
            <label>Geschlecht (für Genogramm-Symbol)
              <select value={gender} onChange={(event) => setGender(event.currentTarget.value as GenogramPerson['gender'])}>
                <option value="unknown">Unbekannt / keine Angabe</option><option value="female">Weiblich</option><option value="male">Männlich</option><option value="nonbinary">Nicht-binär</option>
              </select>
            </label>
          </div>
          {kind === 'child' && <fieldset className="add-member-parents">
            <legend>Elternzuordnung</legend>
            <p>Wähle die zugeordneten Eltern aus. Die Art der Elternschaft wird nicht automatisch abgeleitet.</p>
            {parentLinks.map((link) => {
              const person = parents.find((candidate) => candidate.id === link.parentId)!;
              return <div className="add-member-parent-row" key={link.parentId}>
                <label><input type="checkbox" checked={link.selected} onChange={(event) => updateParent(link.parentId, { selected: event.currentTarget.checked })} />{displayName(person)}</label>
                {link.selected && <select aria-label={`Elternschaftsart für ${displayName(person)}`} value={link.relationshipType} onChange={(event) => updateParent(link.parentId, { relationshipType: event.currentTarget.value as ParentageType })}>
                  <option value="unspecified">Unbekannt / ungeklärt</option><option value="biological">Biologisch</option><option value="adoptive">Adoptiv</option><option value="step">Stiefelternschaft</option><option value="foster">Pflege</option><option value="social">Sozial</option>
                </select>}
              </div>;
            })}
          </fieldset>}
          {kind === 'partner' && <fieldset className="add-member-parents">
            <legend>Partnerschaft mit {partner ? displayName(partner) : 'Person'}</legend>
            <div className="editor-fields editor-partnership-fields">
              <label>Status<select value={status} onChange={(event) => setStatus(event.currentTarget.value as 'married' | 'unknown')}><option value="unknown">Unbekannt</option><option value="married">Verheiratet</option></select></label>
              <label>Datum<input placeholder="TT.MM.JJJJ, MM.JJJJ oder JJJJ" value={partnershipDate} onChange={(event) => setPartnershipDate(event.currentTarget.value)} /></label>
            </div>
          </fieldset>}
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
        <footer className="dialog-footer"><button type="button" className="secondary-button" onClick={onCancel}>Abbrechen</button><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Wird gespeichert …' : 'Hinzufügen'}</button></footer>
      </form>
    </div>
  ), document.body);
}

function CreateGenogramDialog({ database, onCancel, onCreated }: {
  database: LocalDatabaseClient | null;
  onCancel: () => void;
  onCreated: (genogramId: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [name, setName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [deathDate, setDeathDate] = useState('');
  const [gender, setGender] = useState<GenogramPerson['gender']>('unknown');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedBirthDate = parseCorrectionDate(birthDate);
    const parsedDeathDate = parseCorrectionDate(deathDate);
    if (!title.trim() || title.trim().length > 200 || !name.trim()
      || parsedBirthDate === undefined || parsedDeathDate === undefined) {
      setError(!title.trim() || title.trim().length > 200
        ? 'Bitte gib einen Genogrammnamen mit höchstens 200 Zeichen ein.'
        : 'Bitte gib einen Namen ein und prüfe die Datumsangaben (TT.MM.JJJJ, MM.JJJJ oder JJJJ).');
      return;
    }
    if (!database) {
      setError('Der lokale Speicher ist nicht verfügbar.');
      return;
    }

    const input: NewGenogramInput = {
      title: title.trim(),
      rootPerson: {
        id: crypto.randomUUID(),
        name: name.trim(),
        familyName: familyName.trim() || null,
        birthDate: parsedBirthDate ?? null,
        deathDate: parsedDeathDate ?? null,
        gender,
      },
    };
    setSaving(true);
    setError(null);
    try {
      const genogramId = await database.createGenogram(input);
      onCreated(genogramId);
    } catch {
      setError('Das Genogramm konnte nicht im lokalen Speicher angelegt werden.');
    } finally {
      setSaving(false);
    }
  }

  return createPortal((
    <div className="editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onCancel(); }}>
      <form className="add-member-dialog" role="dialog" aria-modal="true" aria-labelledby="new-genogram-title" onSubmit={save}>
        <header className="node-editor-heading dialog-header">
          <div><p className="eyebrow">Neu beginnen</p><h3 id="new-genogram-title">Genogramm erstellen</h3></div>
          <button type="button" className="icon-button" onClick={onCancel} disabled={saving} aria-label="Dialog schließen">×</button>
        </header>
        <div className="dialog-body add-member-body">
          <div className="editor-fields">
            <label>Genogrammname<input autoFocus required maxLength={200} value={title} onChange={(event) => setTitle(event.currentTarget.value)} /></label>
            <label>Name der ersten Person<input required value={name} onChange={(event) => setName(event.currentTarget.value)} /></label>
            <label>Familienname<input value={familyName} onChange={(event) => setFamilyName(event.currentTarget.value)} /></label>
            <label>Geburtsdatum<input placeholder="TT.MM.JJJJ, MM.JJJJ oder JJJJ" value={birthDate} onChange={(event) => setBirthDate(event.currentTarget.value)} /></label>
            <label>Todesdatum<input placeholder="TT.MM.JJJJ, MM.JJJJ oder JJJJ" value={deathDate} onChange={(event) => setDeathDate(event.currentTarget.value)} /></label>
            <label>Geschlecht (für Genogramm-Symbol)
              <select value={gender} onChange={(event) => setGender(event.currentTarget.value as GenogramPerson['gender'])}>
                <option value="unknown">Unbekannt / keine Angabe</option><option value="female">Weiblich</option><option value="male">Männlich</option><option value="nonbinary">Nicht-binär</option>
              </select>
            </label>
          </div>
          <p className="editor-privacy-note">Die erste Person wird als Wurzel angelegt. Partner und Kinder kannst du anschließend am Knoten ergänzen. Die Daten bleiben in diesem Browser.</p>
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
        <footer className="dialog-footer">
          <button type="button" className="secondary-button" onClick={onCancel} disabled={saving}>Abbrechen</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? 'Wird angelegt …' : 'Genogramm anlegen'}</button>
        </footer>
      </form>
    </div>
  ), document.body);
}

function FamilyNodeEditor({
  group,
  genogramId,
  database,
  onCancel,
  onSaved,
}: {
  group: FamilyTreeGroup;
  genogramId: string;
  database: LocalDatabaseClient | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [people, setPeople] = useState(() => group.partners.map((person) => ({
    id: person.id,
    name: person.name,
    familyName: person.familyName ?? '',
    birthDate: inputDate(person.birthDate, person.birthDatePrecision),
    deathDate: inputDate(person.deathDate, person.deathDatePrecision),
    gender: person.gender,
  })));
  const [status, setStatus] = useState(group.partnership?.status ?? 'unknown');
  const [marriageDate, setMarriageDate] = useState(
    inputDate(group.partnership?.startDate ?? null, group.partnership?.startDatePrecision ?? null),
  );
  const parentIds = group.partners.map((partner) => partner.id);
  const [childParentages, setChildParentages] = useState(() => group.children.map((child) => ({
    childId: child.person.id,
    childName: displayName(child.person),
    parents: group.partners.map((parent) => {
      const link = child.parentLinks.find((candidate) => candidate.parentId === parent.id);
      return {
        parentId: parent.id,
        selected: Boolean(link),
        relationshipType: parentageType(link?.relationshipType),
      };
    }),
  })));
  const [activeTab, setActiveTab] = useState<'people' | 'parents'>('people');
  const [activeChildId, setActiveChildId] = useState(() => group.children[0]?.person.id ?? '');
  const activeChild = childParentages.find((child) => child.childId === activeChildId) ?? childParentages[0];
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function updatePerson(index: number, field: 'name' | 'familyName' | 'birthDate' | 'deathDate' | 'gender', value: string) {
    setPeople((current) => current.map((person, personIndex) =>
      personIndex === index ? { ...person, [field]: value } : person));
  }

  function updateChildParentage(childId: string, parentId: string, update: { selected?: boolean; relationshipType?: ParentageType }) {
    setChildParentages((current) => current.map((child) => child.childId !== childId ? child : {
      ...child,
      parents: child.parents.map((parent) => parent.parentId !== parentId ? parent : { ...parent, ...update }),
    }));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!database) {
      setError('Der lokale Speicher ist nicht verfügbar.');
      return;
    }

    const parsedPeople = people.map((person) => ({
      id: person.id,
      name: person.name.trim(),
      familyName: person.familyName.trim() || null,
      birthDate: parseCorrectionDate(person.birthDate),
      deathDate: parseCorrectionDate(person.deathDate),
      gender: person.gender,
    }));
    const parsedMarriageDate = parseCorrectionDate(marriageDate);
    if (parsedPeople.some((person) => !person.name || person.birthDate === undefined || person.deathDate === undefined)
      || parsedMarriageDate === undefined) {
      setError('Bitte Namen ausfüllen und Datumsangaben als TT.MM.JJJJ, MM.JJJJ oder JJJJ eingeben.');
      setActiveTab('people');
      return;
    }

    const correction: FamilyNodeCorrection = {
      genogramId,
      people: parsedPeople.map((person) => ({
        ...person,
        birthDate: person.birthDate ?? null,
        deathDate: person.deathDate ?? null,
      })),
      partnership: group.partnership ? {
        id: group.partnership.id,
        status,
        startDate: parsedMarriageDate ?? null,
      } : null,
      replaceParentIds: parentIds,
      childParentages: childParentages.map((child) => ({
        childId: child.childId,
        links: child.parents.filter((parent) => parent.selected).map((parent) => ({
          parentId: parent.parentId,
          relationshipType: parent.relationshipType,
        })),
      })),
    };
    setSaving(true);
    setError(null);
    try {
      await database.updateFamilyNode(correction);
      onSaved();
    } catch {
      setError('Die Korrektur konnte nicht im lokalen Speicher gesichert werden.');
    } finally {
      setSaving(false);
    }
  }

  return createPortal((
    <div className="editor-backdrop">
      <form className="node-editor" role="dialog" aria-modal="true" aria-labelledby="node-editor-title" onSubmit={save}>
        <div className="node-editor-top">
          <header className="node-editor-heading dialog-header">
            <div>
              <p className="eyebrow">Lokale Korrektur</p>
              <h3 id="node-editor-title">Knoten bearbeiten</h3>
            </div>
            <button type="button" className="icon-button" onClick={onCancel} aria-label="Bearbeitung schließen">×</button>
          </header>
          {childParentages.length > 0 && <div className="editor-tabs" role="tablist" aria-label="Bereiche der Knotenbearbeitung">
            <button type="button" role="tab" id="editor-tab-people" aria-controls="editor-panel-people" aria-selected={activeTab === 'people'} onClick={() => setActiveTab('people')}>Personen &amp; Partnerschaft</button>
            <button type="button" role="tab" id="editor-tab-parents" aria-controls="editor-panel-parents" aria-selected={activeTab === 'parents'} onClick={() => setActiveTab('parents')}>Elternzuordnungen <span>{childParentages.length}</span></button>
          </div>}
        </div>
        <div className="dialog-body">
        {activeTab === 'people' && <div id="editor-panel-people" role={childParentages.length > 0 ? 'tabpanel' : undefined} aria-labelledby={childParentages.length > 0 ? 'editor-tab-people' : undefined} className="editor-tab-panel">
        {people.map((person, index) => (
          <fieldset className="editor-person" key={person.id}>
            <legend>{people.length > 1 ? `Person ${index + 1}` : 'Person'}</legend>
            <div className="editor-fields">
              <label>Name<input required value={person.name} onChange={(event) => updatePerson(index, 'name', event.currentTarget.value)} /></label>
              <label>Familienname<input value={person.familyName} onChange={(event) => updatePerson(index, 'familyName', event.currentTarget.value)} /></label>
              <label>Geburtsdatum<input value={person.birthDate} placeholder="TT.MM.JJJJ, MM.JJJJ oder JJJJ" onChange={(event) => updatePerson(index, 'birthDate', event.currentTarget.value)} /></label>
              <label>Todesdatum<input value={person.deathDate} placeholder="TT.MM.JJJJ, MM.JJJJ oder JJJJ" onChange={(event) => updatePerson(index, 'deathDate', event.currentTarget.value)} /></label>
              <label>Geschlecht (für Genogramm-Symbol)
                <select value={person.gender} onChange={(event) => updatePerson(index, 'gender', event.currentTarget.value)}>
                  <option value="unknown">Unbekannt / keine Angabe</option>
                  <option value="female">Weiblich</option>
                  <option value="male">Männlich</option>
                  <option value="nonbinary">Nicht-binär</option>
                </select>
              </label>
            </div>
          </fieldset>
        ))}
        {group.partnership && (
          <fieldset className="editor-person">
            <legend>Partnerschaft</legend>
            <div className="editor-fields editor-partnership-fields">
              <label>Status
                <select value={status} onChange={(event) => setStatus(event.currentTarget.value as 'married' | 'unknown')}>
                  <option value="married">Verheiratet</option>
                  <option value="unknown">Unbekannt</option>
                </select>
              </label>
              <label>Datum<input value={marriageDate} placeholder="TT.MM.JJJJ, MM.JJJJ oder JJJJ" onChange={(event) => setMarriageDate(event.currentTarget.value)} /></label>
            </div>
          </fieldset>
        )}
        </div>}
        {activeTab === 'parents' && activeChild && <div id="editor-panel-parents" role="tabpanel" aria-labelledby="editor-tab-parents" className="editor-tab-panel parentage-tab-panel">
          <p className="parentage-tab-intro">Wähle für das Kind die tatsächlich zugeordneten Eltern und die Art der Elternschaft aus.</p>
          <label className="parentage-child-select">Kind
            <select value={activeChild.childId} onChange={(event) => setActiveChildId(event.currentTarget.value)}>
              {childParentages.map((child) => <option value={child.childId} key={child.childId}>{child.childName}</option>)}
            </select>
          </label>
          <div className="parentage-child-editor">
            {activeChild.parents.map((parent, index) => <div className="parentage-link-editor" key={parent.parentId}>
              <label className="parentage-parent-check">
                <input type="checkbox" checked={parent.selected} onChange={(event) => updateChildParentage(activeChild.childId, parent.parentId, { selected: event.currentTarget.checked })} />
                <span>{group.partners[index] ? displayName(group.partners[index]) : 'Elternteil'}</span>
              </label>
              {parent.selected && <label className="parentage-type-select">Art
                <select value={parent.relationshipType} onChange={(event) => updateChildParentage(activeChild.childId, parent.parentId, { relationshipType: event.currentTarget.value as ParentageType })}>
                  <option value="unspecified">Unbekannt / ungeklärt</option>
                  <option value="biological">Biologisch</option>
                  <option value="adoptive">Adoptiv</option>
                  <option value="foster">Pflege</option>
                  <option value="step">Stiefelternschaft</option>
                  <option value="social">Soziale Elternschaft</option>
                </select>
              </label>}
            </div>)}
          </div>
        </div>}
        {error && <p className="inline-error" role="alert">{error}</p>}
        </div>
        <footer className="dialog-footer editor-dialog-footer">
          <p className="editor-privacy-note">Änderungen werden ausschließlich in diesem Browser gespeichert.</p>
          <div className="editor-actions">
          <button type="button" className="secondary-button" onClick={onCancel} disabled={saving}>Abbrechen</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? 'Speichert …' : 'Änderungen speichern'}</button>
          </div>
        </footer>
      </form>
    </div>
  ), document.body);
}

const PENDING_CHANGE_STORAGE_KEY = 'cherware-genogram-pending-json-changes-v1';

function readPendingChangeCounts(): Record<string, number> {
  try {
    const value = JSON.parse(localStorage.getItem(PENDING_CHANGE_STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] =>
      typeof entry[1] === 'number' && Number.isSafeInteger(entry[1]) && entry[1] > 0,
    ));
  } catch {
    return {};
  }
}

function persistPendingChangeCounts(counts: Record<string, number>) {
  try { localStorage.setItem(PENDING_CHANGE_STORAGE_KEY, JSON.stringify(counts)); } catch { /* Browser storage may be disabled or full. */ }
}

function branchDeletionCounts(genogram: GenogramDetail, rootPersonIds: string[]): { peopleCount: number; partnershipsCount: number; linksCount: number } {
  const childrenByParent = new Map<string, string[]>();
  genogram.parentChildLinks.forEach((link) => {
    const children = childrenByParent.get(link.parentId) ?? [];
    children.push(link.childId);
    childrenByParent.set(link.parentId, children);
  });
  const personIds = new Set<string>();
  const pending = [...rootPersonIds];
  while (pending.length > 0) {
    const personId = pending.pop()!;
    if (personIds.has(personId)) continue;
    personIds.add(personId);
    pending.push(...(childrenByParent.get(personId) ?? []));
  }
  return {
    peopleCount: personIds.size,
    partnershipsCount: genogram.partnerships.filter((partnership) => personIds.has(partnership.personAId) || personIds.has(partnership.personBId)).length,
    linksCount: genogram.parentChildLinks.filter((link) => personIds.has(link.parentId) || personIds.has(link.childId)).length,
  };
}

function inputDate(value: string | null, precision: 'day' | 'month' | 'year' | null): string {
  if (!value) return '';
  if (precision === 'month' && /^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split('-');
    return `${month}.${year}`;
  }
  if (precision === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-');
    return `${day}.${month}.${year}`;
  }
  return value;
}

function findTreeGroup(groups: FamilyTreeGroup[], id: string): FamilyTreeGroup | null {
  for (const group of groups) {
    if (group.id === id) return group;
    const nested = findTreeGroup(group.children.flatMap((child) => child.unions), id);
    if (nested) return nested;
  }
  return null;
}

function applyChildOrder(groups: FamilyTreeGroup[], childOrder: Record<string, string[]>): FamilyTreeGroup[] {
  return groups.map((group) => {
    const children = group.children.map((child) => ({ ...child, unions: applyChildOrder(child.unions, childOrder) }));
    const preferred = childOrder[group.id];
    if (!preferred?.length) return { ...group, children };
    const byId = new Map(children.map((child) => [child.person.id, child]));
    const ordered = preferred.flatMap((id) => {
      const child = byId.get(id);
      if (!child) return [];
      byId.delete(id);
      return [child];
    });
    return { ...group, children: [...ordered, ...byId.values()], hasCustomChildOrder: true };
  });
}

function compareBirthDates(left: FamilyTreePerson, right: FamilyTreePerson): number {
  const leftDate = birthDateSortKey(left.person.birthDate);
  const rightDate = birthDateSortKey(right.person.birthDate);
  if (leftDate === null) return rightDate === null ? 0 : 1;
  if (rightDate === null) return -1;
  return leftDate - rightDate;
}

function birthDateSortKey(value: string | null): number | null {
  if (!value) return null;
  const yearOnly = /^(\d{4})$/.exec(value);
  if (yearOnly) return Number(yearOnly[1]) * 10_000;
  const monthOnly = /^(\d{4})-(\d{2})$/.exec(value);
  if (monthOnly) return Number(monthOnly[1]) * 10_000 + Number(monthOnly[2]) * 100;
  const fullDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!fullDate) return null;
  return Number(fullDate[1]) * 10_000 + Number(fullDate[2]) * 100 + Number(fullDate[3]);
}

function parseCorrectionDate(value: string): EditableDate | null | undefined {
  const parsed = editableDateInput(value);
  if (parsed?.precision === 'unparsed') return undefined;
  return parsed;
}

function PersonSummary({ person }: { person: GenogramPerson }) {
  const dates = [
    person.birthDate ? `geb. ${formatDate(person.birthDate, person.birthDatePrecision)}` : null,
    person.deathDate ? `gest. ${formatDate(person.deathDate, person.deathDatePrecision)}` : null,
  ].filter(Boolean);
  const accessibleLabel = [displayName(person), dates.join(' · ')].filter(Boolean).join(' — ');
  return (
    <span className="person-summary" title={accessibleLabel}>
      <span className="person-marker" aria-hidden="true" />
      <span className="person-summary-copy">
        <strong>{displayName(person)}</strong>
        {dates.length > 0 && <span className="person-dates">
          {person.birthDate && <span>geb. {formatDate(person.birthDate, person.birthDatePrecision)}</span>}
          {person.deathDate && <span>gest. {formatDate(person.deathDate, person.deathDatePrecision)}</span>}
        </span>}
      </span>
    </span>
  );
}

function displayName(person: GenogramPerson): string {
  return [person.name, person.familyName].filter(Boolean).join(' ');
}

function genogramPersonName(person: GenogramPerson, hideLastName: boolean): string {
  return hideLastName && person.familyName ? person.name : displayName(person);
}

function genogramPersonCardClass(gender: GenogramPerson['gender']): string {
  return gender === 'female' ? 'female' : gender === 'male' ? 'male' : gender === 'nonbinary' ? 'nonbinary' : 'unknown';
}

const cohortColors = ['#72a889', '#6b9fbd', '#9784b8', '#ca8292', '#d69a61', '#bea84f', '#5c9b9d'];

function cohortForYear(birthDate: string | null | undefined, cohorts: GenerationCohort[]): GenerationCohort | undefined {
  if (!birthDate) return undefined;
  const year = Number(birthDate.slice(0, 4));
  if (!Number.isInteger(year)) return undefined;
  return cohorts.find((cohort) => year >= cohort.fromYear && year <= cohort.toYear);
}

function generationStyle(birthDate: string | null | undefined, enabled: boolean, cohorts: GenerationCohort[]): React.CSSProperties {
  if (!enabled) return {};
  const cohort = cohortForYear(birthDate, cohorts);
  if (!cohort) return {};
  return { '--cohort-color': cohortColors[cohorts.indexOf(cohort) % cohortColors.length] } as React.CSSProperties;
}

function parentageType(value: string | undefined): ParentageType {
  return value === 'biological' || value === 'adoptive' || value === 'foster' || value === 'step' || value === 'social'
    ? value : 'unspecified';
}

function formatDate(value: string, precision: 'day' | 'month' | 'year' | null): string {
  if (precision === 'year' || /^\d{4}$/.test(value)) return value;
  if (precision === 'month' && /^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split('-');
    return `${month}.${year}`;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Zeitpunkt unbekannt' : new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(date);
}
