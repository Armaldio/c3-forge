import { isRecord } from './json';
import type { ParsedResource } from './resources';
import type { EntityKind, ForgeEntity, ProjectIndex, ProjectReference, ReferenceConfidence, ReferenceSource } from './types';

const EVENT_REFERENCE_KINDS: readonly EntityKind[] = ['object', 'family'];
const FALLBACK_KINDS: readonly EntityKind[] = ['object', 'family', 'layout', 'eventSheet', 'function', 'variable'];
const NON_OBJECT_CLASSES = new Set(['system', 'function']);

function targetCandidates(index: ProjectIndex, name: string, kinds?: readonly EntityKind[]): readonly ForgeEntity[] {
  const all = index.byName.get(name.toLocaleLowerCase('en-US')) ?? [];
  return all.filter((entity) => entity.name === name && (!kinds || kinds.includes(entity.kind)));
}

function makeReference(
  source: ForgeEntity,
  targetName: string,
  relationship: string,
  confidence: ReferenceConfidence,
  referenceSource: ReferenceSource,
  index: ProjectIndex,
  targetKinds?: readonly EntityKind[],
  resolvedTarget?: ForgeEntity,
  allowNameLookup = true,
): ProjectReference {
  const candidates = targetCandidates(index, targetName, targetKinds);
  const targetEntity = resolvedTarget ?? (allowNameLookup && candidates.length === 1 ? candidates[0] : undefined);
  const targetKind = targetEntity?.kind ?? (targetKinds?.length === 1 ? targetKinds[0] : undefined);
  const targetIdentity = targetEntity?.id ?? `${targetKind ?? ''}:${targetName}`;
  const id = [source.id, relationship, targetIdentity].map(encodeURIComponent).join(':');
  return {
    id,
    sourceEntityId: source.id,
    sourcePath: source.sourcePath,
    ...(targetEntity ? { targetEntityId: targetEntity.id } : {}),
    targetName,
    ...(targetKind ? { targetKind } : {}),
    relationship,
    confidence,
    source: referenceSource,
  };
}

function addReference(
  references: Map<string, ProjectReference>,
  source: ForgeEntity,
  targetName: string,
  relationship: string,
  confidence: ReferenceConfidence,
  referenceSource: ReferenceSource,
  index: ProjectIndex,
  targetKinds?: readonly EntityKind[],
  resolvedTarget?: ForgeEntity,
  allowNameLookup = true,
): void {
  if (targetName.trim() === '') return;
  const reference = makeReference(source, targetName, relationship, confidence, referenceSource, index, targetKinds, resolvedTarget, allowNameLookup);
  references.set(reference.id, reference);
}

const EVENT_VARIABLE_PARAMETER_ACTIONS = new Set(['set-eventvar-value', 'add-to-eventvar']);
const EVENT_VARIABLE_PARAMETER_CONDITIONS = new Set(['compare-eventvar']);
const EXPRESSION_PARAMETER_NAMES = new Set(['count', 'expression', 'first-value', 'second-value', 'text', 'value']);

function variableEntity(index: ProjectIndex, name: string, sourcePath: string, functionName?: string): ForgeEntity | undefined {
  const candidates = targetCandidates(index, name, ['variable']);
  const functionVariables = functionName
    ? candidates.filter((entity) => entity.sourcePath === sourcePath
      && entity.metadata.functionName === functionName
      && ['function-parameter', 'function-local'].includes(String(entity.metadata.scope)))
    : [];
  if (functionVariables.length === 1) return functionVariables[0];
  if (functionVariables.length > 1) return undefined;

  if (!functionName) {
    const scopedLocals = candidates.filter((entity) => entity.sourcePath === sourcePath
      && entity.metadata.scope === 'local');
    if (scopedLocals.length > 0) return undefined;
  }

  const globals = candidates.filter((entity) => entity.sourcePath === sourcePath && entity.metadata.scope === 'global');
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
  functionName?: string,
): void {
  const expression = withoutExpressionStrings(value);
  const identifiers = [...expression.matchAll(/[A-Za-z_$][\w$]*/g)];
  for (let indexInExpression = 0; indexInExpression < identifiers.length; indexInExpression += 1) {
    const match = identifiers[indexInExpression];
    const name = match?.[0];
    const start = match?.index;
    if (!name || start === undefined) continue;

    const end = start + name.length;
    const prefix = expression.slice(0, start).trimEnd();
    const before = prefix.at(-1);
    const after = expression.slice(end).trimStart()[0];

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
      addReference(references, source, target.name, relationship, 'medium', 'construct-expression', index, ['variable'], target, false);
      continue;
    }

    if (after === '.' || after === '(') continue;
    const target = variableEntity(index, name, source.sourcePath, functionName);
    if (!target) continue;
    addReference(references, source, target.name, 'event-variable-expression', 'medium', 'construct-expression', index, ['variable'], target, false);
  }
}

