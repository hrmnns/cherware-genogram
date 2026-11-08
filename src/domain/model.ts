export type DatePrecision = 'day' | 'month' | 'year';
export type DateValue = { value: string; precision: DatePrecision };
export type DateFieldDraft = DateValue | { value: string; precision: 'unparsed' };
export type MarriageStatus = 'married' | 'unknown';
export type ImportedParentAssignment = 'primary-parent' | 'primary-and-partner';

export interface ImportPersonDraft {
  name: string;
  familyName: string | null;
  birthDate: DateFieldDraft | null;
  deathDate: DateFieldDraft | null;
}

export interface ImportEntryDraft {
  sourceRow: number;
  generation: number;
  generationValid: boolean;
  parentSourceRow: number | null;
  parentAssignment: ImportedParentAssignment;
  person: ImportPersonDraft;
  spouse: ImportPersonDraft | null;
  marriageStatus: MarriageStatus | null;
  marriageDate: DateFieldDraft | null;
  warnings: string[];
}

export interface ImportSummary {
  personCount: number;
  partnershipCount: number;
  parentChildLinkCount: number;
}
