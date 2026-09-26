import { isRecord, toJsonValue } from './json';
import { normalizeProjectPath, projectPathWithoutExtension } from './paths';
import type { EntityKind, ForgeEntity, JsonValue, ManifestResource } from './types';

const METADATA_KEYS: Readonly<Record<EntityKind, readonly string[]>> = {
  object: ['sid', 'plugin-id', 'pluginId', 'isGlobal', 'global'],
  family: ['sid', 'plugin-id', 'pluginId'],
  layout: ['sid', 'eventSheet', 'eventSheetName', 'width', 'height'],
  eventSheet: ['sid'],
  timeline: ['sid'],
  flowchart: ['sid'],
  function: ['sid', 'functionName', 'sheetName'],
  variable: ['sid', 'variableType', 'sheetName', 'objectName'],
  addon: ['pluginId', 'version'],
  asset: ['extension', 'size'],
  projectFile: ['constructVersion'],
};

export function makeStableEntityId(
  kind: EntityKind,
  sourcePath: string,
  name: string,
  discriminator?: string,
  sid?: string,
): string {
  const parts = sid !== undefined && sid !== ''
    ? [kind, 'sid', sid]
    : [kind, normalizeProjectPath(sourcePath), name, ...(discriminator ? [discriminator] : [])];
  return parts.map((part) => encodeURIComponent(part)).join(':');
}

export function createForgeEntity(
  kind: EntityKind,
  name: string,
  sourcePath: string,
  metadata: Readonly<Record<string, JsonValue>> = {},
  discriminator?: string,
): ForgeEntity {
  const normalizedPath = normalizeProjectPath(sourcePath);
  const sid = metadata.sid;
  return {
    id: makeStableEntityId(kind, normalizedPath, name, discriminator,
      typeof sid === 'string' || typeof sid === 'number' ? String(sid) : undefined),
    kind,
    name,
    sourcePath: normalizedPath,
    metadata,
  };
}

function semanticMetadata(kind: EntityKind, raw: unknown): Readonly<Record<string, JsonValue>> {
  if (!isRecord(raw)) return {};
  const metadata: Record<string, JsonValue> = {};
  for (const key of METADATA_KEYS[kind]) {
    const value = toJsonValue(raw[key]);
    if (value !== undefined) metadata[key] = value;
  }
  return metadata;
}

export function entityFromResource(resource: ManifestResource, raw: unknown): ForgeEntity {
  const rawName = isRecord(raw) && typeof raw.name === 'string' && raw.name.trim() !== '' ? raw.name.trim() : undefined;
  const name = rawName ?? resource.name ?? projectPathWithoutExtension(resource.path);
  return createForgeEntity(resource.kind, name, resource.path, semanticMetadata(resource.kind, raw));
}

export function entityForProjectFile(name: string): ForgeEntity {
  return createForgeEntity('projectFile', name, 'project.c3proj');
}

export function entityForAsset(resource: ManifestResource): ForgeEntity {
  const extension = resource.path.includes('.') ? resource.path.slice(resource.path.lastIndexOf('.') + 1) : undefined;
  return createForgeEntity('asset', resource.name ?? projectPathWithoutExtension(resource.path), resource.path, {
    ...resource.metadata,
    ...(extension ? { extension } : {}),
  });
}
