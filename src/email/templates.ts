// Operator email is Rally-layer. Plain and short: it's read on a phone between services.

import type { Email } from './mailer';

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

function wrap(bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;padding:24px 16px;background:#FFFFFF;color:#19120F;font:16px/1.5 Arial,Helvetica,sans-serif">
<div style="max-width:480px;margin:0 auto">
<p style="font:900 22px/1 'Arial Black',Arial,sans-serif;text-transform:uppercase;letter-spacing:-0.02em;margin:0 0 24px">Rally</p>
${bodyHtml}
</div></body></html>`;
}

const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${esc(href)}" style="display:inline-block;background:#FF4D1C;color:#FFFFFF;font:700 19px/1 Arial,Helvetica,sans-serif;text-decoration:none;padding:14px 22px;border:2px solid #19120F;border-radius:2px">${esc(label)}</a></p>`;

export function signInEmail(to: string, link: string, minutes: number): Email {
  return {
    to,
    subject: 'Your Rally sign-in link',
    text: `Sign in to Rally:\n\n${link}\n\nThis link works once, for ${minutes} minutes. If you didn't ask for it, ignore this email.`,
    html: wrap(`<p style="margin:0">Tap to sign in to Rally.</p>${button(link, 'Sign in')}
<p style="margin:0;color:#574C47;font-size:14px">This link works once, for ${minutes} minutes. If you didn't ask for it, ignore this email.</p>`),
  };
}

export function invitedEmail(to: string, brandName: string, role: string, link: string, minutes: number): Email {
  return {
    to,
    subject: `You've been added to ${brandName} on Rally`,
    text: `You've been added to ${brandName} on Rally as ${role}.\n\nSign in:\n\n${link}\n\nThis link works once, for ${minutes} minutes. After that, sign in any time at the same address with your email.`,
    html: wrap(`<p style="margin:0">You've been added to <strong>${esc(brandName)}</strong> on Rally as ${esc(role)}.</p>${button(link, 'Sign in')}
<p style="margin:0;color:#574C47;font-size:14px">This link works once, for ${minutes} minutes. After that, sign in any time with your email.</p>`),
  };
}
