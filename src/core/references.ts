import { isRecord } from './json';
import type { ParsedResource } from './resources';
import type {
  EntityKind,
  ForgeEntity,
  ProjectDependency,
  ProjectIndex,
  ProjectReference,
  ReferenceConfidence,
  ReferenceSource,
  ReferenceSourceLocation,
} from './types';

const EVENT_REFERENCE_KINDS: readonly EntityKind[] = ['object', 'family'];
const FALLBACK_KINDS: readonly EntityKind[] = ['object', 'family', 'layout', 'eventSheet', 'function', 'variable'];
const NON_OBJECT_CLASSES = new Set(['system', 'function']);
const EVENT_VARIABLE_PARAMETER_ACTIONS = new Set(['set-eventvar-value', 'add-to-eventvar']);
const EVENT_VARIABLE_PARAMETER_CONDITIONS = new Set(['compare-eventvar']);
const EXPRESSION_PARAMETER_NAMES = new Set(['count', 'expression', 'first-value', 'second-value', 'text', 'value']);

interface AddReferenceOptions {
  readonly sourceEntity: ForgeEntity;
  readonly targetName: string;
  readonly relationship: string;
  readonly confidence: ReferenceConfidence;
  readonly source: ReferenceSource;
  readonly index: ProjectIndex;
  readonly sourceLocation: ReferenceSourceLocation;
  readonly targetKinds?: readonly EntityKind[];
  readonly resolvedTarget?: ForgeEntity;
  readonly allowNameLookup?: boolean;
}

interface EventScope {
  readonly eventPath: readonly number[];
  readonly eventJsonPath: string;
  readonly eventSid?: string;
  readonly functionEntity?: ForgeEntity;
  readonly functionSid?: string;
}

function targetCandidates(index: ProjectIndex, name: string, kinds?: readonly EntityKind[]): readonly ForgeEntity[] {
  const all = index.byName.get(name.toLocaleLowerCase('en-US')) ?? [];
  return all.filter((entity) => entity.name === name && (!kinds || kinds.includes(entity.kind)));
}

function addReference(references: Map<string, ProjectReference>, options: AddReferenceOptions): void {
  if (options.targetName.trim() === '') return;

  const candidates = targetCandidates(options.index, options.targetName, options.targetKinds);
  const targetEntity = options.resolvedTarget
    ?? (options.allowNameLookup !== false && candidates.length === 1 ? candidates[0] : undefined);
  const targetKind = targetEntity?.kind ?? (options.targetKinds?.length === 1 ? options.targetKinds[0] : undefined);
  const targetIdentity = targetEntity?.id ?? `${targetKind ?? ''}:${options.targetName}`;
  const occurrence = JSON.stringify(options.sourceLocation);
  const id = [options.sourceEntity.id, options.relationship, targetIdentity, occurrence]
    .map((part) => encodeURIComponent(part))
    .join(':');

  references.set(id, {
    id,
    sourceEntityId: options.sourceEntity.id,
    sourcePath: options.sourceEntity.sourcePath,
    ...(targetEntity ? { targetEntityId: targetEntity.id } : {}),
    targetName: options.targetName,
    ...(targetKind ? { targetKind } : {}),
    relationship: options.relationship,
    confidence: options.confidence,
    source: options.source,
    sourceLocation: options.sourceLocation,
  });
}

function jsonPropertyPath(path: string, key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}

function walkStrings(
  value: unknown,
  path: string,
  visit: (text: string, jsonPath: string, key?: string) => void,
  key?: string,
  depth = 0,
): void {
  if (depth > 64) return;
  if (typeof value === 'string') {
    visit(value, path, key);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkStrings(item, `${path}[${index}]`, visit, undefined, depth + 1));
    return;
  }
  if (!isRecord(value)) return;
  for (const [childKey, child] of Object.entries(value)) {
    walkStrings(child, jsonPropertyPath(path, childKey), visit, childKey, depth + 1);
  }
}

