import type { FamilyTreeGroup, FamilyTreePerson, GenogramDetail } from '../domain/savedGenogram';
import type { GenogramAppearance } from './appearance';
import type { GenerationCohort } from './viewPreferences';

const cardWidth = 176;
const cardHeight = 154;
const partnerGap = 44;
const siblingGap = 34;
const unionGap = 24;
const branchFramePadding = 14;

interface PrintLayout { width: number; height: number; svg: string; content: string; smallestTextPt: number; }

export interface PosterPrintLayout {
  pages: string[];
  scale: number;
  columns: number;
}

export function createGenogramPrintSvg(
  genogram: GenogramDetail,
  tree: FamilyTreeGroup[],
  appearance: GenogramAppearance,
  hideLastNames: boolean,
  showGenerationCohorts: boolean,
  generationCohorts: GenerationCohort[],
  generationGap: number,
  pageWidthMm: number,
  pageHeightMm: number,
): PrintLayout {
  const groupWidths = new Map<FamilyTreeGroup, number>();
  const branchWidths = new Map<FamilyTreePerson, number>();
  const branchHeight = (branch: FamilyTreePerson): number => branch.unions.length
    ? Math.max(...branch.unions.map(groupHeight))
    : cardHeight;
  const groupHeight = (group: FamilyTreeGroup): number => group.children.length
    ? cardHeight + generationGap + Math.max(...group.children.map(branchHeight))
    : cardHeight;
  const branchWidth = (branch: FamilyTreePerson): number => {
    const width = branch.unions.length
      ? branch.unions.reduce((sum, group) => sum + groupWidth(group), 0) + unionGap * Math.max(0, branch.unions.length - 1)
      : cardWidth;
    branchWidths.set(branch, width);
    return width;
  };
  const groupWidth = (group: FamilyTreeGroup): number => {
    const own = group.partners.length * cardWidth + Math.max(0, group.partners.length - 1) * partnerGap;
    const kids = group.children.reduce((sum, child) => sum + branchWidth(child), 0) + siblingGap * Math.max(0, group.children.length - 1);
    const width = Math.max(own || cardWidth, kids);
    groupWidths.set(group, width);
    return width;
  };
  tree.forEach(groupWidth);
  const rootGap = 70;
  const contentWidth = tree.reduce((sum, group) => sum + (groupWidths.get(group) ?? cardWidth), 0) + rootGap * Math.max(0, tree.length - 1);
  const depth = (group: FamilyTreeGroup): number => group.children.length
    ? 1 + Math.max(...group.children.map((child) => child.unions.length ? Math.max(...child.unions.map(depth)) : 0))
    : 0;
  const maxDepth = tree.length ? Math.max(...tree.map(depth)) : 0;
  const contentHeight = (maxDepth + 1) * cardHeight + maxDepth * generationGap;
  const margin = 38;
  const titleHeight = 58;
  const legendHeight = 46 + (showGenerationCohorts && generationCohorts.length ? 20 + generationCohorts.length * 13 : 0);
  const diagramWidth = contentWidth + margin * 2;
  const diagramHeight = titleHeight + contentHeight + legendHeight + margin * 2;
  const mmPerUnit = Math.min((pageWidthMm - 20) / diagramWidth, (pageHeightMm - 20) / diagramHeight);
  const smallestTextPt = 10 * mmPerUnit * 72 / 25.4;
  const body: string[] = [];
  const path = (d: string, color = '#8da99a', dash = '') => body.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="1.6"${dash ? ` stroke-dasharray="${dash}"` : ''} />`);
  const text = (x: number, y: number, value: string, size: number, weight = 400, color = '#40544a', anchor = 'middle') =>
    body.push(`<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="Inter, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${escapeXml(value)}</text>`);
  const dateLabel = (date: string | null, precision: string | null) => date ? formatPrintDate(date, precision) : '';
  const byChild = new Map<string, Map<string, string>>();
  genogram.parentChildLinks.forEach((link) => {
    const links = byChild.get(link.childId) ?? new Map<string, string>();
    links.set(link.parentId, link.relationshipType);
    byChild.set(link.childId, links);
  });
  const layouts: Array<{ group: FamilyTreeGroup; x: number; y: number }> = [];
  const connectorBuses: Array<{ from: number; sourceY: number; targetY: number; children: Array<{ personId: string; fallbackX: number; type: string }> }> = [];
  const branchRegions: Array<{ x: number; y: number; width: number; height: number; color: string }> = [];
  const personCenters = new Map<string, { x: number; topY: number }>();

  function placeGroup(group: FamilyTreeGroup, x: number, y: number): void {
    const width = groupWidths.get(group) ?? cardWidth;
    layouts.push({ group, x, y });
    const branchColor = group.partners.map((person) => appearance.branchColors[person.id]).find(Boolean);
    if (branchColor) {
      const branchBottom = group.children.length
        ? y + cardHeight + generationGap + Math.max(...group.children.map(branchHeight))
        : y + cardHeight;
      branchRegions.push({
        x: x - branchFramePadding,
        y: y - branchFramePadding,
        width: width + branchFramePadding * 2,
        height: branchBottom - y + branchFramePadding * 2,
        color: branchColor,
      });
    }
    const own = group.partners.length * cardWidth + Math.max(0, group.partners.length - 1) * partnerGap;
    let partnerX = x + (width - own) / 2;
    group.partners.forEach((person) => {
      personCenters.set(person.id, { x: partnerX + cardWidth / 2, topY: y });
      partnerX += cardWidth + partnerGap;
    });
    if (!group.children.length) return;
    const kidsWidth = group.children.reduce((sum, child) => sum + (branchWidths.get(child) ?? cardWidth), 0) + siblingGap * Math.max(0, group.children.length - 1);
    let childX = x + (width - kidsWidth) / 2;
    const childY = y + cardHeight + generationGap;
    const buckets = new Map<string, { from: number; sourceY: number; targetY: number; children: Array<{ personId: string; fallbackX: number; type: string }> }>();
    for (const child of group.children) {
      const childWidth = branchWidths.get(child) ?? cardWidth;
      const childCenter = childX + childWidth / 2;
      const parents = group.partners.map((person) => person.id).filter((id) => byChild.get(child.person.id)?.has(id));
      if (parents.length) {
        const connected = parents.map((id) => personCenters.get(id)?.x).filter((value): value is number => value !== undefined);
        const allPartnersLinked = parents.length === group.partners.length && group.partners.length > 1;
        const from = allPartnersLinked ? (Math.min(...connected) + Math.max(...connected)) / 2 : connected[0] ?? x + width / 2;
        const parentTypes = parents.map((id) => byChild.get(child.person.id)?.get(id) ?? 'unspecified');
        const type = parentTypes.every((value) => value === parentTypes[0]) ? parentTypes[0]! : 'unspecified';
        const sourceY = allPartnersLinked ? y + cardHeight / 2 : y + cardHeight;
        const key = `${Math.round(from)}:${Math.round(sourceY)}:${type}`;
        const bucket = buckets.get(key) ?? { from, sourceY, targetY: childY, children: [] };
        bucket.children.push({ personId: child.person.id, fallbackX: childCenter, type });
        buckets.set(key, bucket);
      }
      if (child.unions.length) {
        const unionsWidth = child.unions.reduce((sum, union) => sum + (groupWidths.get(union) ?? cardWidth), 0) + unionGap * Math.max(0, child.unions.length - 1);
        let unionX = childX + (childWidth - unionsWidth) / 2;
        child.unions.forEach((union) => {
          placeGroup(union, unionX, childY);
          unionX += (groupWidths.get(union) ?? cardWidth) + unionGap;
        });
      } else {
        layouts.push({ group: { id: `leaf-${child.person.id}`, partnership: null, partners: [child.person], children: [] }, x: childCenter - cardWidth / 2, y: childY });
        personCenters.set(child.person.id, { x: childCenter, topY: childY });
      }
      childX += childWidth + siblingGap;
    }
    connectorBuses.push(...buckets.values());
  }

  let rootX = margin;
  tree.forEach((group) => {
    placeGroup(group, rootX, titleHeight + margin);
    rootX += (groupWidths.get(group) ?? cardWidth) + rootGap;
  });

  branchRegions.forEach((region) => body.push(`<rect x="${region.x}" y="${region.y}" width="${region.width}" height="${region.height}" rx="16" fill="${blend(region.color, '#ffffff', .92)}" stroke="${blend(region.color, '#ffffff', .28)}" stroke-width="1.5" />`));
  connectorBuses.forEach((bus) => {
    const busY = bus.sourceY + (bus.targetY - bus.sourceY) * .3;
    const styles = [...new Set(bus.children.map((child) => child.type))];
    for (const type of styles) {
      const dashed = ['adoptive', 'step'].includes(type) ? '6 4' : ['foster', 'social'].includes(type) ? '1 4' : '';
      const targets = bus.children.filter((child) => child.type === type);
      path(`M ${bus.from} ${bus.sourceY} V ${busY}`, '#8da99a', dashed);
      targets.forEach((target) => {
        const personPosition = personCenters.get(target.personId);
        const targetX = personPosition?.x ?? target.fallbackX;
        const targetY = personPosition?.topY ?? bus.targetY;
        const curve = Math.max(22, (targetY - busY) * .54);
        path(`M ${bus.from} ${busY} C ${bus.from} ${busY + curve * .35}, ${targetX} ${targetY - curve}, ${targetX} ${targetY}`, '#8da99a', dashed);
      });
    }
  });

  for (const { group, x, y } of layouts) {
    const ownWidth = group.partners.length * cardWidth + Math.max(0, group.partners.length - 1) * partnerGap;
    let personX = x + ((groupWidths.get(group) ?? cardWidth) - ownWidth) / 2;
    const partnerCenters: number[] = [];
    for (const person of group.partners) {
      const cx = personX + cardWidth / 2;
      partnerCenters.push(cx);
      const color = appearance.personColors[person.id];
      const cohort = showGenerationCohorts ? cohortForPrintYear(person.birthDate, generationCohorts) : undefined;
      const cohortColor = cohort ? cohortColors[generationCohorts.indexOf(cohort) % cohortColors.length] : undefined;
      const fill = color ? blend(color, '#ffffff', .9) : cohortColor ? blend(cohortColor, '#ffffff', .88) : '#f4f8f4';
      const stroke = color ?? cohortColor ?? '#578d72';
      const isFemale = person.gender === 'female';
      if (cohortColor) {
        const halo = isFemale
          ? `<circle cx="${cx}" cy="${y + cardHeight / 2}" r="80" fill="${cohortColor}" fill-opacity=".11" stroke="${cohortColor}" stroke-opacity=".32" stroke-width="1" />`
          : `<rect x="${cx - 81}" y="${y - 4}" width="162" height="162" rx="5" fill="${cohortColor}" fill-opacity=".10" stroke="${cohortColor}" stroke-opacity=".32" stroke-width="1" />`;
        body.push(halo);
      }
      const shape = isFemale
        ? `<circle cx="${cx}" cy="${y + cardHeight / 2}" r="73" fill="${fill}" stroke="${stroke}" stroke-width="1.6" />`
        : person.gender === 'nonbinary'
          ? `<rect x="${cx - 52}" y="${y + cardHeight / 2 - 52}" width="104" height="104" rx="3" transform="rotate(45 ${cx} ${y + cardHeight / 2})" fill="${fill}" stroke="${stroke}" stroke-width="1.6" stroke-dasharray="6 4" />`
          : `<rect x="${cx - 74}" y="${y + 3}" width="148" height="148" rx="${person.gender === 'unknown' ? 8 : 2}" fill="${fill}" stroke="${stroke}" stroke-width="1.6"${person.gender === 'unknown' ? ' stroke-dasharray="2 3"' : ''} />`;
      body.push(shape);
      const name = [person.name, ...(hideLastNames ? [] : [person.familyName])].filter(Boolean).join(' ');
      const lines = wrapText(name, 19);
      const lineHeight = 20;
      const textTop = y + cardHeight / 2 - (lines.length * lineHeight + 30) / 2 + 16;
      if (cohort) text(cx, y + 22, cohort.name, 8, 700, cohortColor ?? '#52685b');
      lines.forEach((line, index) => text(cx, textTop + index * lineHeight, line, 15, 700, '#31483d'));
      const dates = [person.birthDate ? `geb. ${dateLabel(person.birthDate, person.birthDatePrecision)}` : '', person.deathDate ? `gest. ${dateLabel(person.deathDate, person.deathDatePrecision)}` : ''].filter(Boolean);
      dates.forEach((date, index) => text(cx, textTop + lines.length * lineHeight + index * 14, date, 10, 400, '#66756d'));
      personX += cardWidth + partnerGap;
    }
    if (partnerCenters.length > 1) {
      path(`M ${partnerCenters[0]! + 74} ${y + cardHeight / 2} H ${partnerCenters[1]! - 74}`,'#75877c');
      if (group.partnership?.status === 'married' || group.partnership?.startDate) {
        const label = `${group.partnership.status === 'married' ? '∞' : ''}${group.partnership.startDate ? ` · ${dateLabel(group.partnership.startDate, group.partnership.startDatePrecision)}` : ''}`;
        const labelX = (partnerCenters[0]! + partnerCenters[1]!) / 2;
        body.push(`<text x="${labelX}" y="${y + cardHeight / 2 - 14}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="700" fill="#42584c" stroke="#ffffff" stroke-width="4" stroke-linejoin="round" paint-order="stroke">${escapeXml(label)}</text>`);
      }
    }
  }

  const svgWidth = diagramWidth;
  const svgHeight = diagramHeight;
  const title = escapeXml(genogram.summary.title);
  const legendY = svgHeight - margin - 9;
  const generationLegend = showGenerationCohorts ? generationCohorts.map((cohort, index) => {
    const y = legendY - 31 - (generationCohorts.length - index - 1) * 13;
    const color = cohortColors[index % cohortColors.length];
    return `<rect x="${margin}" y="${y - 7}" width="9" height="9" rx="2" fill="${color}" fill-opacity=".55" stroke="${color}"/><text x="${margin + 15}" y="${y}" font-family="Inter, Arial, sans-serif" font-size="9" fill="#566a5e">${escapeXml(cohort.name)} · ${cohort.fromYear}–${cohort.toYear}</text>`;
  }).join('') : '';
  const generationLegendTitle = showGenerationCohorts && generationCohorts.length ? `<text x="${margin}" y="${legendY - 39 - generationCohorts.length * 13}" font-family="Inter, Arial, sans-serif" font-size="9" font-weight="700" fill="#40544a">Generationen (Geburtsjahre)</text>` : '';
  const content = `<rect width="100%" height="100%" fill="#ffffff"/><text x="${margin}" y="34" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="700" fill="#173c36">${title}</text>${body.join('')}${generationLegendTitle}${generationLegend}<line x1="${margin}" y1="${legendY - 22}" x2="${svgWidth - margin}" y2="${legendY - 22}" stroke="#dce5dd"/><circle cx="${margin + 8}" cy="${legendY}" r="7" fill="#f4f8f4" stroke="#578d72"/><rect x="${margin + 25}" y="${legendY - 7}" width="14" height="14" fill="#f4f8f4" stroke="#578d72"/><rect x="${margin + 48}" y="${legendY - 5}" width="10" height="10" transform="rotate(45 ${margin + 53} ${legendY})" fill="#f4f8f4" stroke="#578d72" stroke-dasharray="2 1"/><rect x="${margin + 70}" y="${legendY - 7}" width="14" height="14" rx="4" fill="#f4f8f4" stroke="#578d72" stroke-dasharray="1 2"/><text x="${margin + 77}" y="${legendY + 3.5}" text-anchor="middle" font-family="Arial,sans-serif" font-size="9" fill="#566a5e">?</text><text x="${margin + 92}" y="${legendY + 4}" font-family="Inter, Arial, sans-serif" font-size="10" fill="#566a5e">weiblich · männlich · nicht-binär · unbekannt</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidthMm}mm" height="${pageHeightMm}mm" viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="xMidYMid meet">${content}</svg>`;
  return { width: svgWidth, height: svgHeight, svg, content, smallestTextPt };
}

