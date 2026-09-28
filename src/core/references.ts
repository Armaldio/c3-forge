import { isRecord } from './json';
import type { ParsedResource } from './resources';
import type {
  EntityKind,
  ForgeEntity,
  ProjectDependency,
  ProjectIndex,
  ProjectReference,
  ReferenceSourceLocation,
  RelationshipKind,
  UnresolvedProjectReference,
} from './types';

const EVENT_REFERENCE_KINDS: readonly EntityKind[] = ['object', 'family'];
const RESERVED_NON_OBJECT_CLASSES = new Set(['system', 'function']);
const EVENT_VARIABLE_PARAMETER_ACTIONS = new Set(['set-eventvar-value', 'add-to-eventvar']);
const EVENT_VARIABLE_PARAMETER_CONDITIONS = new Set(['compare-eventvar']);
const EXPRESSION_PARAMETER_NAMES = new Set(['count', 'expression', 'first-value', 'second-value', 'text', 'value']);
// The checked-in real Construct corpus does not contain JPEG frame metadata to prove its image suffix.
const FRAME_IMAGE_EXTENSION_BY_TYPE: Readonly<Record<string, string>> = {
  'image/png': '.png',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/svg+xml': '.svg',
};
const MAX_EXPRESSION_LENGTH = 16_384;
const MAX_EXPRESSION_TOKENS = 512;
interface RelationshipCollector {
  readonly references: Map<string, ProjectReference>;
  readonly unresolvedReferences: Map<string, UnresolvedProjectReference>;
  unsupportedExpressionCount: number;
}

interface EventScope {
  readonly eventPath: readonly number[];
  readonly functionEntity?: ForgeEntity;
  readonly functionId?: string;
  readonly functionSid?: string;
}

type Resolution<T> =
  | { readonly status: 'resolved'; readonly value: T }
  | { readonly status: 'missing' }
  | { readonly status: 'ambiguous'; readonly candidates: readonly T[] };

interface ExpressionReference {
  readonly kind: 'identifier' | 'member' | 'function' | 'behavior';
  readonly name: string;
  readonly owner?: string;
  readonly start: number;
  readonly end: number;
  readonly ownerStart?: number;
  readonly ownerEnd?: number;
  readonly behaviorStart?: number;
  readonly behaviorEnd?: number;
}

interface ExpressionToken {
  readonly kind: 'identifier' | 'number' | 'string' | 'symbol';
  readonly value: string;
  readonly start: number;
  readonly end: number;
}

type FamilyMemberships = ReadonlyMap<string, readonly ForgeEntity[]>;

function nameKey(name: string): string {
  return name.toLocaleLowerCase('en-US');
}

function targetCandidates(index: ProjectIndex, name: string, kinds?: readonly EntityKind[]): readonly ForgeEntity[] {
  const all = index.byName.get(nameKey(name)) ?? [];
  return all.filter((entity) => !kinds || kinds.includes(entity.kind));
}

function resolveTarget(index: ProjectIndex, name: string, kinds?: readonly EntityKind[]): Resolution<ForgeEntity> {
  const candidates = targetCandidates(index, name, kinds);
  if (candidates.length === 1) return { status: 'resolved', value: candidates[0] as ForgeEntity };
  if (candidates.length > 1) return { status: 'ambiguous', candidates };
  return { status: 'missing' };
}

function addRelationship(
  collector: RelationshipCollector,
  source: ForgeEntity,
  relationship: RelationshipKind,
  targetName: string,
  resolution: Resolution<ForgeEntity>,
  sourceLocation: ReferenceSourceLocation,
): void {
  if (resolution.status === 'resolved') {
    const target = resolution.value;
    const id = [source.id, relationship, target.id, JSON.stringify(sourceLocation)]
      .map((part) => encodeURIComponent(part))
      .join(':');
    collector.references.set(id, {
      id,
      sourceEntityId: source.id,
      targetEntityId: target.id,
      relationship,
      sourcePath: source.sourcePath,
      sourceLocation,
    });
    return;
  }

  const candidateEntityIds = resolution.status === 'ambiguous'
    ? resolution.candidates.map((candidate) => candidate.id)
    : [];
  const id = [source.id, relationship, targetName, resolution.status, JSON.stringify(sourceLocation)]
    .map((part) => encodeURIComponent(part))
    .join(':');
  collector.unresolvedReferences.set(id, {
    id,
    sourceEntityId: source.id,
    sourcePath: source.sourcePath,
    targetName,
    relationship,
    resolution: resolution.status,
    candidateEntityIds,
    sourceLocation,
  });
}

