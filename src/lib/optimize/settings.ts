/**
 * The optimisation settings a project carries, turned into codegen options.
 *
 * Lives here rather than in codegen/options.ts because types.ts imports that
 * module, and this needs to know about Project.
 */
import type { Project } from '../../types'
import {
  NO_PASSES,
  availablePasses,
  optionsFor,
  type CodegenOptions,
  type OptimizationLevel,
} from '../codegen/options'

/**
 * What to emit for this project.
 *
 * A project with a level but no chosen passes has not been searched yet, so it
 * falls back to everything the level allows. That keeps the download useful
 * before the compiler has had its say, and the search narrows it afterwards.
 */
export function projectOptions(project: Project): CodegenOptions {
  const settings = project.optimization
  if (!settings || settings.level === 'off') return NO_PASSES
  const passes = settings.passes.length > 0 ? settings.passes : availablePasses(settings.level)
  return optionsFor(passes)
}

export function projectLevel(project: Project): OptimizationLevel {
  return project.optimization?.level ?? 'off'
}
