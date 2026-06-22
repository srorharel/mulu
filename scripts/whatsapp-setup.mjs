#!/usr/bin/env node
// scripts/whatsapp-setup.mjs
//
// One-off helper to drive the Meta WhatsApp Cloud API while wiring up the
// registration OTP feature (see supabase/functions/_shared/sms.ts, provider
// 'whatsapp'). It NEVER takes the token on the command line or from source — it
// reads credentials from the environment, or from a local *gitignored* file
// `scripts/.wa-secrets.json`, so the secret stays on your machine and out of
// shell history and chat transcripts.
//
// Credentials (env var  ||  key in scripts/.wa-secrets.json):
//   WHATSAPP_TOKEN            token         (required) — Meta access token
//   WHATSAPP_PHONE_NUMBER_ID  phoneNumberId            — "Phone number ID" from API Setup
//   WHATSAPP_WABA_ID          wabaId                   — WhatsApp Business Account ID
//   WHATSAPP_TEMPLATE_NAME    templateName  (default 'mulu_otp')
//   WHATSAPP_TEMPLATE_LANG    templateLang  (default 'he')
//   WHATSAPP_GRAPH_VERSION    graphVersion  (default 'v21.0')
//
// Commands:
//   node scripts/whatsapp-setup.mjs test <to>         # send sample hello_world (proves the pipe)
//   node scripts/whatsapp-setup.mjs create-template   # submit the Hebrew AUTHENTICATION OTP template
//   node scripts/whatsapp-setup.mjs list-templates    # list your templates + approval status
//   node scripts/whatsapp-setup.mjs send <to> [code]  # send the real OTP template (once APPROVED)
//
// <to> is an Israeli mobile in any format; it is normalised to digits (9725XXXXXXXX).

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadConfig() {
  let file = {}
  try {
    file = JSON.parse(readFileSync(join(__dirname, '.wa-secrets.json'), 'utf8'))
  } catch {
    /* optional — env vars take precedence and the file may not exist */
  }
  const pick = (envKey, fileKey, def) => process.env[envKey] ?? file[fileKey] ?? def
  return {
    token: pick('WHATSAPP_TOKEN', 'token'),
    phoneNumberId: pick('WHATSAPP_PHONE_NUMBER_ID', 'phoneNumberId'),
    wabaId: pick('WHATSAPP_WABA_ID', 'wabaId'),
    templateName: pick('WHATSAPP_TEMPLATE_NAME', 'templateName', 'mulu_otp'),
    templateLang: pick('WHATSAPP_TEMPLATE_LANG', 'templateLang', 'he'),
    graphVersion: pick('WHATSAPP_GRAPH_VERSION', 'graphVersion', 'v21.0'),
  }
}

const cfg = loadConfig()
const API = `https://graph.facebook.com/${cfg.graphVersion}`
const toDigits = (s) => String(s || '').replace(/\D/g, '')

function need(...keys) {
  const missing = keys.filter((k) => !cfg[k])
  if (missing.length) {
    console.error(`✗ Missing credentials: ${missing.join(', ')}`)
    console.error('  Provide them as env vars, or in scripts/.wa-secrets.json (gitignored).')
    process.exit(1)
  }
}

async function api(path, body) {
  const res = await fetch(`${API}/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text }
  }
  return { ok: res.ok, status: res.status, json }
}

function report(ok, status, json, okMsg) {
  if (ok) {
    if (okMsg) console.log(`✓ ${okMsg}`)
    console.log(JSON.stringify(json, null, 2))
  } else {
    console.error(`✗ HTTP ${status}`)
    console.error(JSON.stringify(json, null, 2))
    process.exit(1)
  }
}

// Send the pre-approved English sample template — the quickest end-to-end pipe test.
async function cmdTest(to) {
  need('token', 'phoneNumberId')
  if (!to) return usage()
  const { ok, status, json } = await api(`${cfg.phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    to: toDigits(to),
    type: 'template',
    template: { name: 'hello_world', language: { code: 'en_US' } },
  })
  report(ok, status, json, `Sent sample hello_world to ${toDigits(to)} — check WhatsApp.`)
}

// Submit the real Hebrew OTP template. AUTHENTICATION category: Meta supplies the
// standardized localized body itself; we only configure the copy-code button +
// 10-minute expiry (matches send-otp's CODE_TTL_MIN) + the security line.
async function cmdCreateTemplate() {
  need('token', 'wabaId')
  const { ok, status, json } = await api(`${cfg.wabaId}/message_templates`, {
    name: cfg.templateName,
    language: cfg.templateLang,
    category: 'AUTHENTICATION',
    components: [
      { type: 'BODY', add_security_recommendation: true },
      { type: 'FOOTER', code_expiration_minutes: 10 },
      { type: 'BUTTONS', buttons: [{ type: 'OTP', otp_type: 'COPY_CODE', text: 'העתקת הקוד' }] },
    ],
  })
  report(
    ok,
    status,
    json,
    `Submitted template "${cfg.templateName}" (${cfg.templateLang}). ` +
      `Run "list-templates" until its status is APPROVED.`,
  )
}

async function cmdListTemplates() {
  need('token', 'wabaId')
  const { ok, status, json } = await api(
    `${cfg.wabaId}/message_templates?fields=name,language,category,status&limit=100`,
  )
  if (ok && Array.isArray(json.data)) {
    console.log('\nTemplates on this WhatsApp Business Account:')
    if (!json.data.length) console.log('  (none yet)')
    for (const t of json.data) {
      console.log(`  • ${t.name} [${t.language}]  ${t.category}  →  ${t.status}`)
    }
    console.log()
  } else {
    report(ok, status, json)
  }
}

// Send the real OTP template with a dummy code — verifies the approved template
// renders correctly end-to-end. The live app does this from the send-otp Edge Fn.
async function cmdSend(to, code = '123456') {
  need('token', 'phoneNumberId')
  if (!to) return usage()
  const { ok, status, json } = await api(`${cfg.phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    to: toDigits(to),
    type: 'template',
    template: {
      name: cfg.templateName,
      language: { code: cfg.templateLang },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: code }] },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
      ],
    },
  })
  report(ok, status, json, `Sent OTP template "${cfg.templateName}" (code ${code}) to ${toDigits(to)}.`)
}

function usage() {
  console.error('Commands:')
  console.error('  node scripts/whatsapp-setup.mjs test <to>')
  console.error('  node scripts/whatsapp-setup.mjs create-template')
  console.error('  node scripts/whatsapp-setup.mjs list-templates')
  console.error('  node scripts/whatsapp-setup.mjs send <to> [code]')
  process.exit(1)
}

const [cmd, ...rest] = process.argv.slice(2)
const commands = {
  test: () => cmdTest(rest[0]),
  'create-template': cmdCreateTemplate,
  'list-templates': cmdListTemplates,
  send: () => cmdSend(rest[0], rest[1]),
}
;(commands[cmd] ?? usage)()
