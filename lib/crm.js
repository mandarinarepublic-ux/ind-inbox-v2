// lib/crm.js — lectura del Google Sheet de MANDARINACRM (ventas por WhatsApp).
// Reutiliza la MISMA Service Account (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY).
// Estructura CRM: fila1=título, fila2=headers, fila3=descripción, fila4+=datos.
import { google } from 'googleapis'
import { unstable_cache } from 'next/cache'

const CRM_SHEET_ID = process.env.MANDARINACRM_SHEET_ID || '13MiI4BPE247suz539TtObvS3L0SqhMu5KnvIg2YkAfs'

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
}

async function readCrmSheet(sheetName) {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: CRM_SHEET_ID, range: `${sheetName}!A:AZ` })
  return res.data.values || []
}

function rowsToObjects(rows) {
  const headers = rows[1] || []
  return rows.slice(3).map(r => {
    const o = {}
    headers.forEach((h, i) => { const k = String(h || '').trim(); if (k) o[k] = r[i] ?? '' })
    return o
  })
}

export const readCrmPedidos = unstable_cache(
  async () => rowsToObjects(await readCrmSheet('PEDIDOS')),
  ['crm:pedidos'], { revalidate: 60, tags: ['crm'] }
)
