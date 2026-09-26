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

const fixtureModules = {
  'sample-project': import.meta.glob<string>('../fixtures/sample-project/**/*', { eager: true, query: '?raw', import: 'default' }),
  'minimal-project': import.meta.glob<string>('../fixtures/minimal-project/**/*', { eager: true, query: '?raw', import: 'default' }),
  'semantic-project': import.meta.glob<string>('../fixtures/semantic-project/**/*', { eager: true, query: '?raw', import: 'default' }),
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

function fixtureFileSystem(name: keyof typeof fixtureModules): MemoryProjectFileSystem {
  return new MemoryProjectFileSystem(name, readFixtureTree(name));
}

describe('Construct project core', () => {
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
    expect(analysis.index.bySourcePath.get('layouts/Main.json')).toHaveLength(1);

    const relationships = analysis.references.map((reference) => [reference.relationship, reference.targetName]);
    expect(relationships).toContainEqual(['layout-event-sheet', 'Game Events']);
    expect(relationships).toContainEqual(['layout-instance', 'Player']);
    expect(relationships).toContainEqual(['layout-instance', 'Enemy']);
    expect(relationships).toContainEqual(['family-member', 'Player']);
    expect(relationships).toContainEqual(['event-sheet-include', 'Shared Events']);
    expect(relationships).toContainEqual(['event-sheet-include', 'Missing Events']);
    expect(relationships).toContainEqual(['function-call', 'Spawn']);

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
    expect(analysis.diagnostics.some((diagnostic) => diagnostic.ruleId === 'reference.unresolved')).toBe(true);
    expect(analysis.index.byKind.get('asset')?.some((entity) => entity.sourcePath === 'images/player-frame.png')).toBe(true);
    expect(analysis.index.byKind.get('addon')?.some((entity) => entity.name === 'Fixture plugin')).toBe(true);
    expect(analysis.stats.entitiesByKind.layout).toBe(2);
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

  it('resolves Construct globals across sheets and respects nested local and function scopes', async () => {
    const analysis = await loadProject(fixtureFileSystem('semantic-project'));
    const byName = (name: string) => analysis.index.byKind.get('variable')?.find((entity) => entity.name === name);
    const coins = byName('coins');
    const groupDamage = byName('groupDamage');
    const nestedDamage = byName('nestedDamage');
    const amount = byName('amount');
    const functionLocal = byName('functionLocal');
    const nestedFunctionLocal = byName('nestedFunctionLocal');
    const combatSheet = analysis.index.byKind.get('eventSheet')?.find((entity) => entity.name === 'Combat');
    const combatSourcePath = 'eventSheets/Gameplay/Combat.json';

    expect(coins?.sourcePath).toBe('eventSheets/Globals.json');
    expect(combatSheet?.sourcePath).toBe(combatSourcePath);

    const combatCoinReferences = analysis.references.filter((reference) =>
      reference.sourcePath === combatSourcePath && reference.targetEntityId === coins?.id);
    expect(combatCoinReferences.filter((reference) => reference.relationship === 'event-variable-action')).toHaveLength(2);
    expect(combatCoinReferences.filter((reference) => reference.relationship === 'event-variable-condition')).toHaveLength(1);
    expect(combatCoinReferences.filter((reference) => reference.relationship === 'event-variable-expression')).toHaveLength(4);
    expect(combatCoinReferences.find((reference) => reference.relationship === 'event-variable-condition')?.sourceLocation)
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
      reference.sourceLocation?.eventSid === '219' && reference.targetName === 'groupDamage');
    expect(outsideGroupUses.some((reference) => reference.targetEntityId === groupDamage?.id)).toBe(false);

    const award = analysis.index.byKind.get('function')?.find((entity) => entity.name === 'AwardCoins');
    expect(award?.id).toContain('sid:230');
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
      reference.relationship === 'family-member' && reference.targetName === 'Player')).toBe(true);

    const coinExpressionReferences = combatCoinReferences.filter((reference) => reference.relationship === 'event-variable-expression');
    expect(coinExpressionReferences).toHaveLength(4);
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

    const possibleFamilyMatches = analysis.references.filter((reference) =>
      reference.source === 'exact-string-fallback' && reference.targetName === 'Combatants');
    expect(possibleFamilyMatches).toHaveLength(1);
    expect(possibleFamilyMatches[0]?.sourceLocation?.jsonPath).toBe('$.notes');

    expect(analysis.referencesBySource.get(combatSheet?.id ?? '')).toContain(combatCoinReferences[0]);
    expect(analysis.referencesByTarget.get(coins?.id ?? '')).toEqual(expect.arrayContaining(combatCoinReferences));
    expect(analysis.dependencies.find((edge) =>
      edge.sourceEntityId === combatSheet?.id
      && edge.targetEntityId === coins?.id
      && edge.relationship === 'event-variable-expression')?.occurrenceIds).toHaveLength(4);
    expect(new Set(analysis.dependencies.map((edge) => edge.id)).size).toBe(analysis.dependencies.length);
    expect(analysis.diagnostics.some((diagnostic) => diagnostic.ruleId === 'resource.missing-resource')).toBe(false);
  });
});
