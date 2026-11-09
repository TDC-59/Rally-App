import { b64urlEncode, utf8 } from './b64';

/** 256 bits of randomness, base64url. For magic-link tokens and session ids. */
export const randomToken = (): string => b64urlEncode(crypto.getRandomValues(new Uint8Array(32)));

/** What gets stored for a secret token: never the token itself. */
export async function sha256(s: string): Promise<string> {
  return b64urlEncode(await crypto.subtle.digest('SHA-256', utf8(s)));
}
