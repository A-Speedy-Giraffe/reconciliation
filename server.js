import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { Dedalus } from 'dedalus-labs'

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))

const client = new Dedalus({
  apiKey: process.env.DEDALUS_API_KEY,
})

app.post('/api/reconcile', async (req, res) => {
  const { documents } = req.body

  if (!documents || documents.length < 2) {
    return res.status(400).json({ error: 'At least 2 documents are required' })
  }

  const documentList = documents
    .map((doc, i) => `--- Document ${i + 1}: "${doc.name}" ---\n${doc.content}`)
    .join('\n\n')

  try {
    const completion = await client.chat.completions.create({
      model: 'openai/gpt-5-nano',
      messages: [
        {
          role: 'system',
          content: `You are a financial document reconciliation assistant. You compare financial documents and identify discrepancies between them.

Analyze the provided documents and return a JSON array of discrepancies. Each discrepancy should have:
- "row": the row or line number where the discrepancy occurs
- "field": the field or column name (e.g., "Amount", "Date", "Reference")
- "documents": which documents conflict (e.g., "Doc 1 vs Doc 2")
- "values": the conflicting values separated by " / "
- "difference": a short description of the difference
- "severity": "high" for monetary discrepancies, "low" for formatting or minor issues

Return ONLY valid JSON — an array of objects. No markdown, no explanation.
If no discrepancies are found, return an empty array: []`,
        },
        {
          role: 'user',
          content: `Compare these financial documents and find all discrepancies:\n\n${documentList}`,
        },
      ],
    })

    const content = completion.choices[0]?.message?.content || '[]'
    const discrepancies = JSON.parse(content)
    res.json({ discrepancies })
  } catch (err) {
    console.error('Reconciliation error:', err)
    res.status(500).json({ error: 'Failed to analyze documents' })
  }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
