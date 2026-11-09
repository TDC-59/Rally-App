/** Unix seconds, UTC. The only "now" the app uses. */
export const nowSec = (): number => Math.floor(Date.now() / 1000);
