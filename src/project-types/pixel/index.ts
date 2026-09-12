import { lazy } from 'react'
import type { ProjectTypeDefinition } from '@/core/projectTypes'

export const pixelType: ProjectTypeDefinition = {
  id: 'pixel',
  label: 'Pixel Budurasmala',
  summary: 'Addressable pixel LEDs — editor coming soon',
  path: '/pixel',
  Workspace: lazy(() => import('./PixelWorkspace')),
  // Nothing to configure yet; the editor will define its own data block.
  createData: () => ({}),
  isValidData: (data) => typeof data === 'object' && data !== null,
}