function numberPath(metadata: Readonly<Record<string, unknown>>, key: string): readonly number[] | undefined {
  const value = metadata[key];
  if (!Array.isArray(value)) return undefined;
  const numbers: number[] = [];
  for (const part of value) {
    if (typeof part !== 'number') return undefined;
    numbers.push(part);
  }
  return numbers;
}

function isWithinDeclaredScope(entity: ForgeEntity, eventPath: readonly number[]): boolean {
  const scopePath = numberPath(entity.metadata, 'scopePath');
  const position = entity.metadata.scopePosition;
  if (!scopePath || typeof position !== 'number' || eventPath.length <= scopePath.length) return false;
  for (let index = 0; index < scopePath.length; index += 1) {
    if (scopePath[index] !== eventPath[index]) return false;
  }
  const referencePosition = eventPath[scopePath.length];
  return referencePosition !== undefined && referencePosition >= position;
}

function variableEntity(
  index: ProjectIndex,
  name: string,
  sourcePath: string,
  eventPath: readonly number[],
  functionEntity?: ForgeEntity,
): ForgeEntity | undefined {
  const candidates = targetCandidates(index, name, ['variable']);
  const functionId = functionEntity?.id;
  const visibleLocals = candidates.filter((entity) => {
    if (entity.sourcePath !== sourcePath || !isWithinDeclaredScope(entity, eventPath)) return false;
    const scope = entity.metadata.scope;
    const ownerFunction = entity.metadata.functionId;
    if (scope === 'local') return functionId === undefined && ownerFunction === undefined;
    if (scope === 'function-local') return functionId !== undefined && ownerFunction === functionId;
    return false;
  });

  if (visibleLocals.length > 0) {
    const depth = Math.max(...visibleLocals.map((entity) => numberPath(entity.metadata, 'scopePath')?.length ?? -1));
    const closest = visibleLocals.filter((entity) => (numberPath(entity.metadata, 'scopePath')?.length ?? -1) === depth);
    return closest.length === 1 ? closest[0] : undefined;
  }

  if (functionId !== undefined) {
    const parameters = candidates.filter((entity) => entity.metadata.scope === 'function-parameter'
      && entity.metadata.functionId === functionId);
    if (parameters.length === 1) return parameters[0];
    if (parameters.length > 1) return undefined;
  }

  const globals = candidates.filter((entity) => entity.metadata.scope === 'global');
  if (globals.length === 1) return globals[0];
  return undefined;
}

function withoutExpressionStrings(value: string): string {
  let quote: string | undefined;
  let escaped = false;
  let result = '';
  for (const character of value) {
    if (quote) {
      result += ' ';
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = undefined;
    } else if (character === '"' || character === "'" || character === '`') {
      quote = character;
      result += ' ';
    } else {
      result += character;
    }
  }
  return result;
}

