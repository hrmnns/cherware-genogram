export type ViewOrientation = 'horizontal' | 'vertical' | 'genogram';

export interface GenogramViewPreferences {
  orientation: ViewOrientation;
  zoom: Record<ViewOrientation, number>;
  wrapChildren: boolean;
  stackTerminalChildren: boolean;
  generationGap: number;
  hideLastNames: boolean;
  collapsedGenogramNodes: string[];
  scroll: Record<ViewOrientation, { left: number; top: number }>;
}

const lastCaseKey = 'cherware-genogram:last-case:v1';
const viewKey = (genogramId: string) => `cherware-genogram:view:v1:${genogramId}`;

const defaults: GenogramViewPreferences = {
  orientation: 'horizontal',
  zoom: { horizontal: 1, vertical: 1, genogram: 1 },
  wrapChildren: false,
  stackTerminalChildren: false,
  generationGap: 60,
  hideLastNames: false,
  collapsedGenogramNodes: [],
  scroll: {
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
        horizontal: validZoom(zoom.horizontal),
        vertical: validZoom(zoom.vertical),
        genogram: validZoom(zoom.genogram),
      },
      wrapChildren: value.wrapChildren === true,
      stackTerminalChildren: value.stackTerminalChildren === true,
      generationGap: typeof value.generationGap === 'number' ? Math.min(180, Math.max(30, value.generationGap)) : defaults.generationGap,
      hideLastNames: value.hideLastNames === true,
      collapsedGenogramNodes: Array.isArray(value.collapsedGenogramNodes)
        ? value.collapsedGenogramNodes.filter((id): id is string => typeof id === 'string') : [],
      scroll: {
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
  return value === 'horizontal' || value === 'vertical' || value === 'genogram';
}

function defaultPreferences(): GenogramViewPreferences {
  return {
    ...defaults,
    zoom: { ...defaults.zoom },
    collapsedGenogramNodes: [],
    scroll: {
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
