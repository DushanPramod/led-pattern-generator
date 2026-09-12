import { Save, TriangleAlert } from 'lucide-react'
import { useState, type ComponentProps } from 'react'
import { PROJECT_FILE_COMPATIBILITY_WARNING } from '@/core/projectFile'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from './ui/alert-dialog'
import { Button } from './ui/button'

/**
 * Saves the project file, but first shows a modal warning that the file format
 * may change while the app is under development.
 */
export function SaveProjectButton({
  onSave,
  ...props
}: Omit<ComponentProps<typeof Button>, 'onClick'> & { onSave: () => void }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button type="button" variant="outline" {...props} onClick={() => setOpen(true)}>
        <Save /> Save project
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-amber-500/15 text-amber-700 dark:text-amber-400">
              <TriangleAlert />
            </AlertDialogMedia>
            <AlertDialogTitle>Save project file</AlertDialogTitle>
            <AlertDialogDescription>{PROJECT_FILE_COMPATIBILITY_WARNING}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onSave}>
              <Save /> Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
