import type {
  AnalysisStats,
  DiagnosticSeverity,
  EntityKind,
  ForgeEntity,
  ProjectDiagnostic,
  ProjectDependency,
  ProjectIndex,
  ProjectReference,
  ResourceIssue,
  UnresolvedProjectReference,
} from './types';

export function createProjectDiagnostics(
  index: ProjectIndex,
  unresolvedReferences: readonly UnresolvedProjectReference[],
  issues: readonly ResourceIssue[],
): readonly ProjectDiagnostic[] {
  const diagnostics: ProjectDiagnostic[] = issues.map((issue) => ({
    ruleId: `resource.${issue.code}`,
    severity: issue.stage === 'parse' ? 'error' : 'warning',
    title: issue.code === 'missing-resource' ? 'Project resource is missing' : 'Project resource could not be loaded',
    description: issue.message,
    sourcePath: issue.path,
    evidence: `${issue.stage}: ${issue.path || 'project root'}`,
  }));

  for (const reference of unresolvedReferences) {
    const ambiguous = reference.resolution === 'ambiguous';
    const candidates = reference.candidateEntityIds.flatMap((id) => {
      const candidate = index.byId.get(id);
      return candidate ? [`${candidate.kind}: ${candidate.sourcePath}`] : [];
    });
    diagnostics.push({
      ruleId: ambiguous ? 'relationship.ambiguous-target' : 'relationship.missing-target',
      severity: 'warning',
      title: ambiguous ? 'Relationship target is ambiguous' : 'Relationship target is missing',
      description: ambiguous
        ? `${reference.relationship} refers to “${reference.targetName}”, which matches multiple indexed entities.`
        : `${reference.relationship} refers to “${reference.targetName}”, but no matching indexed entity was found.`,
      entityId: reference.sourceEntityId,
      sourcePath: reference.sourcePath,
      sourceLocation: reference.sourceLocation,
      evidence: ambiguous ? candidates.join('; ') : `${reference.relationship}: ${reference.targetName}`,
    });
  }

  for (const conflict of index.identityConflicts) {
    const first = conflict.entities[0];
    if (!first) continue;
    diagnostics.push({
      ruleId: 'entity.identity-conflict',
      severity: 'error',
      title: 'Entity identity has conflicting definitions',
      description: `The stable ID ${conflict.id} was produced by incompatible entity definitions.`,
      entityId: conflict.id,
      sourcePath: first.sourcePath,
      evidence: conflict.entities.map((entity) => `${entity.kind} “${entity.name}” at ${entity.sourcePath}`).join('; '),
    });
  }

  return diagnostics;
}

export function createAnalysisStats(
  entities: readonly ForgeEntity[],
  references: readonly ProjectReference[],
  dependencies: readonly ProjectDependency[],
  unresolvedReferences: readonly UnresolvedProjectReference[],
  unsupportedExpressionCount: number,
  diagnostics: readonly ProjectDiagnostic[],
): AnalysisStats {
  const entitiesByKind = {
    object: 0,
    family: 0,
    layout: 0,
    eventSheet: 0,
    timeline: 0,
    flowchart: 0,
    function: 0,
    variable: 0,
    addon: 0,
    asset: 0,
    layoutLayer: 0,
    layoutInstance: 0,
    event: 0,
    behavior: 0,
    animation: 0,
    animationFrame: 0,
    projectFolder: 0,
    projectFile: 0,
  } satisfies Record<EntityKind, number>;
  for (const entity of entities) entitiesByKind[entity.kind] += 1;

  const diagnosticsBySeverity: Record<DiagnosticSeverity, number> = { error: 0, warning: 0, info: 0 };
  for (const diagnostic of diagnostics) diagnosticsBySeverity[diagnostic.severity] += 1;

  return {
    totalEntities: entities.length,
    entitiesByKind,
    totalReferences: references.length,
    totalDependencies: dependencies.length,
    totalUnresolvedReferences: unresolvedReferences.length,
    unsupportedExpressionCount,
    diagnosticsBySeverity,
  };
}
