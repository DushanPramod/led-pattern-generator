import { useMemo, useState } from 'react'
import { generate } from '../lib/codegen'
import { useProject } from '../state/useProject'

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
  const sketch = useMemo(() => generate(project), [project])

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
    <section className="panel code">
      <div className="tools">
        <button type="button" className="primary" onClick={save}>
          ⤓ Download {split ? 'both files' : sketch.fileName}
        </button>
        <button type="button" onClick={copy}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>
        <span className="spacer" />
        <label className="check">
          <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />
          <span>Split designs into a second file</span>
        </label>
      </div>

      <p className="note">
        Put {split ? `${sketch.fileName} and ${sketch.designsFileName}` : sketch.fileName} in a
        folder named <code>{sketch.fileName.replace('.ino', '')}</code> and open it with the Arduino
        IDE. {lineCount} lines.
      </p>

      <pre className="code-block">
        <code>{text}</code>
      </pre>

      {split && (
        <pre className="code-block">
          <code>{sketch.split.designsFile}</code>
        </pre>
      )}
    </section>
  )
}
