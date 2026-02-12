import type { ServerWebSocket } from "bun";
import { getUserByAccountId } from "../../database/accountManager";
import type { User } from "../../database/schema";
import logger from "../../utils/logger";
import { TokenManager } from "../../database/tokenManager";

export class LauncherClient {
  public user: User;
  public ws: ServerWebSocket<unknown> | undefined;

  public static clients: LauncherClient[] = [];

  constructor(ws: ServerWebSocket<unknown>, user: User) {
    this.ws = ws;
    this.user = user;

    this.setIntervals();

    LauncherClient.clients.push(this);
  }

  public static getOrCreateClient(
    ws: ServerWebSocket<unknown>,
    user: User
  ): LauncherClient {
    let client = LauncherClient.clients.find(
      (c) => c.user.accountId === user.accountId
    );

    if (client) {
      console.log(
        `Client for user: ${user.accountId} already exists. Reusing.`
      );
      client.ws = ws;
      return client;
    } else {
      console.log(`Creating new client for user: ${user.accountId}.`);
      return new LauncherClient(ws, user);
    }
  }

  public static async onMessage(ws: ServerWebSocket<unknown>, message: string) {
    if (message == "ping") {
      return ws.send("ping");
    }

    if (message == "requestExchangeCode") {
      const user = await LauncherClient.clients
        .find((p) => p.ws == ws)
        ?.getUserUpdate();

      if (!user) return ws.send("invalid");

      const tokenManager = new TokenManager(user);

      ws.send(
        JSON.stringify({
          type: "exchangeCode",
          code: await tokenManager.NewExchangeCode(),
        })
      );
    }

    if (message == "requestUserUpdate") {
      const user = await LauncherClient.clients
        .find((p) => p.ws == ws)
        ?.getUserUpdate();
      ws?.send(
        JSON.stringify({
          type: "userUpdate",
          body: { isDonator: user?.isDonator, stats: user?.stats },
        })
      );
    }
  }

  public async getUserUpdate(): Promise<User | null> {
    const newUser = await getUserByAccountId(this.user.accountId);

    if (!newUser) return null;

    this.user = newUser;

    return newUser;
  }

  public async setIntervals() {
    setInterval(async () => {
      await this.getUserUpdate();

      this.ws?.send(
        JSON.stringify({
          type: "userUpdate",
          body: { isDonator: this.user.isDonator, stats: this.user.stats },
        })
      );
    }, 60000);
  }
}
