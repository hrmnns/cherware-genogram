export interface GenogramSummary {
  id: string;
  title: string;
  createdAt: string;
  sourceFormat: string;
  personCount: number;
  partnershipCount: number;
  parentChildLinkCount: number;
}

export interface GenogramPerson {
  id: string;
  name: string;
  familyName: string | null;
  birthDate: string | null;
  birthDatePrecision: 'day' | 'month' | 'year' | null;
  deathDate: string | null;
  deathDatePrecision: 'day' | 'month' | 'year' | null;
  gender: GenogramGender;
}

export type GenogramGender = 'female' | 'male' | 'nonbinary' | 'unknown';

export interface GenogramPartnership {
  id: string;
  personAId: string;
  personBId: string;
  status: 'married' | 'unknown';
  startDate: string | null;
  startDatePrecision: 'day' | 'month' | 'year' | null;
}

export interface ParentChildLink {
  id: string;
  parentId: string;
  childId: string;
  relationshipType: string;
}

export type ParentageType = 'unspecified' | 'biological' | 'adoptive' | 'foster' | 'step' | 'social';

export interface ParentageLinkCorrection {
  parentId: string;
  relationshipType: ParentageType;
}

export interface ChildParentageCorrection {
  childId: string;
  links: ParentageLinkCorrection[];
}

export interface GenogramDetail {
  summary: GenogramSummary;
  people: GenogramPerson[];
  partnerships: GenogramPartnership[];
  parentChildLinks: ParentChildLink[];
}

export interface EditableDate {
  value: string;
  precision: 'day' | 'month' | 'year';
}

export interface PersonCorrection {
  id: string;
  name: string;
  familyName: string | null;
  birthDate: EditableDate | null;
  deathDate: EditableDate | null;
  gender: GenogramGender;
}

export interface PartnershipCorrection {
  id: string;
  status: 'married' | 'unknown';
  startDate: EditableDate | null;
}

export interface FamilyNodeCorrection {
  genogramId: string;
  people: PersonCorrection[];
  partnership: PartnershipCorrection | null;
  replaceParentIds: string[];
  childParentages: ChildParentageCorrection[];
}

export interface AddFamilyMemberInput {
  genogramId: string;
  person: PersonCorrection;
  relationship:
    | { kind: 'child'; parents: ParentageLinkCorrection[] }
    | { kind: 'partner'; partnerId: string; status: 'married' | 'unknown'; startDate: EditableDate | null };
}

export interface NewGenogramInput {
  title: string;
  rootPerson: PersonCorrection;
}

export interface FamilyTreePerson {
  person: GenogramPerson;
  unions: FamilyTreeGroup[];
  parentLinks: ParentChildLink[];
}

export interface FamilyTreeGroup {
  id: string;
  hasCustomChildOrder?: boolean;
  partnership: GenogramPartnership | null;
  partners: GenogramPerson[];
  children: FamilyTreePerson[];
}
