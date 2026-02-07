import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import Dedalus from 'dedalus-labs'
import * as XLSX from 'xlsx'
import { PDFParse } from 'pdf-parse'

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))

const MODEL = 'anthropic/claude-sonnet-4-5-20250929'

const client = new Dedalus({
  apiKey: process.env.DEDALUS_API_KEY,
  timeout: 60000,
})

// In-memory database for storing extracted tables
let database = []
let nextId = 1

function extractJSON(text) {
  // Try to extract from code fences anywhere in the text
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (fenceMatch) {
    return fenceMatch[1].trim()
  }
  // Find the outermost JSON array boundaries
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start !== -1 && end > start) {
    return text.slice(start, end + 1)
  }
  return text.trim()
}

// Parse uploaded file content (base64) into readable text based on file extension
async function parseDocument(name, base64Data) {
  const ext = name.split('.').pop().toLowerCase()
  const buffer = Buffer.from(base64Data, 'base64')

  switch (ext) {
    case 'csv':
    case 'json':
    case 'txt':
      return buffer.toString('utf-8')

    case 'xlsx':
    case 'xls': {
      const workbook = XLSX.read(buffer)
      return workbook.SheetNames
        .map((sheetName) => {
          const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName])
          return workbook.SheetNames.length > 1
            ? `--- Sheet: ${sheetName} ---\n${csv}`
            : csv
        })
        .join('\n\n')
    }

    case 'pdf': {
      const parser = new PDFParse({ data: new Uint8Array(buffer) })
      const result = await parser.getText()
      await parser.destroy()
      return result.text
    }

    default:
      return buffer.toString('utf-8')
  }
}

// Step 1: Extract numerical data from a single document into a structured table
async function extractTable(doc, index) {
  console.log(`  [Step 1] Extracting numbers from Doc ${index + 1}: "${doc.name}"...`)

  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `You extract numerical and financial data from documents into a structured JSON table.

From the document provided, extract every row that contains numerical data (monetary amounts, quantities, dates, percentages, totals, reference/invoice numbers).

Return a JSON array of objects. Each object should have:
- "row": the row or line number in the original document
- "label": what the number represents (e.g., "Invoice Total", "Tax", "Quantity", "Payment Date")
- "value": the exact value as it appears (e.g., "$1,510.00", "2025-01-15", "42")

Return ONLY a valid JSON array. No markdown, no code fences, no explanation.
If no numerical data is found, return: []`,
      },
      {
        role: 'user',
        content: doc.content,
      },
    ],
  })

  const raw = completion.choices?.[0]?.message?.content
  if (!raw) {
    console.error(`  [Step 1] No content for Doc ${index + 1}`)
    throw new Error(`AI returned no content for document "${doc.name}"`)
  }

  console.log(`  [Step 1] Doc ${index + 1} raw response:`, raw)
  let parsed
  try {
    parsed = JSON.parse(extractJSON(raw))
  } catch (e) {
    console.error(`  [Step 1] Failed to parse JSON for Doc ${index + 1}:`, raw)
    throw new Error(`Failed to parse AI response for "${doc.name}": ${e.message}`)
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`AI returned non-array for "${doc.name}": ${typeof parsed}`)
  }
  console.log(`  [Step 1] Doc ${index + 1}: extracted ${parsed.length} rows`)
  return parsed
}

