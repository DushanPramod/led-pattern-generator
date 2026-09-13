import { ArrowUp, Info } from 'lucide-react'
import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { AppFooter } from '@/components/AppFooter'
import { AppHeader } from '@/components/AppHeader'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { GUIDE, LANGS, UI, type Lang } from './content'

/** Remembers the reader's language, per browser. `?lang=si` in the URL wins. */
const LANG_KEY = 'guide.lang'

/** Faces that ship Sinhala glyphs on Windows, macOS, Android and most Linux desktops. */
const SINHALA_FONTS = "'Noto Sans Sinhala', 'Iskoola Pota', 'Nirmala UI', 'Sinhala Sangam MN', system-ui, sans-serif"

const isLang = (value: string | null): value is Lang => LANGS.some((l) => l.id === value)

function readLang(fromUrl: string | null): Lang {
  if (isLang(fromUrl)) return fromUrl
  try {
    const stored = localStorage.getItem(LANG_KEY)
    if (isLang(stored)) return stored
  } catch {
    // Storage can be blocked; English it is.
  }
  return 'en'
}

/**
 * Renders the guide's two bits of inline markup: **Label** for a control named
 * as the app shows it, and `code` for values, pins and file names.
 */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            // eslint-disable-next-line react/no-array-index-key -- static text split
            <strong key={i} className="rounded border bg-muted px-1 py-px text-[0.92em] font-semibold whitespace-nowrap">
              {part.slice(2, -2)}
            </strong>
          )
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            // eslint-disable-next-line react/no-array-index-key -- static text split
            <code key={i} className="rounded bg-code px-1 py-px font-mono text-[0.88em]">
              {part.slice(1, -1)}
            </code>
          )
        }
        // eslint-disable-next-line react/no-array-index-key -- static text split
        return <Fragment key={i}>{part}</Fragment>
      })}
    </>
  )
}

function Note({ label, children }: { label: string; children: ReactNode }) {
  return (
    <aside className="flex items-start gap-2 rounded-lg border border-primary/30 bg-accent px-3 py-2.5 text-sm leading-relaxed text-accent-foreground">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="m-0">
        <span className="sr-only">{label}: </span>
        {children}
      </p>
    </aside>
  )
}

/** How to use the app, screen by screen, in English and Sinhala. */
export function GuidePage() {
  const [params, setParams] = useSearchParams()
  const [lang, setLangState] = useState<Lang>(() => readLang(params.get('lang')))
  const htmlLang = LANGS.find((l) => l.id === lang)?.htmlLang ?? 'en'

  const setLang = (next: Lang) => {
    setLangState(next)
    try {
      localStorage.setItem(LANG_KEY, next)
    } catch {
      // The switch still works for this visit.
    }
    setParams(next === 'en' ? {} : { lang: next }, { replace: true, preventScrollReset: true })
  }

  useEffect(() => {
    document.title = `${UI.title[lang]} · LED Pattern Generator`
  }, [lang])

  // A link straight to a section (#movement) lands on it once the page has rendered.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1))
    if (id) document.getElementById(id)?.scrollIntoView()
  }, [])

  const t = (key: keyof typeof UI) => UI[key][lang]

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-[1680px] flex-col gap-4 p-4">
      <AppHeader title={t('title')} subtitle={t('subtitle')} showGuide={false}>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={lang}
          aria-label="Language / භාෂාව"
          onValueChange={(v) => isLang(v) && setLang(v)}
        >
          {LANGS.map((l) => (
            <ToggleGroupItem key={l.id} value={l.id} lang={l.htmlLang}>
              {l.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </AppHeader>

      <div
        lang={htmlLang}
        className="grid grow grid-cols-1 items-start gap-6 wide:grid-cols-[240px_minmax(0,1fr)]"
        // Sinhala script needs a face that carries it, and a little more line height.
        style={lang === 'si' ? { fontFamily: SINHALA_FONTS, lineHeight: 1.75 } : undefined}
      >
        <nav
          aria-label={t('contents')}
          className="rounded-xl border bg-card p-3 wide:sticky wide:top-4 wide:max-h-[calc(100svh-2rem)] wide:overflow-y-auto"
        >
          <h2 className="m-0 mb-2 px-2 text-[0.72rem] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
            {t('contents')}
          </h2>
          <ol className="m-0 flex list-none flex-col gap-0.5 p-0">
            {GUIDE.map((section, i) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="flex gap-2 rounded-md px-2 py-1 text-sm text-foreground no-underline hover:bg-muted"
                >
                  <span className="w-5 shrink-0 text-right tabular-nums text-muted-foreground">{i + 1}.</span>
                  {section.title[lang]}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <main className="flex min-w-0 flex-col gap-4">
          <Note label={t('note')}>{t('labelsNote')}</Note>

          {GUIDE.map((section, i) => (
            <section
              key={section.id}
              id={section.id}
              className="flex scroll-mt-4 flex-col gap-3 rounded-xl border bg-card p-5"
            >
              <header className="flex items-baseline justify-between gap-3">
                <h2 className="m-0 text-lg font-semibold">
                  <span className="mr-2 tabular-nums text-muted-foreground">{i + 1}.</span>
                  {section.title[lang]}
                </h2>
                <a
                  href="#top"
                  onClick={(e) => {
                    e.preventDefault()
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground no-underline hover:text-foreground"
                >
                  <ArrowUp className="size-3.5" aria-hidden /> {t('backToTop')}
                </a>
              </header>

              {section.intro && (
                <p className="m-0 max-w-[80ch] text-sm leading-relaxed text-muted-foreground">
                  <Rich text={section.intro[lang]} />
                </p>
              )}

              {section.items && (
                <dl className="m-0 flex flex-col divide-y rounded-lg border">
                  {section.items.map((item) => (
                    <div
                      key={item.label.en}
                      className="grid grid-cols-1 gap-x-6 gap-y-1 px-3 py-2.5 md:grid-cols-[minmax(160px,260px)_minmax(0,1fr)]"
                    >
                      <dt className="text-sm font-semibold">
                        <Rich text={item.label[lang]} />
                      </dt>
                      <dd className="m-0 max-w-[80ch] text-sm leading-relaxed">
                        <Rich text={item.body[lang]} />
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              {section.steps && (
                <ol className="m-0 flex max-w-[80ch] list-none flex-col gap-2 p-0">
                  {section.steps.map((step, n) => (
                    <li key={step.en} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2.5 text-sm leading-relaxed">
                      <span className="mt-0.5 flex size-6 items-center justify-center rounded-full bg-accent text-[0.72rem] font-semibold text-accent-foreground">
                        {n + 1}
                      </span>
                      <span>
                        <Rich text={step[lang]} />
                      </span>
                    </li>
                  ))}
                </ol>
              )}

              {section.note && (
                <Note label={t('note')}>
                  <Rich text={section.note[lang]} />
                </Note>
              )}
            </section>
          ))}
        </main>
      </div>

      <AppFooter />
    </div>
  )
}
