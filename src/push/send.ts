import { encryptPayload, type PushSubscriptionKeys } from './encrypt';
import { vapidAuthorization, type VapidKeys } from './vapid';
import { utf8 } from '../lib/b64';

export interface Subscription extends PushSubscriptionKeys {
  endpoint: string;
}

export interface PushMessage {
  title: string;
  body: string;
  url: string;   // where a tap lands
  tag?: string;  // replaces an earlier notification with the same tag
}

export type SendOutcome =
  | { kind: 'accepted'; status: number }
  | { kind: 'gone'; status: number }    // 404/410: subscription is dead, prune it
  | { kind: 'failed'; status: number; detail: string };

export async function sendPush(
  sub: Subscription,
  msg: PushMessage,
  vapid: VapidKeys,
  opts: { ttlSeconds?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high' } = {},
): Promise<SendOutcome> {
  const body = await encryptPayload(sub, utf8(JSON.stringify(msg)));
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(sub.endpoint, vapid),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(opts.ttlSeconds ?? 3600),
      Urgency: opts.urgency ?? 'high',
    },
    body,
  });
  if (res.status === 201 || res.status === 200 || res.status === 202) return { kind: 'accepted', status: res.status };
  if (res.status === 404 || res.status === 410) return { kind: 'gone', status: res.status };
  return { kind: 'failed', status: res.status, detail: (await res.text()).slice(0, 300) };
}