export function createPosterPrintPages(
  layout: PrintLayout,
  title: string,
  pageWidthMm: number,
  pageHeightMm: number,
  overlapMm: number,
  showInfo: boolean,
  showMarks: boolean,
): PosterPrintLayout {
  const margin = 10;
  const headerHeight = 8;
  const footerHeight = 8;
  const contentWidthMm = pageWidthMm - margin * 2;
  const contentHeightMm = pageHeightMm - margin * 2 - headerHeight - footerHeight;
  const scale = contentHeightMm / layout.height;
  const viewportWidth = contentWidthMm / scale;
  const stride = Math.max(1, (contentWidthMm - overlapMm) / scale);
  const columns = Math.max(1, Math.ceil((layout.width - viewportWidth) / stride) + 1);
  const safeTitle = escapeXml(title);
  const pages = Array.from({ length: columns }, (_, index) => {
    const x = index * stride;
    const label = `Teil ${index + 1} von ${columns}`;
    const header = showInfo ? `<text x="${margin}" y="${margin + 5}" font-family="Inter, Arial, sans-serif" font-size="3.2" font-weight="700" fill="#52685d">${safeTitle}</text><text x="${pageWidthMm - margin}" y="${margin + 5}" text-anchor="end" font-family="Inter, Arial, sans-serif" font-size="3" fill="#52685d">${label}</text>` : '';
    const footer = showInfo ? `<line x1="${margin}" y1="${pageHeightMm - margin - footerHeight / 2}" x2="${pageWidthMm - margin}" y2="${pageHeightMm - margin - footerHeight / 2}" stroke="#e1e6e1" stroke-width=".25"/><text x="${margin}" y="${pageHeightMm - margin - 2}" font-family="Inter, Arial, sans-serif" font-size="2.6" fill="#718078">${overlapMm} mm Überlappung · von links nach rechts zusammenfügen</text><text x="${pageWidthMm - margin}" y="${pageHeightMm - margin - 2}" text-anchor="end" font-family="Inter, Arial, sans-serif" font-size="2.6" fill="#718078">${label}</text>` : '';
    const seamMarkers = new Set([
      ...(index > 0 ? [margin, margin + overlapMm] : []),
      ...(index < columns - 1 ? [pageWidthMm - margin - overlapMm, pageWidthMm - margin] : []),
    ]);
    const marks = showMarks ? [...seamMarkers].map((markX) => `<path d="M ${markX - 2} ${margin + headerHeight} h 4 M ${markX} ${margin + headerHeight} v 4 M ${markX - 2} ${margin + headerHeight + contentHeightMm} h 4 M ${markX} ${margin + headerHeight + contentHeightMm} v -4" fill="none" stroke="#8d9b92" stroke-width=".35"/>`).join('') : '';
    const inner = `<rect width="${pageWidthMm}" height="${pageHeightMm}" fill="#ffffff"/>${header}<svg x="${margin}" y="${margin + headerHeight}" width="${contentWidthMm}" height="${contentHeightMm}" viewBox="${x} 0 ${viewportWidth} ${layout.height}" preserveAspectRatio="none">${layout.content}</svg>${marks}${footer}`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidthMm}mm" height="${pageHeightMm}mm" viewBox="0 0 ${pageWidthMm} ${pageHeightMm}">${inner}</svg>`;
  });
  return { pages, scale, columns };
}