function addKnownRelationship(
  collector: RelationshipCollector,
  source: ForgeEntity,
  target: ForgeEntity,
  relationship: RelationshipKind,
  sourceLocation: ReferenceSourceLocation,
): void {
  const id = [source.id, relationship, target.id, JSON.stringify(sourceLocation)]
    .map((part) => encodeURIComponent(part))
    .join(':');
  collector.references.set(id, {
    id,
    sourceEntityId: source.id,
    targetEntityId: target.id,
    relationship,
    sourcePath: source.sourcePath,
    sourceLocation,
  });
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

/** Construct scopes locals by indentation: same-level siblings and their descendants can use the local. */
function isWithinDeclaredScope(entity: ForgeEntity, eventPath: readonly number[]): boolean {
  const scopePath = numberPath(entity.metadata, 'scopePath');
  if (!scopePath || eventPath.length <= scopePath.length) return false;
  for (let index = 0; index < scopePath.length; index += 1) {
    if (scopePath[index] !== eventPath[index]) return false;
  }
  return true;
}

function resolveVariable(
  index: ProjectIndex,
  name: string,
  sourcePath: string,
  eventPath: readonly number[],
  functionId?: string,
): Resolution<ForgeEntity> {
  const candidates = targetCandidates(index, name, ['variable']);
  const visibleLocals = candidates.filter((entity) => {
    if (entity.sourcePath !== sourcePath || !isWithinDeclaredScope(entity, eventPath)) return false;
    const scope = entity.metadata.scope;
    const ownerFunction = entity.metadata.functionId;
    if (scope === 'local') return ownerFunction === undefined;
    return scope === 'function-local' && functionId !== undefined && ownerFunction === functionId;
  });

  if (visibleLocals.length > 0) {
    const depth = Math.max(...visibleLocals.map((entity) => numberPath(entity.metadata, 'scopePath')?.length ?? -1));
    const closest = visibleLocals.filter((entity) => (numberPath(entity.metadata, 'scopePath')?.length ?? -1) === depth);
    return closest.length === 1
      ? { status: 'resolved', value: closest[0] as ForgeEntity }
      : { status: 'ambiguous', candidates: closest };
  }

  if (functionId !== undefined) {
    const parameters = candidates.filter((entity) =>
      (entity.metadata.scope === 'function-parameter' || entity.metadata.scope === 'custom-action-parameter')
      && entity.metadata.functionId === functionId);
    if (parameters.length === 1) return { status: 'resolved', value: parameters[0] as ForgeEntity };
    if (parameters.length > 1) return { status: 'ambiguous', candidates: parameters };
  }

  const globals = candidates.filter((entity) => entity.metadata.scope === 'global');
  if (globals.length === 1) return { status: 'resolved', value: globals[0] as ForgeEntity };
  if (globals.length > 1) return { status: 'ambiguous', candidates: globals };
  return { status: 'missing' };
}

function familyMemberships(resources: readonly ParsedResource[], index: ProjectIndex): FamilyMemberships {
  const memberships = new Map<string, ForgeEntity[]>();
  for (const resource of resources) {
    if (resource.descriptor.kind !== 'family' || !isRecord(resource.raw) || !Array.isArray(resource.raw.members)) continue;
    for (const member of resource.raw.members) {
      const memberName = typeof member === 'string'
        ? member
        : isRecord(member) && typeof member.name === 'string' ? member.name : undefined;
      if (!memberName) continue;
      const object = resolveTarget(index, memberName, ['object']);
      if (object.status !== 'resolved') continue;
      const families = memberships.get(object.value.id) ?? [];
      if (!families.some((family) => family.id === resource.entity.id)) families.push(resource.entity);
      memberships.set(object.value.id, families);
    }
  }
  return memberships;
}

function resolveInstanceVariable(
  index: ProjectIndex,
  owner: ForgeEntity,
  variableName: string,
  memberships: FamilyMemberships,
): { readonly relationship: RelationshipKind; readonly resolution: Resolution<ForgeEntity> } {
  const candidates = targetCandidates(index, variableName, ['variable']).filter((entity) => {
    if (owner.kind === 'family') {
      return entity.metadata.scope === 'family'
        && typeof entity.metadata.familyName === 'string'
        && nameKey(entity.metadata.familyName) === nameKey(owner.name);
    }
    if (owner.kind !== 'object') return false;
    if (entity.metadata.scope === 'object'
      && typeof entity.metadata.objectName === 'string'
      && nameKey(entity.metadata.objectName) === nameKey(owner.name)) return true;
    const memberFamilies = memberships.get(owner.id) ?? [];
    return entity.metadata.scope === 'family'
      && typeof entity.metadata.familyName === 'string'
      && memberFamilies.some((family) => nameKey(family.name) === nameKey(entity.metadata.familyName as string));
  });
  const resolution: Resolution<ForgeEntity> = candidates.length === 1
    ? { status: 'resolved', value: candidates[0] as ForgeEntity }
    : candidates.length > 1
      ? { status: 'ambiguous', candidates }
      : { status: 'missing' };
  const relationship: RelationshipKind = owner.kind === 'family'
    || (candidates.length > 0 && candidates.every((candidate) => candidate.metadata.scope === 'family'))
    ? 'family-variable-reference'
    : 'instance-variable-reference';
  return { relationship, resolution };
}

function tokenizeExpression(value: string): readonly ExpressionToken[] | undefined {
  const tokens: ExpressionToken[] = [];
  let index = 0;
  while (index < value.length) {
    if (tokens.length >= MAX_EXPRESSION_TOKENS) return undefined;
    const character = value[index] as string;
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }

    if (character === '"') {
      const start = index;
      index += 1;
      let closed = false;
      while (index < value.length) {
        if (value[index] === '"') {
          if (value[index + 1] === '"') {
            index += 2;
            continue;
          }
          index += 1;
          closed = true;
          break;
        }
        index += 1;
      }
      if (!closed) return undefined;
      tokens.push({ kind: 'string', value: value.slice(start, index), start, end: index });
      continue;
    }

    if (/[A-Za-z_$]/.test(character)) {
      const start = index;
      index += 1;
      while (index < value.length && /[A-Za-z0-9_$]/.test(value[index] as string)) index += 1;
      tokens.push({ kind: 'identifier', value: value.slice(start, index), start, end: index });
      continue;
    }

    if (character === '.' && /^\.\d+[A-Za-z_$]/.test(value.slice(index))) {
      tokens.push({ kind: 'symbol', value: '.', start: index, end: index + 1 });
      index += 1;
      continue;
    }

    if (/[0-9]/.test(character) || (character === '.' && /[0-9]/.test(value[index + 1] ?? ''))) {
      const start = index;
      const match = value.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
      const nextCharacter = match ? value[index + match[0].length] : undefined;
      if (match && (!nextCharacter || !/[A-Za-z_$]/.test(nextCharacter))) {
        index += match[0].length;
        tokens.push({ kind: 'number', value: match[0], start, end: index });
        continue;
      }
      const digitStartedIdentifier = value.slice(index).match(/^\d+[A-Za-z_$][A-Za-z0-9_$]*/);
      if (!digitStartedIdentifier) return undefined;
      index += digitStartedIdentifier[0].length;
      tokens.push({ kind: 'identifier', value: digitStartedIdentifier[0], start, end: index });
      continue;
    }

    const pair = value.slice(index, index + 2);
    if (['<=', '>=', '<>', '==', '!='].includes(pair)) {
      tokens.push({ kind: 'symbol', value: pair, start: index, end: index + 2 });
      index += 2;
      continue;
    }
    if ('+-*/%^&|=<>(),.?!:'.includes(character)) {
      tokens.push({ kind: 'symbol', value: character, start: index, end: index + 1 });
      index += 1;
      continue;
    }
    return undefined;
  }
  return tokens;
}

