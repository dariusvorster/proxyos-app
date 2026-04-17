import { createTransport } from 'nodemailer'
import { eq } from 'drizzle-orm'
import { getDb, systemSettings } from '@proxyos/db'

export interface SmtpConfig {
  host: string
  port: number
  secure: boolean   // true = port 465 (TLS), false = STARTTLS/plain
  user: string
  pass: string
  from: string
  to: string        // comma-separated recipient addresses
}

export interface NotifyConfig {
  smtp: SmtpConfig | null
  webhookUrl: string | null
}

async function loadConfig(): Promise<NotifyConfig> {
  const db = getDb()
  const [smtpRow, webhookRow] = await Promise.all([
    db.select().from(systemSettings).where(eq(systemSettings.key, 'alert_smtp')).get(),
    db.select().from(systemSettings).where(eq(systemSettings.key, 'alert_webhook')).get(),
  ])

  let smtp: SmtpConfig | null = null
  if (smtpRow?.value) {
    try {
      smtp = JSON.parse(smtpRow.value) as SmtpConfig
    } catch { /* ignore */ }
  }

  return {
    smtp: smtp && smtp.host && smtp.to ? smtp : null,
    webhookUrl: webhookRow?.value ?? null,
  }
}

export async function sendAlertNotifications(params: {
  ruleName: string
  message: string
  detail?: Record<string, unknown>
}): Promise<void> {
  const config = await loadConfig()
  const { ruleName, message, detail } = params

  await Promise.allSettled([
    config.smtp ? sendEmail(config.smtp, ruleName, message, detail) : Promise.resolve(),
    config.webhookUrl ? sendWebhook(config.webhookUrl, ruleName, message, detail) : Promise.resolve(),
  ])
}

async function sendEmail(
  smtp: SmtpConfig,
  ruleName: string,
  message: string,
  detail?: Record<string, unknown>,
): Promise<void> {
  const transport = createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
  })

  const detailText = detail ? `\n\nDetail:\n${JSON.stringify(detail, null, 2)}` : ''
  const recipients = smtp.to.split(',').map((s) => s.trim()).filter(Boolean)

  await transport.sendMail({
    from: smtp.from || smtp.user,
    to: recipients.join(', '),
    subject: `[ProxyOS Alert] ${ruleName}`,
    text: `Alert fired: ${message}${detailText}\n\n— ProxyOS`,
    html: `
      <p><strong>Alert:</strong> ${htmlEscape(ruleName)}</p>
      <p>${htmlEscape(message)}</p>
      ${detail ? `<pre style="background:#f5f5f5;padding:12px;border-radius:4px">${htmlEscape(JSON.stringify(detail, null, 2))}</pre>` : ''}
      <p style="color:#999;font-size:12px">Sent by ProxyOS</p>
    `,
  })
}

async function sendWebhook(
  url: string,
  ruleName: string,
  message: string,
  detail?: Record<string, unknown>,
): Promise<void> {
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: 'proxyos',
      event: 'alert.fired',
      rule: ruleName,
      message,
      detail: detail ?? null,
      firedAt: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(10_000),
  })
}

function htmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Send a test email using provided config (used by settings page) */
export async function sendTestEmail(smtp: SmtpConfig): Promise<void> {
  await sendEmail(smtp, 'Test alert', 'This is a test alert from ProxyOS. If you see this, email delivery is working.')
}

/** Send a test webhook (used by settings page) */
export async function sendTestWebhook(url: string): Promise<void> {
  await sendWebhook(url, 'Test alert', 'This is a test alert from ProxyOS. If you see this, webhook delivery is working.')
}