function walkRecords(value: unknown, visit: (record: Record<string, unknown>) => void, depth = 0): void {
  if (depth > 64) return;
  if (Array.isArray(value)) {
    for (const child of value) walkRecords(child, visit, depth + 1);
    return;
  }
  if (!isRecord(value)) return;
  visit(value);
  for (const child of Object.values(value)) walkRecords(child, visit, depth + 1);
}

function extractFamilyReferences(resource: ParsedResource, index: ProjectIndex, references: Map<string, ProjectReference>): void {
  if (resource.descriptor.kind !== 'family' || !isRecord(resource.raw) || !Array.isArray(resource.raw.members)) return;
  for (const member of resource.raw.members) {
    const memberName = typeof member === 'string'
      ? member
      : isRecord(member) && typeof member.name === 'string' ? member.name : undefined;
    if (memberName) addReference(references, resource.entity, memberName, 'family-member', 'high', 'semantic', index, ['object']);
  }
}

function extractLayoutReferences(resource: ParsedResource, index: ProjectIndex, references: Map<string, ProjectReference>): void {
  if (resource.descriptor.kind !== 'layout' || !isRecord(resource.raw)) return;
  const visitLayer = (layer: unknown, depth: number): void => {
    if (!isRecord(layer) || depth > 48) return;
    if (Array.isArray(layer.instances)) {
      for (const instance of layer.instances) {
        if (isRecord(instance) && typeof instance.type === 'string') {
          addReference(references, resource.entity, instance.type, 'layout-instance', 'high', 'semantic', index, ['object', 'family']);
        }
      }
    }
    if (Array.isArray(layer.subLayers)) for (const nested of layer.subLayers) visitLayer(nested, depth + 1);
    if (Array.isArray(layer.layers)) for (const nested of layer.layers) visitLayer(nested, depth + 1);
  };
  if (Array.isArray(resource.raw.layers)) for (const layer of resource.raw.layers) visitLayer(layer, 0);
  const sheetName = typeof resource.raw.eventSheet === 'string' ? resource.raw.eventSheet : undefined;
  if (sheetName) addReference(references, resource.entity, sheetName, 'layout-event-sheet', 'high', 'semantic', index, ['eventSheet']);
}

