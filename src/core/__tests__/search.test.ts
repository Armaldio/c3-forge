import { describe, expect, it } from 'vitest'
import { createForgeEntity } from '../entities'
import { createProjectIndex } from '../project-index'
import { searchEntities } from '../search'

describe('project entity search ordering', () => {
  it('shows the first-class project entities before internal semantic entities', () => {
    const internalEvent = createForgeEntity('event', 'Player event', 'eventSheets/Game.json')
    const player = createForgeEntity('object', 'Player', 'objectTypes/Player.json')
    const frame = createForgeEntity('animationFrame', 'Player frame', 'objectTypes/Player.json')
    const sheet = createForgeEntity('eventSheet', 'Player sheet', 'eventSheets/Player.json')
    const results = searchEntities(createProjectIndex([internalEvent, frame, player, sheet]), 'player')

    expect(results.map((entity) => entity.kind)).toEqual(['object', 'eventSheet', 'event', 'animationFrame'])
  })

  it('retains explicit kind searches for hidden semantic entities', () => {
    const event = createForgeEntity('event', 'Player event', 'eventSheets/Game.json')
    const object = createForgeEntity('object', 'Player', 'objectTypes/Player.json')

    expect(searchEntities(createProjectIndex([event, object]), 'kind:event player').map((entity) => entity.id))
      .toEqual([event.id])
  })
})
