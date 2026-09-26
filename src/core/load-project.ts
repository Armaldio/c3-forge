import type { ProjectFileSystem } from './filesystem';
import { createAnalysisStats, createProjectDiagnostics } from './diagnostics';
import { entityForProjectFile } from './entities';
import { parseProjectManifestResult, type ManifestParseResult } from './manifest';
import { createProjectIndex } from './project-index';
import { createProjectDependencies, createReferenceIndexes, extractProjectReferences } from './references';
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
  const entities = [entityForProjectFile(parsedManifest.manifest.name), ...loaded.entities];
  // Resources are parsed independently so a malformed file does not stop other resources.
  const allIssues: ResourceIssue[] = [...parsedManifest.issues, ...loaded.issues];

  report(options, 'index');
  const index = createProjectIndex(entities);

  report(options, 'references');
  const references = extractProjectReferences(loaded.resources, index);
  const referenceIndexes = createReferenceIndexes(references);
  const dependencies = createProjectDependencies(references);

  report(options, 'diagnostics');
  const diagnostics = createProjectDiagnostics(index, references, allIssues);
  const stats = createAnalysisStats(index.entities, references, diagnostics);

  report(options, 'ready');
  return {
    manifest: parsedManifest.manifest,
    index,
    references,
    ...referenceIndexes,
    dependencies,
    diagnostics,
    stats,
  };
}
