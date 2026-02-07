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

function ResultsTable({ results, onAnalyzeCauses, analyzingCauses, rootCauseAnalysis }) {
  if (!results) return null

  return (
    <div className="results-section">
      <div className="results-header">
        <h2>Discrepancies Found ({results.length})</h2>
        {results.length > 0 && (
          <button
            className="analyze-btn"
            onClick={onAnalyzeCauses}
            disabled={analyzingCauses}
          >
            {analyzingCauses ? 'Analyzing...' : '🔍 Analyze Root Causes'}
          </button>
        )}
      </div>
      {results.length === 0 ? (
        <div className="no-results">
          <p>No discrepancies detected. Documents match.</p>
        </div>
      ) : (
        <>
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
          {rootCauseAnalysis && (
            <div className="root-cause-analysis">
              <h3>Root Cause Analysis</h3>
              <div className="analysis-content">
                {rootCauseAnalysis.split('\n').map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function App() {
  const [activeTab, setActiveTab] = useState('home') // 'home', 'normal', or 'database'
  const [files, setFiles] = useState([null, null])
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Database mode state
  const [databaseDocs, setDatabaseDocs] = useState([])
  const [uploadDoc, setUploadDoc] = useState(null)
  const [compareDoc, setCompareDoc] = useState(null)
  const [uploadingFolder, setUploadingFolder] = useState(false)
  const [folderProgress, setFolderProgress] = useState({ current: 0, total: 0 })

  // Root cause analysis state
  const [tables, setTables] = useState(null)
  const [analyzingCauses, setAnalyzingCauses] = useState(false)
  const [rootCauseAnalysis, setRootCauseAnalysis] = useState(null)

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
    setRootCauseAnalysis(null)
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
      setTables(data.tables)
    } catch (err) {
      setError(err.message)
      setResults(null)
      setTables(null)
    } finally {
      setLoading(false)
    }
  }

  const canReconcile = uploadedCount >= 2 && !loading

  // Database mode functions
  const fetchDatabaseList = async () => {
    try {
      const res = await fetch('/api/database/list')
      const data = await res.json()
      setDatabaseDocs(data.documents)
    } catch (err) {
      console.error('Failed to fetch database list:', err)
    }
  }

  const handleAddToDatabase = async () => {
    if (!uploadDoc) return
    setLoading(true)
    setError(null)
    try {
      const base64 = await readFileAsBase64(uploadDoc)
      const res = await fetch('/api/database/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document: { name: uploadDoc.name, data: base64 },
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || `Server error (${res.status})`)
      }
      setUploadDoc(null)
      await fetchDatabaseList()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteFromDatabase = async (id) => {
    try {
      const res = await fetch(`/api/database/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || `Server error (${res.status})`)
      }
      await fetchDatabaseList()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleCompareWithDatabase = async () => {
    if (!compareDoc) return
    setLoading(true)
    setError(null)
    setRootCauseAnalysis(null)
    try {
      const base64 = await readFileAsBase64(compareDoc)
      const res = await fetch('/api/database/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document: { name: compareDoc.name, data: base64 },
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || `Server error (${res.status})`)
      }
      setResults(data.discrepancies)
      setTables(data.tables)
    } catch (err) {
      setError(err.message)
      setResults(null)
      setTables(null)
    } finally {
      setLoading(false)
    }
  }

  const handleFolderUpload = async (event) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return

    // Filter for supported file types
    const supportedFiles = files.filter(file => {
      const ext = file.name.split('.').pop().toLowerCase()
      return ['csv', 'xlsx', 'xls', 'pdf', 'json'].includes(ext)
    })

    if (supportedFiles.length === 0) {
      setError('No supported files found in folder. Please use CSV, Excel, PDF, or JSON files.')
      return
    }

    setUploadingFolder(true)
    setError(null)
    setFolderProgress({ current: 0, total: supportedFiles.length })

    let successCount = 0
    let failCount = 0
    const errors = []

    for (let i = 0; i < supportedFiles.length; i++) {
      const file = supportedFiles[i]
      setFolderProgress({ current: i + 1, total: supportedFiles.length })

      try {
        const base64 = await readFileAsBase64(file)
        const res = await fetch('/api/database/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            document: { name: file.name, data: base64 },
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.error || `Server error (${res.status})`)
        }
        successCount++
      } catch (err) {
        failCount++
        errors.push(`${file.name}: ${err.message}`)
        console.error(`Failed to upload ${file.name}:`, err)
      }
    }

    setUploadingFolder(false)
    setFolderProgress({ current: 0, total: 0 })
    await fetchDatabaseList()

    // Show summary
    if (failCount > 0) {
      setError(`Uploaded ${successCount} files. Failed: ${failCount}. Errors: ${errors.join('; ')}`)
    } else {
      // Clear any previous errors on success
      setError(null)
    }

    // Reset the file input
    event.target.value = ''
  }

  const handleAnalyzeCauses = async () => {
    if (!results || !tables) return
    setAnalyzingCauses(true)
    setError(null)
    try {
      const res = await fetch('/api/analyze-causes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discrepancies: results,
          tables: tables,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || `Server error (${res.status})`)
      }
      setRootCauseAnalysis(data.analysis)
    } catch (err) {
      setError(err.message)
    } finally {
      setAnalyzingCauses(false)
    }
  }

  const renderHomePage = () => (
    <div className="home-page">
      <div className="hero-section">
        <div className="hero-icon">
          <svg width="80" height="80" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="8" y="8" width="14" height="18" rx="2" fill="#10B981" opacity="0.9"/>
            <rect x="26" y="8" width="14" height="18" rx="2" fill="#3B82F6" opacity="0.9"/>
            <path d="M18 28 L30 28 M18 32 L30 32 M18 36 L30 36" stroke="#059669" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="24" cy="24" r="4" fill="#fff" stroke="#3B82F6" strokeWidth="2"/>
          </svg>
        </div>
        <h2 className="hero-title">Welcome to DocSync</h2>
        <p className="hero-description">
          Powerful AI-driven document reconciliation platform that automatically detects discrepancies
          across your financial documents. Choose your workflow to get started.
        </p>
      </div>

      <div className="mode-cards">
        <div className="mode-card">
          <div className="mode-icon">📄</div>
          <h3>Normal Mode</h3>
          <p>Compare 2-5 documents simultaneously in a single batch analysis</p>
          <ul className="feature-list">
            <li>Quick one-time comparisons</li>
            <li>Multi-document analysis</li>
            <li>Instant discrepancy detection</li>
          </ul>
          <button className="mode-btn normal-btn" onClick={() => setActiveTab('normal')}>
            Start Normal Mode
          </button>
        </div>

        <div className="mode-card featured">
          <div className="featured-badge">Popular</div>
          <div className="mode-icon">🗄️</div>
          <h3>Database Mode</h3>
          <p>Build a document library and compare new documents against your entire database</p>
          <ul className="feature-list">
            <li>Persistent document storage</li>
            <li>Folder batch uploads</li>
            <li>Compare vs entire database</li>
          </ul>
          <button className="mode-btn database-btn" onClick={() => setActiveTab('database')}>
            Start Database Mode
          </button>
        </div>
      </div>

      <div className="features-section">
        <h3>Why teams choose DocSync</h3>
        <p className="features-subtitle">
          Enterprise-grade document reconciliation powered by advanced AI technology
        </p>
        <div className="features-grid">
          <div className="feature-item">
            <div className="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4Z" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                <path d="M12 8V12L15 15" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="12" cy="12" r="2" fill="white"/>
              </svg>
            </div>
            <div className="feature-content">
              <h4>AI-Powered Analysis</h4>
              <p>Claude 4.5 intelligently extracts and compares numerical data across documents with unprecedented accuracy</p>
            </div>
          </div>
          <div className="feature-item">
            <div className="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="4" y="4" width="6" height="8" rx="1" stroke="white" strokeWidth="2"/>
                <rect x="14" y="4" width="6" height="8" rx="1" stroke="white" strokeWidth="2"/>
                <rect x="4" y="14" width="6" height="6" rx="1" stroke="white" strokeWidth="2"/>
                <rect x="14" y="14" width="6" height="6" rx="1" stroke="white" strokeWidth="2"/>
              </svg>
            </div>
            <div className="feature-content">
              <h4>Universal Format Support</h4>
              <p>Seamlessly process PDF, Excel, CSV, and JSON documents without manual conversion or preprocessing</p>
            </div>
          </div>
          <div className="feature-item">
            <div className="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="11" cy="11" r="7" stroke="white" strokeWidth="2"/>
                <path d="M18 18L21 21" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                <path d="M11 8V11L13 13" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="feature-content">
              <h4>Root Cause Analysis</h4>
              <p>Receive AI-powered insights into discrepancy origins, saving hours of manual investigation time</p>
            </div>
          </div>
          <div className="feature-item">
            <div className="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M7 12H17" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                <path d="M7 8H10" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                <path d="M14 8H17" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                <path d="M7 16H10" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                <path d="M14 16H17" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="12" cy="12" r="2" fill="white"/>
              </svg>
            </div>
            <div className="feature-content">
              <h4>Smart Field Matching</h4>
              <p>Advanced algorithms automatically match corresponding fields across different document formats and structures</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  const renderNormalMode = () => (
    <>
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

      <ResultsTable
        results={results}
        onAnalyzeCauses={handleAnalyzeCauses}
        analyzingCauses={analyzingCauses}
        rootCauseAnalysis={rootCauseAnalysis}
      />
    </>
  )

  const renderDatabaseMode = () => (
    <>
      <div className="database-layout">
        <section className="database-upload-section">
          <h3>Add to Database</h3>
          <FileUploadZone
            label="Upload Document"
            file={uploadDoc}
            onFileSelect={setUploadDoc}
            canRemoveSlot={false}
          />
          <button
            className="reconcile-btn"
            disabled={!uploadDoc || loading || uploadingFolder}
            onClick={handleAddToDatabase}
            style={{ marginTop: '1rem' }}
          >
            {loading ? 'Adding...' : 'Add to Database'}
          </button>

          <div className="folder-upload-section">
            <p className="folder-upload-label">Or upload an entire folder:</p>
            <label className="folder-upload-btn">
              <input
                type="file"
                webkitdirectory=""
                directory=""
                multiple
                onChange={handleFolderUpload}
                disabled={uploadingFolder || loading}
                hidden
              />
              {uploadingFolder ? (
                <span>Uploading {folderProgress.current} of {folderProgress.total}...</span>
              ) : (
                <span>📁 Upload Folder</span>
              )}
            </label>
          </div>
        </section>

        <section className="database-list-section">
          <h3>Database ({databaseDocs.length} documents)</h3>
          {databaseDocs.length === 0 ? (
            <div className="no-database-docs">
              <p>No documents in database. Add documents above.</p>
            </div>
          ) : (
            <div className="database-list">
              {databaseDocs.map((doc) => (
                <div key={doc.id} className="database-item">
                  <div className="database-item-info">
                    <span className="file-icon">&#128196;</span>
                    <div className="database-item-details">
                      <span className="database-item-name">{doc.name}</span>
                      <span className="database-item-meta">
                        {doc.rowCount} rows • {new Date(doc.uploadedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <button
                    className="remove-btn"
                    onClick={() => handleDeleteFromDatabase(doc.id)}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="compare-section">
        <h3>Compare Document</h3>
        <FileUploadZone
          label="Document to Compare"
          file={compareDoc}
          onFileSelect={setCompareDoc}
          canRemoveSlot={false}
        />
        <button
          className="reconcile-btn"
          disabled={!compareDoc || databaseDocs.length === 0 || loading}
          onClick={handleCompareWithDatabase}
          style={{ marginTop: '1rem' }}
        >
          {loading ? 'Comparing...' : 'Compare with Database'}
        </button>
      </section>

      {error && (
        <div className="error-banner">
          <p>{error}</p>
        </div>
      )}

      <ResultsTable
        results={results}
        onAnalyzeCauses={handleAnalyzeCauses}
        analyzingCauses={analyzingCauses}
        rootCauseAnalysis={rootCauseAnalysis}
      />
    </>
  )

  // Fetch database list when switching to database mode
  const handleTabChange = (tab) => {
    setActiveTab(tab)
    if (tab === 'database') {
      fetchDatabaseList()
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="logo-container">
          <svg className="logo" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="8" y="8" width="14" height="18" rx="2" fill="#10B981" opacity="0.9"/>
            <rect x="26" y="8" width="14" height="18" rx="2" fill="#3B82F6" opacity="0.9"/>
            <path d="M18 28 L30 28 M18 32 L30 32 M18 36 L30 36" stroke="#059669" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="24" cy="24" r="4" fill="#fff" stroke="#3B82F6" strokeWidth="2"/>
          </svg>
          <h1>DocSync</h1>
        </div>
        <p className="subtitle">Professional Document Reconciliation & Analysis Platform</p>
      </header>

      {activeTab !== 'home' && (
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'normal' ? 'active' : ''}`}
            onClick={() => handleTabChange('normal')}
          >
            Normal Mode
          </button>
          <button
            className={`tab ${activeTab === 'database' ? 'active' : ''}`}
            onClick={() => handleTabChange('database')}
          >
            Database Mode
          </button>
        </div>
      )}

      <main className="app-main">
        {activeTab === 'home' && renderHomePage()}
        {activeTab === 'normal' && renderNormalMode()}
        {activeTab === 'database' && renderDatabaseMode()}
      </main>
    </div>
  )
}

export default App
