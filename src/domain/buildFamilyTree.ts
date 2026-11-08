import type {
  FamilyTreeGroup,
  FamilyTreePerson,
  GenogramDetail,
  GenogramPartnership,
  GenogramPerson,
} from './savedGenogram';

export function buildFamilyTree(genogram: GenogramDetail): FamilyTreeGroup[] {
  const people = new Map(genogram.people.map((person) => [person.id, person]));
  const parentIds = new Set(genogram.parentChildLinks.map((link) => link.childId));
  // In the legacy workbook mapping, person B is the spouse from column G.
  // They have no ancestry rows of their own and must not become separate roots.
  const importedSpouseIds = new Set(genogram.partnerships.map((partnership) => partnership.personBId));
  const partnershipsByPerson = new Map<string, GenogramPartnership[]>();
  const childrenByParent = new Map<string, Set<string>>();

  for (const partnership of genogram.partnerships) {
    for (const personId of [partnership.personAId, partnership.personBId]) {
      const unions = partnershipsByPerson.get(personId) ?? [];
      unions.push(partnership);
      partnershipsByPerson.set(personId, unions);
    }
  }
  for (const link of genogram.parentChildLinks) {
    const children = childrenByParent.get(link.parentId) ?? new Set<string>();
    children.add(link.childId);
    childrenByParent.set(link.parentId, children);
  }

  function buildGroup(
    partnership: GenogramPartnership | null,
    soloPerson?: GenogramPerson,
    ancestorIds = new Set<string>(),
  ): FamilyTreeGroup {
    const partners = partnership
      ? [people.get(partnership.personAId), people.get(partnership.personBId)].filter(
          (person): person is GenogramPerson => Boolean(person),
        )
      : soloPerson ? [soloPerson] : [];
    const partnerIds = partners.map((person) => person.id);
    const childrenIds = new Set(partnerIds.flatMap((id) => [...(childrenByParent.get(id) ?? [])]));
    const children = [...childrenIds]
      .map((id) => people.get(id))
      .filter((person): person is GenogramPerson => Boolean(person))
      .map((person) => ({
        ...buildPerson(person, partnership?.id ?? null, ancestorIds),
        parentLinks: genogram.parentChildLinks.filter((link) =>
          link.childId === person.id && partnerIds.includes(link.parentId)),
      }));

    return {
      id: partnership?.id ?? `solo-${soloPerson?.id ?? 'unknown'}`,
      partnership,
      partners,
      children,
    };
  }

  function buildPerson(
    person: GenogramPerson,
    parentPartnershipId: string | null,
    ancestors: Set<string>,
  ): FamilyTreePerson {
    if (ancestors.has(person.id)) return { person, unions: [], parentLinks: [] };
    const nextAncestors = new Set(ancestors).add(person.id);
    const partnerships = (partnershipsByPerson.get(person.id) ?? [])
      .filter((partnership) => partnership.id !== parentPartnershipId);
    const unions = partnerships.length > 0
      ? partnerships.map((partnership) => buildGroup(partnership, undefined, nextAncestors))
      : [buildGroup(null, person, nextAncestors)];
    return { person, unions, parentLinks: [] };
  }

  const rootGroups: FamilyTreeGroup[] = [];
  const rootPartnerIds = new Set<string>();
  for (const partnership of genogram.partnerships) {
    const bothAreRoots = !parentIds.has(partnership.personAId) && !parentIds.has(partnership.personBId);
    if (bothAreRoots) {
      rootGroups.push(buildGroup(partnership));
      rootPartnerIds.add(partnership.personAId);
      rootPartnerIds.add(partnership.personBId);
    }
  }

  for (const person of genogram.people) {
    if (parentIds.has(person.id) || rootPartnerIds.has(person.id) || importedSpouseIds.has(person.id)) continue;
    const hasRootPartner = (partnershipsByPerson.get(person.id) ?? []).some((partnership) =>
      !parentIds.has(partnership.personAId) && !parentIds.has(partnership.personBId),
    );
    if (!hasRootPartner) rootGroups.push(buildGroup(null, person));
  }

  return rootGroups;
}
