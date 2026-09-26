import type { ProjectFileSystem } from './filesystem';
import { createForgeEntity, entityForAsset, entityFromResource } from './entities';
import { isRecord, stringProperty, toJsonValue } from './json';
import type { ForgeEntity, JsonValue, ManifestResource, ProjectManifest, ResourceIssue } from './types';

export interface ParsedResource {
  readonly descriptor: ManifestResource;
  readonly entity: ForgeEntity;
  /** Private raw document used only by the core extractors. */
  readonly raw?: unknown;
}

export interface ResourceLoadResult {
  readonly resources: readonly ParsedResource[];
  readonly entities: readonly ForgeEntity[];
  readonly issues: readonly ResourceIssue[];
}

interface ResourceInput {
  readonly descriptor: ManifestResource;
  readonly path: string;
  readonly text?: string;
}

interface ResourceReadResult {
  readonly input?: ResourceInput;
  readonly issue?: ResourceIssue;
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  transform: (value: T) => Promise<R>,
): Promise<readonly R[]> {
  const result: (R | undefined)[] = new Array(values.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), values.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      result[index] = await transform(values[index] as T);
    }
  }));
  return result.filter((item): item is R => item !== undefined);
}

function sidOf(record: Record<string, unknown>): string | undefined {
  const value = record.sid;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return undefined;
}

function scalarMetadata(record: Record<string, unknown>, keys: readonly string[]): Record<string, JsonValue> {
  const result: Record<string, JsonValue> = {};
  for (const key of keys) {
    const value = toJsonValue(record[key]);
    if (value !== undefined && (typeof value !== 'object' || value === null)) result[key] = value;
  }
  return result;
}

function eventSemanticEntities(resource: ParsedResource): ForgeEntity[] {
  if (resource.descriptor.kind !== 'eventSheet' || !isRecord(resource.raw)) return [];
  const events = resource.raw.events;
  if (!Array.isArray(events)) return [];
  const entities: ForgeEntity[] = [];
  const sheetName = resource.entity.name;

  const visit = (node: unknown, depth: number, trail: readonly number[], functionName?: string, functionSid?: string): void => {
    if (!isRecord(node) || depth > 64) return;
    const eventType = typeof node.eventType === 'string' ? node.eventType : '';
    const sid = sidOf(node);
    let nestedFunctionName = functionName;
    let nestedFunctionSid = functionSid;

    if (eventType === 'function-block') {
      const name = stringProperty(node, 'functionName');
      if (name) {
        const metadata: Record<string, JsonValue> = {
          sheetName,
          ...scalarMetadata(node, ['functionDescription', 'functionCategory', 'functionReturnType', 'functionCopyPicked', 'functionIsAsync']),
        };
        const parameters = Array.isArray(node.functionParameters)
          ? node.functionParameters.flatMap((parameter) => {
              if (!isRecord(parameter)) return [];
              const parameterName = stringProperty(parameter, 'name');
              const parameterType = stringProperty(parameter, 'type');
              return parameterName ? [{ name: parameterName, ...(parameterType ? { type: parameterType } : {}) }] : [];
            })
          : [];
        if (parameters.length > 0) metadata.parameters = parameters;
        const functionEntity = createForgeEntity('function', name, resource.entity.sourcePath, metadata, sid ?? trail.join('.'));
        entities.push(functionEntity);
        nestedFunctionName = name;
        nestedFunctionSid = sid ?? trail.join('.');

        if (Array.isArray(node.functionParameters)) {
          node.functionParameters.forEach((parameter, index) => {
            if (!isRecord(parameter)) return;
            const parameterName = stringProperty(parameter, 'name');
            if (!parameterName) return;
            const parameterMetadata: Record<string, JsonValue> = {
              sheetName,
              functionName: name,
              scope: 'function-parameter',
              ...scalarMetadata(parameter, ['type', 'initialValue', 'comment']),
            };
            entities.push(createForgeEntity(
              'variable', parameterName, resource.entity.sourcePath, parameterMetadata,
              `${nestedFunctionSid}:parameter:${sidOf(parameter) ?? index}`,
            ));
          });
        }
      }
    } else if (eventType === 'variable') {
      const name = stringProperty(node, 'name');
      if (name) {
        const variableMetadata: Record<string, JsonValue> = {
          sheetName,
          scope: functionName ? 'function-local' : depth === 0 ? 'global' : 'local',
          ...(functionName ? { functionName } : {}),
          ...scalarMetadata(node, ['type', 'initialValue', 'isStatic', 'isConstant', 'comment']),
        };
        entities.push(createForgeEntity('variable', name, resource.entity.sourcePath, variableMetadata, sid ?? trail.join('.')));
      }
    }

    for (const key of ['conditions', 'actions', 'children']) {
      const children = node[key];
      if (!Array.isArray(children)) continue;
      children.forEach((child, index) => visit(child, depth + 1, [...trail, index], nestedFunctionName, nestedFunctionSid));
    }
  };

  events.forEach((event, index) => visit(event, 0, [index]));
  return entities;
}

function objectInstanceVariableEntities(resource: ParsedResource): ForgeEntity[] {
  const kind = resource.descriptor.kind;
  if ((kind !== 'object' && kind !== 'family') || !isRecord(resource.raw) || !Array.isArray(resource.raw.instanceVariables)) return [];
  const entities: ForgeEntity[] = [];
  resource.raw.instanceVariables.forEach((variable, index) => {
    if (!isRecord(variable)) return;
    const name = stringProperty(variable, 'name');
    if (!name) return;
    const metadata: Record<string, JsonValue> = {
      scope: kind === 'family' ? 'family' : 'object',
      ...(kind === 'family' ? { familyName: resource.entity.name } : { objectName: resource.entity.name }),
      ...scalarMetadata(variable, ['type', 'initialValue', 'isStatic', 'isConstant', 'comment']),
    };
    entities.push(createForgeEntity('variable', name, resource.entity.sourcePath, metadata, `${kind}:${sidOf(variable) ?? index}`));
  });
  return entities;
}

