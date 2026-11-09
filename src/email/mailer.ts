// Email sits behind this interface so the provider is swappable and tests never send.

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(msg: Email): Promise<void>;
}

/** Captures mail in memory. Tests read `outbox`. */
export class MemoryMailer implements Mailer {
  outbox: Email[] = [];
  async send(msg: Email) { this.outbox.push(msg); }
}

/** Local development: prints the email (and its link) to the wrangler dev console. */
export class LogMailer implements Mailer {
  async send(msg: Email) { console.log(`[mail] to=${msg.to} subject=${msg.subject}\n${msg.text}`); }
}

export class ResendMailer implements Mailer {
  constructor(private apiKey: string, private from: string) {}
  async send(msg: Email) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
    });
    if (!res.ok) throw new Error(`resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

export class MailNotConfigured extends Error {}

let testMailer: Mailer | undefined;
/** Tests only. */
export function setMailerForTests(m: Mailer | undefined) { testMailer = m; }

export function mailerFor(env: Env): Mailer {
  if (testMailer) return testMailer;
  if (env.MAIL_DRIVER === 'log') return new LogMailer();
  if (!env.RESEND_API_KEY) throw new MailNotConfigured('RESEND_API_KEY is not set');
  return new ResendMailer(env.RESEND_API_KEY, env.MAIL_FROM);
}
