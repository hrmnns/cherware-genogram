import type { ImportEntryDraft, ImportSummary } from '../domain/model';
import type { AddFamilyMemberInput, FamilyNodeCorrection, GenogramDetail, GenogramSummary, NewGenogramInput } from '../domain/savedGenogram';
import type { GenogramArchiveV1 } from '../backup/archive';

export type DatabaseStatus =
  | { state: 'starting' }
  | { state: 'ready'; sqliteVersion: string; storage: 'opfs-sahpool' }
  | { state: 'unavailable'; reason: 'unsupported' | 'initialization-failed' };

export type DatabaseCommand =
  | {
  type: 'import';
  entries: ImportEntryDraft[];
  }
  | { type: 'list-genograms' }
  | { type: 'get-genogram'; genogramId: string }
  | { type: 'rename-genogram'; genogramId: string; title: string }
  | { type: 'update-family-node'; correction: FamilyNodeCorrection }
  | { type: 'add-family-member'; input: AddFamilyMemberInput }
  | { type: 'create-genogram'; input: NewGenogramInput }
  | { type: 'export-genogram'; genogramId: string }
  | { type: 'import-genogram'; archive: unknown }
  | { type: 'delete-family-branch'; genogramId: string; rootPersonIds: string[] }
  | { type: 'delete-genogram'; genogramId: string };

export type DatabaseRequest = DatabaseCommand & { requestId: string };

export type DatabaseWorkerMessage =
  | { type: 'ready'; sqliteVersion: string }
  | { type: 'unavailable'; reason: 'unsupported' | 'initialization-failed' }
  | { type: 'imported'; requestId: string; summary: ImportSummary }
  | { type: 'import-failed'; requestId: string }
  | { type: 'genograms-listed'; requestId: string; genograms: GenogramSummary[] }
  | { type: 'genogram-loaded'; requestId: string; genogram: GenogramDetail | null }
  | { type: 'genogram-renamed'; requestId: string }
  | { type: 'family-node-updated'; requestId: string }
  | { type: 'family-member-added'; requestId: string }
  | { type: 'genogram-created'; requestId: string; genogramId: string }
  | { type: 'genogram-exported'; requestId: string; archive: GenogramArchiveV1 | null }
  | { type: 'genogram-imported'; requestId: string; genogramId: string; personIdMap: Record<string, string> }
  | { type: 'family-branch-deleted'; requestId: string }
  | { type: 'genogram-deleted'; requestId: string }
  | { type: 'query-failed'; requestId: string };