function extractVariableExpressionReferences(
  value: string,
  source: ForgeEntity,
  index: ProjectIndex,
  references: Map<string, ProjectReference>,
  scope: EventScope,
  location: ReferenceSourceLocation,
): void {
  const expression = withoutExpressionStrings(value);
  const identifiers = [...expression.matchAll(/[A-Za-z_$][\w$]*/g)];
  for (const match of identifiers) {
    const name = match[0];
    const start = match.index;
    if (!name || start === undefined) continue;

    const end = start + name.length;
    const prefix = expression.slice(0, start).trimEnd();
    const before = prefix.at(-1);
    const after = expression.slice(end).trimStart()[0];
    const sourceLocation = { ...location, expressionRange: { start, end } };

    if (before === '.') {
      const ownerPrefix = prefix.slice(0, -1).trimEnd();
      const variables = targetCandidates(index, name, ['variable']).filter((entity) =>
        [entity.metadata.objectName, entity.metadata.familyName].some((ownerName) => {
          if (typeof ownerName !== 'string' || !ownerPrefix.endsWith(ownerName)) return false;
          const precedingCharacter = ownerPrefix[ownerPrefix.length - ownerName.length - 1];
          return precedingCharacter === undefined || !/[A-Za-z0-9_$]/.test(precedingCharacter);
        }));
      if (variables.length !== 1) continue;
      const target = variables[0];
      if (!target) continue;
      const relationship = typeof target.metadata.familyName === 'string'
        ? 'family-variable-expression'
        : 'instance-variable-expression';
      addReference(references, {
        sourceEntity: source,
        targetName: target.name,
        relationship,
        confidence: 'medium',
        source: 'construct-expression',
        index,
        targetKinds: ['variable'],
        resolvedTarget: target,
        allowNameLookup: false,
        sourceLocation,
      });
      continue;
    }

    if (after === '.' || after === '(') continue;
    const target = variableEntity(index, name, source.sourcePath, scope.eventPath, scope.functionEntity);
    if (!target) continue;
    addReference(references, {
      sourceEntity: source,
      targetName: target.name,
      relationship: 'event-variable-expression',
      confidence: 'medium',
      source: 'construct-expression',
      index,
      targetKinds: ['variable'],
      resolvedTarget: target,
      allowNameLookup: false,
      sourceLocation,
    });
  }
}

function extractFamilyReferences(resource: ParsedResource, index: ProjectIndex, references: Map<string, ProjectReference>): void {
  if (resource.descriptor.kind !== 'family' || !isRecord(resource.raw) || !Array.isArray(resource.raw.members)) return;
  resource.raw.members.forEach((member, memberIndex) => {
    const memberName = typeof member === 'string'
      ? member
      : isRecord(member) && typeof member.name === 'string' ? member.name : undefined;
    if (!memberName) return;
    addReference(references, {
      sourceEntity: resource.entity,
      targetName: memberName,
      relationship: 'family-member',
      confidence: 'high',
      source: 'semantic',
      index,
      targetKinds: ['object'],
      sourceLocation: { jsonPath: `$.members[${memberIndex}]` },
    });
  });
}

function extractLayoutReferences(resource: ParsedResource, index: ProjectIndex, references: Map<string, ProjectReference>): void {
  if (resource.descriptor.kind !== 'layout' || !isRecord(resource.raw)) return;
  const visitLayer = (layer: unknown, path: string, depth: number): void => {
    if (!isRecord(layer) || depth > 48) return;
    if (Array.isArray(layer.instances)) {
      layer.instances.forEach((instance, instanceIndex) => {
        if (!isRecord(instance) || typeof instance.type !== 'string') return;
        addReference(references, {
          sourceEntity: resource.entity,
          targetName: instance.type,
          relationship: 'layout-instance',
          confidence: 'high',
          source: 'semantic',
          index,
          targetKinds: EVENT_REFERENCE_KINDS,
          sourceLocation: { jsonPath: `${path}.instances[${instanceIndex}].type` },
        });
      });
    }
    for (const key of ['subLayers', 'layers']) {
      const nestedLayers = layer[key];
      if (!Array.isArray(nestedLayers)) continue;
      nestedLayers.forEach((nested, childIndex) => visitLayer(nested, `${path}.${key}[${childIndex}]`, depth + 1));
    }
  };
  if (Array.isArray(resource.raw.layers)) {
    resource.raw.layers.forEach((layer, layerIndex) => visitLayer(layer, `$.layers[${layerIndex}]`, 0));
  }
  if (typeof resource.raw.eventSheet === 'string') {
    addReference(references, {
      sourceEntity: resource.entity,
      targetName: resource.raw.eventSheet,
      relationship: 'layout-event-sheet',
      confidence: 'high',
      source: 'semantic',
      index,
      targetKinds: ['eventSheet'],
      sourceLocation: { jsonPath: '$.eventSheet' },
    });
  }
}

