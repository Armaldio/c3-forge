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

type ResourcePathMatch =
  | { readonly status: 'resolved'; readonly path: string }
  | { readonly status: 'missing' }
  | { readonly status: 'ambiguous'; readonly paths: readonly string[] };

/** Prefer an exact manifest path; accept one unique case-insensitive match and reject ambiguous matches. */
async function resolveCaseInsensitiveResourcePath(
  filesystem: ProjectFileSystem,
  requestedPath: string,
): Promise<ResourcePathMatch> {
  const segments = filesystem.normalizePath(requestedPath).split('/').filter(Boolean);
  let parent = '';
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index] as string;
    const finalSegment = index === segments.length - 1;
    const entries = finalSegment
      ? await filesystem.listFiles(parent)
      : await filesystem.listDirectories(parent);
    const matches = entries.filter((entry) => entry.split('/').at(-1)?.toLocaleLowerCase('en-US') === segment.toLocaleLowerCase('en-US'));
    if (matches.length === 0) return { status: 'missing' };
    if (matches.length > 1) return { status: 'ambiguous', paths: matches };
    const match = matches[0] as string;
    if (finalSegment) return { status: 'resolved', path: filesystem.normalizePath(match) };
    parent = filesystem.normalizePath(match);
  }
  return { status: 'missing' };
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
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string' && value.trim() !== '') return value;
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

  interface FunctionScope {
    readonly id: string;
    readonly name: string;
    readonly kind: 'function' | 'custom-action';
    readonly sid?: string;
  }

  const visit = (node: unknown, eventPath: readonly number[], functionScope?: FunctionScope): void => {
    if (!isRecord(node) || eventPath.length > 64) return;
    const eventType = typeof node.eventType === 'string' ? node.eventType : '';
    const sid = sidOf(node);
    let nestedFunctionScope = functionScope;
    let declaredFunctionScope: FunctionScope | undefined;

    if (eventType === 'function-block') {
      const name = stringProperty(node, 'functionName');
      if (name) {
        const metadata: Record<string, JsonValue> = {
          sheetName,
          ...(sid ? { sid } : {}),
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
        const functionEntity = createForgeEntity('function', name, resource.entity.sourcePath, metadata, eventPath.join('.'));
        entities.push(functionEntity);
        nestedFunctionScope = { id: functionEntity.id, name, kind: 'function', ...(sid ? { sid } : {}) };
        declaredFunctionScope = nestedFunctionScope;
      }
    } else if (eventType === 'custom-ace-block') {
      const name = stringProperty(node, 'aceName');
      if (name) {
        const ownerId = `custom-action:${resource.entity.id}:${sid ?? eventPath.join('.')}`;
        nestedFunctionScope = { id: ownerId, name, kind: 'custom-action', ...(sid ? { sid } : {}) };
        declaredFunctionScope = nestedFunctionScope;
      }
    }

    if (declaredFunctionScope && Array.isArray(node.functionParameters)) {
      node.functionParameters.forEach((parameter, index) => {
        if (!isRecord(parameter)) return;
        const parameterName = stringProperty(parameter, 'name');
        if (!parameterName) return;
        const parameterSid = sidOf(parameter);
        const parameterMetadata: Record<string, JsonValue> = {
          sheetName,
          functionName: declaredFunctionScope.name,
          functionId: declaredFunctionScope.id,
          ...(declaredFunctionScope.kind === 'function' && declaredFunctionScope.sid
            ? { functionSid: declaredFunctionScope.sid } : {}),
          ...(declaredFunctionScope.kind === 'custom-action' ? { customActionName: declaredFunctionScope.name } : {}),
          ...(parameterSid ? { sid: parameterSid } : {}),
          scope: declaredFunctionScope.kind === 'function' ? 'function-parameter' : 'custom-action-parameter',
          ...scalarMetadata(parameter, ['type', 'initialValue', 'comment']),
        };
        entities.push(createForgeEntity(
          'variable', parameterName, resource.entity.sourcePath, parameterMetadata,
          `${declaredFunctionScope.id}:parameter:${parameterSid ?? index}`,
        ));
      });
    }

    if (eventType === 'variable') {
      const name = stringProperty(node, 'name');
      if (name) {
        const scope = nestedFunctionScope ? 'function-local' : eventPath.length === 1 ? 'global' : 'local';
        const variableMetadata: Record<string, JsonValue> = {
          ...(sid ? { sid } : {}),
          sheetName,
          scope,
          ...(scope === 'local' || scope === 'function-local' ? {
            eventPath: [...eventPath],
            scopePath: eventPath.slice(0, -1),
          } : {}),
          ...(nestedFunctionScope ? {
            functionName: nestedFunctionScope.name,
            functionId: nestedFunctionScope.id,
            ...(nestedFunctionScope.kind === 'function' && nestedFunctionScope.sid
              ? { functionSid: nestedFunctionScope.sid } : {}),
            ...(nestedFunctionScope.kind === 'custom-action' ? { customActionName: nestedFunctionScope.name } : {}),
          } : {}),
          ...scalarMetadata(node, ['type', 'initialValue', 'isStatic', 'isConstant', 'comment']),
        };
        entities.push(createForgeEntity('variable', name, resource.entity.sourcePath, variableMetadata, eventPath.join('.')));
      }
    }

    if (Array.isArray(node.children)) {
      node.children.forEach((child, index) => visit(child, [...eventPath, index], nestedFunctionScope));
    }
  };

  events.forEach((event, index) => visit(event, [index]));
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
    const sid = sidOf(variable);
    const metadata: Record<string, JsonValue> = {
      ...(sid ? { sid } : {}),
      scope: kind === 'family' ? 'family' : 'object',
      ...(kind === 'family' ? { familyName: resource.entity.name } : { objectName: resource.entity.name }),
      ...scalarMetadata(variable, ['type', 'initialValue', 'isStatic', 'isConstant', 'comment']),
    };
    entities.push(createForgeEntity('variable', name, resource.entity.sourcePath, metadata, `${kind}:${sidOf(variable) ?? index}`));
  });
  return entities;
}

