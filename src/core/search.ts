import { FIRST_CLASS_ENTITY_KINDS, type EntityKind, type ForgeEntity, type ProjectIndex } from './types';

export interface ParsedEntitySearch {
  readonly terms: readonly string[];
  readonly kinds: readonly EntityKind[];
  readonly sheets: readonly string[];
}

const ENTITY_KIND_SET = new Set<EntityKind>([
  'object', 'family', 'layout', 'eventSheet', 'timeline', 'flowchart', 'function', 'variable', 'addon', 'asset',
  'layoutLayer', 'layoutInstance', 'event', 'behavior', 'animation', 'animationFrame', 'projectFolder', 'projectFile',
]);

function isEntityKind(value: string): value is EntityKind {
  return [...ENTITY_KIND_SET].some((kind) => kind === value);
}

function queryTokens(query: string): string[] {
  const tokens: string[] = [];
  const pattern = /((?:[^\s:]+:)?)"((?:\\.|[^"\\])*)"|((?:[^\s:]+:)?)'((?:\\.|[^'\\])*)'|(\S+)/g;
  for (const match of query.matchAll(pattern)) {
    const quotedToken = match[2] !== undefined ? `${match[1] ?? ''}${match[2]}` : undefined;
    const singleQuotedToken = match[4] !== undefined ? `${match[3] ?? ''}${match[4]}` : undefined;
    const token = quotedToken ?? singleQuotedToken ?? match[5];
    if (token) tokens.push(token.replaceAll('\\"', '"').replaceAll("\\'", "'"));
  }
  return tokens;
}

export function parseEntitySearch(query: string): ParsedEntitySearch {
  const terms: string[] = [];
  const kinds: EntityKind[] = [];
  const sheets: string[] = [];
  for (const token of queryTokens(query)) {
    const separator = token.indexOf(':');
    if (separator < 0) {
      terms.push(token.toLocaleLowerCase('en-US'));
      continue;
    }
    const key = token.slice(0, separator).toLowerCase();
    const value = token.slice(separator + 1).trim();
    if (key === 'kind' && isEntityKind(value)) kinds.push(value);
    else if (key === 'sheet' && value !== '') sheets.push(value.toLocaleLowerCase('en-US'));
    else terms.push(token.toLocaleLowerCase('en-US'));
  }
  return { terms, kinds, sheets };
}

function flattenMetadata(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(flattenMetadata).join(' ');
  if (typeof value === 'object') return Object.values(value).map(flattenMetadata).join(' ');
  return '';
}

function searchableText(entity: ForgeEntity): string {
  return [entity.name, entity.kind, entity.sourcePath, flattenMetadata(entity.metadata)]
    .join(' ')
    .toLocaleLowerCase('en-US');
}

function sheetMatches(entity: ForgeEntity, sheets: readonly string[]): boolean {
  if (sheets.length === 0) return true;
  const associatedSheet = entity.metadata.sheetName;
  const sheetText = [
    entity.kind === 'eventSheet' ? entity.name : '',
    typeof associatedSheet === 'string' ? associatedSheet : '',
    entity.sourcePath,
  ].join(' ').toLocaleLowerCase('en-US');
  return sheets.every((sheet) => sheetText.includes(sheet));
}

/** Search an existing index without traversing raw Construct JSON. Filters are ready to grow independently. */
export function searchEntities(index: ProjectIndex, query: string): readonly ForgeEntity[] {
  const parsed = parseEntitySearch(query);
  const allowedKinds = new Set(parsed.kinds);
  const matches = index.entities.filter((entity) => {
    if (allowedKinds.size > 0 && !allowedKinds.has(entity.kind)) return false;
    if (!sheetMatches(entity, parsed.sheets)) return false;
    const text = searchableText(entity);
    return parsed.terms.every((term) => text.includes(term));
  });
  const firstClassRank: ReadonlyMap<EntityKind, number> = new Map(FIRST_CLASS_ENTITY_KINDS
    .map((kind, position): [EntityKind, number] => [kind, position]));
  const queryText = parsed.terms.join(' ');
  const relevance = (entity: ForgeEntity): number => {
    if (!queryText) return 0;
    const name = entity.name.toLocaleLowerCase('en-US');
    if (name === queryText) return 0;
    if (name.startsWith(queryText)) return 1;
    if (name.includes(queryText)) return 2;
    return 3;
  };
  return matches.sort((left, right) =>
    (firstClassRank.get(left.kind) ?? FIRST_CLASS_ENTITY_KINDS.length)
      - (firstClassRank.get(right.kind) ?? FIRST_CLASS_ENTITY_KINDS.length)
    || relevance(left) - relevance(right)
    || left.name.localeCompare(right.name)
    || left.sourcePath.localeCompare(right.sourcePath));
}