function eventScope(
  node: Record<string, unknown>,
  eventPath: readonly number[],
  eventJsonPath: string,
  functionEntity?: ForgeEntity,
  functionSid?: string,
): EventScope {
  const eventSid = typeof node.sid === 'string' || typeof node.sid === 'number' ? String(node.sid) : undefined;
  return {
    eventPath,
    eventJsonPath,
    ...(eventSid ? { eventSid } : {}),
    ...(functionEntity ? { functionEntity } : {}),
    ...(functionSid ? { functionSid } : {}),
  };
}

function extractEventSheetReferences(resource: ParsedResource, index: ProjectIndex, references: Map<string, ProjectReference>): void {
  if (resource.descriptor.kind !== 'eventSheet' || !isRecord(resource.raw) || !Array.isArray(resource.raw.events)) return;

  const visit = (
    node: unknown,
    eventPath: readonly number[],
    eventJsonPath: string,
    parentFunction?: ForgeEntity,
    parentFunctionSid?: string,
  ): void => {
    if (!isRecord(node) || eventPath.length > 64) return;
    const eventType = typeof node.eventType === 'string' ? node.eventType : '';
    const declaredFunction = eventType === 'function-block'
      ? (index.byKind.get('function') ?? []).find((entity) =>
          entity.sourcePath === resource.entity.sourcePath
          && entity.name === node.functionName
          && (typeof node.sid !== 'string' && typeof node.sid !== 'number'
            || String(entity.metadata.sid) === String(node.sid)))
      : undefined;
    const functionEntity = declaredFunction ?? parentFunction;
    const ownSid = typeof node.sid === 'string' || typeof node.sid === 'number' ? String(node.sid) : undefined;
    const functionSid = declaredFunction ? ownSid : parentFunctionSid;
    const scope = eventScope(node, eventPath, eventJsonPath, functionEntity, functionSid);
    const source = functionEntity ?? resource.entity;

    if (eventType === 'include' && typeof node.includeSheet === 'string') {
      addReference(references, {
        sourceEntity: resource.entity,
        targetName: node.includeSheet,
        relationship: 'event-sheet-include',
        confidence: 'high',
        source: 'semantic',
        index,
        targetKinds: ['eventSheet'],
        sourceLocation: {
          ...(scope.eventSid ? { eventSid: scope.eventSid } : {}),
          eventPath: eventJsonPath,
          jsonPath: `${eventJsonPath}.includeSheet`,
        },
      });
    }

    const inspectEntry = (entry: Record<string, unknown>, entryKind: 'condition' | 'action', entryIndex: number): void => {
      const entryPath = `${eventJsonPath}.${entryKind === 'condition' ? 'conditions' : 'actions'}[${entryIndex}]`;
      const entryLocation: ReferenceSourceLocation = {
        ...(scope.eventSid ? { eventSid: scope.eventSid } : {}),
        ...(scope.functionSid ? { functionSid: scope.functionSid } : {}),
        eventPath: eventJsonPath,
        entryKind,
        entryIndex,
      };
      const objectClass = typeof entry.objectClass === 'string' ? entry.objectClass : undefined;
      if (objectClass && !NON_OBJECT_CLASSES.has(objectClass.toLowerCase())) {
        addReference(references, {
          sourceEntity: source,
          targetName: objectClass,
          relationship: 'event-object-reference',
          confidence: 'high',
          source: 'semantic',
          index,
          targetKinds: EVENT_REFERENCE_KINDS,
          sourceLocation: { ...entryLocation, jsonPath: `${entryPath}.objectClass` },
        });
      }

      const entryId = typeof entry.id === 'string' ? entry.id : '';
      const parameters = isRecord(entry.parameters) ? entry.parameters : undefined;
      const variableName = parameters && typeof parameters.variable === 'string' ? parameters.variable : undefined;
      const isEventVariableReference = objectClass?.toLowerCase() === 'system'
        && variableName !== undefined
        && ((entryKind === 'action' && EVENT_VARIABLE_PARAMETER_ACTIONS.has(entryId))
          || (entryKind === 'condition' && EVENT_VARIABLE_PARAMETER_CONDITIONS.has(entryId)));
      if (isEventVariableReference && variableName) {
        const target = variableEntity(index, variableName, resource.entity.sourcePath, scope.eventPath, functionEntity);
        addReference(references, {
          sourceEntity: source,
          targetName: variableName,
          relationship: entryKind === 'action' ? 'event-variable-action' : 'event-variable-condition',
          confidence: 'high',
          source: 'semantic',
          index,
          targetKinds: ['variable'],
          ...(target ? { resolvedTarget: target } : {}),
          allowNameLookup: false,
          sourceLocation: { ...entryLocation, jsonPath: `${entryPath}.parameters.variable` },
        });
      }

      if (typeof entry.callFunction === 'string') {
        addReference(references, {
          sourceEntity: source,
          targetName: entry.callFunction,
          relationship: 'function-call',
          confidence: 'high',
          source: 'semantic',
          index,
          targetKinds: ['function'],
          sourceLocation: { ...entryLocation, jsonPath: `${entryPath}.callFunction` },
        });
      }

      walkStrings(entry, entryPath, (value, jsonPath, key) => {
        if (!key || (!EXPRESSION_PARAMETER_NAMES.has(key) && !/(?:expression|parameter|value)/i.test(key))) return;
        const functionPattern = /\bFunctions\.([A-Za-z_$][\w$]*)\s*\(/g;
        for (const match of value.matchAll(functionPattern)) {
          const calledName = match[1];
          if (!calledName || match.index === undefined) continue;
          const start = match.index + match[0].indexOf(calledName);
          addReference(references, {
            sourceEntity: source,
            targetName: calledName,
            relationship: 'function-call-expression',
            confidence: 'high',
            source: 'semantic',
            index,
            targetKinds: ['function'],
            sourceLocation: {
              ...entryLocation,
              jsonPath,
              expressionRange: { start, end: start + calledName.length },
            },
          });
        }
        extractVariableExpressionReferences(value, source, index, references, scope, {
          ...entryLocation,
          jsonPath,
        });
      });
    };

    if (typeof node.callFunction === 'string') {
      addReference(references, {
        sourceEntity: source,
        targetName: node.callFunction,
        relationship: 'function-call',
        confidence: 'high',
        source: 'semantic',
        index,
        targetKinds: ['function'],
        sourceLocation: {
          ...(scope.eventSid ? { eventSid: scope.eventSid } : {}),
          ...(scope.functionSid ? { functionSid: scope.functionSid } : {}),
          eventPath: eventJsonPath,
          jsonPath: `${eventJsonPath}.callFunction`,
        },
      });
    }

    for (const entryKind of ['condition', 'action'] as const) {
      const key = entryKind === 'condition' ? 'conditions' : 'actions';
      const entries = node[key];
      if (Array.isArray(entries)) {
        entries.forEach((entry, entryIndex) => {
          if (isRecord(entry)) inspectEntry(entry, entryKind, entryIndex);
        });
      }
    }

    if (Array.isArray(node.children)) {
      node.children.forEach((child, childIndex) => visit(
        child,
        [...eventPath, childIndex],
        `${eventJsonPath}.children[${childIndex}]`,
        functionEntity,
        functionSid,
      ));
    }
  };

  resource.raw.events.forEach((event, eventIndex) => visit(event, [eventIndex], `$.events[${eventIndex}]`));
}

function exactStrings(value: unknown, visit: (text: string, jsonPath: string) => void, path = '$', depth = 0): void {
  if (depth > 64) return;
  if (typeof value === 'string') {
    visit(value, path);
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => exactStrings(item, visit, `${path}[${index}]`, depth + 1));
  } else if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      exactStrings(item, visit, jsonPropertyPath(path, key), depth + 1);
    }
  }
}