const BINARY_PRECEDENCE: Readonly<Record<string, number>> = {
  '|': 1,
  '&': 2,
  '=': 3,
  '==': 3,
  '!=': 3,
  '<>': 3,
  '<': 3,
  '<=': 3,
  '>': 3,
  '>=': 3,
  '+': 4,
  '-': 4,
  '*': 5,
  '/': 5,
  '%': 5,
  '^': 6,
};

function parseExpression(value: string, functionsName: string): readonly ExpressionReference[] | undefined {
  const tokenized = tokenizeExpression(value);
  if (!tokenized) return undefined;
  const tokens: readonly ExpressionToken[] = tokenized;
  let position = 0;
  const references: ExpressionReference[] = [];
  const peek = () => tokens[position];
  const take = () => tokens[position++];

  function parseArguments(): boolean {
    const opening = take();
    if (opening?.value !== '(') return false;
    if (peek()?.value === ')') {
      take();
      return true;
    }
    while (position < tokens.length) {
      if (!parseBinary(0)) return false;
      if (peek()?.value === ')') {
        take();
        return true;
      }
      if (take()?.value !== ',') return false;
    }
    return false;
  }

  function parsePrimary(): boolean {
    const token = take();
    if (!token) return false;
    if (token.kind === 'number' || token.kind === 'string') return true;
    if (token.value === '(') {
      if (!parseBinary(0) || take()?.value !== ')') return false;
      return true;
    }
    if (['+', '-', '!'].includes(token.value)
      || (token.kind === 'identifier' && token.value.toLocaleLowerCase('en-US') === 'not')) {
      return parsePrimary();
    }
    if (token.kind !== 'identifier') return false;

    const isFunctionsObject = nameKey(token.value) === nameKey(functionsName);
    if (isFunctionsObject && peek()?.value === '.') {
      take();
      const member = take();
      if (!member || member.kind !== 'identifier') return false;
      references.push({ kind: 'function', name: member.value, start: member.start, end: member.end });
      if (peek()?.value === '(' && !parseArguments()) return false;
      return true;
    }

    if (peek()?.value === '(') {
      if (!parseArguments()) return false;
      const ownerEnd = tokens[position - 1]?.end ?? token.end;
      if (peek()?.value !== '.') return true;
      take();
      const member = take();
      if (!member || member.kind !== 'identifier') return false;
      if (peek()?.value === '.') {
        take();
        const expression = take();
        if (!expression || expression.kind !== 'identifier') return false;
        references.push({
          kind: 'behavior',
          owner: token.value,
          name: member.value,
          start: expression.start,
          end: expression.end,
          ownerStart: token.start,
          ownerEnd,
          behaviorStart: member.start,
          behaviorEnd: member.end,
        });
        if (peek()?.value === '(' && !parseArguments()) return false;
        return true;
      }
      references.push({
        kind: 'member',
        owner: token.value,
        name: member.value,
        start: member.start,
        end: member.end,
        ownerStart: token.start,
        ownerEnd,
      });
      if (peek()?.value === '(' && !parseArguments()) return false;
      return true;
    }

    if (peek()?.value === '.') {
      take();
      const member = take();
      if (!member || member.kind !== 'identifier') return false;
      if (peek()?.value === '.') {
        take();
        const expression = take();
        if (!expression || expression.kind !== 'identifier') return false;
        references.push({
          kind: 'behavior',
          owner: token.value,
          name: member.value,
          start: expression.start,
          end: expression.end,
          ownerStart: token.start,
          ownerEnd: token.end,
          behaviorStart: member.start,
          behaviorEnd: member.end,
        });
        if (peek()?.value === '(' && !parseArguments()) return false;
        return true;
      }
      references.push({
        kind: 'member',
        owner: token.value,
        name: member.value,
        start: member.start,
        end: member.end,
        ownerStart: token.start,
        ownerEnd: token.end,
      });
      if (peek()?.value === '(' && !parseArguments()) return false;
      return true;
    }

    references.push({ kind: 'identifier', name: token.value, start: token.start, end: token.end });
    return true;
  }

  function parseBinary(minimumPrecedence: number): boolean {
    if (!parsePrimary()) return false;
    while (position < tokens.length) {
      const next = peek();
      if (!next || next.kind !== 'symbol') break;
      if (next.value === '?' && minimumPrecedence === 0) {
        take();
        if (!parseBinary(0) || take()?.value !== ':' || !parseBinary(0)) return false;
        continue;
      }
      const precedence = BINARY_PRECEDENCE[next.value] ?? -1;
      if (precedence < minimumPrecedence) break;
      take();
      if (!parseBinary(precedence + 1)) return false;
    }
    return true;
  }

  if (tokens.length === 0 || !parseBinary(0) || position !== tokens.length) return undefined;
  return references.sort((left, right) => left.start - right.start || left.end - right.end);
}

