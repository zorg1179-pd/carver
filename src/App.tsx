import { Routes, Route, Navigate } from 'react-router-dom'
import EditorPage from '@/pages/EditorPage'

export default function App() {
  return (
    <Routes>
      <Route path="/editor" element={<EditorPage />} />
      <Route path="*" element={<Navigate to="/editor" replace />} />
    </Routes>
  )
}
