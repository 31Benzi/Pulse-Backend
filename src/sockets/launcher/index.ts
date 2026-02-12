import { getUserByAccountId } from "../../database/accountManager";
import { XMPPClient } from "../xmpp/xmpp-client";
import { LauncherClient } from "./client";

Bun.serve({
  port: 3001,
  fetch(req, server) {
    server.upgrade(req, {
      data: {
        accountId: req.headers.get("Account-ID"),
        client: null,
      },
    });

    return undefined;
  },
  websocket: {
    open: async (ws) => {
      if (!(ws.data as any).accountId) return ws.close();

      const user = await getUserByAccountId((ws.data as any).accountId);

      if (!user) {
        console.warn("Failed to find accountId in headers!");

        return ws.close();
      }

      const client = LauncherClient.getOrCreateClient(ws, user);
      (ws.data as any).client = client;
    },
    message: (ws, message) => {
      console.log(message);
      LauncherClient.onMessage(ws, message as string);
    },
  },
});
