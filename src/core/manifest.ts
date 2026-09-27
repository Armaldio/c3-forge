import { isRecord, stringProperty, toJsonValue } from './json';
import { joinProjectPaths, normalizeProjectPath, projectPathBasename, projectPathWithoutExtension } from './paths';
import type { EntityKind, JsonValue, ManifestAddon, ManifestFolder, ManifestResource, ProjectManifest, ResourceIssue } from './types';

const RESOURCE_SECTIONS: Readonly<Record<string, { kind: EntityKind; directory: string; extension: string }>> = {
  objectTypes: { kind: 'object', directory: 'objectTypes', extension: '.json' },
  families: { kind: 'family', directory: 'families', extension: '.json' },
  layouts: { kind: 'layout', directory: 'layouts', extension: '.json' },
  eventSheets: { kind: 'eventSheet', directory: 'eventSheets', extension: '.json' },
  timelines: { kind: 'timeline', directory: 'timelines', extension: '.json' },
  flowcharts: { kind: 'flowchart', directory: 'flowcharts', extension: '.json' },
  files: { kind: 'asset', directory: 'files', extension: '' },
};

const ROOT_FILE_DIRECTORIES: Readonly<Record<string, string>> = {
  script: 'scripts',
  sound: 'sounds',
  music: 'music',
  video: 'videos',
  font: 'fonts',
  icon: 'icons',
  general: 'files',
};

export interface ManifestParseResult {
  readonly manifest: ProjectManifest;
  readonly issues: readonly ResourceIssue[];
}

function isEmptyFolder(value: Record<string, unknown>): boolean {
  return Array.isArray(value.items) && value.items.length === 0
    && Array.isArray(value.subfolders) && value.subfolders.length === 0;
}

function resourceName(item: string): string {
  const basename = projectPathBasename(item);
  return basename.toLowerCase().endsWith('.json') ? basename.slice(0, -'.json'.length) : basename;
}

function appendResource(
  section: { kind: EntityKind; directory: string; extension: string },
  item: string,
  pathFolders: readonly string[],
  resources: ManifestResource[],
  issues: ResourceIssue[],
): void {
  const itemPath = item.trim().replaceAll('\\', '/');
  if (itemPath === '') {
    issues.push({ path: item, stage: 'parse', code: 'invalid-resource-path', message: 'Resource item name is empty.' });
    return;
  }
  try {
    const basename = projectPathBasename(itemPath);
    if (basename === '' || itemPath.endsWith('/')) throw new Error('Resource item must identify a file name.');
    const pathParts = itemPath.includes('/') ? itemPath.split('/').slice(0, -1) : [];
    const leaf = section.extension !== '' && !basename.toLowerCase().endsWith(section.extension.toLowerCase())
      ? `${basename}${section.extension}`
      : basename;
    const name = resourceName(basename);
    const path = joinProjectPaths(section.directory, ...pathFolders, ...pathParts, leaf);
    resources.push({ kind: section.kind, path, name, metadata: {} });
  } catch (error) {
    issues.push({
      path: item,
      stage: 'parse',
      code: 'invalid-resource-path',
      message: error instanceof Error ? error.message : 'Resource path is invalid.',
    });
  }
}

