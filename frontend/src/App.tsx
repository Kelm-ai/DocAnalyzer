import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { Upload } from '@/pages/Upload'
import { Evaluations } from '@/pages/Evaluations'
import { ResultsV2 } from '@/pages/ResultsV2'
import { Frameworks } from '@/pages/Frameworks'
import { FrameworkDetail } from '@/pages/FrameworkDetail'
import { Docs } from '@/pages/Docs'
import { ErrorBoundary } from '@/components/ErrorBoundary'

function ResultsV2Redirect() {
  const { evaluationId } = useParams()
  return <Navigate to={`/results/${evaluationId}`} replace />
}

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Upload />} />
            <Route path="/evaluations" element={<Evaluations />} />
            <Route path="/results/:evaluationId" element={<ResultsV2 />} />
            <Route path="/results-v2/:evaluationId" element={<ResultsV2Redirect />} />
            <Route path="/frameworks" element={<Frameworks />} />
            <Route path="/frameworks/:id" element={<FrameworkDetail />} />
            {/* Redirect old requirements route to frameworks */}
            <Route path="/requirements" element={<Navigate to="/frameworks" replace />} />
            <Route path="/docs" element={<Docs />} />
          </Routes>
        </Layout>
      </Router>
    </ErrorBoundary>
  )
}

export default App