function extractEventSheetReferences(resource: ParsedResource, index: ProjectIndex, references: Map<string, ProjectReference>): void {
  if (resource.descriptor.kind !== 'eventSheet' || !isRecord(resource.raw)) return;
  const events = resource.raw.events;
  if (!Array.isArray(events)) return;
  const functionsByName = (index.byKind.get('function') ?? []).filter((entity) => entity.sourcePath === resource.entity.sourcePath);

  const visit = (node: unknown, depth: number, functionEntity?: ForgeEntity): void => {
    if (!isRecord(node) || depth > 64) return;
    const eventType = typeof node.eventType === 'string' ? node.eventType : '';
    const functionName = eventType === 'function-block' && typeof node.functionName === 'string' ? node.functionName : undefined;
    const nextFunction = functionName
      ? functionsByName.find((entity) => entity.name === functionName)
      : functionEntity;
    const source = nextFunction ?? resource.entity;

    if (eventType === 'include' && typeof node.includeSheet === 'string') {
      addReference(references, resource.entity, node.includeSheet, 'event-sheet-include', 'high', 'semantic', index, ['eventSheet']);
    }

    const inspectEntry = (entry: Record<string, unknown>, entryKind: 'conditions' | 'actions'): void => {
      const objectClass = typeof entry.objectClass === 'string' ? entry.objectClass : undefined;
      if (objectClass && !NON_OBJECT_CLASSES.has(objectClass.toLowerCase())) {
        addReference(references, source, objectClass, 'event-object-reference', 'high', 'semantic', index, EVENT_REFERENCE_KINDS);
      }
      const entryId = typeof entry.id === 'string' ? entry.id : '';
      const parameters = isRecord(entry.parameters) ? entry.parameters : undefined;
      const variableName = parameters && typeof parameters.variable === 'string' ? parameters.variable : undefined;
      const isEventVariableReference = objectClass?.toLowerCase() === 'system'
        && variableName !== undefined
        && ((entryKind === 'actions' && EVENT_VARIABLE_PARAMETER_ACTIONS.has(entryId))
          || (entryKind === 'conditions' && EVENT_VARIABLE_PARAMETER_CONDITIONS.has(entryId)));
      if (isEventVariableReference && variableName) {
        const functionScope = source.kind === 'function' ? source.name : undefined;
        const target = variableEntity(index, variableName, resource.entity.sourcePath, functionScope);
        addReference(
          references,
          source,
          variableName,
          entryKind === 'actions' ? 'event-variable-action' : 'event-variable-condition',
          'high',
          'semantic',
          index,
          ['variable'],
          target,
          false,
        );
      }
      if (typeof entry.callFunction === 'string') {
        addReference(references, source, entry.callFunction, 'function-call', 'high', 'semantic', index, ['function']);
      }
      walkRecords(entry, (record) => {
        for (const [key, value] of Object.entries(record)) {
          if (typeof value !== 'string'
            || (!EXPRESSION_PARAMETER_NAMES.has(key) && !/(?:expression|parameter|value)/i.test(key))) continue;
          const functionPattern = /\bFunctions\.([A-Za-z_$][\w$]*)\s*\(/g;
          for (const match of value.matchAll(functionPattern)) {
            const calledName = match[1];
            if (calledName) addReference(references, source, calledName, 'function-call-expression', 'high', 'semantic', index, ['function']);
          }
          extractVariableExpressionReferences(value, source, index, references, source.kind === 'function' ? source.name : undefined);
        }
      });
    };

    if (typeof node.callFunction === 'string') {
      addReference(references, source, node.callFunction, 'function-call', 'high', 'semantic', index, ['function']);
    }
    for (const key of ['conditions', 'actions'] as const) {
      const entries = node[key];
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) if (isRecord(entry)) inspectEntry(entry, key);
    }

    for (const key of ['conditions', 'actions', 'children']) {
      const children = node[key];
      if (Array.isArray(children)) children.forEach((child) => visit(child, depth + 1, nextFunction));
    }
  };

  events.forEach((event) => visit(event, 0));
}

function exactStrings(value: unknown, visit: (text: string) => void, depth = 0): void {
  if (depth > 64) return;
  if (typeof value === 'string') {
    visit(value);
  } else if (Array.isArray(value)) {
    for (const item of value) exactStrings(item, visit, depth + 1);
  } else if (isRecord(value)) {
    for (const item of Object.values(value)) exactStrings(item, visit, depth + 1);
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
    if (reference.targetEntityId) semanticPairs.add(`${reference.sourcePath}:${reference.targetEntityId}`);
  }

  for (const resource of resources) {
    if (resource.raw === undefined || resource.descriptor.kind === 'flowchart') continue;
    exactStrings(resource.raw, (value) => {
      const matches = targetCandidates(index, value, FALLBACK_KINDS);
      for (const target of matches) {
        if (target.id === resource.entity.id || semanticPairs.has(`${resource.entity.sourcePath}:${target.id}`)) continue;
        addReference(references, resource.entity, target.name, 'exact-string-match', 'low', 'exact-string-fallback', index, [target.kind]);
      }
    });
  }

  return [...references.values()];
}
