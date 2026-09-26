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

export type ReferenceConfidence = 'high' | 'medium' | 'low';
export type ReferenceSource = 'semantic' | 'construct-expression' | 'exact-string-fallback';

export interface ProjectReference {
  readonly id: string;
  readonly sourceEntityId?: string;
  readonly sourcePath: string;
  readonly targetEntityId?: string;
  readonly targetName: string;
  readonly targetKind?: EntityKind;
  readonly relationship: string;
  readonly confidence: ReferenceConfidence;
  readonly source: ReferenceSource;
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface ProjectDiagnostic {
  readonly ruleId: string;
  readonly severity: DiagnosticSeverity;
  readonly title: string;
  readonly description: string;
  readonly entityId?: string;
  readonly sourcePath?: string;
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
  readonly resources: readonly ManifestResource[];
  readonly addons: readonly ManifestAddon[];
  readonly metadata: Readonly<Record<string, JsonValue>>;
}

export interface AnalysisStats {
  readonly totalEntities: number;
  readonly entitiesByKind: Readonly<Record<EntityKind, number>>;
  readonly totalReferences: number;
  readonly diagnosticsBySeverity: Readonly<Record<DiagnosticSeverity, number>>;
}

export interface ProjectAnalysis {
  readonly manifest: ProjectManifest;
  readonly index: ProjectIndex;
  readonly references: readonly ProjectReference[];
  readonly diagnostics: readonly ProjectDiagnostic[];
  readonly resourceIssues: readonly ResourceIssue[];
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
