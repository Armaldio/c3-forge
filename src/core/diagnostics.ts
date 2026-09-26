import type {
  AnalysisStats,
  DiagnosticSeverity,
  EntityKind,
  ForgeEntity,
  ProjectDiagnostic,
  ProjectIndex,
  ProjectReference,
  ResourceIssue,
} from './types';

export function createProjectDiagnostics(
  index: ProjectIndex,
  references: readonly ProjectReference[],
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

  for (const reference of references) {
    if (reference.source !== 'semantic' || reference.targetEntityId) continue;
    const candidates = (index.byName.get(reference.targetName.toLocaleLowerCase('en-US')) ?? [])
      .filter((entity) => entity.name === reference.targetName
        && (!reference.targetKind || entity.kind === reference.targetKind));
    if (candidates.length > 1) {
      diagnostics.push({
        ruleId: 'reference.ambiguous',
        severity: 'warning',
        title: 'Known reference target is ambiguous',
        description: `${reference.relationship} refers to “${reference.targetName}”, which matches ${candidates.length} indexed entities.`,
        ...(reference.sourceEntityId ? { entityId: reference.sourceEntityId } : {}),
        sourcePath: reference.sourcePath,
        evidence: candidates.map((entity) => `${entity.kind}: ${entity.sourcePath}`).join('; '),
      });
      continue;
    }
    diagnostics.push({
      ruleId: 'reference.unresolved',
      severity: 'warning',
      title: 'Known reference target was not found',
      description: `${reference.relationship} refers to “${reference.targetName}”, but no matching indexed entity was found.`,
      ...(reference.sourceEntityId ? { entityId: reference.sourceEntityId } : {}),
      sourcePath: reference.sourcePath,
      evidence: `${reference.relationship}: ${reference.targetName}`,
    });
  }

  const nameGroups = new Map<string, ForgeEntity[]>();
  for (const entity of index.entities) {
    if (!['object', 'family', 'layout', 'eventSheet', 'function'].includes(entity.kind)) continue;
    const key = `${entity.kind}:${entity.name.toLocaleLowerCase('en-US')}`;
    const group = nameGroups.get(key) ?? [];
    group.push(entity);
    nameGroups.set(key, group);
  }
  for (const group of nameGroups.values()) {
    if (group.length < 2) continue;
    for (const entity of group) {
      diagnostics.push({
        ruleId: 'entity.ambiguous-name',
        severity: 'warning',
        title: 'Entity name is ambiguous',
        description: `${group.length} ${entity.kind} entities are named “${entity.name}”; name-based references may be ambiguous.`,
        entityId: entity.id,
        sourcePath: entity.sourcePath,
        evidence: group.map((item) => item.sourcePath).join(', '),
      });
    }
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
    projectFile: 0,
  } satisfies Record<EntityKind, number>;
  for (const entity of entities) entitiesByKind[entity.kind] += 1;

  const diagnosticsBySeverity: Record<DiagnosticSeverity, number> = { error: 0, warning: 0, info: 0 };
  for (const diagnostic of diagnostics) diagnosticsBySeverity[diagnostic.severity] += 1;

  return {
    totalEntities: entities.length,
    entitiesByKind,
    totalReferences: references.length,
    diagnosticsBySeverity,
  };
}
