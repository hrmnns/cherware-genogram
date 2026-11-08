export type ViewOrientation = 'timeline' | 'horizontal' | 'vertical' | 'genogram';

export interface GenerationCohort {
  id: string;
  name: string;
  fromYear: number;
  toYear: number;
}

export const defaultGenerationCohorts: GenerationCohort[] = [
  { id: 'silent', name: 'Stille Generation', fromYear: 1928, toYear: 1945 },
  { id: 'boomer', name: 'Babyboomer', fromYear: 1946, toYear: 1964 },
  { id: 'x', name: 'Generation X', fromYear: 1965, toYear: 1980 },
  { id: 'y', name: 'Generation Y / Millennials', fromYear: 1981, toYear: 1996 },
  { id: 'z', name: 'Generation Z', fromYear: 1997, toYear: 2012 },
  { id: 'alpha', name: 'Generation Alpha', fromYear: 2013, toYear: 2026 },
];

export interface GenogramViewPreferences {
  orientation: ViewOrientation;
  zoom: Record<ViewOrientation, number>;
  wrapChildren: boolean;
  stackTerminalChildren: boolean;
  generationGap: number;
  hideLastNames: boolean;
  showGenerationCohorts: boolean;
  generationCohorts: GenerationCohort[];
  collapsedGenogramNodes: string[];
  scroll: Record<ViewOrientation, { left: number; top: number }>;
}

const lastCaseKey = 'cherware-genogram:last-case:v1';
const viewKey = (genogramId: string) => `cherware-genogram:view:v1:${genogramId}`;

const defaults: GenogramViewPreferences = {
  orientation: 'horizontal',
  zoom: { timeline: 1, horizontal: 1, vertical: 1, genogram: 1 },
  wrapChildren: false,
  stackTerminalChildren: false,
  generationGap: 60,
  hideLastNames: false,
  showGenerationCohorts: false,
  generationCohorts: defaultGenerationCohorts,
  collapsedGenogramNodes: [],
  scroll: {
    timeline: { left: 0, top: 0 },
    horizontal: { left: 0, top: 0 },
    vertical: { left: 0, top: 0 },
    genogram: { left: 0, top: 0 },
  },
};

export function readLastGenogramId(): string | null {
  try { return localStorage.getItem(lastCaseKey); } catch { return null; }
}

export function writeLastGenogramId(id: string): void {
  try { localStorage.setItem(lastCaseKey, id); } catch { /* Storage may be disabled or full. */ }
}

export function readViewPreferences(genogramId: string): GenogramViewPreferences {
  try {
    const value = JSON.parse(localStorage.getItem(viewKey(genogramId)) ?? 'null') as Partial<GenogramViewPreferences> | null;
    if (!value) return defaultPreferences();
    const zoom = { ...defaults.zoom, ...value.zoom };
    const scroll = { ...defaults.scroll, ...value.scroll };
    return {
      orientation: isOrientation(value.orientation) ? value.orientation : defaults.orientation,
      zoom: {
        timeline: validZoom(zoom.timeline),
        horizontal: validZoom(zoom.horizontal),
        vertical: validZoom(zoom.vertical),
        genogram: validZoom(zoom.genogram),
      },
      wrapChildren: value.wrapChildren === true,
      stackTerminalChildren: value.stackTerminalChildren === true,
      generationGap: typeof value.generationGap === 'number' ? Math.min(180, Math.max(30, value.generationGap)) : defaults.generationGap,
      hideLastNames: value.hideLastNames === true,
      showGenerationCohorts: value.showGenerationCohorts === true,
      generationCohorts: validCohorts(value.generationCohorts),
      collapsedGenogramNodes: Array.isArray(value.collapsedGenogramNodes)
        ? value.collapsedGenogramNodes.filter((id): id is string => typeof id === 'string') : [],
      scroll: {
        timeline: validScroll(scroll.timeline),
        horizontal: validScroll(scroll.horizontal),
        vertical: validScroll(scroll.vertical),
        genogram: validScroll(scroll.genogram),
      },
    };
  } catch {
    return defaultPreferences();
  }
}

export function writeViewPreferences(genogramId: string, preferences: GenogramViewPreferences): void {
  try { localStorage.setItem(viewKey(genogramId), JSON.stringify(preferences)); } catch { /* Storage may be disabled or full. */ }
}

function isOrientation(value: unknown): value is ViewOrientation {
  return value === 'timeline' || value === 'horizontal' || value === 'vertical' || value === 'genogram';
}

function defaultPreferences(): GenogramViewPreferences {
  return {
    ...defaults,
    zoom: { ...defaults.zoom },
    generationCohorts: defaults.generationCohorts.map((cohort) => ({ ...cohort })),
    collapsedGenogramNodes: [],
    scroll: {
      timeline: { ...defaults.scroll.timeline },
      horizontal: { ...defaults.scroll.horizontal },
      vertical: { ...defaults.scroll.vertical },
      genogram: { ...defaults.scroll.genogram },
    },
  };
}

function validZoom(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1.25, Math.max(0.05, value)) : 1;
}

function validScroll(value: unknown): { left: number; top: number } {
  if (!value || typeof value !== 'object') return { left: 0, top: 0 };
  const scroll = value as { left?: unknown; top?: unknown };
  return {
    left: typeof scroll.left === 'number' && Number.isFinite(scroll.left) ? Math.max(0, scroll.left) : 0,
    top: typeof scroll.top === 'number' && Number.isFinite(scroll.top) ? Math.max(0, scroll.top) : 0,
  };
}

function validCohorts(value: unknown): GenerationCohort[] {
  if (!Array.isArray(value)) return defaultGenerationCohorts.map((cohort) => ({ ...cohort }));
  return value.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const cohort = item as Partial<GenerationCohort>;
    if (typeof cohort.name !== 'string' || !cohort.name.trim() || typeof cohort.fromYear !== 'number' || typeof cohort.toYear !== 'number' || !Number.isInteger(cohort.fromYear) || !Number.isInteger(cohort.toYear) || cohort.fromYear > cohort.toYear) return [];
    return [{
      id: typeof cohort.id === 'string' ? cohort.id : `cohort-${index}`,
      name: cohort.name.trim().slice(0, 60),
      fromYear: Math.max(1, Math.min(9999, cohort.fromYear)),
      toYear: Math.max(1, Math.min(9999, cohort.toYear)),
    }];
  });
}
