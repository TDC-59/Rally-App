// Rally-layer page shell. Never used for a brand's public page.

import { html } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';
import { assetVersion } from '../static';
import type { Operator } from '../auth/session';
import type { BrandMembership } from '../db/brands';

export type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

export interface Chrome {
  operator: Operator;
  brand?: BrandMembership;
  memberships?: BrandMembership[];
  current?: 'today' | 'calendar' | 'team' | 'settings';
}

export async function rallyPage(opts: { title: string; body: Html; chrome?: Chrome; narrow?: boolean }) {
  const css = await assetVersion('/css/rally.css');
  const ch = opts.chrome;
  const nav = (key: NonNullable<Chrome['current']>, href: string, label: string) =>
    html`<a href="${href}" ${ch?.current === key ? html`aria-current="page"` : ''}>${label}</a>`;
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>${opts.title} · Rally</title>
<link rel="preload" href="/fonts/archivo-black-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/css/rally.css?v=${css}">
</head>
<body>
<header class="topbar">
  <a class="wordmark" href="${ch ? '/app' : '/login'}">Rally</a>
  ${ch?.brand
    ? html`<nav class="nav" aria-label="Console">
        ${nav('today', '/app', 'Today')}
        ${ch.brand.role === 'owner' ? nav('team', '/app/team', 'Team') : ''}
        ${(ch.memberships?.length ?? 0) > 1
          ? html`<form method="post" action="/app/brand" class="row">
              <label class="row"><span class="hint">Brand</span>
                <select name="brand_id" onchange="this.form.submit()">
                  ${ch.memberships!.map((m) => html`<option value="${m.brand_id}" ${m.brand_id === ch.brand!.brand_id ? 'selected' : ''}>${m.name}</option>`)}
                </select>
              </label>
              <noscript><button class="secondary">Switch</button></noscript>
            </form>`
          : ''}
        <form method="post" action="/logout"><button class="quiet">Sign out</button></form>
      </nav>`
    : ch
      ? html`<form method="post" action="/logout"><button class="quiet">Sign out</button></form>`
      : ''}
</header>
<main class="page ${opts.narrow ? 'narrow' : ''}">
${opts.body}
</main>
</body>
</html>`;
}

export function errorList(errors: Record<string, string>) {
  const entries = Object.values(errors);
  if (!entries.length) return '';
  return html`<div class="notice crit" role="alert"><strong>Fix ${entries.length === 1 ? 'this' : 'these'} first</strong>
    <ul>${entries.map((e) => html`<li>${e}</li>`)}</ul></div>`;
}