function resolveBehavior(
  index: ProjectIndex,
  owner: Resolution<ForgeEntity>,
  behaviorName: string,
): Resolution<ForgeEntity> {
  if (owner.status === 'missing') return { status: 'missing' };
  if (owner.status === 'ambiguous') {
    return { status: 'ambiguous', candidates: owner.candidates.flatMap((entity) =>
      (index.byKind.get('behavior') ?? []).filter((behavior) =>
        behavior.metadata.ownerEntityId === entity.id && nameKey(behavior.name) === nameKey(behaviorName))) };
  }
  const candidates = (index.byKind.get('behavior') ?? []).filter((behavior) =>
    behavior.metadata.ownerEntityId === owner.value.id && nameKey(behavior.name) === nameKey(behaviorName));
  if (candidates.length === 1) return { status: 'resolved', value: candidates[0] as ForgeEntity };
  if (candidates.length > 1) return { status: 'ambiguous', candidates };
  return { status: 'missing' };
}

function addExpressionRelationships(
  expression: string,
  source: ForgeEntity,
  index: ProjectIndex,
  memberships: FamilyMemberships,
  collector: RelationshipCollector,
  scope: EventScope,
  location: ReferenceSourceLocation,
  functionsName: string,
  expressionOwner?: ForgeEntity,
): void {
  if (expression.length > MAX_EXPRESSION_LENGTH) {
    collector.unsupportedExpressionCount += 1;
    return;
  }
  const expressionReferences = parseExpression(expression, functionsName);
  if (!expressionReferences) {
    collector.unsupportedExpressionCount += 1;
    return;
  }

  for (const occurrence of expressionReferences) {
    const sourceLocation = {
      ...location,
      expressionRange: { start: occurrence.start, end: occurrence.end },
    };
    if (occurrence.kind === 'function') {
      addRelationship(collector, source, 'function-call', occurrence.name,
        resolveTarget(index, occurrence.name, ['function']), sourceLocation);
      continue;
    }

    if (occurrence.kind === 'behavior') {
      const ownerName = occurrence.owner ?? '';
      const selfOwner = nameKey(ownerName) === 'self';
      const ownerResolution = selfOwner
        ? expressionOwner ? { status: 'resolved' as const, value: expressionOwner } : { status: 'missing' as const }
        : resolveTarget(index, ownerName, EVENT_REFERENCE_KINDS);
      if (!selfOwner) {
        addRelationship(collector, source, 'object-reference', ownerName, ownerResolution, {
          ...sourceLocation,
          expressionRange: {
            start: occurrence.ownerStart ?? Math.max(0, occurrence.start - ownerName.length - 1),
            end: occurrence.ownerEnd ?? Math.max(0, occurrence.start - 1),
          },
        });
      }
      const targetName = `${ownerName}.${occurrence.name}`;
      const behaviorResolution = resolveBehavior(index, ownerResolution, occurrence.name);
      if (!selfOwner || expressionOwner) {
        addRelationship(collector, source, 'behavior-expression-reference', targetName, behaviorResolution, {
          ...sourceLocation,
          expressionRange: {
            start: occurrence.behaviorStart ?? occurrence.start,
            end: occurrence.behaviorEnd ?? occurrence.end,
          },
        });
      }
      continue;
    }

    if (occurrence.kind === 'member') {
      if (nameKey(occurrence.owner ?? '') === 'self') {
        if (!expressionOwner) continue;
        const variable = resolveInstanceVariable(index, expressionOwner, occurrence.name, memberships);
        if (variable.resolution.status !== 'missing') {
          addRelationship(collector, source, variable.relationship, `Self.${occurrence.name}`, variable.resolution, sourceLocation);
        }
        continue;
      }
      const ownerResolution = resolveTarget(index, occurrence.owner ?? '', EVENT_REFERENCE_KINDS);
      addRelationship(collector, source, 'object-reference', occurrence.owner ?? '', ownerResolution, {
        ...sourceLocation,
        expressionRange: {
          start: occurrence.ownerStart ?? Math.max(0, occurrence.start - (occurrence.owner?.length ?? 0) - 1),
          end: occurrence.ownerEnd ?? occurrence.start - 1,
        },
      });
      if (ownerResolution.status !== 'resolved') continue;
      const variable = resolveInstanceVariable(index, ownerResolution.value, occurrence.name, memberships);
      if (variable.resolution.status !== 'missing') {
        addRelationship(collector, source, variable.relationship, `${occurrence.owner}.${occurrence.name}`, variable.resolution, sourceLocation);
      }
      continue;
    }

    const variableResolution = resolveVariable(index, occurrence.name, source.sourcePath, scope.eventPath, scope.functionId);
    if (variableResolution.status !== 'missing'
      || targetCandidates(index, occurrence.name, ['variable']).length > 0) {
      addRelationship(collector, source, 'event-variable-reference', occurrence.name, variableResolution, sourceLocation);
    }
  }
}