function walkFileTree(
  value: unknown,
  directory: string,
  category: string,
  pathFolders: readonly string[],
  resources: ManifestResource[],
  declaredFolders: ManifestFolder[],
  issues: ResourceIssue[],
  depth = 0,
): void {
  if (depth > 48) {
    issues.push({ path: directory, stage: 'parse', code: 'resource-tree-too-deep', message: `Manifest folder nesting exceeds the supported depth near ${directory}.` });
    return;
  }
  if (!isRecord(value)) return;
  if (Array.isArray(value.items)) {
    for (const [index, item] of value.items.entries()) {
      const name = typeof item === 'string' ? item : isRecord(item) ? stringProperty(item, 'name', 'path', 'file') : undefined;
      if (!name) {
        issues.push({ path: `${directory}/${index}`, stage: 'parse', code: 'invalid-resource-item', message: `Manifest file item ${index} in ${directory} has no name.` });
        continue;
      }
      try {
        const itemParts = name.replaceAll('\\', '/').split('/');
        const leaf = itemParts.pop() ?? name;
        if (leaf === '' || name.endsWith('/') || name.endsWith('\\')) throw new Error('Resource item must identify a file name.');
        const path = joinProjectPaths(directory, ...pathFolders, ...itemParts, leaf);
        const metadata: Record<string, JsonValue> = { category };
        if (isRecord(item)) {
          const itemType = toJsonValue(item.type);
          if (itemType !== undefined) metadata.type = itemType;
        }
        resources.push({ kind: 'asset', path, name: projectPathWithoutExtension(leaf), metadata });
      } catch (error) {
        issues.push({
          path: name,
          stage: 'parse',
          code: 'invalid-resource-path',
          message: error instanceof Error ? error.message : 'Resource path is invalid.',
        });
      }
    }
  }
  if (!Array.isArray(value.subfolders)) return;
  for (const [index, subfolder] of value.subfolders.entries()) {
    if (!isRecord(subfolder)) {
      issues.push({ path: `${directory}/${index}`, stage: 'parse', code: 'invalid-resource-folder', message: `Manifest subfolder ${index} in ${directory} is not an object.` });
      continue;
    }
    if (isEmptyFolder(subfolder) && !stringProperty(subfolder, 'name')) continue;
    const name = stringProperty(subfolder, 'name');
    if (!name) {
      issues.push({ path: `${directory}/${index}`, stage: 'parse', code: 'invalid-resource-folder', message: `Manifest subfolder ${index} in ${directory} has no name.` });
      continue;
    }
    try {
      const nextFolders = [...pathFolders, normalizeProjectPath(name)];
      declaredFolders.push({ kind: 'projectFolder', path: joinProjectPaths(directory, ...nextFolders) });
      walkFileTree(subfolder, directory, category, nextFolders, resources, declaredFolders, issues, depth + 1);
    } catch (error) {
      issues.push({
        path: name,
        stage: 'parse',
        code: 'invalid-resource-folder',
        message: error instanceof Error ? error.message : 'Resource folder path is invalid.',
      });
    }
  }
}

function parseAddons(value: unknown): ManifestAddon[] {
  const addons: ManifestAddon[] = [];
  const entries = Array.isArray(value)
    ? value
    : isRecord(value) ? Object.entries(value).map(([key, entry]) => isRecord(entry) ? { id: key, ...entry } : key) : [];
  for (const entry of entries) {
    if (typeof entry === 'string') {
      addons.push({ id: entry, name: entry, metadata: {} });
      continue;
    }
    if (!isRecord(entry)) continue;
    const id = stringProperty(entry, 'id', 'addonId', 'pluginId', 'name');
    if (!id) continue;
    const name = stringProperty(entry, 'name', 'displayName') ?? id;
    const version = stringProperty(entry, 'version');
    const metadata: Record<string, JsonValue> = { id };
    for (const key of ['version', 'type', 'author', 'bundled']) {
      const item = toJsonValue(entry[key]);
      if (item !== undefined) metadata[key] = item;
    }
    addons.push({ id, name, ...(version ? { version } : {}), metadata });
  }
  return addons;
}

function walkResourceTree(
  value: unknown,
  section: { kind: EntityKind; directory: string; extension: string },
  pathFolders: readonly string[],
  resources: ManifestResource[],
  declaredFolders: ManifestFolder[],
  issues: ResourceIssue[],
  depth = 0,
): void {
  if (depth > 48) {
    issues.push({ path: section.directory, stage: 'parse', code: 'resource-tree-too-deep', message: `Manifest folder nesting exceeds the supported depth under ${section.directory}.` });
    return;
  }
  if (!isRecord(value)) return;

  const items = value.items;
  if (Array.isArray(items)) {
    for (const [index, item] of items.entries()) {
      if (typeof item === 'string') appendResource(section, item, pathFolders, resources, issues);
      else if (isRecord(item)) {
        const path = stringProperty(item, 'path', 'file', 'filename', 'name');
        if (path) appendResource(section, path, pathFolders, resources, issues);
        else issues.push({ path: `${section.directory}/${index}`, stage: 'parse', code: 'invalid-resource-item', message: `Manifest item ${index} in ${section.directory} has no name.` });
      } else {
        issues.push({ path: `${section.directory}/${index}`, stage: 'parse', code: 'invalid-resource-item', message: `Manifest item ${index} in ${section.directory} is not a string or object.` });
      }
    }
  }

  if (!Array.isArray(value.subfolders)) return;
  for (const [index, subfolder] of value.subfolders.entries()) {
    if (!isRecord(subfolder)) {
      issues.push({ path: `${section.directory}/${index}`, stage: 'parse', code: 'invalid-resource-folder', message: `Manifest subfolder ${index} in ${section.directory} is not an object.` });
      continue;
    }
    if (isEmptyFolder(subfolder) && !stringProperty(subfolder, 'name')) continue;
    const name = stringProperty(subfolder, 'name');
    if (!name) {
      issues.push({ path: `${section.directory}/${index}`, stage: 'parse', code: 'invalid-resource-folder', message: `Manifest subfolder ${index} in ${section.directory} has no name.` });
      continue;
    }
    try {
      const normalized = normalizeProjectPath(name);
      const nextFolders = [...pathFolders, normalized];
      declaredFolders.push({ kind: 'projectFolder', path: joinProjectPaths(section.directory, ...nextFolders) });
      walkResourceTree(subfolder, section, nextFolders, resources, declaredFolders, issues, depth + 1);
    } catch (error) {
      issues.push({
        path: name,
        stage: 'parse',
        code: 'invalid-resource-folder',
        message: error instanceof Error ? error.message : 'Resource folder path is invalid.',
      });
    }
  }
}

