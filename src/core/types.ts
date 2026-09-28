/** JSON-safe data retained for entity metadata; raw parser objects are never exposed. */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export type EntityKind =
  | 'object'
  | 'family'
  | 'layout'
  | 'eventSheet'
  | 'timeline'
  | 'flowchart'
  | 'function'
  | 'variable'
  | 'addon'
  | 'asset'
  | 'layoutLayer'
  | 'layoutInstance'
  | 'event'
  | 'behavior'
  | 'animation'
  | 'animationFrame'
  | 'projectFolder'
  | 'projectFile';

export interface ForgeEntity {
  readonly id: string;
  readonly kind: EntityKind;
  readonly name: string;
  /** Normalized, root-relative path using `/` separators. */
  readonly sourcePath: string;
  readonly metadata: Readonly<Record<string, JsonValue>>;
}

export interface ProjectIndex {
  readonly entities: readonly ForgeEntity[];
  readonly byId: ReadonlyMap<string, ForgeEntity>;
  readonly byKind: ReadonlyMap<EntityKind, readonly ForgeEntity[]>;
  readonly byName: ReadonlyMap<string, readonly ForgeEntity[]>;
  readonly bySourcePath: ReadonlyMap<string, readonly ForgeEntity[]>;
  readonly identityConflicts: readonly EntityIdentityConflict[];
}

export interface EntityIdentityConflict {
  readonly id: string;
  readonly entities: readonly ForgeEntity[];
}

export const RELATIONSHIP_KINDS = [
  'family-member',
  'layout-layer',
  'layer-child',
  'layer-instance',
  'layout-instance-type',
  'layout-event-sheet',
  'event-sheet-event',
  'event-child',
  'event-defines-function',
  'event-sheet-include',
  'behavior-attachment',
  'object-animation',
  'animation-frame',
  'frame-image',
  'folder-resource',
  'folder-child',
  'object-reference',
  'function-call',
  'event-variable-reference',
  'instance-variable-reference',
  'family-variable-reference',
  'behavior-expression-reference',
] as const;

export type RelationshipKind = typeof RELATIONSHIP_KINDS[number];

export const FIRST_CLASS_ENTITY_KINDS = [
  'object', 'family', 'layout', 'eventSheet', 'function', 'variable', 'timeline', 'flowchart',
] as const satisfies readonly EntityKind[];

export type FirstClassEntityKind = typeof FIRST_CLASS_ENTITY_KINDS[number];

export interface ReferenceSourceLocation {
  readonly eventSid?: string;
  readonly functionSid?: string;
  /** JSONPath-like path to the event that owns this occurrence. */
  readonly eventPath?: string;
  /** JSONPath-like path to the referenced field or expression. */
  readonly jsonPath?: string;
  readonly entryKind?: 'condition' | 'action';
  readonly entryIndex?: number;
  readonly expressionRange?: { readonly start: number; readonly end: number };
}

export interface ProjectReference {
  readonly id: string;
  readonly sourceEntityId: string;
  readonly targetEntityId: string;
  readonly relationship: RelationshipKind;
  readonly sourcePath: string;
  readonly sourceLocation?: ReferenceSourceLocation;
}

/** An explicit Construct reference that could not be resolved to one target. */
export interface UnresolvedProjectReference {
  readonly id: string;
  readonly sourceEntityId: string;
  readonly sourcePath: string;
  readonly targetName: string;
  readonly relationship: RelationshipKind;
  readonly resolution: 'missing' | 'ambiguous';
  readonly candidateEntityIds: readonly string[];
  readonly sourceLocation?: ReferenceSourceLocation;
}

/** A derived graph edge that points back to all of its source occurrences. */
export interface ProjectDependency {
  readonly id: string;
  readonly sourceEntityId: string;
  readonly relationship: RelationshipKind;
  readonly targetEntityId: string;
  readonly occurrenceIds: readonly string[];
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface ProjectDiagnostic {
  readonly ruleId: string;
  readonly severity: DiagnosticSeverity;
  readonly title: string;
  readonly description: string;
  readonly entityId?: string;
  readonly sourcePath?: string;
  readonly sourceLocation?: ReferenceSourceLocation;
  readonly evidence?: string;
  readonly futureFixId?: string;
}

export type ResourceStage = 'read' | 'parse' | 'index' | 'references';

export interface ResourceIssue {
  readonly path: string;
  readonly stage: ResourceStage;
  readonly code: string;
  readonly message: string;
}

export interface ManifestResource {
  readonly kind: EntityKind;
  readonly path: string;
  readonly name?: string;
  readonly metadata: Readonly<Record<string, JsonValue>>;
}

export interface ManifestFolder {
  readonly kind: EntityKind;
  readonly path: string;
}

export interface ManifestAddon {
  readonly id: string;
  readonly name: string;
  readonly version?: string;
  readonly metadata: Readonly<Record<string, JsonValue>>;
}

/** Normalized subset of project.c3proj understood by the current core. */
export interface ProjectManifest {
  readonly projectFile: 'project.c3proj';
  readonly name: string;
  readonly constructVersion?: string;
  /** Project-configured object name used to call event sheet functions. */
  readonly functionsName?: string;
  readonly resources: readonly ManifestResource[];
  readonly folders: readonly ManifestFolder[];
  readonly addons: readonly ManifestAddon[];
  readonly metadata: Readonly<Record<string, JsonValue>>;
}

export interface AnalysisStats {
  readonly totalEntities: number;
  readonly entitiesByKind: Readonly<Record<EntityKind, number>>;
  readonly totalReferences: number;
  readonly totalDependencies: number;
  readonly totalUnresolvedReferences: number;
  readonly unsupportedExpressionCount: number;
  readonly diagnosticsBySeverity: Readonly<Record<DiagnosticSeverity, number>>;
}

export interface ProjectAnalysis {
  readonly manifest: ProjectManifest;
  readonly index: ProjectIndex;
  readonly references: readonly ProjectReference[];
  readonly referencesBySource: ReadonlyMap<string, readonly ProjectReference[]>;
  readonly referencesByTarget: ReadonlyMap<string, readonly ProjectReference[]>;
  readonly dependencies: readonly ProjectDependency[];
  readonly unresolvedReferences: readonly UnresolvedProjectReference[];
  readonly unsupportedExpressionCount: number;
  readonly diagnostics: readonly ProjectDiagnostic[];
  readonly stats: AnalysisStats;
}

export type ProjectLoadStage =
  | 'validate'
  | 'read-manifest'
  | 'load-resources'
  | 'parse'
  | 'index'
  | 'references'
  | 'diagnostics'
  | 'ready';

export interface ProjectLoadOptions {
  readonly onProgress?: (stage: ProjectLoadStage) => void;
}