function extractFamilyRelationships(resource: ParsedResource, index: ProjectIndex, collector: RelationshipCollector): void {
  if (resource.descriptor.kind !== 'family' || !isRecord(resource.raw) || !Array.isArray(resource.raw.members)) return;
  resource.raw.members.forEach((member, memberIndex) => {
    const memberName = typeof member === 'string'
      ? member
      : isRecord(member) && typeof member.name === 'string' ? member.name : undefined;
    if (!memberName) return;
    addRelationship(collector, resource.entity, 'family-member', memberName,
      resolveTarget(index, memberName, ['object']), { jsonPath: `$.members[${memberIndex}]` });
  });
}

function extractStructureRelationships(resource: ParsedResource, index: ProjectIndex, collector: RelationshipCollector): void {
  const owned = (kind: EntityKind) => (index.byKind.get(kind) ?? [])
    .filter((entity) => entity.metadata.ownerEntityId === resource.entity.id);

  if (resource.descriptor.kind === 'eventSheet') {
    const events = owned('event');
    const byId = new Map(events.map((event) => [event.id, event]));
    for (const event of events) {
      const parentId = typeof event.metadata.parentEventId === 'string' ? event.metadata.parentEventId : undefined;
      const parent = parentId ? byId.get(parentId) : undefined;
      const eventPath = typeof event.metadata.jsonPath === 'string' ? event.metadata.jsonPath : undefined;
      addKnownRelationship(collector, parent ?? resource.entity, event, parent ? 'event-child' : 'event-sheet-event',
        eventPath ? {
          ...(typeof event.metadata.sid === 'string' ? { eventSid: event.metadata.sid } : {}),
          jsonPath: eventPath,
        } : {});

      if (event.metadata.eventType === 'function-block') {
        addRelationship(collector, event, 'event-defines-function', event.name,
          resolveTarget(index, event.name, ['function']), eventPath ? {
            ...(typeof event.metadata.sid === 'string' ? { eventSid: event.metadata.sid } : {}),
            eventPath,
            jsonPath: `${eventPath}.functionName`,
          } : {});
      }
    }
  }

  if (resource.descriptor.kind === 'object') {
    for (const behavior of owned('behavior')) {
      addKnownRelationship(collector, resource.entity, behavior, 'behavior-attachment',
        typeof behavior.metadata.jsonPath === 'string' ? { jsonPath: behavior.metadata.jsonPath } : {});
    }
    const animations = owned('animation');
    const frames = owned('animationFrame');
    for (const animation of animations) {
      addKnownRelationship(collector, resource.entity, animation, 'object-animation',
        typeof animation.metadata.jsonPath === 'string' ? { jsonPath: animation.metadata.jsonPath } : {});
    }
    for (const frame of frames) {
      const animationId = typeof frame.metadata.animationEntityId === 'string' ? frame.metadata.animationEntityId : undefined;
      const animation = animationId ? index.byId.get(animationId) : undefined;
      const framePath = typeof frame.metadata.jsonPath === 'string' ? frame.metadata.jsonPath : undefined;
      if (animation) addKnownRelationship(collector, animation, frame, 'animation-frame', framePath ? { jsonPath: framePath } : {});

      const animationName = typeof frame.metadata.animationName === 'string' ? frame.metadata.animationName : undefined;
      const frameIndex = typeof frame.metadata.frameIndex === 'number' ? frame.metadata.frameIndex : undefined;
      const fileType = typeof frame.metadata.fileType === 'string' ? frame.metadata.fileType : undefined;
      const extension = fileType ? FRAME_IMAGE_EXTENSION_BY_TYPE[fileType] : undefined;
      if (!animationName || frameIndex === undefined || !extension
        || !/^[a-z0-9 _-]+$/i.test(resource.entity.name)
        || !/^[a-z0-9 _-]+$/i.test(animationName)) continue;
      const expectedPath = `images/${resource.entity.name.toLowerCase()}-${animationName.toLowerCase()}-${String(frameIndex).padStart(3, '0')}${extension}`;
      const exactAssets = (index.bySourcePath.get(expectedPath) ?? []).filter((entity) => entity.kind === 'asset');
      // Preserve exact Construct paths; only use a case-insensitive match when the exact path is absent.
      const matchingAssets = exactAssets.length > 0
        ? exactAssets
        : (index.byKind.get('asset') ?? []).filter((entity) =>
          entity.sourcePath.toLocaleLowerCase('en-US') === expectedPath.toLocaleLowerCase('en-US'));
      const resolution: Resolution<ForgeEntity> = matchingAssets.length === 1
        ? { status: 'resolved', value: matchingAssets[0] as ForgeEntity }
        : matchingAssets.length > 1
          ? { status: 'ambiguous', candidates: matchingAssets }
          : { status: 'missing' };
      addRelationship(collector, frame, 'frame-image', expectedPath, resolution,
        framePath ? { jsonPath: framePath } : {});
    }
  }

}

