import { Hono } from 'hono';
import { html } from 'hono/html';
import type { AppEnv } from '../../app-context';
import { createBrand, SlugTaken } from '../../db/brands';
import { setOperatorName } from '../../db/operators';
import { slugify, slugProblem, SLUG_MESSAGES } from '../../domain/slug';
import { allZones, COMMON_ZONES, isValidTimeZone } from '../../domain/tz';
import { rallyPage, errorList } from '../../views/layout';

export const onboarding = new Hono<AppEnv>();

interface Fields { name: string; slug: string; timezone: string; truck: string; your_name: string }

function zoneSelect(selected: string) {
  const opt = (z: string) => html`<option value="${z}" ${z === selected ? 'selected' : ''}>${z.replace(/_/g, ' ')}</option>`;
  return html`<select name="timezone" required>
    <optgroup label="United States">${COMMON_ZONES.map(opt)}</optgroup>
    <optgroup label="Everywhere else">${allZones().map(opt)}</optgroup>
  </select>`;
}

const page = (f: Fields, errors: Record<string, string> = {}) => html`
  <div class="stack">
    <h1>Set up your brand</h1>
    <p class="muted">The brand is what customers follow. You can add more trucks later.</p>
  </div>
  ${errorList(errors)}
  <form method="post" action="/app/onboarding" class="card">
    <label>Brand name
      <input type="text" name="name" value="${f.name}" required maxlength="80" autocomplete="organization">
    </label>
    <label>Public address
      <span class="hint">Customers find you at rally/<strong>your-address</strong>. It can't change once you publish a shift.</span>
      <input type="text" name="slug" value="${f.slug}" maxlength="40" autocapitalize="none" spellcheck="false" pattern="[a-z0-9-]{2,40}" placeholder="from your brand name">
    </label>
    <label>Timezone
      <span class="hint">Every time customers see is shown in this zone.</span>
      ${zoneSelect(f.timezone)}
    </label>
    <label>First truck
      <span class="hint">Only your team sees truck names.</span>
      <input type="text" name="truck" value="${f.truck}" required maxlength="60">
    </label>
    <label>Your name <span class="hint">Optional. Shown to your team.</span>
      <input type="text" name="your_name" value="${f.your_name}" maxlength="80" autocomplete="name">
    </label>
    <button>Create brand</button>
  </form>`;

onboarding.get('/', (c) => {
  const cfZone = (c.req.raw.cf as { timezone?: string } | undefined)?.timezone;
  const tz = cfZone && isValidTimeZone(cfZone) ? cfZone : 'America/New_York';
  return c.html(rallyPage({
    title: 'Set up',
    narrow: true,
    chrome: { operator: c.get('operator') },
    body: page({ name: '', slug: '', timezone: tz, truck: 'Truck 1', your_name: c.get('operator').name ?? '' }),
  }));
});

onboarding.post('/', async (c) => {
  const b = await c.req.parseBody();
  const f: Fields = {
    name: String(b.name ?? '').trim(),
    slug: String(b.slug ?? '').trim().toLowerCase(),
    timezone: String(b.timezone ?? ''),
    truck: String(b.truck ?? '').trim(),
    your_name: String(b.your_name ?? '').trim(),
  };
  if (!f.slug) f.slug = slugify(f.name);

  const errors: Record<string, string> = {};
  if (!f.name) errors.name = 'Give the brand a name.';
  const sp = slugProblem(f.slug);
  if (sp) errors.slug = `Public address: ${SLUG_MESSAGES[sp]}`;
  if (!isValidTimeZone(f.timezone)) errors.timezone = 'Pick a timezone from the list.';
  if (!f.truck) errors.truck = 'Name the first truck.';

  const render = (status: 400 | 409) =>
    c.html(rallyPage({ title: 'Set up', narrow: true, chrome: { operator: c.get('operator') }, body: page(f, errors) }), status);
  if (Object.keys(errors).length) return render(400);

  try {
    await createBrand(c.env.DB, { name: f.name, slug: f.slug, timezone: f.timezone, truckName: f.truck, operatorId: c.get('operator').id });
  } catch (e) {
    if (e instanceof SlugTaken) {
      errors.slug = `Public address: ${SLUG_MESSAGES.taken}`;
      return render(409);
    }
    throw e;
  }
  if (f.your_name) await setOperatorName(c.env.DB, c.get('operator').id, f.your_name);
  return c.redirect('/app', 303);
});
