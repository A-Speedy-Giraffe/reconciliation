import { useState, useCallback } from 'react'
import './App.css'

const MAX_DOCUMENTS = 5

function FileUploadZone({ label, file, onFileSelect, onRemoveSlot, canRemoveSlot }) {
  const [dragOver, setDragOver] = useState(false)

  const handleDrag = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDragIn = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }, [])

  const handleDragOut = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFileSelect(e.dataTransfer.files[0])
    }
  }, [onFileSelect])

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelect(e.target.files[0])
    }
  }

  return (
    <div
      className={`upload-zone ${dragOver ? 'drag-over' : ''} ${file ? 'has-file' : ''}`}
      onDragEnter={handleDragIn}
      onDragLeave={handleDragOut}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      <div className="upload-zone-header">
        <label className="upload-label">{label}</label>
        {canRemoveSlot && (
          <button className="remove-slot-btn" onClick={onRemoveSlot} title="Remove document slot">&times;</button>
        )}
      </div>
      {file ? (
        <div className="file-info">
          <span className="file-icon">&#128196;</span>
          <span className="file-name">{file.name}</span>
          <span className="file-size">{(file.size / 1024).toFixed(1)} KB</span>
          <button className="remove-btn" onClick={() => onFileSelect(null)}>Clear</button>
        </div>
      ) : (
        <div className="upload-prompt">
          <span className="upload-icon">&#8682;</span>
          <p>Drag & drop a file here, or</p>
          <label className="file-input-label">
            Browse
            <input
              type="file"
              accept=".csv,.xlsx,.xls,.pdf,.json"
              onChange={handleFileInput}
              hidden
            />
          </label>
          <p className="accepted-formats">CSV, Excel, PDF, JSON</p>
        </div>
      )}
    </div>
  )
}

function ResultsTable({ results, documents }) {
  if (!results) return null

  return (
    <div className="results-section">
      <h2>Discrepancies Found ({results.length})</h2>
      {results.length === 0 ? (
        <div className="no-results">
          <p>No discrepancies detected. Documents match.</p>
        </div>
      ) : (
        <table className="results-table">
          <thead>
            <tr>
              <th>Severity</th>
              <th>Row</th>
              <th>Field</th>
              <th>Documents</th>
              <th>Values</th>
              <th>Difference</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={i} className={`severity-${r.severity || 'low'}`}>
                <td><span className={`severity-badge badge-${r.severity || 'low'}`}>{r.severity || 'low'}</span></td>
                <td>{r.row}</td>
                <td>{r.field}</td>
                <td>{r.documents}</td>
                <td>{r.values}</td>
                <td className="diff-cell">{r.difference}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function App() {
  const [files, setFiles] = useState([null, null])
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const setFileAt = (index, file) => {
    setFiles(prev => {
      const next = [...prev]
      next[index] = file
      return next
    })
  }

  const addSlot = () => {
    if (files.length < MAX_DOCUMENTS) {
      setFiles(prev => [...prev, null])
    }
  }

  const removeSlot = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const uploadedCount = files.filter(Boolean).length

  const readFileAsBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = reader.result.split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const handleReconcile = async () => {
    if (uploadedCount < 2) return
    setLoading(true)
    setError(null)
    try {
      const uploadedFiles = files.filter(Boolean)
      const documents = await Promise.all(
        uploadedFiles.map(async (file) => ({
          name: file.name,
          data: await readFileAsBase64(file),
        }))
      )
      console.log('Sending documents:', documents.map(d => `${d.name} (${d.data.length} chars base64)`))
      const res = await fetch('/api/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documents }),
      })
      const data = await res.json()
      console.log('Server response:', data)
      if (!res.ok) {
        throw new Error(data.error || `Server error (${res.status})`)
      }
      setResults(data.discrepancies)
    } catch (err) {
      setError(err.message)
      setResults(null)
    } finally {
      setLoading(false)
    }
  }

  const canReconcile = uploadedCount >= 2 && !loading

  return (
    <div className="app">
      <header className="app-header">
        <h1>Reconciliation</h1>
        <p className="subtitle">Upload financial documents to detect discrepancies (up to {MAX_DOCUMENTS})</p>
      </header>

      <main className="app-main">
        <section className="upload-grid">
          {files.map((file, i) => (
            <FileUploadZone
              key={i}
              label={`Document ${i + 1}`}
              file={file}
              onFileSelect={(f) => setFileAt(i, f)}
              onRemoveSlot={() => removeSlot(i)}
              canRemoveSlot={files.length > 2}
            />
          ))}
          {files.length < MAX_DOCUMENTS && (
            <button className="add-slot-btn" onClick={addSlot}>
              <span className="add-icon">+</span>
              <span>Add Document</span>
            </button>
          )}
        </section>

        <div className="action-bar">
          <span className="upload-count">{uploadedCount} of {files.length} uploaded</span>
          <button
            className="reconcile-btn"
            disabled={!canReconcile}
            onClick={handleReconcile}
          >
            {loading ? 'Analyzing...' : 'Compare Documents'}
          </button>
        </div>

        {error && (
          <div className="error-banner">
            <p>{error}</p>
          </div>
        )}

        <ResultsTable results={results} documents={files} />
      </main>
    </div>
  )
}

export default App