/** Prefer format-aware extraction. Exact string equality remains an explicitly low-confidence fallback. */
export function extractProjectReferences(resources: readonly ParsedResource[], index: ProjectIndex): readonly ProjectReference[] {
  const references = new Map<string, ProjectReference>();
  for (const resource of resources) {
    extractFamilyReferences(resource, index, references);
    extractLayoutReferences(resource, index, references);
    extractEventSheetReferences(resource, index, references);
  }

  const semanticPairs = new Set<string>();
  for (const reference of references.values()) {
    if (reference.source !== 'exact-string-fallback' && reference.targetEntityId) {
      semanticPairs.add(`${reference.sourcePath}:${reference.targetEntityId}`);
    }
  }

  for (const resource of resources) {
    if (resource.raw === undefined || resource.descriptor.kind === 'flowchart') continue;
    exactStrings(resource.raw, (value, jsonPath) => {
      const matches = targetCandidates(index, value, FALLBACK_KINDS);
      for (const target of matches) {
        if (target.id === resource.entity.id || semanticPairs.has(`${resource.entity.sourcePath}:${target.id}`)) continue;
        addReference(references, {
          sourceEntity: resource.entity,
          targetName: target.name,
          relationship: 'exact-string-match',
          confidence: 'low',
          source: 'exact-string-fallback',
          index,
          targetKinds: [target.kind],
          resolvedTarget: target,
          allowNameLookup: false,
          sourceLocation: { jsonPath },
        });
      }
    });
  }

  return [...references.values()];
}

