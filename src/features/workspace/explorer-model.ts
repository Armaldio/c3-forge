import type { EntityKind, ForgeEntity } from '../../core/types'
import { FIRST_CLASS_ENTITY_KINDS } from '../../core/types'

export interface ExplorerSection {
  readonly kind: EntityKind
  readonly label: string
  readonly entities: readonly ForgeEntity[]
}

export function buildExplorerSections(
  entitiesByKind: ReadonlyMap<EntityKind, readonly ForgeEntity[]>,
  labels: Readonly<Record<EntityKind, string>>,
): readonly ExplorerSection[] {
  return FIRST_CLASS_ENTITY_KINDS.flatMap((kind) => {
    const entities = entitiesByKind.get(kind) ?? []
    return entities.length > 0 ? [{ kind, label: labels[kind], entities }] : []
  })
}
