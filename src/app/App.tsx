import { Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { PROJECT_TYPES } from '@/core/registry'
import { LandingPage } from '@/pages/LandingPage'

/** One route per project type, straight from the registry. */
export default function App() {
  return (
    <Suspense fallback={<p className="p-8 text-center text-muted-foreground">Loading…</p>}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        {PROJECT_TYPES.map(({ id, path, Workspace }) => (
          <Route key={id} path={path} element={<Workspace />} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
