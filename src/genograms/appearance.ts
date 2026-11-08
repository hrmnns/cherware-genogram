export interface GenogramAppearance {
  personColors: Record<string, string>;
  branchColors: Record<string, string>;
}

const key = (genogramId: string) => `cherware-genogram:appearance:v1:${genogramId}`;

export function readGenogramAppearance(genogramId: string): GenogramAppearance {
  try {
    const value = JSON.parse(localStorage.getItem(key(genogramId)) ?? 'null') as Partial<GenogramAppearance> | null;
    return {
      personColors: validColorMap(value?.personColors),
      branchColors: validColorMap(value?.branchColors),
    };
  } catch {
    return { personColors: {}, branchColors: {} };
  }
}

export function writeGenogramAppearance(genogramId: string, appearance: GenogramAppearance): void {
  try { localStorage.setItem(key(genogramId), JSON.stringify(appearance)); } catch { /* Local storage may be unavailable. */ }
}

function validColorMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter(([id, color]) => id.length <= 128 && typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)));
}
