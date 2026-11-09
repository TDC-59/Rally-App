import type { MiddlewareHandler } from 'hono';
import { html } from 'hono/html';
import type { AppEnv } from '../../app-context';
import type { Role } from '../../db/brands';
import { rallyPage } from '../../views/layout';

export const requireRole = (role: Role): MiddlewareHandler<AppEnv> => async (c, next) => {
  if (role === 'owner' && c.get('brand').role !== 'owner') {
    return c.html(rallyPage({
      title: 'Owners only',
      chrome: { operator: c.get('operator'), brand: c.get('brand'), memberships: c.get('memberships') },
      body: html`<div class="notice warn" role="alert"><strong>Only an owner can do that</strong>
        <p>Ask an owner of ${c.get('brand').name}.</p></div>`,
    }), 403);
  }
  await next();
};