function normalizedMetadata(root: Record<string, unknown>): Readonly<Record<string, JsonValue>> {
  const metadata: Record<string, JsonValue> = {};
  for (const key of ['projectId', 'project-id', 'saved-version', 'savedWithRelease', 'version', 'applicationId']) {
    const value = toJsonValue(root[key]);
    if (value !== undefined) metadata[key] = value;
  }
  return metadata;
}

/**
 * Construct's serialized format evolves across releases. Parse its current root registry fields,
 * derive paths from that registry, and ignore unknown properties safely.
 */
export function parseProjectManifestResult(input: unknown, rootName = 'Construct project'): ManifestParseResult {
  if (!isRecord(input)) throw new Error('project.c3proj must contain a JSON object.');

  const sections = Object.keys(RESOURCE_SECTIONS).filter((key) => key in input);
  const rootFileFolders = input.rootFileFolders;
  const rootFileFolderRecord = isRecord(rootFileFolders) ? rootFileFolders : undefined;
  const isResourceTree = (value: unknown): value is Record<string, unknown> =>
    isRecord(value) && (Array.isArray(value.items) || Array.isArray(value.subfolders));
  const hasResourceTree = sections.some((key) => isResourceTree(input[key]));
  const hasFileFolders = rootFileFolderRecord !== undefined && Object.entries(rootFileFolderRecord).some(([category, value]) =>
    Object.hasOwn(ROOT_FILE_DIRECTORIES, category) && isResourceTree(value));
  if (!hasResourceTree && !hasFileFolders) {
    throw new Error('project.c3proj does not contain recognized Construct project sections.');
  }

  const resources: ManifestResource[] = [];
  const folders: ManifestFolder[] = [];
  const issues: ResourceIssue[] = [];
  for (const [key, section] of Object.entries(RESOURCE_SECTIONS)) {
    if (!(key in input)) continue;
    const tree = input[key];
    if (!isRecord(tree) || (!Array.isArray(tree.items) && !Array.isArray(tree.subfolders))) {
      issues.push({ path: section.directory, stage: 'parse', code: 'invalid-resource-tree', message: `Manifest section “${key}” is not a supported resource tree.` });
      continue;
    }
    walkResourceTree(tree, section, [], resources, folders, issues);
  }
  if ('rootFileFolders' in input) {
    if (!rootFileFolderRecord) {
      issues.push({ path: 'rootFileFolders', stage: 'parse', code: 'invalid-resource-tree', message: 'Manifest rootFileFolders is not an object.' });
    }
  }
  if (rootFileFolderRecord) {
    for (const [category, value] of Object.entries(rootFileFolderRecord)) {
      if (!Object.hasOwn(ROOT_FILE_DIRECTORIES, category)) continue;
      const directory = ROOT_FILE_DIRECTORIES[category];
      if (!directory) continue;
      if (!isRecord(value) || (!Array.isArray(value.items) && !Array.isArray(value.subfolders))) {
        issues.push({ path: directory, stage: 'parse', code: 'invalid-resource-tree', message: `Manifest file section “${category}” is not a supported resource tree.` });
        continue;
      }
      walkFileTree(value, directory, category, [], resources, folders, issues);
    }
  }

  const name = stringProperty(input, 'name', 'projectName', 'applicationName', 'title') ?? rootName;
  const rawVersion = input.constructVersion ?? input.savedWithRelease ?? input['construct-version'] ?? input['saved-version'];
  const constructVersion = typeof rawVersion === 'string' || (typeof rawVersion === 'number' && Number.isFinite(rawVersion))
    ? String(rawVersion)
    : undefined;
  const manifest: ProjectManifest = {
    projectFile: 'project.c3proj',
    name,
    ...(constructVersion ? { constructVersion } : {}),
    resources,
    folders,
    addons: parseAddons(input.usedAddons),
    metadata: normalizedMetadata(input),
  };
  return { manifest, issues };
}

export function parseProjectManifest(input: unknown, rootName = 'Construct project'): ProjectManifest {
  return parseProjectManifestResult(input, rootName).manifest;
}
