import type {
  Frame,
  Grid,
  Group,
  Hardware,
  OptimizationSettings,
  Project,
  SpeedControl,
  Tile,
} from '../types'

export type Action =
  | { type: 'setName'; name: string }
  | { type: 'setDescription'; description: string }
  | { type: 'setGrid'; grid: Grid }
  | { type: 'setHardware'; patch: Partial<Hardware> }
  | { type: 'setSpeed'; patch: Partial<SpeedControl>; coalesce?: boolean }
  | { type: 'setRowColors'; colors: string[] }
  | { type: 'selectFrame'; id: string | null }
  | { type: 'addFrame'; groupId?: string }
  | { type: 'duplicateFrame'; id: string }
  | { type: 'deleteFrame'; id: string }
  | { type: 'updateFrame'; id: string; patch: Partial<Omit<Frame, 'id' | 'cells'>> }
  | { type: 'setCells'; id: string; cells: Uint8Array; coalesce?: boolean }
  // Artwork and its tile size land together, so a preset is one undo step.
  | { type: 'applyDesign'; id: string; cells: Uint8Array; tile: Tile; name?: string }
  | { type: 'addGroup' }
  | { type: 'updateGroup'; id: string; patch: Partial<Omit<Group, 'id' | 'frameIds'>> }
  | { type: 'duplicateGroup'; id: string }
  | { type: 'deleteGroup'; id: string }
  | { type: 'moveFrame'; frameId: string; toGroupId: string; toIndex: number }
  | { type: 'moveGroup'; id: string; delta: number }
  // Where a dragged sequence is dropped, as a slot in the list it was lifted from.
  | { type: 'moveGroupTo'; id: string; toIndex: number }
  | { type: 'setOptimization'; optimization: OptimizationSettings | undefined }
  | { type: 'loadProject'; project: Project }
  | { type: 'undo' }
  | { type: 'redo' }