// Step 2: Compare extracted tables and find discrepancies
async function findDiscrepancies(tables) {
  console.log(`  [Step 2] Comparing ${tables.length} extracted tables...`)

  const tablesText = tables
    .map((t) => `--- ${t.name} ---\n${JSON.stringify(t.rows, null, 2)}`)
    .join('\n\n')

  const documentNames = tables.map((t) => t.name).join(', ')

  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `You are given structured numerical data extracted from multiple financial documents. Each document's data is a JSON array of rows with "row", "label", and "value" fields.

The documents you are comparing are: ${documentNames}

Compare the data across ALL documents. Find ONLY cases where:
- The same line item / label exists in MULTIPLE documents AND has a DIFFERENT value
- IGNORE line items that exist in one document but are missing from others (e.g., opening balance on bank statement but not in bookkeeping)
- ONLY report discrepancies where matching labels/fields have different numerical values

For each discrepancy, return a JSON object with:
- "row": the row number(s) involved
- "field": the label/field name
- "documents": which documents differ - USE THE ACTUAL DOCUMENT NAMES including file extensions (e.g., "invoice.pdf vs statement.xlsx", NOT "Doc 1 vs Doc 2")
- "values": the conflicting values separated by " / "
- "difference": a short description of the numerical difference
- "severity": "high" for monetary/quantity differences, "medium" for date differences, "low" for reference number differences

IMPORTANT: Always use the actual document filenames in the "documents" field. Never use generic names like "Doc 1" or "Document 1".

Return ONLY a valid JSON array. No markdown, no code fences, no explanation.
If the data matches perfectly across all documents, return: []`,
      },
      {
        role: 'user',
        content: `Compare these extracted tables and list all discrepancies:\n\n${tablesText}`,
      },
    ],
  })

  const raw = completion.choices?.[0]?.message?.content
  if (!raw) {
    console.error('  [Step 2] No content in comparison response')
    throw new Error('AI returned no content during comparison step')
  }

  console.log('  [Step 2] Comparison raw response:', raw)
  let parsed
  try {
    parsed = JSON.parse(extractJSON(raw))
  } catch (e) {
    console.error('  [Step 2] Failed to parse JSON:', raw)
    throw new Error(`Failed to parse comparison response: ${e.message}`)
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`AI returned non-array in comparison: ${typeof parsed}`)
  }
  console.log(`  [Step 2] Found ${parsed.length} discrepancies`)
  return parsed
}

// Database Mode: Add a document to the database
app.post('/api/database/add', async (req, res) => {
  const { document } = req.body

  if (!document || !document.name || !document.data) {
    return res.status(400).json({ error: 'Document with name and data is required' })
  }

  console.log(`\n=== Adding document to database: "${document.name}" ===`)

  try {
    // Parse the document
    const content = await parseDocument(document.name, document.data)
    console.log(`  Parsed: ${content.length} chars`)

    // Extract table (Step 1 only)
    console.log('  Extracting numerical data...')
    const rows = await extractTable({ name: document.name, content }, 0)

    // Store in database
    const entry = {
      id: nextId++,
      name: document.name,
      uploadedAt: new Date().toISOString(),
      rows,
    }
    database.push(entry)

    console.log(`  Added to database with ID ${entry.id} (${rows.length} rows)`)
    res.json({ success: true, entry })
  } catch (err) {
    console.error('Database add error:', err)
    res.status(500).json({ error: `Failed to add document: ${err.message}` })
  }
})

// Database Mode: Get all documents in database
app.get('/api/database/list', (req, res) => {
  const list = database.map(({ id, name, uploadedAt, rows }) => ({
    id,
    name,
    uploadedAt,
    rowCount: rows.length,
  }))
  res.json({ documents: list })
})

// Database Mode: Delete a document from database
app.delete('/api/database/:id', (req, res) => {
  const id = parseInt(req.params.id)
  const index = database.findIndex((doc) => doc.id === id)

  if (index === -1) {
    return res.status(404).json({ error: 'Document not found' })
  }

  const deleted = database.splice(index, 1)[0]
  console.log(`  Deleted document ID ${id}: "${deleted.name}"`)
  res.json({ success: true, deleted })
})

// Database Mode: Compare a document against all in database
app.post('/api/database/compare', async (req, res) => {
  const { document } = req.body

  if (!document || !document.name || !document.data) {
    return res.status(400).json({ error: 'Document with name and data is required' })
  }

  if (database.length === 0) {
    return res.status(400).json({ error: 'Database is empty. Add documents first.' })
  }

  console.log(`\n=== Comparing "${document.name}" against ${database.length} database documents ===`)

  try {
    // Parse and extract the compare document
    const content = await parseDocument(document.name, document.data)
    const compareRows = await extractTable({ name: document.name, content }, 0)
    console.log(`  Compare doc: ${compareRows.length} rows extracted`)

    // Build tables array: compare document + all database documents
    const tables = [
      { name: `${document.name} (Compare)`, rows: compareRows },
      ...database.map((doc) => ({ name: doc.name, rows: doc.rows })),
    ]

    // Step 2: Find discrepancies
    console.log('\n--- Finding discrepancies ---')
    const discrepancies = await findDiscrepancies(tables)

    res.json({ tables, discrepancies })
  } catch (err) {
    console.error('Database compare error:', err)
    res.status(500).json({ error: `Failed to compare document: ${err.message}` })
  }
})

