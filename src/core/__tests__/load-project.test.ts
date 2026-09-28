import { describe, expect, it } from 'vitest';
import {
  joinProjectPaths,
  loadProject,
  makeStableEntityId,
  normalizeProjectPath,
  parseEntitySearch,
  parseProjectManifest,
  parseProjectManifestResult,
  resolveProjectPath,
  searchEntities,
} from '../index';
import type { ProjectFileSystem } from '../filesystem';
import type { ForgeEntity } from '../types';

const fixtureModules = {
  'sample-project': import.meta.glob<string>('../fixtures/sample-project/**/*', { eager: true, query: '?raw', import: 'default' }),
  'minimal-project': import.meta.glob<string>('../fixtures/minimal-project/**/*', { eager: true, query: '?raw', import: 'default' }),
  'semantic-project': import.meta.glob<string>('../fixtures/semantic-project/**/*', { eager: true, query: '?raw', import: 'default' }),
  'construct-platformer': import.meta.glob<string>('../fixtures/construct-platformer/**/*', { eager: true, query: '?raw', import: 'default' }),
};

class MemoryProjectFileSystem implements ProjectFileSystem {
  readonly rootName: string;
  readonly #files: ReadonlyMap<string, Uint8Array>;
  readonly #directories: ReadonlySet<string>;

  constructor(rootName: string, files: ReadonlyMap<string, Uint8Array>) {
    this.rootName = rootName;
    this.#files = files;
    const directories = new Set<string>(['']);
    for (const path of files.keys()) {
      const segments = path.split('/');
      segments.pop();
      for (let end = 1; end <= segments.length; end += 1) directories.add(segments.slice(0, end).join('/'));
    }
    this.#directories = directories;
  }