function extractLayoutRelationships(resource: ParsedResource, index: ProjectIndex, collector: RelationshipCollector): void {
  if (resource.descriptor.kind !== 'layout' || !isRecord(resource.raw)) return;
  const layers = (index.byKind.get('layoutLayer') ?? []).filter((entity) => entity.metadata.ownerEntityId === resource.entity.id);
  const instances = (index.byKind.get('layoutInstance') ?? []).filter((entity) => entity.metadata.ownerEntityId === resource.entity.id);
  const layerByPath = new Map(layers.flatMap((layer) => typeof layer.metadata.layerPath === 'string'
    ? [[layer.metadata.layerPath, layer] as const] : []));
  for (const layer of layers) {
    const path = typeof layer.metadata.layerPath === 'string' ? layer.metadata.layerPath : '';
    const parentMatch = /^(.*)\.(?:subLayers|layers)\[\d+\]$/.exec(path);
    const parent = parentMatch?.[1] ? layerByPath.get(parentMatch[1]) : undefined;
    addKnownRelationship(collector, parent ?? resource.entity, layer, parent ? 'layer-child' : 'layout-layer', {
      jsonPath: path,
    });
  }
  for (const instance of instances) {
    const layer = typeof instance.metadata.layerEntityId === 'string' ? index.byId.get(instance.metadata.layerEntityId) : undefined;
    const instancePath = typeof instance.metadata.jsonPath === 'string' ? instance.metadata.jsonPath : undefined;
    if (layer) addKnownRelationship(collector, layer, instance, 'layer-instance', instancePath ? { jsonPath: instancePath } : {});
    const type = typeof instance.metadata.objectType === 'string' ? instance.metadata.objectType : undefined;
    if (type) addRelationship(collector, resource.entity, 'layout-instance-type', type,
      resolveTarget(index, type, EVENT_REFERENCE_KINDS), instancePath ? { jsonPath: `${instancePath}.type` } : {});
  }
  if (typeof resource.raw.eventSheet === 'string') {
    addRelationship(collector, resource.entity, 'layout-event-sheet', resource.raw.eventSheet,
      resolveTarget(index, resource.raw.eventSheet, ['eventSheet']), { jsonPath: '$.eventSheet' });
  }
}

