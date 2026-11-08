import type { FamilyTreeGroup, FamilyTreePerson, GenogramDetail } from '../domain/savedGenogram';
import type { GenogramAppearance } from './appearance';

const cardWidth = 176;
const cardHeight = 154;
const partnerGap = 44;
const siblingGap = 34;
const unionGap = 24;
const generationGap = 96;
const branchFramePadding = 14;

interface PrintLayout { width: number; height: number; svg: string; smallestTextPt: number; }

export function createGenogramPrintSvg(
  genogram: GenogramDetail,
  tree: FamilyTreeGroup[],
  appearance: GenogramAppearance,
  hideLastNames: boolean,
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
  const legendHeight = 46;
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
    if (branchColor && group.children.length) {
      const childrenTop = y + cardHeight + generationGap;
      const childrenHeight = Math.max(...group.children.map(branchHeight));
      branchRegions.push({
        x: x - branchFramePadding,
        y: childrenTop - branchFramePadding,
        width: width + branchFramePadding * 2,
        height: childrenHeight + branchFramePadding * 2,
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
      const fill = color ? blend(color, '#ffffff', .9) : '#f4f8f4';
      const stroke = color ?? '#578d72';
      const isFemale = person.gender === 'female';
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
  const content = `<rect width="100%" height="100%" fill="#ffffff"/><text x="${margin}" y="34" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="700" fill="#173c36">${title}</text>${body.join('')}<line x1="${margin}" y1="${legendY - 22}" x2="${svgWidth - margin}" y2="${legendY - 22}" stroke="#dce5dd"/><circle cx="${margin + 8}" cy="${legendY}" r="7" fill="#f4f8f4" stroke="#578d72"/><rect x="${margin + 25}" y="${legendY - 7}" width="14" height="14" fill="#f4f8f4" stroke="#578d72"/><rect x="${margin + 48}" y="${legendY - 5}" width="10" height="10" transform="rotate(45 ${margin + 53} ${legendY})" fill="#f4f8f4" stroke="#578d72" stroke-dasharray="2 1"/><rect x="${margin + 70}" y="${legendY - 7}" width="14" height="14" rx="4" fill="#f4f8f4" stroke="#578d72" stroke-dasharray="1 2"/><text x="${margin + 77}" y="${legendY + 3.5}" text-anchor="middle" font-family="Arial,sans-serif" font-size="9" fill="#566a5e">?</text><text x="${margin + 92}" y="${legendY + 4}" font-family="Inter, Arial, sans-serif" font-size="10" fill="#566a5e">weiblich · männlich · nicht-binär · unbekannt</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidthMm}mm" height="${pageHeightMm}mm" viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="xMidYMid meet">${content}</svg>`;
  return { width: svgWidth, height: svgHeight, svg, smallestTextPt };
}

function formatPrintDate(value: string, precision: string | null): string {
  if (precision === 'year' || /^\d{4}$/.test(value)) return value;
  const [year, month, day] = value.split('-');
  return precision === 'month' || !day ? `${month}.${year}` : `${day}.${month}.${year}`;
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