function formatPrintDate(value: string, precision: string | null): string {
  if (precision === 'year' || /^\d{4}$/.test(value)) return value;
  const [year, month, day] = value.split('-');
  return precision === 'month' || !day ? `${month}.${year}` : `${day}.${month}.${year}`;
}

const cohortColors = ['#72a889', '#6b9fbd', '#9784b8', '#ca8292', '#d69a61', '#bea84f', '#5c9b9d'];

function cohortForPrintYear(birthDate: string | null, cohorts: GenerationCohort[]): GenerationCohort | undefined {
  if (!birthDate) return undefined;
  const year = Number(birthDate.slice(0, 4));
  return Number.isInteger(year) ? cohorts.find((cohort) => year >= cohort.fromYear && year <= cohort.toYear) : undefined;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);
}

function wrapText(value: string, max: number): string[] {
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines.length ? lines.slice(0, 4) : [''];
}

function blend(foreground: string, background: string, amount: number): string {
  const fg = foreground.match(/[a-f\d]{2}/gi)?.map((part) => parseInt(part, 16)) ?? [114, 168, 137];
  const bg = background.match(/[a-f\d]{2}/gi)?.map((part) => parseInt(part, 16)) ?? [255, 255, 255];
  return `#${fg.map((channel, index) => Math.round(channel * (1 - amount) + (bg[index] ?? 255) * amount).toString(16).padStart(2, '0')).join('')}`;
}