// Normal Mode: Reconcile multiple documents
app.post('/api/reconcile', async (req, res) => {
  const { documents } = req.body

  if (!documents || documents.length < 2) {
    return res.status(400).json({ error: 'At least 2 documents are required' })
  }

  console.log(`\n=== Reconcile request: ${documents.length} documents ===`)

  try {
    // Parse file content from base64 into readable text
    const parsedDocs = await Promise.all(
      documents.map(async (doc) => ({
        name: doc.name,
        content: await parseDocument(doc.name, doc.data),
      }))
    )
    parsedDocs.forEach((doc, i) => {
      console.log(`  Doc ${i + 1}: "${doc.name}" (${doc.content.length} chars)`)
    })

    // Step 1: Extract tables from each document in parallel
    console.log('\n--- Step 1: Extracting numerical data ---')
    const tables = await Promise.all(
      parsedDocs.map(async (doc, i) => ({
        name: doc.name,
        rows: await extractTable(doc, i),
      }))
    )

    // Log the extracted data
    tables.forEach((t, i) => {
      console.log(`\n  Doc ${i + 1} ("${t.name}") extracted data:`)
      console.log('  ', JSON.stringify(t.rows))
    })

    // Step 2: Compare the tables
    console.log('\n--- Step 2: Finding discrepancies ---')
    const discrepancies = await findDiscrepancies(tables)

    res.json({ tables, discrepancies })
  } catch (err) {
    console.error('Reconciliation error:', err)
    res.status(500).json({ error: `Failed to analyze documents: ${err.message}` })
  }
})

// Analyze root causes of discrepancies
app.post('/api/analyze-causes', async (req, res) => {
  const { discrepancies, tables } = req.body

  if (!discrepancies || !Array.isArray(discrepancies)) {
    return res.status(400).json({ error: 'Discrepancies array is required' })
  }

  if (!tables || !Array.isArray(tables)) {
    return res.status(400).json({ error: 'Tables array is required' })
  }

  if (discrepancies.length === 0) {
    return res.status(400).json({ error: 'No discrepancies to analyze' })
  }

  console.log(`\n=== Analyzing root causes for ${discrepancies.length} discrepancies ===`)

  try {
    const discrepanciesText = JSON.stringify(discrepancies, null, 2)
    const tablesText = tables
      .map((t) => `--- ${t.name} ---\n${JSON.stringify(t.rows, null, 2)}`)
      .join('\n\n')

    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: `You are a financial reconciliation expert analyzing discrepancies between financial documents.

Given the discrepancies found and the original data, provide a CONCISE analysis with EXACTLY 3 bullet points total.

Consider these common reconciliation challenges when analyzing:
- **Timing Differences**: Transactions recorded at different times (e.g., in-transit deposits, outstanding checks, cutoff timing)
- **Data Entry Errors**: Manual entry mistakes, transposed digits, incorrect amounts
- **Format Inconsistencies**: Different file formats (SWIFT, ACH, BAI), varying transaction descriptions, standardization issues
- **Multiple Account Complexity**: Different banking partners, multiple accounts, currency conversions
- **Rounding & Precision**: Different decimal places, rounding methods between systems
- **Transaction Matching Issues**: Duplicates, reversals, split transactions, batch processing differences
- **Missing/Extra Transactions**: Unrecorded items, bank fees, interest, adjustments
- **System Integration Problems**: Different accounting methods, software limitations, data quality issues
- **High Volume Pressure**: Manual processing errors due to tight deadlines and large transaction volumes

Format your response as EXACTLY 3 bullet points:
• [Most likely root cause and what to check]
• [Second most likely cause and recommended action]
• [Additional consideration or verification step]

Keep each bullet point to 1-2 sentences maximum. Be specific and actionable.`,
        },
        {
          role: 'user',
          content: `Here are the discrepancies found:\n\n${discrepanciesText}\n\nHere is the original data from all documents:\n\n${tablesText}\n\nPlease analyze these discrepancies and suggest potential root causes.`,
        },
      ],
    })

    const analysis = completion.choices?.[0]?.message?.content
    if (!analysis) {
      throw new Error('AI returned no content for root cause analysis')
    }

    console.log('  Root cause analysis generated')
    res.json({ analysis })
  } catch (err) {
    console.error('Root cause analysis error:', err)
    res.status(500).json({ error: `Failed to analyze root causes: ${err.message}` })
  }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