function extractEventSheetRelationships(
  resource: ParsedResource,
  index: ProjectIndex,
  collector: RelationshipCollector,
  memberships: FamilyMemberships,
  functionsName: string,
): void {
  if (resource.descriptor.kind !== 'eventSheet' || !isRecord(resource.raw) || !Array.isArray(resource.raw.events)) return;

  const visit = (
    node: unknown,
    eventPath: readonly number[],
    eventJsonPath: string,
    parentFunction?: ForgeEntity,
    parentFunctionId?: string,
    parentFunctionSid?: string,
  ): void => {
    if (!isRecord(node) || eventPath.length > 64) return;
    const eventType = typeof node.eventType === 'string' ? node.eventType : '';
    const sid = typeof node.sid === 'string' || typeof node.sid === 'number' ? String(node.sid) : undefined;
    const declaredFunctionCandidates = eventType === 'function-block'
      ? (index.byKind.get('function') ?? []).filter((entity) =>
          entity.sourcePath === resource.entity.sourcePath
          && nameKey(entity.name) === nameKey(String(node.functionName ?? ''))
          && (sid === undefined || String(entity.metadata.sid) === sid))
      : [];
    const declaredFunction = declaredFunctionCandidates.length === 1 ? declaredFunctionCandidates[0] : undefined;
    const functionEntity = declaredFunction ?? parentFunction;
    const customActionName = eventType === 'custom-ace-block' && typeof node.aceName === 'string' ? node.aceName : undefined;
    const customActionId = customActionName ? `custom-action:${resource.entity.id}:${sid ?? eventPath.join('.')}` : undefined;
    const functionId = declaredFunction?.id ?? customActionId ?? parentFunctionId ?? functionEntity?.id;
    const functionSid = declaredFunction ? sid : parentFunctionSid;
    const scope: EventScope = {
      eventPath,
      ...(functionEntity ? { functionEntity } : {}),
      ...(functionId ? { functionId } : {}),
      ...(functionSid ? { functionSid } : {}),
    };
    const source = functionEntity ?? resource.entity;
    const eventSid = sid;

    if (eventType === 'include' && typeof node.includeSheet === 'string') {
      addRelationship(collector, resource.entity, 'event-sheet-include', node.includeSheet,
        resolveTarget(index, node.includeSheet, ['eventSheet']), {
          ...(eventSid ? { eventSid } : {}),
          eventPath: eventJsonPath,
          jsonPath: `${eventJsonPath}.includeSheet`,
        });
    }

    const inspectEntry = (entry: Record<string, unknown>, entryKind: 'condition' | 'action', entryIndex: number): void => {
      const entryPath = `${eventJsonPath}.${entryKind === 'condition' ? 'conditions' : 'actions'}[${entryIndex}]`;
      const entryLocation: ReferenceSourceLocation = {
        ...(eventSid ? { eventSid } : {}),
        ...(scope.functionSid ? { functionSid: scope.functionSid } : {}),
        eventPath: eventJsonPath,
        entryKind,
        entryIndex,
      };
      const objectClass = typeof entry.objectClass === 'string' ? entry.objectClass : undefined;
      const isFunctionObject = objectClass !== undefined && nameKey(objectClass) === nameKey(functionsName);
      const isNonObjectClass = objectClass !== undefined
        && (RESERVED_NON_OBJECT_CLASSES.has(objectClass.toLocaleLowerCase('en-US')) || isFunctionObject);
      const objectClassResolution = objectClass && !isNonObjectClass
        ? resolveTarget(index, objectClass, EVENT_REFERENCE_KINDS)
        : undefined;
      if (objectClass && !isNonObjectClass) {
        addRelationship(collector, source, 'object-reference', objectClass,
          objectClassResolution ?? { status: 'missing' },
          { ...entryLocation, jsonPath: `${entryPath}.objectClass` });
      }

      const entryId = typeof entry.id === 'string' ? entry.id : '';
      const parameters = isRecord(entry.parameters) ? entry.parameters : undefined;
      const variableName = parameters && typeof parameters.variable === 'string' ? parameters.variable : undefined;
      const isEventVariableReference = objectClass?.toLowerCase() === 'system'
        && variableName !== undefined
        && ((entryKind === 'action' && EVENT_VARIABLE_PARAMETER_ACTIONS.has(entryId))
          || (entryKind === 'condition' && EVENT_VARIABLE_PARAMETER_CONDITIONS.has(entryId)));
      if (isEventVariableReference && variableName) {
        addRelationship(collector, source, 'event-variable-reference', variableName,
          resolveVariable(index, variableName, resource.entity.sourcePath, scope.eventPath, scope.functionId),
          { ...entryLocation, jsonPath: `${entryPath}.parameters.variable` });
      }

      const instanceVariableName = parameters && typeof parameters['instance-variable'] === 'string'
        ? parameters['instance-variable'] : undefined;
      if (objectClass && instanceVariableName) {
        const ownerResolution = resolveTarget(index, objectClass, EVENT_REFERENCE_KINDS);
        if (ownerResolution.status === 'resolved') {
          const variable = resolveInstanceVariable(index, ownerResolution.value, instanceVariableName, memberships);
          addRelationship(collector, source, variable.relationship, `${objectClass}.${instanceVariableName}`, variable.resolution,
            { ...entryLocation, jsonPath: `${entryPath}.parameters.instance-variable` });
        }
      }

      if (typeof entry.callFunction === 'string') {
        addRelationship(collector, source, 'function-call', entry.callFunction,
          resolveTarget(index, entry.callFunction, ['function']),
          { ...entryLocation, jsonPath: `${entryPath}.callFunction` });
      }

      if (!parameters) return;
      for (const [parameterName, parameterValue] of Object.entries(parameters)) {
        if (!EXPRESSION_PARAMETER_NAMES.has(parameterName) || typeof parameterValue !== 'string') continue;
        addExpressionRelationships(parameterValue, source, index, memberships, collector, scope, {
          ...entryLocation,
          jsonPath: `${entryPath}.parameters.${parameterName}`,
        }, functionsName, objectClassResolution?.status === 'resolved' ? objectClassResolution.value : undefined);
      }
    };

    if (typeof node.callFunction === 'string') {
      addRelationship(collector, source, 'function-call', node.callFunction,
        resolveTarget(index, node.callFunction, ['function']), {
          ...(eventSid ? { eventSid } : {}),
          ...(scope.functionSid ? { functionSid: scope.functionSid } : {}),
          eventPath: eventJsonPath,
          jsonPath: `${eventJsonPath}.callFunction`,
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
        functionId,
        functionSid,
      ));
    }
  };

  resource.raw.events.forEach((event, eventIndex) => visit(event, [eventIndex], `$.events[${eventIndex}]`));
}

