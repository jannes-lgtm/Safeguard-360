// Twilio webhook — receives inbound WhatsApp messages
// Set this URL in Twilio console: https://www.risk360.co/api/whatsapp-inbound
// Twilio sends POST with form-encoded body

import { createClient } from '@supabase/supabase-js'
import { sendWhatsApp } from './whatsapp-send.js'

function getSupabase() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed')

  // Twilio sends form-encoded data
  let body = ''
  await new Promise(resolve => { req.on('data', d => body += d); req.on('end', resolve) })
  const params = new URLSearchParams(body)

  const from = params.get('From') || ''        // e.g. whatsapp:+27821234567
  const messageBody = params.get('Body') || ''
  const numMedia = parseInt(params.get('NumMedia') || '0')

  const senderNumber = from.replace('whatsapp:', '')

  console.log('Inbound WhatsApp from', senderNumber, ':', messageBody)

  if (!messageBody.trim()) {
    return res.set('Content-Type', 'text/xml').send(twiml('Message received.'))
  }

  // Store as incident in Supabase
  const supabase = getSupabase()
  const { error } = await supabase.from('incidents').insert({
    reported_by: senderNumber,
    message: messageBody,
    source: 'whatsapp',
    status: 'Pending Review',
    created_at: new Date().toISOString(),
  })

  if (error) {
    console.error('Failed to store incident:', error.message)
  }

  // Notify admin (you) that a new incident was reported
  const adminNumber = process.env.ADMIN_WHATSAPP_NUMBER
  if (adminNumber) {
    await sendWhatsApp(
      adminNumber,
      `🚨 *New Incident Report*\nFrom: ${senderNumber}\n\n${messageBody}\n\n_Review at risk360.co/alerts_`
    )
  }

  // Acknowledge the sender
  return res.set('Content-Type', 'text/xml').send(
    twiml('✅ Thank you for your report. Our team will review and distribute this alert to affected travellers.')
  )
}

function twiml(message) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`
}
