import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import type { ServerWebSocket } from "bun";
import type { WebSocketData } from "../../types/xmpp.t";
import { XMPPClient } from "./xmpp-client";
import logger from "../../utils/logger";
import app from "../../app/index";

app.get("/xmpp/clients", (c) => {
  return c.json({
    amount: XMPPClient.clients.length,
    clients: XMPPClient.clients
      .filter((u) => u.user !== null && u.user !== undefined)
      .map((u) => u.user!.username),
  });
});

Bun.serve({
  port: 4000,
  fetch(req, server) {
    const secWebSocketKey = req.headers.get("Sec-Websocket-Key");
    if (!secWebSocketKey) return new Response(null, { status: 400 });

    server.upgrade(req, {
      data: {
        user: null,
        XMPPClient: null,
        SecWebSocketKey: secWebSocketKey,
      },
    });

    return undefined;
  },
  websocket: {
    open(ws) {
      const xmppClient = new XMPPClient(ws);
      (ws.data as any).XMPPClient = xmppClient;
    },
    async message(ws, message) {
      //console.log("[XMPP] Received message:", message);

      if (!(ws.data as any).XMPPClient) {
        return ws.close(1008, "No XMPPClient");
      }

      await (ws.data as any).XMPPClient.onMessage(message);
    },
    close(ws, code, reason) {
      logger.warn(`[XMPP] WebSocket connection closed: ${code} ${reason}`);

      if (code == 1006) (ws.data as any).XMPPClient.onClose();
    },
  },
});

logger.info("Started XMPP on port 4000");