/** Emits only supported Construct relationships that resolve to exactly one indexed entity. */
export function extractProjectRelationships(
  resources: readonly ParsedResource[],
  index: ProjectIndex,
  functionsName = 'Functions',
): {
  readonly references: readonly ProjectReference[];
  readonly unresolvedReferences: readonly UnresolvedProjectReference[];
  readonly unsupportedExpressionCount: number;
} {
  const collector: RelationshipCollector = {
    references: new Map(),
    unresolvedReferences: new Map(),
    unsupportedExpressionCount: 0,
  };
  const memberships = familyMemberships(resources, index);
  for (const resource of resources) {
    extractFamilyRelationships(resource, index, collector);
    extractLayoutRelationships(resource, index, collector);
    extractStructureRelationships(resource, index, collector);
    extractEventSheetRelationships(resource, index, collector, memberships, functionsName);
  }
  const folders = index.byKind.get('projectFolder') ?? [];
  for (const folder of folders) {
    const parentPath = folder.sourcePath.slice(0, folder.sourcePath.lastIndexOf('/'));
    const parent = folders.find((candidate) => candidate.sourcePath === parentPath);
    if (parent) addKnownRelationship(collector, parent, folder, 'folder-child', {});
  }
  for (const resource of resources) {
    const sourceDirectory = resource.entity.sourcePath.slice(0, resource.entity.sourcePath.lastIndexOf('/'));
    for (const folder of index.byKind.get('projectFolder') ?? []) {
      if (folder.sourcePath === sourceDirectory) {
        addKnownRelationship(collector, folder, resource.entity, 'folder-resource', {});
      }
    }
  }
  return {
    references: [...collector.references.values()],
    unresolvedReferences: [...collector.unresolvedReferences.values()],
    unsupportedExpressionCount: collector.unsupportedExpressionCount,
  };
}

export function createReferenceIndexes(references: readonly ProjectReference[]): {
  readonly referencesBySource: ReadonlyMap<string, readonly ProjectReference[]>;
  readonly referencesByTarget: ReadonlyMap<string, readonly ProjectReference[]>;
} {
  const bySource = new Map<string, ProjectReference[]>();
  const byTarget = new Map<string, ProjectReference[]>();
  for (const reference of references) {
    const sourceMatches = bySource.get(reference.sourceEntityId) ?? [];
    sourceMatches.push(reference);
    bySource.set(reference.sourceEntityId, sourceMatches);
    const targetMatches = byTarget.get(reference.targetEntityId) ?? [];
    targetMatches.push(reference);
    byTarget.set(reference.targetEntityId, targetMatches);
  }
  return { referencesBySource: bySource, referencesByTarget: byTarget };
}

export function createProjectDependencies(references: readonly ProjectReference[]): readonly ProjectDependency[] {
  const groups = new Map<string, { reference: ProjectReference; occurrenceIds: string[] }>();
  for (const reference of references) {
    const key = JSON.stringify([reference.sourceEntityId, reference.relationship, reference.targetEntityId]);
    const group = groups.get(key);
    if (group) group.occurrenceIds.push(reference.id);
    else groups.set(key, { reference, occurrenceIds: [reference.id] });
  }

  return [...groups.values()].map(({ reference, occurrenceIds }) => ({
    id: [reference.sourceEntityId, reference.relationship, reference.targetEntityId]
      .map(encodeURIComponent)
      .join(':'),
    sourceEntityId: reference.sourceEntityId,
    relationship: reference.relationship,
    targetEntityId: reference.targetEntityId,
    occurrenceIds,
  }));
}
