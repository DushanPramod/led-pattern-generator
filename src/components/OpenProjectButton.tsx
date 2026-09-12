import { useRef, type ComponentProps } from 'react'
import { useOpenProjectFile } from '@/core/navigation'
import { PROJECT_FILE_ACCEPT } from '@/core/projectFile'
import { Button } from './ui/button'

/**
 * Picks a saved project file and opens it in whichever workspace its type
 * belongs to. Failures go to `onError`, or an alert when none is given.
 */
export function OpenProjectButton({
  onError,
  ...props
}: Omit<ComponentProps<typeof Button>, 'onClick' | 'onError'> & {
  onError?: (message: string | null) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const { openFromDisk } = useOpenProjectFile()

  const open = async (file: File) => {
    onError?.(null)
    try {
      await openFromDisk(file)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'That file could not be opened.'
      if (onError) onError(message)
      else alert(message)
    }
  }

  return (
    <>
      <Button type="button" {...props} onClick={() => input.current?.click()} />
      <input
        ref={input}
        type="file"
        accept={PROJECT_FILE_ACCEPT}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void open(file)
          e.target.value = ''
        }}
      />
    </>
  )
}
