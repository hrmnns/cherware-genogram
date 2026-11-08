import type { ImportEntryDraft, ImportSummary } from '../domain/model';
import type { AddFamilyMemberInput, FamilyNodeCorrection, GenogramDetail, GenogramSummary, NewGenogramInput } from '../domain/savedGenogram';
import type { GenogramArchiveV1 } from '../backup/archive';
import type { DatabaseCommand, DatabaseRequest, DatabaseStatus, DatabaseWorkerMessage } from './protocol';

export interface LocalDatabaseClient {
  importEntries(entries: ImportEntryDraft[]): Promise<ImportSummary>;
  listGenograms(): Promise<GenogramSummary[]>;
  getGenogram(genogramId: string): Promise<GenogramDetail | null>;
  renameGenogram(genogramId: string, title: string): Promise<void>;
  updateFamilyNode(correction: FamilyNodeCorrection): Promise<void>;
  addFamilyMember(input: AddFamilyMemberInput): Promise<void>;
  createGenogram(input: NewGenogramInput): Promise<string>;
  exportGenogram(genogramId: string): Promise<GenogramArchiveV1 | null>;
  importGenogramArchive(archive: GenogramArchiveV1): Promise<{ genogramId: string; personIdMap: Record<string, string> }>;
  deleteFamilyBranch(genogramId: string, rootPersonIds: string[]): Promise<void>;
  deleteGenogram(genogramId: string): Promise<void>;
  close(): void;
}

export function openLocalDatabase(
  onStatus: (status: DatabaseStatus) => void,
): LocalDatabaseClient {
  const worker = new Worker(new URL('./database.worker.ts', import.meta.url), {
    type: 'module',
  });
  const pending = new Map<string, { resolve: (message: DatabaseWorkerMessage) => void; reject: () => void }>();

  onStatus({ state: 'starting' });

  worker.addEventListener('message', (event: MessageEvent<DatabaseWorkerMessage>) => {
    const message = event.data;
    if (message.type === 'ready') {
      onStatus({
        state: 'ready',
        sqliteVersion: message.sqliteVersion,
        storage: 'opfs-sahpool',
      });
      return;
    }
    if (message.type === 'unavailable') {
      onStatus({ state: 'unavailable', reason: message.reason });
      return;
    }

    const request = pending.get(message.requestId);
    if (!request) return;
    pending.delete(message.requestId);
    if (message.type === 'query-failed' || message.type === 'import-failed') request.reject();
    else request.resolve(message);
  });

  worker.addEventListener('error', () => {
    onStatus({ state: 'unavailable', reason: 'initialization-failed' });
    for (const request of pending.values()) request.reject();
    pending.clear();
  });

  return {
    importEntries(entries) {
      return sendRequest({ type: 'import', entries }).then((message) => {
        if (message.type !== 'imported') throw new Error('Unexpected database response');
        return message.summary;
      });
    },
    listGenograms() {
      return sendRequest({ type: 'list-genograms' }).then((message) => {
        if (message.type !== 'genograms-listed') throw new Error('Unexpected database response');
        return message.genograms;
      });
    },
    getGenogram(genogramId) {
      return sendRequest({ type: 'get-genogram', genogramId }).then((message) => {
        if (message.type !== 'genogram-loaded') throw new Error('Unexpected database response');
        return message.genogram;
      });
    },
    renameGenogram(genogramId, title) {
      return sendRequest({ type: 'rename-genogram', genogramId, title }).then((message) => {
        if (message.type !== 'genogram-renamed') throw new Error('Unexpected database response');
      });
    },
    updateFamilyNode(correction) {
      return sendRequest({ type: 'update-family-node', correction }).then((message) => {
        if (message.type !== 'family-node-updated') throw new Error('Unexpected database response');
      });
    },
    addFamilyMember(input) {
      return sendRequest({ type: 'add-family-member', input }).then((message) => {
        if (message.type !== 'family-member-added') throw new Error('Unexpected database response');
      });
    },
    createGenogram(input) {
      return sendRequest({ type: 'create-genogram', input }).then((message) => {
        if (message.type !== 'genogram-created') throw new Error('Unexpected database response');
        return message.genogramId;
      });
    },
    exportGenogram(genogramId) {
      return sendRequest({ type: 'export-genogram', genogramId }).then((message) => {
        if (message.type !== 'genogram-exported') throw new Error('Unexpected database response');
        return message.archive;
      });
    },
    importGenogramArchive(archive) {
      return sendRequest({ type: 'import-genogram', archive }).then((message) => {
        if (message.type !== 'genogram-imported') throw new Error('Unexpected database response');
        return { genogramId: message.genogramId, personIdMap: message.personIdMap };
      });
    },
    deleteFamilyBranch(genogramId, rootPersonIds) {
      return sendRequest({ type: 'delete-family-branch', genogramId, rootPersonIds }).then((message) => {
        if (message.type !== 'family-branch-deleted') throw new Error('Unexpected database response');
      });
    },
    deleteGenogram(genogramId) {
      return sendRequest({ type: 'delete-genogram', genogramId }).then((message) => {
        if (message.type !== 'genogram-deleted') throw new Error('Unexpected database response');
      });
    },
    close() {
      worker.terminate();
      for (const request of pending.values()) request.reject();
      pending.clear();
    },
  };

  function sendRequest(request: DatabaseCommand): Promise<DatabaseWorkerMessage> {
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject });
      worker.postMessage({ ...request, requestId } as DatabaseRequest);
    });
  }
}
