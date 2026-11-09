// Secrets that are optional per environment, so `wrangler types` can't see them.
interface Env {
  RESEND_API_KEY?: string;
}
declare namespace Cloudflare {
  interface Env {
    RESEND_API_KEY?: string;
  }
}
