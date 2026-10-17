// src/worker.js - Cloudflare Worker and Durable Object Implementation
// Implements WebSocket Hibernation API and OWASP ASVS V4/V5 controls.

import {
  validateUsername,
  validateChatMessage,
  isRateLimited,
  appendBoundedHistory,
} from './chat_core.js';

export class ChatRoom {
  /**
   * Initializes the ChatRoom Durable Object instance.
   * @param {DurableObjectState} ctx
   * @param {object} env
   */
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.storage = ctx.storage;
    this.sessions = new Map();
    this.rateLimits = new Map();
  }

  /**
   * Handles HTTP requests routed to this Durable Object.
   * @param {Request} request
   * @returns {Promise<Response>}
   */
  async fetch(request) {
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.ctx.acceptWebSocket(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  /**
   * Handles inbound WebSocket message frames.
   * @param {WebSocket} ws
   * @param {string|ArrayBuffer} message
   */
  async webSocketMessage(ws, message) {
    if (typeof message !== 'string') {
      return;
    }

    let payload;
    try {
      payload = JSON.parse(message);
    } catch {
      this.sendError(ws, 'INVALID_JSON', 'Malformed JSON payload received.');
      return;
    }

    if (!payload || typeof payload !== 'object' || typeof payload.type !== 'string') {
      this.sendError(ws, 'INVALID_SCHEMA', 'Message must contain a valid type field.');
      return;
    }

    if (payload.type === 'join') {
      await this.handleJoin(ws, payload.name);
      return;
    }

    if (payload.type === 'chat') {
      await this.handleChat(ws, payload.text);
      return;
    }

    if (payload.type === 'ping') {
      this.sendPayload(ws, { type: 'pong', timestamp: Date.now() });
    }
  }

  /**
   * Processes a user joining the chat session.
   * @param {WebSocket} ws
   * @param {unknown} requestedName
   */
  async handleJoin(ws, requestedName) {
    const validation = validateUsername(requestedName);
    if (!validation.valid) {
      this.sendError(ws, 'INVALID_NICKNAME', validation.error || 'Invalid nickname.');
      return;
    }

    const name = validation.value;
    const session = { name };
    this.sessions.set(ws, session);

    try {
      ws.serializeAttachment(session);
    } catch {
      // Ignore attachment serialization if not supported in local mock
    }

    const history = (await this.storage.get('history')) || [];
    this.sendPayload(ws, { type: 'history', messages: history });

    this.broadcastPresence();
    this.broadcast({
      type: 'system',
      text: `${name} entered the room.`,
      timestamp: Date.now(),
    });
  }

  /**
   * Processes a validated chat message from a connected client.
   * @param {WebSocket} ws
   * @param {unknown} text
   */
  async handleChat(ws, text) {
    const now = Date.now();
    const lastTime = this.rateLimits.get(ws);

    if (isRateLimited(lastTime, now)) {
      this.sendError(ws, 'RATE_LIMITED', 'Please wait 1 second between messages.');
      return;
    }
    this.rateLimits.set(ws, now);

    const validation = validateChatMessage(text);
    if (!validation.valid) {
      this.sendError(ws, 'INVALID_MESSAGE', validation.error || 'Invalid message content.');
      return;
    }

    let session = this.sessions.get(ws);
    if (!session) {
      try {
        session = ws.deserializeAttachment();
      } catch {
        session = null;
      }
      if (!session || !session.name) {
        session = { name: 'Guest' };
      }
      this.sessions.set(ws, session);
    }

    const messageRecord = {
      id: crypto.randomUUID(),
      name: session.name,
      text: validation.value,
      timestamp: now,
    };

    const existingHistory = (await this.storage.get('history')) || [];
    const updatedHistory = appendBoundedHistory(existingHistory, messageRecord);
    await this.storage.put('history', updatedHistory);

    this.broadcast({
      type: 'chat',
      message: messageRecord,
    });
  }

  /**
   * Handles WebSocket disconnection and presence updates.
   * @param {WebSocket} ws
   */
  async webSocketClose(ws) {
    let session = this.sessions.get(ws);
    if (!session) {
      try {
        session = ws.deserializeAttachment();
      } catch {
        session = null;
      }
    }

    this.sessions.delete(ws);
    this.rateLimits.delete(ws);

    if (session && session.name) {
      this.broadcastPresence();
      this.broadcast({
        type: 'system',
        text: `${session.name} left the room.`,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handles WebSocket error events.
   * @param {WebSocket} ws
   */
  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }

  /**
   * Sends an error frame to a single WebSocket client.
   * @param {WebSocket} ws
   * @param {string} code
   * @param {string} message
   */
  sendError(ws, code, message) {
    this.sendPayload(ws, { type: 'error', code, message });
  }

  /**
   * Sends a JSON payload to a single WebSocket client.
   * @param {WebSocket} ws
   * @param {object} payload
   */
  sendPayload(ws, payload) {
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // Fail closed if send buffer is broken
    }
  }

  /**
   * Broadcasts active user presence list and counter.
   */
  broadcastPresence() {
    const userNames = [];
    for (const session of this.sessions.values()) {
      if (session.name) {
        userNames.push(session.name);
      }
    }

    this.broadcast({
      type: 'presence',
      count: userNames.length,
      users: userNames,
    });
  }

  /**
   * Broadcasts a JSON message to all connected and awake WebSocket clients.
   * @param {object} payload
   */
  broadcast(payload) {
    const serialized = JSON.stringify(payload);
    const activeSockets = this.ctx.getWebSockets();
    const maxBound = Math.min(activeSockets.length, 1000);

    for (let i = 0; i < maxBound; i++) {
      try {
        activeSockets[i].send(serialized);
      } catch {
        // Socket closed during broadcast iteration
      }
    }
  }
}

export default {
  /**
   * Main Worker fetch handler.
   * @param {Request} request
   * @param {object} env
   * @param {object} ctx
   * @returns {Promise<Response>}
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === '/api/health') {
      return new Response(JSON.stringify({ status: 'healthy', timestamp: Date.now() }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      });
    }

    // WebSocket upgrade endpoint for chat room
    if (url.pathname === '/api/room/websocket') {
      const upgradeHeader = request.headers.get('Upgrade');
      if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
        return new Response('Expected Upgrade: websocket', { status: 426 });
      }

      if (!env.CHAT_ROOM) {
        return new Response('Durable Object binding CHAT_ROOM not configured', { status: 500 });
      }

      const roomId = env.CHAT_ROOM.idFromName('global');
      const roomStub = env.CHAT_ROOM.get(roomId);
      return roomStub.fetch(request);
    }

    // Fallback to static asset handler
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  },
};
