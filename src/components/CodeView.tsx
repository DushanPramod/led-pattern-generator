import { Check, Copy, Download } from 'lucide-react'
import { useMemo, useState } from 'react'
import { generate } from '../lib/codegen'
import { projectOptions } from '../lib/optimize/settings'
import { useProject } from '../state/useProject'
import { Button } from './ui/button'
import { Checkbox } from './ui/checkbox'
import { Label } from './ui/label'

function download(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

export function CodeView() {
  const { project } = useProject()
  const [split, setSplit] = useState(false)
  const [copied, setCopied] = useState(false)
  // Whatever the project is set to optimise for is what gets downloaded.
  const sketch = useMemo(() => generate(project, projectOptions(project)), [project])

  const text = split ? sketch.split.mainFile : sketch.main
  const lineCount = text.split('\n').length

  const copy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const save = () => {
    if (split) {
      download(sketch.fileName, sketch.split.mainFile)
      download(sketch.designsFileName, sketch.split.designsFile)
    } else {
      download(sketch.fileName, sketch.main)
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={save}>
          <Download /> Download {split ? 'both files' : sketch.fileName}
        </Button>
        <Button type="button" variant="secondary" onClick={copy}>
          {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy'}
        </Button>
        <span className="flex-1" />
        <Label className="text-sm font-normal">
          <Checkbox
            checked={split}
            onCheckedChange={(checked) => setSplit(checked === true)}
            aria-label="Split designs into a second file"
          />
          Split designs into a second file
        </Label>
      </div>

      <p className="m-0 text-xs leading-relaxed text-muted-foreground">
        Put {split ? `${sketch.fileName} and ${sketch.designsFileName}` : sketch.fileName} in a
        folder named{' '}
        <code className="rounded bg-muted px-1 py-0.5">{sketch.fileName.replace('.ino', '')}</code>{' '}
        and open it with the Arduino IDE. {lineCount} lines.
      </p>

      <pre className="m-0 max-h-[58vh] overflow-auto rounded-lg border bg-code p-3 text-[0.76rem] leading-relaxed [tab-size:2]">
        <code>{text}</code>
      </pre>

      {split && (
        <pre className="m-0 max-h-[58vh] overflow-auto rounded-lg border bg-code p-3 text-[0.76rem] leading-relaxed [tab-size:2]">
          <code>{sketch.split.designsFile}</code>
        </pre>
      )}
    </section>
  )
}
