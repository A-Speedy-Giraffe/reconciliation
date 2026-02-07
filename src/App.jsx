import { useState, useCallback, useEffect } from 'react'
import './App.css'

const MAX_DOCUMENTS = 5

const LOADING_MESSAGES = [
  'Reading documents',
  'Extracting data',
  'Comparing numbers',
  'Finding patterns',
  'Double checking',
  'Almost there',
  'Finalizing results',
  'Thinking deeply',
  'Crunching numbers',
  'Analyzing discrepancies',
]

function LoadingAnimation({ message = 'Processing' }) {
  const [messageIndex, setMessageIndex] = useState(0)
  const [dots, setDots] = useState('')

  useEffect(() => {
    const messageInterval = setInterval(() => {
      setMessageIndex(prev => (prev + 1) % LOADING_MESSAGES.length)
    }, 2000)

    const dotsInterval = setInterval(() => {
      setDots(prev => (prev.length >= 3 ? '' : prev + '.'))
    }, 400)

    return () => {
      clearInterval(messageInterval)
      clearInterval(dotsInterval)
    }
  }, [])

  return (
    <div className="loading-animation">
      <div className="loading-spinner"></div>
      <span className="loading-text">
        {LOADING_MESSAGES[messageIndex]}
        <span className="loading-dots">{dots}</span>
      </span>
    </div>
  )
}

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

