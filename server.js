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
    .map((t, i) => `--- Document ${i + 1} ---\n${JSON.stringify(t.rows, null, 2)}`)
    .join('\n\n')

  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `You are given structured numerical data extracted from multiple financial documents. Each document's data is a JSON array of rows with "row", "label", and "value" fields.

Compare the data across ALL documents. Find ONLY cases where:
- The same line item / label exists in MULTIPLE documents AND has a DIFFERENT value
- IGNORE line items that exist in one document but are missing from others (e.g., opening balance on bank statement but not in bookkeeping)
- ONLY report discrepancies where matching labels/fields have different numerical values

For each discrepancy, return a JSON object with:
- "row": the row number(s) involved
- "field": the label/field name
- "documents": which documents differ (e.g., "Doc 1 vs Doc 2")
- "values": the conflicting values separated by " / "
- "difference": a short description of the numerical difference
- "severity": "high" for monetary/quantity differences, "medium" for date differences, "low" for reference number differences

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

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
