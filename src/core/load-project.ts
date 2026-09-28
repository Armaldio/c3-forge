import type { ProjectFileSystem } from './filesystem';
import { createAnalysisStats, createProjectDiagnostics } from './diagnostics';
import { createForgeEntity, entityForProjectFile } from './entities';
import { parseProjectManifestResult, type ManifestParseResult } from './manifest';
import { createProjectIndex } from './project-index';
import { createProjectDependencies, createReferenceIndexes, extractProjectRelationships } from './references';
import { loadManifestResources } from './resources';
import type { ProjectAnalysis, ProjectLoadOptions, ProjectLoadStage, ResourceIssue } from './types';

function report(options: ProjectLoadOptions | undefined, stage: ProjectLoadStage): void {
  options?.onProgress?.(stage);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Read and analyze a Construct folder project without writing to its filesystem. */
export async function loadProject(filesystem: ProjectFileSystem, options?: ProjectLoadOptions): Promise<ProjectAnalysis> {
  report(options, 'validate');
  let manifestExists: boolean;
  try {
    manifestExists = await filesystem.exists('project.c3proj');
  } catch (error) {
    throw new Error(`Could not inspect project root for project.c3proj: ${errorMessage(error)}`, { cause: error });
  }
  if (!manifestExists) throw new Error('The selected folder does not contain project.c3proj. Select a Construct 3 folder project.');

  report(options, 'read-manifest');
  let manifestText: string;
  try {
    manifestText = await filesystem.readText('project.c3proj');
  } catch (error) {
    throw new Error(`Could not read project.c3proj: ${errorMessage(error)}`, { cause: error });
  }
  let manifestInput: unknown;
  try {
    manifestInput = JSON.parse(manifestText) as unknown;
  } catch (error) {
    throw new Error(`Could not parse project.c3proj: ${errorMessage(error)}`, { cause: error });
  }

  let parsedManifest: ManifestParseResult;
  try {
    parsedManifest = parseProjectManifestResult(manifestInput, filesystem.rootName);
  } catch (error) {
    throw new Error(`Invalid Construct project manifest at project.c3proj: ${errorMessage(error)}`, { cause: error });
  }

  report(options, 'load-resources');
  const loaded = await loadManifestResources(filesystem, parsedManifest.manifest, () => report(options, 'parse'));
  const folderEntities = parsedManifest.manifest.folders.map((folder) => {
    const label = folder.path.split('/').at(-1) ?? folder.path;
    return createForgeEntity('projectFolder', label, folder.path, { folderPath: folder.path });
  });
  const entities = [entityForProjectFile(parsedManifest.manifest.name), ...folderEntities, ...loaded.entities];
  // Resources are parsed independently so a malformed file does not stop other resources.
  const allIssues: ResourceIssue[] = [...parsedManifest.issues, ...loaded.issues];

  report(options, 'index');
  const index = createProjectIndex(entities);

  report(options, 'references');
  const relationshipResult = extractProjectRelationships(loaded.resources, index, parsedManifest.manifest.functionsName);
  const references = relationshipResult.references;
  const referenceIndexes = createReferenceIndexes(references);
  const dependencies = createProjectDependencies(references);

  report(options, 'diagnostics');
  const diagnostics = createProjectDiagnostics(index, relationshipResult.unresolvedReferences, allIssues);
  const stats = createAnalysisStats(
    index.entities,
    references,
    dependencies,
    relationshipResult.unresolvedReferences,
    relationshipResult.unsupportedExpressionCount,
    diagnostics,
  );

  report(options, 'ready');
  return {
    manifest: parsedManifest.manifest,
    index,
    references,
    ...referenceIndexes,
    dependencies,
    unresolvedReferences: relationshipResult.unresolvedReferences,
    unsupportedExpressionCount: relationshipResult.unsupportedExpressionCount,
    diagnostics,
    stats,
  };
}