function ResultsTable({ results, onAnalyzeCauses, analyzingIndex, rootCauseAnalyses }) {
  if (!results) return null

  return (
    <div className="results-section">
      <div className="results-header">
        <h2>Discrepancies Found ({results.length})</h2>
      </div>
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
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <>
                <tr key={i} className={`severity-${r.severity || 'low'}`}>
                  <td><span className={`severity-badge badge-${r.severity || 'low'}`}>{r.severity || 'low'}</span></td>
                  <td>{r.row}</td>
                  <td>{r.field}</td>
                  <td>{r.documents}</td>
                  <td>{r.values}</td>
                  <td className="diff-cell">{r.difference}</td>
                  <td>
                    <button
                      className="analyze-row-btn"
                      onClick={() => onAnalyzeCauses(i)}
                      disabled={analyzingIndex === i}
                    >
                      {analyzingIndex === i ? <LoadingAnimation /> : rootCauseAnalyses[i] ? '🔄 Re-analyze' : '🔍 Analyze'}
                    </button>
                  </td>
                </tr>
                {rootCauseAnalyses[i] && (
                  <tr key={`analysis-${i}`} className="analysis-row">
                    <td colSpan="7">
                      <div className="row-analysis">
                        <h4>Root Cause Analysis</h4>
                        <div className="analysis-content">
                          {rootCauseAnalyses[i].split('\n').map((line, j) => (
                            <p key={j}>{line}</p>
                          ))}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
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
  const [analyzingIndex, setAnalyzingIndex] = useState(null)
  const [rootCauseAnalyses, setRootCauseAnalyses] = useState({})

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
    setRootCauseAnalyses({})
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
    setRootCauseAnalyses({})
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

  const handleAnalyzeCauses = async (index) => {
    if (!results || !tables || index === undefined) return
    setAnalyzingIndex(index)
    setError(null)
    try {
      const res = await fetch('/api/analyze-causes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discrepancies: [results[index]], // Send only the specific discrepancy
          tables: tables,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || `Server error (${res.status})`)
      }
      setRootCauseAnalyses(prev => ({
        ...prev,
        [index]: data.analysis
      }))
    } catch (err) {
      setError(err.message)
    } finally {
      setAnalyzingIndex(null)
    }
  }

  const renderPaymentsPage = () => (
    <div className="payments-page">
      <div className="payments-hero">
        <h2 className="payments-title">Simple, Transparent Pricing</h2>
        <p className="payments-subtitle">
          Choose the plan that fits your reconciliation needs
        </p>
      </div>

      <div className="pricing-cards">
        <div className="pricing-card">
          <div className="pricing-header">
            <h3>Starter</h3>
            <div className="price">
              <span className="price-currency">$</span>
              <span className="price-amount">49</span>
              <span className="price-period">/month</span>
            </div>
          </div>
          <ul className="pricing-features">
            <li>Up to 100 documents/month</li>
            <li>QuickCompare mode</li>
            <li>Basic discrepancy detection</li>
            <li>Email support</li>
            <li>7-day data retention</li>
          </ul>
          <button className="pricing-btn starter-btn">Get Started</button>
        </div>

        <div className="pricing-card featured-pricing">
          <div className="featured-pricing-badge">Most Popular</div>
          <div className="pricing-header">
            <h3>Professional</h3>
            <div className="price">
              <span className="price-currency">$</span>
              <span className="price-amount">149</span>
              <span className="price-period">/month</span>
            </div>
          </div>
          <ul className="pricing-features">
            <li>Up to 500 documents/month</li>
            <li>QuickCompare + Library Mode</li>
            <li>AI root cause analysis</li>
            <li>Priority email support</li>
            <li>30-day data retention</li>
            <li>Folder batch uploads</li>
          </ul>
          <button className="pricing-btn professional-btn">Get Started</button>
        </div>

        <div className="pricing-card">
          <div className="pricing-header">
            <h3>Enterprise</h3>
            <div className="price">
              <span className="price-currency">$</span>
              <span className="price-amount">499</span>
              <span className="price-period">/month</span>
            </div>
          </div>
          <ul className="pricing-features">
            <li>Unlimited documents</li>
            <li>All features included</li>
            <li>Advanced AI analysis</li>
            <li>24/7 phone & email support</li>
            <li>Unlimited data retention</li>
            <li>Custom integrations</li>
            <li>Dedicated account manager</li>
          </ul>
          <button className="pricing-btn enterprise-btn">Contact Sales</button>
        </div>
      </div>

      <div className="payments-faq">
        <h3>Frequently Asked Questions</h3>
        <div className="faq-grid">
          <div className="faq-item">
            <h4>What payment methods do you accept?</h4>
            <p>We accept all major credit cards (Visa, MasterCard, Amex) and bank transfers for annual plans.</p>
          </div>
          <div className="faq-item">
            <h4>Can I change plans anytime?</h4>
            <p>Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately.</p>
          </div>
          <div className="faq-item">
            <h4>Is there a free trial?</h4>
            <p>We offer a 14-day free trial on all plans. No credit card required to start.</p>
          </div>
          <div className="faq-item">
            <h4>What happens if I exceed my document limit?</h4>
            <p>We'll notify you when you're approaching your limit. You can upgrade anytime or purchase additional documents.</p>
          </div>
        </div>
      </div>
    </div>
  )

  const renderContactUsPage = () => (
    <div className="contact-page">
      <div className="contact-hero">
        <h2 className="contact-title">Get in Touch</h2>
        <p className="contact-subtitle">
          Have questions? We'd love to hear from you.
        </p>
      </div>

      <div className="contact-layout">
        <div className="contact-info">
          <div className="contact-info-card">
            <div className="contact-icon">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 8L10.89 13.26C11.2187 13.4793 11.6049 13.5963 12 13.5963C12.3951 13.5963 12.7813 13.4793 13.11 13.26L21 8M5 19H19C19.5304 19 20.0391 18.7893 20.4142 18.4142C20.7893 18.0391 21 17.5304 21 17V7C21 6.46957 20.7893 5.96086 20.4142 5.58579C20.0391 5.21071 19.5304 5 19 5H5C4.46957 5 3.96086 5.21071 3.58579 5.58579C3.21071 5.96086 3 6.46957 3 7V17C3 17.5304 3.21071 18.0391 3.58579 18.4142C3.96086 18.7893 4.46957 19 5 19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h4>Email Us</h4>
            <p>support@docsync.com</p>
            <p className="contact-info-detail">We typically respond within 24 hours</p>
          </div>

          <div className="contact-info-card">
            <div className="contact-icon">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 5C3 3.89543 3.89543 3 5 3H8.27924C8.70967 3 9.09181 3.27543 9.22792 3.68377L10.7257 8.17721C10.8831 8.64932 10.6694 9.16531 10.2243 9.38787L7.96701 10.5165C9.06925 12.9612 11.0388 14.9308 13.4835 16.033L14.6121 13.7757C14.8347 13.3306 15.3507 13.1169 15.8228 13.2743L20.3162 14.7721C20.7246 14.9082 21 15.2903 21 15.7208V19C21 20.1046 20.1046 21 19 21H18C9.71573 21 3 14.2843 3 6V5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h4>Call Us</h4>
            <p>+1 (555) 123-4567</p>
            <p className="contact-info-detail">Mon-Fri, 9am-6pm EST</p>
          </div>

          <div className="contact-info-card">
            <div className="contact-icon">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.657 16.657L13.414 20.9C13.039 21.2746 12.5306 21.4851 12 21.4851C11.4694 21.4851 10.961 21.2746 10.586 20.9L6.343 16.657C5.22422 15.5381 4.46234 14.1127 4.15369 12.5608C3.84504 11.009 4.00349 9.40047 4.60901 7.93853C5.21452 6.4766 6.2399 5.22726 7.55548 4.34824C8.87107 3.46921 10.4178 3 12 3C13.5822 3 15.1289 3.46921 16.4445 4.34824C17.7601 5.22726 18.7855 6.4766 19.391 7.93853C19.9965 9.40047 20.155 11.009 19.8463 12.5608C19.5377 14.1127 18.7758 15.5381 17.657 16.657Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M12 13C13.1046 13 14 12.1046 14 11C14 9.89543 13.1046 9 12 9C10.8954 9 10 9.89543 10 11C10 12.1046 10.8954 13 12 13Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h4>Visit Us</h4>
            <p>123 Finance Street</p>
            <p className="contact-info-detail">San Francisco, CA 94105</p>
          </div>
        </div>

        <div className="contact-form-container">
          <form className="contact-form">
            <div className="form-group">
              <label htmlFor="name">Name</label>
              <input type="text" id="name" name="name" required />
            </div>
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input type="email" id="email" name="email" required />
            </div>
            <div className="form-group">
              <label htmlFor="subject">Subject</label>
              <input type="text" id="subject" name="subject" required />
            </div>
            <div className="form-group">
              <label htmlFor="message">Message</label>
              <textarea id="message" name="message" rows="6" required></textarea>
            </div>
            <button type="submit" className="contact-submit-btn">Send Message</button>
          </form>
        </div>
      </div>
    </div>
  )

  const renderAboutPage = () => (
    <div className="about-page">
      <div className="about-hero">
        <h2 className="about-title">About DocSync</h2>
        <p className="about-subtitle">
          AI-powered document reconciliation for modern finance teams
        </p>
      </div>

      <div className="about-content">
        <section className="about-section">
          <h3>Our Mission</h3>
          <p>
            DocSync was built to eliminate the tedious, error-prone process of manually comparing financial documents.
            We leverage advanced AI technology to automate reconciliation, saving finance teams countless hours while
            improving accuracy and reducing risk.
          </p>
        </section>

        <section className="about-section">
          <h3>How It Works</h3>
          <p>
            Our two-step AI pipeline uses Claude 4.5 to first extract numerical data from your documents, then
            intelligently compares them to identify discrepancies. The system understands different file formats,
            document structures, and can even provide root cause analysis for the differences it finds.
          </p>
        </section>

        <section className="about-section">
          <h3>Technology</h3>
          <p>
            Built with React and powered by Anthropic's Claude 4.5, DocSync processes PDF, Excel, CSV, and JSON
            files with high accuracy. Our system handles complex reconciliation scenarios including timing differences,
            format inconsistencies, and multi-document comparisons.
          </p>
        </section>

        <section className="about-section">
          <h3>Use Cases</h3>
          <ul className="about-list">
            <li>Bank statement reconciliation</li>
            <li>Invoice verification</li>
            <li>Payment confirmation matching</li>
            <li>Financial report validation</li>
            <li>Audit preparation and support</li>
            <li>Multi-system data consistency checks</li>
          </ul>
        </section>

        <section className="about-section">
          <h3>Get Started</h3>
          <p>
            Ready to streamline your reconciliation process? Choose between QuickCompare for instant document comparisons
            or Library Mode to build a persistent document library. Both modes feature our AI-powered root
            cause analysis to help you understand and resolve discrepancies faster.
          </p>
          <div className="about-cta">
            <button className="mode-btn normal-btn" onClick={() => setActiveTab('normal')}>
              Try QuickCompare
            </button>
            <button className="mode-btn database-btn" onClick={() => setActiveTab('database')}>
              Try Library Mode
            </button>
          </div>
        </section>
      </div>
    </div>
  )

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
          <div className="mode-icon">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="iconGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#3B82F6"/>
                  <stop offset="100%" stopColor="#10B981"/>
                </linearGradient>
              </defs>
              <rect x="3" y="4" width="8" height="11" rx="1.5" strokeWidth="2"/>
              <rect x="13" y="4" width="8" height="11" rx="1.5" strokeWidth="2"/>
              <path d="M6 7H8M6 9H8M6 11H8" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M16 7H18M16 9H18M16 11H18" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M3 18L10 18L12 21L14 18L21 18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h3>QuickCompare</h3>
          <p>Compare 2-5 documents simultaneously in a single batch analysis</p>
          <ul className="feature-list">
            <li>Quick one-time comparisons</li>
            <li>Multi-document analysis</li>
            <li>Instant discrepancy detection</li>
          </ul>
          <button className="mode-btn normal-btn" onClick={() => setActiveTab('normal')}>
            Start QuickCompare
          </button>
        </div>

        <div className="mode-card featured">
          <div className="featured-badge">Popular</div>
          <div className="mode-icon">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="iconGradient2" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#3B82F6"/>
                  <stop offset="100%" stopColor="#10B981"/>
                </linearGradient>
              </defs>
              <rect x="4" y="3" width="16" height="4" rx="1" stroke="url(#iconGradient2)" strokeWidth="2"/>
              <rect x="4" y="9" width="16" height="4" rx="1" stroke="url(#iconGradient2)" strokeWidth="2"/>
              <rect x="4" y="15" width="16" height="4" rx="1" stroke="url(#iconGradient2)" strokeWidth="2"/>
              <circle cx="7" cy="5" r="0.5" fill="url(#iconGradient2)"/>
              <circle cx="7" cy="11" r="0.5" fill="url(#iconGradient2)"/>
              <circle cx="7" cy="17" r="0.5" fill="url(#iconGradient2)"/>
              <path d="M10 5H17M10 11H17M10 17H17" stroke="url(#iconGradient2)" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <h3>Library Mode</h3>
          <p>Build a document library and compare new documents against your entire collection</p>
          <ul className="feature-list">
            <li>Persistent document storage</li>
            <li>Folder batch uploads</li>
            <li>Compare vs entire library</li>
          </ul>
          <button className="mode-btn database-btn" onClick={() => setActiveTab('database')}>
            Start Library Mode
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
          {loading ? <LoadingAnimation /> : 'Compare Documents'}
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
        analyzingIndex={analyzingIndex}
        rootCauseAnalyses={rootCauseAnalyses}
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
            {loading ? <LoadingAnimation /> : 'Add to Database'}
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
                <div className="folder-upload-progress">
                  <LoadingAnimation />
                  <span className="folder-upload-count">
                    {folderProgress.current} of {folderProgress.total} files
                  </span>
                </div>
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
          {loading ? <LoadingAnimation /> : 'Compare with Database'}
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
        analyzingIndex={analyzingIndex}
        rootCauseAnalyses={rootCauseAnalyses}
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
        <div className="logo-container" onClick={() => handleTabChange('home')} style={{ cursor: 'pointer' }}>
          <svg className="logo" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="8" y="8" width="14" height="18" rx="2" fill="#10B981" opacity="0.9"/>
            <rect x="26" y="8" width="14" height="18" rx="2" fill="#3B82F6" opacity="0.9"/>
            <path d="M18 28 L30 28 M18 32 L30 32 M18 36 L30 36" stroke="#059669" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="24" cy="24" r="4" fill="#fff" stroke="#3B82F6" strokeWidth="2"/>
          </svg>
          <h1>DocSync</h1>
        </div>

        <div className="tabs">
          <button
            className={`tab ${activeTab === 'home' ? 'active' : ''}`}
            onClick={() => handleTabChange('home')}
          >
            Home
          </button>
          <button
            className={`tab ${activeTab === 'normal' ? 'active' : ''}`}
            onClick={() => handleTabChange('normal')}
          >
            QuickCompare
          </button>
          <button
            className={`tab ${activeTab === 'database' ? 'active' : ''}`}
            onClick={() => handleTabChange('database')}
          >
            Library Mode
          </button>
          <button
            className={`tab ${activeTab === 'about' ? 'active' : ''}`}
            onClick={() => handleTabChange('about')}
          >
            About
          </button>
          <button
            className={`tab ${activeTab === 'payments' ? 'active' : ''}`}
            onClick={() => handleTabChange('payments')}
          >
            Pricing
          </button>
          <button
            className={`tab ${activeTab === 'contact' ? 'active' : ''}`}
            onClick={() => handleTabChange('contact')}
          >
            Contact
          </button>
        </div>
      </header>

      <main className="app-main">
        {activeTab === 'home' && renderHomePage()}
        {activeTab === 'normal' && renderNormalMode()}
        {activeTab === 'database' && renderDatabaseMode()}
        {activeTab === 'about' && renderAboutPage()}
        {activeTab === 'payments' && renderPaymentsPage()}
        {activeTab === 'contact' && renderContactUsPage()}
      </main>
    </div>
  )
}

export default App
