// _worker.js - Cloudflare Pages Advanced Mode Entrypoint
// Re-exports the Durable Object and Worker fetch handler for Cloudflare Pages Git deployments.

export { ChatRoom, default } from './src/worker.js';
