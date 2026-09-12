import { ArrowRight, FolderOpen, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { AppFooter } from '@/components/AppFooter'
import { AppHeader } from '@/components/AppHeader'
import { OpenProjectButton } from '@/components/OpenProjectButton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { readLastProject } from '@/core/lastProject'
import { useOpenProjectFile } from '@/core/navigation'
import { newProjectFile } from '@/core/projectFile'
import type { ProjectTypeId } from '@/core/projectTypes'
import { DEFAULT_PROJECT_TYPE, PROJECT_TYPES, getProjectType } from '@/core/registry'
import { useNavigate } from 'react-router'

const DESCRIPTION_LIMIT = 200

/** Start a new project of any type, open a saved file, or go back to the last one. */
export function LandingPage() {
  const navigate = useNavigate()
  const { openFile } = useOpenProjectFile()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<ProjectTypeId>(DEFAULT_PROJECT_TYPE)
  const [touched, setTouched] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)
  const [last] = useState(readLastProject)
  const lastType = last ? getProjectType(last.type) : undefined

  const nameMissing = name.trim() === ''
  const nameError = touched && nameMissing

  const create = (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (nameMissing) return
    openFile(newProjectFile(type, { name: name.trim(), description: description.trim() }))
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-[1680px] flex-col gap-4 p-4">
      <AppHeader title="LED Pattern Generator" subtitle="design a circuit, get the Arduino sketch" showHome={false} />

      <main className="flex grow items-start justify-center py-6 sm:py-12">
        <div className="flex w-full max-w-md flex-col gap-4">
          <form
            onSubmit={create}
            noValidate
            className="flex flex-col gap-4 rounded-xl border bg-card p-6"
          >
            <div>
              <h2 className="m-0 text-lg font-semibold">New project</h2>
              <p className="m-0 text-sm text-muted-foreground">
                Name it and pick what you are building.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="project-name">
                Project name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="project-name"
                autoFocus
                required
                value={name}
                aria-invalid={nameError || undefined}
                aria-describedby={nameError ? 'project-name-error' : undefined}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setTouched(true)}
                placeholder="e.g. Vesak Budurasmala 2026"
              />
              {nameError && (
                <p id="project-name-error" className="m-0 text-xs text-destructive">
                  A project name is required.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="project-description">
                Description <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <textarea
                id="project-description"
                rows={3}
                maxLength={DESCRIPTION_LIMIT}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A short note about this project"
                className="w-full min-w-0 resize-y rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
              />
              <p className="m-0 self-end text-xs text-muted-foreground tabular-nums">
                {description.length}/{DESCRIPTION_LIMIT}
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="project-type">Project type</Label>
              <Select value={type} onValueChange={(v) => setType(v as ProjectTypeId)}>
                <SelectTrigger id="project-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_TYPES.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="m-0 text-xs text-muted-foreground">{getProjectType(type)?.summary}</p>
            </div>

            <Button type="submit" size="lg" disabled={touched && nameMissing}>
              <Plus /> Create project
            </Button>
          </form>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Separator className="flex-1" /> or <Separator className="flex-1" />
          </div>

          <div className="flex flex-col gap-2">
            <OpenProjectButton variant="outline" size="lg" onError={setOpenError}>
              <FolderOpen /> Open saved project file
            </OpenProjectButton>
            {openError && (
              <p role="alert" className="m-0 text-center text-xs text-destructive">
                {openError}
              </p>
            )}
            {last && lastType && (
              <Button type="button" variant="ghost" size="lg" onClick={() => navigate(lastType.path)}>
                Continue “{last.name || 'Untitled'}” · {lastType.label} <ArrowRight />
              </Button>
            )}
          </div>
        </div>
      </main>

      <AppFooter />
    </div>
  )
}
