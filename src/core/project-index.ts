import type { EntityKind, ForgeEntity, ProjectIndex } from './types';
import type { JsonValue } from './types';

const ENTITY_KINDS: readonly EntityKind[] = [
  'object', 'family', 'layout', 'eventSheet', 'timeline', 'flowchart', 'function', 'variable', 'addon', 'asset',
  'layoutLayer', 'layoutInstance', 'event', 'behavior', 'animation', 'animationFrame', 'projectFolder', 'projectFile',
];

function isJsonArray(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function canonicalJson(value: JsonValue): JsonValue {
  if (isJsonArray(value)) return value.map(canonicalJson);
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) {
      result[key] = canonicalJson(item);
    }
    return result;
  }
  return value;
}

function entitySignature(entity: ForgeEntity): string {
  return JSON.stringify({
    kind: entity.kind,
    name: entity.name,
    sourcePath: entity.sourcePath,
    metadata: canonicalJson(entity.metadata),
  });
}

export function createProjectIndex(entities: readonly ForgeEntity[]): ProjectIndex {
  const byId = new Map<string, ForgeEntity>();
  const conflictVariants = new Map<string, ForgeEntity[]>();
  const kindEntries = new Map<EntityKind, ForgeEntity[]>();
  const nameEntries = new Map<string, ForgeEntity[]>();
  const pathEntries = new Map<string, ForgeEntity[]>();

  for (const kind of ENTITY_KINDS) kindEntries.set(kind, []);
  for (const entity of entities) {
    const existing = byId.get(entity.id);
    if (existing) {
      const variants = conflictVariants.get(entity.id) ?? [existing];
      const signature = entitySignature(entity);
      if (entitySignature(existing) !== signature && !variants.some((variant) => entitySignature(variant) === signature)) {
        variants.push(entity);
        conflictVariants.set(entity.id, variants);
      }
      continue;
    }
    byId.set(entity.id, entity);
    kindEntries.get(entity.kind)?.push(entity);
    const nameKey = entity.name.toLocaleLowerCase('en-US');
    const named = nameEntries.get(nameKey) ?? [];
    named.push(entity);
    nameEntries.set(nameKey, named);
    const fromPath = pathEntries.get(entity.sourcePath) ?? [];
    fromPath.push(entity);
    pathEntries.set(entity.sourcePath, fromPath);
  }

  return {
    entities: [...byId.values()],
    byId,
    byKind: new Map([...kindEntries].map(([kind, values]) => [kind, values])),
    byName: new Map([...nameEntries].map(([name, values]) => [name, values])),
    bySourcePath: new Map([...pathEntries].map(([path, values]) => [path, values])),
    identityConflicts: [...conflictVariants].map(([id, variants]) => ({ id, entities: variants })),
  };
}