  exists(path: string): Promise<boolean> {
    const normalized = this.normalizePath(path);
    return Promise.resolve(this.#files.has(normalized) || this.#directories.has(normalized));
  }

  async readText(path: string): Promise<string> {
    const content = this.#files.get(this.normalizePath(path));
    if (!content) throw new Error(`Missing fixture file: ${path}`);
    return new TextDecoder().decode(content);
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const content = this.#files.get(this.normalizePath(path));
    if (!content) throw new Error(`Missing fixture file: ${path}`);
    return content;
  }

  listFiles(directory = ''): Promise<readonly string[]> {
    const normalized = this.normalizePath(directory);
    return Promise.resolve([...this.#files.keys()].filter((path) => parentPath(path) === normalized));
  }

  listDirectories(directory = ''): Promise<readonly string[]> {
    const normalized = this.normalizePath(directory);
    return Promise.resolve([...this.#directories].filter((path) => path !== '' && parentPath(path) === normalized));
  }

  normalizePath(path: string): string {
    return normalizeProjectPath(path);
  }

  joinPaths(...segments: readonly string[]): string {
    return joinProjectPaths(...segments);
  }

  resolve(fromPath: string, relativePath: string): string {
    return resolveProjectPath(fromPath, relativePath);
  }
}

function parentPath(path: string): string {
  const separator = path.lastIndexOf('/');
  return separator < 0 ? '' : path.slice(0, separator);
}

function readFixtureTree(name: keyof typeof fixtureModules): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  for (const [modulePath, content] of Object.entries(fixtureModules[name])) {
    const fixturePrefix = `../fixtures/${name}/`;
    const relativePath = modulePath.startsWith(fixturePrefix) ? modulePath.slice(fixturePrefix.length) : modulePath;
    files.set(relativePath, new TextEncoder().encode(content));
  }
  return files;
}

function fixtureFileSystem(
  name: keyof typeof fixtureModules,
  editFiles?: (files: Map<string, Uint8Array>) => void,
): MemoryProjectFileSystem {
  const files = readFixtureTree(name);
  editFiles?.(files);
  return new MemoryProjectFileSystem(name, files);
}

describe('Construct project core', () => {
  it('resolves a unique case-insensitive file path from the Construct manifest', async () => {
    const analysis = await loadProject(fixtureFileSystem('sample-project', (files) => {
      const originalPath = 'objectTypes/Player.json';
      const object = files.get(originalPath);
      if (!object) throw new Error(`Missing fixture file: ${originalPath}`);
      files.delete(originalPath);
      files.set('objectTypes/player.json', object);
    }));

    expect(analysis.index.byKind.get('object')?.some((entity) => entity.name === 'Player')).toBe(true);
    expect(analysis.diagnostics.some((diagnostic) => diagnostic.ruleId === 'resource.missing-resource'
      && diagnostic.sourcePath === 'objectTypes/Player.json')).toBe(false);
  });

  it('does not choose between case-insensitive resource path collisions', async () => {
    const analysis = await loadProject(fixtureFileSystem('sample-project', (files) => {
      const originalPath = 'objectTypes/Player.json';
      const object = files.get(originalPath);
      if (!object) throw new Error(`Missing fixture file: ${originalPath}`);
      files.delete(originalPath);
      files.set('objectTypes/player.json', object);
      files.set('objectTypes/PLAYER.json', object);
    }));

    expect(analysis.diagnostics).toContainEqual(expect.objectContaining({
      ruleId: 'resource.ambiguous-resource-path',
      sourcePath: 'objectTypes/Player.json',
    }));
    expect(analysis.index.byKind.get('object')?.some((entity) => entity.name === 'Player')).toBe(false);
  });

  it('normalizes manifest resource trees, assets, addons, and paths', () => {
    const manifest = {
      name: 'Nested',
      savedWithRelease: 'r400',
      objectTypes: { items: ['Player', 'Player.v2'], subfolders: [{ name: 'World', items: ['Enemy'], subfolders: [] }] },
      rootFileFolders: { general: { items: [{ name: 'badge.png', type: 'image' }], subfolders: [] } },
      usedAddons: [{ id: 'addon.id', name: 'Addon', type: 'plugin' }],
    };
    const normalized = parseProjectManifest(manifest);
    expect(normalized.resources.map((resource) => resource.path)).toEqual([
      'objectTypes/Player.json',
      'objectTypes/Player.v2.json',
      'objectTypes/World/Enemy.json',
      'files/badge.png',
    ]);
    expect(normalized.resources[1]?.name).toBe('Player.v2');
    expect(normalized.folders).toContainEqual({ kind: 'projectFolder', path: 'objectTypes/World' });
    expect(normalized.constructVersion).toBe('r400');
    expect(normalized.addons[0]?.id).toBe('addon.id');
    expect(normalizeProjectPath('objectTypes\\World\\Enemy.json')).toBe('objectTypes/World/Enemy.json');
    expect(resolveProjectPath('layouts/Nested/Main.json', '../Shared.json')).toBe('layouts/Shared.json');
    expect(makeStableEntityId('object', 'objectTypes/Player.json', 'Player'))
      .toBe(makeStableEntityId('object', 'objectTypes/Player.json', 'Player'));
    expect(() => normalizeProjectPath('../outside.json')).toThrow(/escapes its root/);
    expect(() => parseProjectManifest({ name: 'not a Construct project' })).toThrow(/recognized Construct project sections/);

    const unsafeManifest = parseProjectManifestResult({ layouts: { items: ['../outside'], subfolders: [] } });
    expect(unsafeManifest.manifest.resources).toEqual([]);
    expect(unsafeManifest.issues[0]?.code).toBe('invalid-resource-path');

    const emptyTimelineFolder = parseProjectManifestResult({ timelines: { items: [], subfolders: [{ items: [], subfolders: [] }] } });
    expect(emptyTimelineFolder.issues).toEqual([]);
  });

  it('provides read-only file operations through the in-memory filesystem contract', async () => {
    const filesystem = fixtureFileSystem('minimal-project');

    expect(await filesystem.exists('project.c3proj')).toBe(true);
    expect(await filesystem.exists('layouts/Not Here.json')).toBe(false);
    expect(await filesystem.readText('project.c3proj')).toContain('Minimal Forge Project');
    expect(await filesystem.listFiles('layouts')).toEqual(['layouts/Start.json']);
    expect(await filesystem.listDirectories('')).toEqual(['layouts']);
    expect(await filesystem.readBinary('layouts/Start.json')).toBeInstanceOf(Uint8Array);
  });

  it('loads a checked-in multi-resource project with isolated malformed and missing resources', async () => {
    const filesystem = fixtureFileSystem('sample-project');
    const stages: string[] = [];
    const analysis = await loadProject(filesystem, { onProgress: (stage) => stages.push(stage) });

    expect(analysis.manifest.name).toBe('Fixture Forge Project');
    expect(analysis.manifest.constructVersion).toBe('Construct 3 r999');
    expect(analysis.index.byKind.get('layout')?.map((entity) => entity.name)).toEqual(['Main', 'Title Screen']);
    expect(analysis.index.byKind.get('object')?.map((entity) => entity.name)).toEqual(['Player', 'Enemy']);
    expect(analysis.index.byName.get('player')?.[0]?.sourcePath).toBe('objectTypes/Player.json');
    expect(analysis.index.bySourcePath.get('layouts/Main.json')?.filter((entity) => entity.kind === 'layout')).toHaveLength(1);

    const relationships = analysis.references.map((reference) => [
      reference.relationship,
      analysis.index.byId.get(reference.targetEntityId)?.name,
    ]);
    expect(relationships).toContainEqual(['layout-event-sheet', 'Game Events']);
    expect(relationships).toContainEqual(['layout-instance-type', 'Player']);
    expect(relationships).toContainEqual(['layout-instance-type', 'Enemy']);
    expect(relationships).toContainEqual(['layout-layer', 'World']);
    expect(relationships).toContainEqual(['layer-child', 'Enemies']);
    expect(relationships).toContainEqual(['layer-instance', 'Player (1)']);
    expect(relationships).toContainEqual(['family-member', 'Player']);
    expect(relationships).toContainEqual(['event-sheet-include', 'Shared Events']);
    expect(relationships).toContainEqual(['function-call', 'Spawn']);
    expect(relationships).toContainEqual(['event-defines-function', 'Spawn']);
    expect(relationships).toContainEqual(['event-sheet-event', 'block']);
    const functionEvent = (analysis.index.byKind.get('event') ?? []).find((entity) => entity.metadata.eventType === 'function-block');
    expect(functionEvent?.id).toContain(encodeURIComponent(String(functionEvent?.metadata.sid)));
    expect(analysis.references.some((reference) => reference.relationship === 'event-defines-function'
      && reference.sourceEntityId === functionEvent?.id
      && reference.sourceLocation?.eventSid === '411'
      && reference.sourceLocation.jsonPath === '$.events[3].functionName')).toBe(true);
    expect(analysis.unresolvedReferences).toContainEqual(expect.objectContaining({
      relationship: 'event-sheet-include',
      targetName: 'Missing Events',
      resolution: 'missing',
    }));

    const resourceDiagnostics = analysis.diagnostics.filter((diagnostic) => diagnostic.ruleId.startsWith('resource.'));
    expect(resourceDiagnostics).toHaveLength(2);
    expect('resourceIssues' in analysis).toBe(false);
    expect(resourceDiagnostics).toContainEqual(expect.objectContaining({
      ruleId: 'resource.missing-resource',
      sourcePath: 'objectTypes/Missing.json',
    }));
    expect(resourceDiagnostics).toContainEqual(expect.objectContaining({
      ruleId: 'resource.invalid-json',
      sourcePath: 'timelines/Broken.json',
    }));
    expect(analysis.diagnostics.some((diagnostic) => diagnostic.ruleId === 'relationship.missing-target')).toBe(true);
    expect(analysis.index.byKind.get('asset')?.some((entity) => entity.sourcePath === 'images/player-frame.png')).toBe(true);
    expect(analysis.index.byKind.get('addon')?.some((entity) => entity.name === 'Fixture plugin')).toBe(true);
    expect(analysis.stats.entitiesByKind.layout).toBe(2);
    const worldFolder = analysis.index.byKind.get('projectFolder')?.find((entity) => entity.sourcePath === 'objectTypes/World');
    const cavesFolder = analysis.index.byKind.get('projectFolder')?.find((entity) => entity.sourcePath === 'objectTypes/World/Caves');
    const nestedEnemy = analysis.index.byKind.get('object')?.find((entity) => entity.sourcePath === 'objectTypes/World/Enemy.json');
    expect(worldFolder).toBeDefined();
    expect(cavesFolder).toBeDefined();
    expect(analysis.references.some((reference) => reference.relationship === 'folder-resource'
      && reference.sourceEntityId === worldFolder?.id && reference.targetEntityId === nestedEnemy?.id)).toBe(true);
    expect(analysis.references.some((reference) => reference.relationship === 'folder-child'
      && reference.sourceEntityId === worldFolder?.id && reference.targetEntityId === cavesFolder?.id)).toBe(true);
    expect(analysis.references.some((reference) => reference.relationship === 'folder-resource'
      && reference.sourceEntityId === cavesFolder?.id && reference.targetEntityId === nestedEnemy?.id)).toBe(false);
    expect(analysis.stats.entitiesByKind.variable).toBe(6);
    expect(searchEntities(analysis.index, 'kind:function sheet:"Game Events"').map((entity) => entity.name)).toEqual(['Spawn']);
    expect(stages).toEqual(['validate', 'read-manifest', 'load-resources', 'parse', 'index', 'references', 'diagnostics', 'ready']);

    const flowchartRefs = analysis.references.filter((reference) => reference.sourcePath.startsWith('flowcharts/'));
    expect(flowchartRefs).toEqual([]);
  });

  it('loads a minimal checked-in project and supports structured-ready search parsing', async () => {
    const analysis = await loadProject(fixtureFileSystem('minimal-project'));
    expect(analysis.index.byKind.get('layout')?.map((entity) => entity.name)).toEqual(['Start']);
    expect(analysis.diagnostics.filter((diagnostic) => diagnostic.ruleId.startsWith('resource.'))).toEqual([]);
    expect(parseEntitySearch('kind:function sheet:"Game Events"')).toEqual({
      terms: [],
      kinds: ['function'],
      sheets: ['game events'],
    });
    expect(searchEntities(analysis.index, 'kind:layout start').map((entity) => entity.name)).toEqual(['Start']);
  });

  it('loads a licensed real Construct folder project without unresolved references', async () => {
    const analysis = await loadProject(fixtureFileSystem('construct-platformer'));
    expect({ entities: analysis.stats.totalEntities, references: analysis.stats.totalReferences, dependencies: analysis.stats.totalDependencies })
      .toEqual({ entities: 154, references: 207, dependencies: 138 });

    expect(analysis.manifest.name).toBe('Platform abstraction');
    expect(analysis.manifest.constructVersion).toBe('44002');
    expect(analysis.stats.entitiesByKind).toMatchObject({ object: 9, layout: 1, eventSheet: 1, variable: 2 });
    expect(analysis.references.every((reference) => analysis.index.byId.has(reference.targetEntityId))).toBe(true);
    expect(analysis.dependencies.length).toBeGreaterThan(24);
    expect(analysis.dependencies.some((dependency) => dependency.occurrenceIds.length > 1)).toBe(true);
    expect(analysis.unresolvedReferences).toEqual([]);
    expect(analysis.diagnostics).toEqual([]);

    const layout = analysis.index.byKind.get('layout')?.[0];
    const layoutLayers = analysis.index.byKind.get('layoutLayer') ?? [];
    const layoutInstances = analysis.index.byKind.get('layoutInstance') ?? [];
    expect(layoutLayers.length).toBeGreaterThan(0);
    expect(layoutInstances.some((instance) => instance.metadata.uid !== undefined && instance.metadata.position !== undefined)).toBe(true);
    expect(analysis.references.some((reference) => reference.sourceEntityId === layout?.id && reference.relationship === 'layout-layer')).toBe(true);
    expect(analysis.references.some((reference) => reference.relationship === 'layer-instance')).toBe(true);
    expect(analysis.references.some((reference) => reference.relationship === 'layout-instance-type')).toBe(true);

    const objectNames = analysis.index.byKind.get('object')?.map((entity) => entity.name) ?? [];
    expect(objectNames).toContain('PlayerAnim');
    expect(analysis.index.byKind.get('behavior')?.some((entity) => entity.name === 'Flash')).toBe(true);
    expect(analysis.references.some((reference) => reference.relationship === 'behavior-attachment')).toBe(true);
    expect(analysis.index.byKind.get('animation')?.some((entity) => entity.name === 'walk')).toBe(true);
    expect(analysis.index.byKind.get('animationFrame')?.length).toBeGreaterThan(0);
    expect(analysis.references.some((reference) => reference.relationship === 'object-animation')).toBe(true);
    expect(analysis.references.some((reference) => reference.relationship === 'animation-frame')).toBe(true);
    expect(analysis.references.some((reference) => reference.relationship === 'frame-image'
      && analysis.index.byId.get(reference.targetEntityId)?.sourcePath === 'images/playeranim-walk-000.png'
      && reference.sourceLocation?.jsonPath === '$.animations.items[0].frames[0]')).toBe(true);
    expect(analysis.index.byKind.get('event')?.length).toBeGreaterThan(0);
    expect(analysis.references.some((reference) => reference.relationship === 'event-child')).toBe(true);
    expect(analysis.index.byKind.get('event')?.some((entity) => entity.metadata.sid === '374483578434910')).toBe(true);
    const frames = analysis.index.byKind.get('animationFrame') ?? [];
    expect(new Set(frames.map((frame) => frame.id)).size).toBe(frames.length);
    const walkFrame = frames.find((frame) => frame.name === 'walk · 1');
    expect(walkFrame).toMatchObject({
      metadata: { jsonPath: '$.animations.items[0].frames[0]', frameIndex: 0, imageSpriteId: '3' },
    });
  });

  it('reports a missing deterministically named PNG frame image and creates no image edge', async () => {
    const analysis = await loadProject(fixtureFileSystem('construct-platformer', (files) => {
      files.delete('images/playeranim-walk-000.png');
      files.set('images/unrelated/playeranim-walk-000.png', new Uint8Array([1]));
    }));
    expect(analysis.references.some((reference) => reference.relationship === 'frame-image'
      && analysis.index.byId.get(reference.targetEntityId)?.sourcePath === 'images/playeranim-walk-000.png')).toBe(false);
    expect(analysis.unresolvedReferences).toContainEqual(expect.objectContaining({
      relationship: 'frame-image',
      targetName: 'images/playeranim-walk-000.png',
      resolution: 'missing',
    }));
  });

  it('maps a serialized WebP frame to its deterministically named image asset', async () => {
    const analysis = await loadProject(fixtureFileSystem('construct-platformer', (files) => {
      const objectPath = 'objectTypes/PlayerAnim.json';
      const content = files.get(objectPath);
      if (!content) throw new Error(`Missing fixture file: ${objectPath}`);
      const object = JSON.parse(new TextDecoder().decode(content)) as {
        animations: { items: { frames: { fileType: string }[] }[] };
      };
      object.animations.items[0]!.frames[0]!.fileType = 'image/webp';
      files.set(objectPath, new TextEncoder().encode(JSON.stringify(object)));
      const pngPath = 'images/playeranim-walk-000.png';
      const image = files.get(pngPath);
      if (!image) throw new Error(`Missing fixture image: ${pngPath}`);
      files.delete(pngPath);
      files.set('images/playeranim-walk-000.webp', image);
    }));

    expect(analysis.references).toContainEqual(expect.objectContaining({
      relationship: 'frame-image',
      targetEntityId: expect.any(String),
      sourceLocation: { jsonPath: '$.animations.items[0].frames[0]' },
    }));
    const imageReference = analysis.references.find((reference) => reference.relationship === 'frame-image'
      && reference.sourceLocation?.jsonPath === '$.animations.items[0].frames[0]');
    expect(imageReference && analysis.index.byId.get(imageReference.targetEntityId)?.sourcePath)
      .toBe('images/playeranim-walk-000.webp');
  });

  it('reports ambiguous function definition names instead of choosing one', async () => {
    const analysis = await loadProject(fixtureFileSystem('semantic-project', (files) => {
      const path = 'eventSheets/Gameplay/Combat.json';
      const source = files.get(path);
      if (!source) throw new Error(`Missing fixture file: ${path}`);
      const sheet = JSON.parse(new TextDecoder().decode(source)) as { events: unknown[] };
      sheet.events.push({ eventType: 'function-block', functionName: 'AwardCoins', sid: 999001, conditions: [], actions: [] });
      files.set(path, new TextEncoder().encode(JSON.stringify(sheet)));
    }));
    const ambiguousFunctionEventIds = new Set((analysis.index.byKind.get('event') ?? [])
      .filter((entity) => entity.name === 'AwardCoins').map((entity) => entity.id));
    expect(analysis.references.some((reference) => reference.relationship === 'event-defines-function'
      && ambiguousFunctionEventIds.has(reference.sourceEntityId))).toBe(false);
    expect(analysis.unresolvedReferences).toContainEqual(expect.objectContaining({
      relationship: 'event-defines-function',
      targetName: 'AwardCoins',
      resolution: 'ambiguous',
      candidateEntityIds: expect.arrayContaining([expect.stringContaining('function:sid:')]),
    }));
  });

  it('resolves Construct globals across sheets and respects nested local and function scopes', async () => {
    const analysis = await loadProject(fixtureFileSystem('semantic-project'));
    const byName = (name: string) => analysis.index.byKind.get('variable')?.find((entity) => entity.name === name);
    const coins = byName('coins');
    const groupDamage = byName('groupDamage');
    const nestedDamage = byName('nestedDamage');
    const forwardLocal = byName('forwardLocal');
    const branchLocal = byName('branchLocal');
    const amount = byName('amount');
    const functionLocal = byName('functionLocal');
    const nestedFunctionLocal = byName('nestedFunctionLocal');
    const customAmount = byName('customAmount');
    const customLocal = byName('customLocal');
    const groupFunctionLocal = byName('groupFunctionLocal');
    const combatSheet = analysis.index.byKind.get('eventSheet')?.find((entity) => entity.name === 'Combat');
    const combatSourcePath = 'eventSheets/Gameplay/Combat.json';

    expect(coins?.sourcePath).toBe('eventSheets/Globals.json');
    expect(combatSheet?.sourcePath).toBe(combatSourcePath);

    const combatCoinReferences = analysis.references.filter((reference) =>
      reference.sourcePath === combatSourcePath && reference.targetEntityId === coins?.id);
    expect(combatCoinReferences.filter((reference) =>
      reference.sourceLocation?.jsonPath?.endsWith('.parameters.variable'))).toHaveLength(3);
    expect(combatCoinReferences.find((reference) =>
      reference.sourceLocation?.jsonPath?.endsWith('.parameters.variable'))?.sourceLocation)
      .toMatchObject({
        eventSid: '201',
        entryKind: 'condition',
        entryIndex: 0,
        jsonPath: '$.events[0].conditions[0].parameters.variable',
      });

    const nestedOccurrences = analysis.references.filter((reference) => reference.targetEntityId === nestedDamage?.id);
    expect(nestedOccurrences.some((reference) => reference.sourceLocation?.eventSid === '215')).toBe(true);
    expect(nestedOccurrences.some((reference) => reference.sourceLocation?.eventSid === '217')).toBe(false);

    const outsideGroupUses = analysis.references.filter((reference) =>
      reference.sourceLocation?.eventSid === '219'
      && analysis.index.byId.get(reference.targetEntityId)?.name === 'groupDamage');
    expect(outsideGroupUses.some((reference) => reference.targetEntityId === groupDamage?.id)).toBe(false);
    expect(outsideGroupUses.some((reference) => reference.targetEntityId === forwardLocal?.id)).toBe(false);

    const eventUsesVariable = (eventSid: string, variable: ForgeEntity | undefined) => analysis.references.some((reference) =>
      reference.sourceLocation?.eventSid === eventSid && reference.targetEntityId === variable?.id);
    expect(eventUsesVariable('241', forwardLocal)).toBe(true);
    expect(eventUsesVariable('244', forwardLocal)).toBe(true);
    expect(eventUsesVariable('246', forwardLocal)).toBe(true);
    expect(eventUsesVariable('250', branchLocal)).toBe(true);
    expect(eventUsesVariable('253', branchLocal)).toBe(false);
    expect(customAmount?.metadata.scope).toBe('custom-action-parameter');
    expect(customLocal?.metadata.scope).toBe('function-local');
    expect(eventUsesVariable('283', customAmount)).toBe(true);
    expect(eventUsesVariable('283', customLocal)).toBe(true);
    expect(analysis.references.filter((reference) =>
      ['291', '293'].includes(reference.sourceLocation?.eventSid ?? '')
      && reference.relationship === 'event-variable-reference'
      && reference.targetEntityId === groupFunctionLocal?.id)).toHaveLength(2);
    expect(analysis.references.some((reference) =>
      reference.relationship === 'object-reference'
      && analysis.index.byId.get(reference.targetEntityId)?.name === 'Functions')).toBe(false);

    const award = analysis.index.byKind.get('function')?.find((entity) => entity.name === 'AwardCoins');
    expect(award?.id).toContain('sid:230');
    expect(analysis.references.some((reference) =>
      reference.sourceLocation?.eventSid === '283'
      && reference.relationship === 'function-call'
      && reference.targetEntityId === award?.id)).toBe(true);
    expect(analysis.references.some((reference) =>
      reference.sourceEntityId === award?.id && reference.targetEntityId === amount?.id)).toBe(true);
    expect(analysis.references.find((reference) =>
      reference.sourceEntityId === award?.id && reference.targetEntityId === amount?.id)?.sourceLocation)
      .toMatchObject({ eventSid: '230', functionSid: '230', eventPath: '$.events[1]' });
    expect(analysis.references.some((reference) =>
      reference.sourceLocation?.eventSid === '233' && reference.targetEntityId === functionLocal?.id)).toBe(true);
    expect(analysis.references.some((reference) =>
      reference.sourceLocation?.eventSid === '236' && reference.targetEntityId === nestedFunctionLocal?.id)).toBe(true);
    expect(analysis.references.some((reference) =>
      reference.sourceLocation?.eventSid === '238' && reference.targetEntityId === nestedFunctionLocal?.id)).toBe(false);
    expect(analysis.references.some((reference) =>
      reference.sourceLocation?.eventSid === '238' && reference.targetEntityId === functionLocal?.id)).toBe(true);

    expect(analysis.index.byKind.get('object')?.find((entity) => entity.name === 'Player')?.sourcePath)
      .toBe('objectTypes/Actors/Player.json');
    expect(analysis.references.some((reference) =>
      reference.relationship === 'family-member'
      && analysis.index.byId.get(reference.targetEntityId)?.name === 'Player')).toBe(true);

    const coinExpressionReferences = combatCoinReferences.filter((reference) =>
      !reference.sourceLocation?.jsonPath?.endsWith('.parameters.variable'));
    expect(coinExpressionReferences.length).toBeGreaterThanOrEqual(4);
    expect(new Set(coinExpressionReferences.map((reference) => reference.id)).size).toBe(4);
    expect(new Set(coinExpressionReferences.map((reference) => reference.sourceLocation?.jsonPath)).size).toBeGreaterThan(0);
    expect(coinExpressionReferences.some((reference) => reference.sourceLocation?.eventSid === '201')).toBe(true);
    expect(coinExpressionReferences.some((reference) => reference.sourceLocation?.eventSid === '212')).toBe(true);
    expect(coinExpressionReferences.every((reference) => reference.sourceLocation?.entryIndex === 0)).toBe(true);
    expect(coinExpressionReferences.find((reference) => reference.sourceLocation?.eventSid === '201')?.sourceLocation?.expressionRange)
      .toEqual({ start: 0, end: 5 });
    expect(coinExpressionReferences.filter((reference) => reference.sourceLocation?.eventSid === '201'
      && reference.sourceLocation?.entryKind === 'action')
      .map((reference) => reference.sourceLocation?.expressionRange?.start)).toEqual([0, 8]);
    const repeatedActionOccurrences = coinExpressionReferences.filter((reference) =>
      reference.sourceLocation?.eventSid === '201' && reference.sourceLocation?.entryKind === 'action');
    expect(repeatedActionOccurrences).toHaveLength(2);
    expect(new Set(repeatedActionOccurrences.map((reference) => reference.id)).size).toBe(2);

    expect(analysis.references.some((reference) =>
      analysis.index.byId.get(reference.targetEntityId)?.name === 'Combatants'
      && reference.sourceLocation?.jsonPath === '$.notes')).toBe(false);

    expect(analysis.referencesBySource.get(combatSheet?.id ?? '')).toContain(combatCoinReferences[0]);
    expect(analysis.referencesByTarget.get(coins?.id ?? '')).toEqual(expect.arrayContaining(combatCoinReferences));
    expect(analysis.dependencies.find((edge) =>
      edge.sourceEntityId === combatSheet?.id
      && edge.targetEntityId === coins?.id
      && edge.relationship === 'event-variable-reference')?.occurrenceIds.length).toBeGreaterThanOrEqual(4);
    expect(new Set(analysis.dependencies.map((edge) => edge.id)).size).toBe(analysis.dependencies.length);
    expect(analysis.diagnostics.some((diagnostic) => diagnostic.ruleId === 'resource.missing-resource')).toBe(false);
  });
});