async function readOne(
  filesystem: ProjectFileSystem,
  manifest: ProjectManifest,
  resource: ManifestResource,
): Promise<ResourceReadResult> {
  let path: string;
  try {
    path = filesystem.normalizePath(filesystem.resolve(manifest.projectFile, resource.path));
  } catch (error) {
    return {
      issue: {
        path: resource.path,
        stage: 'read',
        code: 'invalid-resource-path',
        message: error instanceof Error ? error.message : 'Resource path is invalid.',
      },
    };
  }

  try {
    if (!(await filesystem.exists(path))) {
      return { issue: { path, stage: 'read', code: 'missing-resource', message: `Manifest resource was not found: ${path}` } };
    }
    const descriptor = { ...resource, path };
    if (resource.kind === 'asset') return { input: { descriptor, path } };
    const text = await filesystem.readText(path);
    return { input: { descriptor, path, text } };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'File could not be read.';
    return { issue: { path, stage: 'read', code: 'resource-read-failed', message: `Could not read ${path}: ${reason}` } };
  }
}

export async function loadManifestResources(
  filesystem: ProjectFileSystem,
  manifest: ProjectManifest,
  onParseStart?: () => void,
): Promise<ResourceLoadResult> {
  const uniqueResources = [...new Map(manifest.resources.map((resource) => [resource.path, resource])).values()];
  const loaded = await mapWithConcurrency(uniqueResources, 8, (resource) => readOne(filesystem, manifest, resource));
  const inputs = loaded.flatMap((item) => item.input ? [item.input] : []);
  const issues = loaded.flatMap((item) => item.issue ? [item.issue] : []);
  onParseStart?.();
  const resources: ParsedResource[] = [];
  for (const input of inputs) {
    if (input.descriptor.kind === 'asset') {
      resources.push({ descriptor: input.descriptor, entity: entityForAsset(input.descriptor) });
      continue;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(input.text ?? '') as unknown;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Invalid JSON.';
      issues.push({ path: input.path, stage: 'parse', code: 'invalid-json', message: `Could not parse ${input.path}: ${reason}` });
      continue;
    }
    if (!isRecord(raw)) {
      issues.push({ path: input.path, stage: 'parse', code: 'invalid-resource-shape', message: `${input.path} must contain a JSON object.` });
      continue;
    }
    resources.push({ descriptor: input.descriptor, entity: entityFromResource(input.descriptor, raw), raw });
  }
  const entities: ForgeEntity[] = resources.map((resource) => resource.entity);
  for (const resource of resources) {
    entities.push(...eventSemanticEntities(resource));
    entities.push(...objectInstanceVariableEntities(resource));
  }

  const plugins = new Map<string, ForgeEntity>();
  for (const addon of manifest.addons) {
    plugins.set(addon.id, createForgeEntity('addon', addon.name, manifest.projectFile, addon.metadata, addon.id));
  }
  for (const entity of entities) {
    if (entity.kind !== 'object') continue;
    const pluginId = entity.metadata['plugin-id'] ?? entity.metadata.pluginId;
    if (typeof pluginId !== 'string' || pluginId === '') continue;
    if (!plugins.has(pluginId)) {
      plugins.set(pluginId, createForgeEntity('addon', pluginId, manifest.projectFile, { pluginId }));
    }
  }
  entities.push(...plugins.values());

  const indexedPaths = new Set(entities.filter((entity) => entity.kind === 'asset').map((entity) => entity.sourcePath));
  const imageDirectories: string[] = [];
  try {
    for (const directory of await filesystem.listDirectories('')) {
      if (directory.split('/').at(-1)?.toLowerCase() === 'images') imageDirectories.push(directory);
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Directory listing failed.';
    issues.push({ path: '', stage: 'read', code: 'directory-list-failed', message: `Could not list project root: ${reason}` });
  }

  const pendingDirectories = [...imageDirectories];
  const visitedDirectories = new Set<string>();
  while (pendingDirectories.length > 0) {
    const directory = pendingDirectories.pop();
    if (!directory || visitedDirectories.has(directory)) continue;
    visitedDirectories.add(directory);
    try {
      for (const path of await filesystem.listFiles(directory)) {
        const normalizedPath = filesystem.normalizePath(path);
        if (indexedPaths.has(normalizedPath)) continue;
        indexedPaths.add(normalizedPath);
        const extension = normalizedPath.includes('.') ? normalizedPath.slice(normalizedPath.lastIndexOf('.') + 1).toLowerCase() : '';
        if (!['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'].includes(extension)) continue;
        const basename = normalizedPath.slice(normalizedPath.lastIndexOf('/') + 1);
        entities.push(createForgeEntity('asset', basename.slice(0, basename.lastIndexOf('.')), normalizedPath, { extension }));
      }
      pendingDirectories.push(...await filesystem.listDirectories(directory));
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Directory listing failed.';
      issues.push({ path: directory, stage: 'read', code: 'directory-list-failed', message: `Could not list ${directory}: ${reason}` });
    }
  }

  return { resources, entities, issues };
}
