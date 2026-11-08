import { useEffect, useState } from 'react';
import { Info, X } from 'lucide-react';
import { openLocalDatabase } from './db/database';
import type { LocalDatabaseClient } from './db/database';
import type { DatabaseStatus } from './db/protocol';
import SavedGenograms from './genograms/SavedGenograms';

const initialStatus: DatabaseStatus = { state: 'starting' };

export default function App() {
  const [databaseStatus, setDatabaseStatus] = useState<DatabaseStatus>(initialStatus);
  const [database, setDatabase] = useState<LocalDatabaseClient | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [caseMenuOpen, setCaseMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [fileMenuHost, setFileMenuHost] = useState<HTMLDivElement | null>(null);
  const [viewMenuHost, setViewMenuHost] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    let client: LocalDatabaseClient | undefined;
    const startup = window.setTimeout(() => {
      client = openLocalDatabase(setDatabaseStatus);
      setDatabase(client);
    }, 0);

    return () => {
      window.clearTimeout(startup);
      client?.close();
    };
  }, []);

  const isReady = databaseStatus.state === 'ready';

  useEffect(() => {
    if (!aboutOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setAboutOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [aboutOpen]);

  return (
    <main className="page-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <button
            type="button"
            className="hamburger-button"
            aria-label={caseMenuOpen ? 'Fallmenü schließen' : 'Fallmenü öffnen'}
            aria-expanded={caseMenuOpen}
            aria-controls="case-drawer"
            onClick={() => setCaseMenuOpen((open) => !open)}
          >
            <span /><span /><span />
          </button>
          <a className="wordmark" href="/" aria-label="Genogramm Startseite">
            <span>Genogramm</span>
          </a>
        </div>
        <div className="topbar-actions">
          <nav className="app-menubar" aria-label="Hauptmenü">
            <div className="header-file-menu-host" ref={setFileMenuHost} />
            <div className="header-view-menu-host" ref={setViewMenuHost} />
            <button type="button" className="about-menu-button" aria-label="Über Cherware Genogramm" title="Über Cherware Genogramm" onClick={() => setAboutOpen(true)}><Info size={15} /><span>Über</span></button>
          </nav>
          <div className="topbar-status">
          <span className={`storage-status ${isReady ? 'is-ready' : databaseStatus.state === 'unavailable' ? 'is-error' : ''}`} role="status">
            <span className="privacy-dot" aria-hidden="true" />
            {isReady ? 'Lokal bereit' : databaseStatus.state === 'unavailable' ? 'Speicher nicht verfügbar' : 'Speicher startet …'}
          </span>
          {isReady && <span className="storage-version">SQLite {databaseStatus.state === 'ready' ? databaseStatus.sqliteVersion : ''} · OPFS</span>}
          </div>
        </div>
      </header>

      <SavedGenograms
        databaseReady={isReady}
        database={database}
        refreshKey={refreshKey}
        fileMenuHost={fileMenuHost}
        viewMenuHost={viewMenuHost}
        onArchiveImported={() => setRefreshKey((current) => current + 1)}
        caseMenuOpen={caseMenuOpen}
        onCloseCaseMenu={() => setCaseMenuOpen(false)}
        onCaseDeleted={() => setRefreshKey((current) => current + 1)}
      />
      {aboutOpen && <div className="editor-backdrop about-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setAboutOpen(false); }}>
        <section className="about-dialog" role="dialog" aria-modal="true" aria-labelledby="about-title">
          <header className="dialog-header"><div><p className="eyebrow">Über diese Anwendung</p><h2 id="about-title">Cherware Genogramm</h2></div><button type="button" className="icon-button" onClick={() => setAboutOpen(false)} aria-label="Fenster schließen"><X size={17} /></button></header>
          <div className="dialog-body about-dialog-body">
            <div className="about-version-row"><span>Version</span><strong>v{__APP_VERSION__}</strong></div>
            <p>Eine browserbasierte Anwendung zum Erstellen, Bearbeiten und Erkunden von Genogrammen.</p>
            <div className="about-detail"><strong>Lokale Speicherung</strong><span>Familiendaten bleiben in diesem Browser und werden nicht an einen Anwendungsserver übertragen.</span></div>
            <div className="about-detail"><strong>Datensicherung</strong><span>Mit einem JSON-Archiv kannst du Fälle samt Gestaltung sichern und auf ein anderes Gerät übertragen.</span></div>
          </div>
          <footer className="dialog-footer"><span className="about-version-note">Build-Version steigt mit jedem Commit.</span><button type="button" className="primary-button" onClick={() => setAboutOpen(false)}>Schließen</button></footer>
        </section>
      </div>}
    </main>
  );
}