function structureEntities(resource: ParsedResource): ForgeEntity[] {
  if (!isRecord(resource.raw)) return [];
  const entities: ForgeEntity[] = [];
  const sourcePath = resource.entity.sourcePath;
  const parentMetadata = { ownerEntityId: resource.entity.id, ownerName: resource.entity.name };

  if (resource.descriptor.kind === 'layout') {
    const visitLayer = (layer: unknown, jsonPath: string, depth: number): void => {
      if (!isRecord(layer) || depth > 48) return;
      const sid = sidOf(layer);
      const name = stringProperty(layer, 'name') ?? `Layer ${jsonPath.split('[').at(-1)?.replace(']', '') ?? ''}`;
      const entity = createForgeEntity('layoutLayer', name, sourcePath, {
        ...parentMetadata,
        ...(sid ? { sid } : {}),
        jsonPath,
        layerPath: jsonPath,
      }, jsonPath);
      entities.push(entity);

      if (Array.isArray(layer.instances)) {
        layer.instances.forEach((instance, index) => {
          if (!isRecord(instance)) return;
          const type = stringProperty(instance, 'type');
          if (!type) return;
          const instancePath = `${jsonPath}.instances[${index}]`;
          const instanceSid = sidOf(instance);
          const uid = typeof instance.uid === 'string' || typeof instance.uid === 'number' ? String(instance.uid) : undefined;
          entities.push(createForgeEntity('layoutInstance', `${type}${uid ? ` (${uid})` : ''}`, sourcePath, {
            ...parentMetadata,
            layerEntityId: entity.id,
            objectType: type,
            ...(instanceSid ? { sid: instanceSid } : {}),
            ...(uid ? { uid } : {}),
            jsonPath: instancePath,
            ...(isRecord(instance.world) ? {
              position: {
                ...(typeof instance.world.x === 'number' ? { x: instance.world.x } : {}),
                ...(typeof instance.world.y === 'number' ? { y: instance.world.y } : {}),
                ...(typeof instance.world.width === 'number' ? { width: instance.world.width } : {}),
                ...(typeof instance.world.height === 'number' ? { height: instance.world.height } : {}),
                ...(typeof instance.world.angle === 'number' ? { angle: instance.world.angle } : {}),
              },
            } : {}),
          }, instancePath));
        });
      }
      for (const key of ['subLayers', 'layers']) {
        if (!Array.isArray(layer[key])) continue;
        (layer[key] as unknown[]).forEach((child, index) => visitLayer(child, `${jsonPath}.${key}[${index}]`, depth + 1));
      }
    };
    if (Array.isArray(resource.raw.layers)) {
      resource.raw.layers.forEach((layer, index) => visitLayer(layer, `$.layers[${index}]`, 0));
    }
  }

  if (resource.descriptor.kind === 'eventSheet' && Array.isArray(resource.raw.events)) {
    const visitEvent = (node: unknown, path: string, depth: number, parentId?: string): void => {
      if (!isRecord(node) || depth > 64) return;
      const eventType = stringProperty(node, 'eventType')
        ?? (Array.isArray(node.conditions) || Array.isArray(node.actions) ? 'block' : undefined);
      if (!eventType) return;
      const sid = sidOf(node);
      const name = stringProperty(node, 'functionName', 'title', 'name') ?? eventType;
      const eventPath = createForgeEntity('event', name, sourcePath, {
        ...parentMetadata,
        ...(sid ? { sid } : {}),
        eventType,
        jsonPath: path,
        ...(parentId ? { parentEventId: parentId } : {}),
      }, path);
      entities.push(eventPath);
      if (Array.isArray(node.children)) {
        node.children.forEach((child, index) => visitEvent(child, `${path}.children[${index}]`, depth + 1, eventPath.id));
      }
    };
    resource.raw.events.forEach((event, index) => visitEvent(event, `$.events[${index}]`, 0));
  }

  if (resource.descriptor.kind === 'object') {
    if (Array.isArray(resource.raw.behaviorTypes)) {
      resource.raw.behaviorTypes.forEach((behavior, index) => {
        if (!isRecord(behavior)) return;
        const behaviorId = stringProperty(behavior, 'behaviorId');
        const name = stringProperty(behavior, 'name');
        if (!behaviorId || !name) return;
        const sid = sidOf(behavior);
        entities.push(createForgeEntity('behavior', name, sourcePath, {
          ...parentMetadata,
          ...(sid ? { sid } : {}),
          behaviorId,
          jsonPath: `$.behaviorTypes[${index}]`,
        }, `behaviorTypes.${sid ?? index}`));
      });
    }
    if (resource.raw['plugin-id'] === 'Sprite' && isRecord(resource.raw.animations) && Array.isArray(resource.raw.animations.items)) {
      resource.raw.animations.items.forEach((animation, animationIndex) => {
        if (!isRecord(animation)) return;
        const animationName = stringProperty(animation, 'name');
        if (!animationName) return;
        const animationSid = sidOf(animation);
        const animationPath = `$.animations.items[${animationIndex}]`;
        const animationEntity = createForgeEntity('animation', animationName, sourcePath, {
          ...parentMetadata,
          ...(animationSid ? { sid: animationSid } : {}),
          animationName,
          jsonPath: animationPath,
        }, animationPath);
        entities.push(animationEntity);
        if (!Array.isArray(animation.frames)) return;
        animation.frames.forEach((frame, frameIndex) => {
          if (!isRecord(frame)) return;
          const framePath = `${animationPath}.frames[${frameIndex}]`;
          const frameSid = sidOf(frame);
          entities.push(createForgeEntity('animationFrame', `${animationName} · ${frameIndex + 1}`, sourcePath, {
            ...parentMetadata,
            animationEntityId: animationEntity.id,
            animationName,
            frameIndex,
            ...(frameSid ? { sid: frameSid } : {}),
            ...(typeof frame.imageSpriteId === 'number' || typeof frame.imageSpriteId === 'string'
              ? { imageSpriteId: String(frame.imageSpriteId) } : {}),
            ...(typeof frame.fileType === 'string' ? { fileType: frame.fileType } : {}),
            jsonPath: framePath,
          }, framePath));
        });
      });
    }
  }

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
      const caseInsensitiveMatch = await resolveCaseInsensitiveResourcePath(filesystem, path);
      if (caseInsensitiveMatch.status === 'missing') {
        return { issue: { path, stage: 'read', code: 'missing-resource', message: `Manifest resource was not found: ${path}` } };
      }
      if (caseInsensitiveMatch.status === 'ambiguous') {
        return { issue: {
          path,
          stage: 'read',
          code: 'ambiguous-resource-path',
          message: `Manifest resource path ${path} matches multiple case-insensitive paths: ${caseInsensitiveMatch.paths.join(', ')}.`,
        } };
      }
      path = caseInsensitiveMatch.path;
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
    entities.push(...structureEntities(resource));
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
