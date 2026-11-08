import { useEffect, useState } from 'react';
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
    </main>
  );
}