export function createReferenceIndexes(references: readonly ProjectReference[]): {
  readonly referencesBySource: ReadonlyMap<string, readonly ProjectReference[]>;
  readonly referencesByTarget: ReadonlyMap<string, readonly ProjectReference[]>;
} {
  const bySource = new Map<string, ProjectReference[]>();
  const byTarget = new Map<string, ProjectReference[]>();
  for (const reference of references) {
    if (reference.sourceEntityId) {
      const matches = bySource.get(reference.sourceEntityId) ?? [];
      matches.push(reference);
      bySource.set(reference.sourceEntityId, matches);
    }
    if (reference.targetEntityId) {
      const matches = byTarget.get(reference.targetEntityId) ?? [];
      matches.push(reference);
      byTarget.set(reference.targetEntityId, matches);
    }
  }
  return { referencesBySource: bySource, referencesByTarget: byTarget };
}

export function createProjectDependencies(references: readonly ProjectReference[]): readonly ProjectDependency[] {
  const groups = new Map<string, { reference: ProjectReference; occurrenceIds: string[] }>();
  for (const reference of references) {
    const targetIdentity = reference.targetEntityId ?? `${reference.targetKind ?? ''}:${reference.targetName}`;
    const key = JSON.stringify([
      reference.sourceEntityId ?? reference.sourcePath,
      targetIdentity,
      reference.relationship,
      reference.confidence,
      reference.source,
    ]);
    const group = groups.get(key);
    if (group) {
      group.occurrenceIds.push(reference.id);
    } else {
      groups.set(key, { reference, occurrenceIds: [reference.id] });
    }
  }

  return [...groups.values()].map(({ reference, occurrenceIds }) => ({
    id: [reference.sourceEntityId ?? reference.sourcePath, reference.relationship,
      reference.targetEntityId ?? `${reference.targetKind ?? ''}:${reference.targetName}`,
      reference.confidence, reference.source]
      .map(encodeURIComponent)
      .join(':'),
    ...(reference.sourceEntityId ? { sourceEntityId: reference.sourceEntityId } : {}),
    sourcePath: reference.sourcePath,
    ...(reference.targetEntityId ? { targetEntityId: reference.targetEntityId } : {}),
    targetName: reference.targetName,
    ...(reference.targetKind ? { targetKind: reference.targetKind } : {}),
    relationship: reference.relationship,
    confidence: reference.confidence,
    source: reference.source,
    occurrenceIds,
  }));
}
