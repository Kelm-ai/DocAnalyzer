import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { Upload } from '@/pages/Upload'
import { Evaluations } from '@/pages/Evaluations'
import { Results } from '@/pages/Results'
import { Reports } from '@/pages/Reports'
import { ErrorBoundary } from '@/components/ErrorBoundary'

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Upload />} />
            <Route path="/evaluations" element={<Evaluations />} />
            <Route path="/results/:evaluationId" element={<Results />} />
            <Route path="/reports" element={<Reports />} />
          </Routes>
        </Layout>
      </Router>
    </ErrorBoundary>
  )
}

export default App