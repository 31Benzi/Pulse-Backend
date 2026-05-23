import type { ServerWebSocket } from "bun";
import { tokens, type User } from "../../database/schema";
import xmlbuilder from "xmlbuilder";
import xmlparser from "xml-parser";
import logger from "../../utils/logger";
import { db } from "../../app";
import { TokenManager } from "../../database/tokenManager";
import { eq } from "drizzle-orm";
import { getUserByAccountId } from "../../database/accountManager";
import type { Friends, MUCs } from "../../types/xmpp.t";
import {
  getPresenceForFriends,
  updatePresenceForFriends,
} from "../../utils/friends";
const xmppDomain = "prod.ol.epicgames.com";

// HEAVILY inspired from https://github.com/simplyzetax/Aphrodite/blob/main/src/xmpp/classes/client.ts

export class XMPPClient {
  public static clients: XMPPClient[] = [];
  public static MUCs: MUCs = {};

  private joinedMUCs: string[] = [];
  public ws: ServerWebSocket<unknown> | undefined;
  private authenticated = false;
  public user: User | null = null;
  private uuid: string | null = null;
  public roomName: string | null = null;

  private resource: string | null = null;
  public jid: string | null = null;
  public lastPresenceUpdate: { away: boolean; status: string } = {
    away: false,
    status: "{}",
  };

  constructor(ws: ServerWebSocket<unknown>) {
    this.ws = ws;
    this.uuid = crypto.randomUUID();
  }

  public async onMessage(message: string | Buffer) {
    if (Buffer.isBuffer(message)) message = message.toString();

    const msg = xmlparser(message);
    if (!msg || !msg.root || !msg.root.name)
      return this.ws?.close(1008, "Invalid XML");

    logger.info(`[XMPP] Recieved message: ${msg.root.name}`);

    switch (msg.root.name) {
      case "open":
        this.onOpen();
        break;
      case "auth":
        await this.onAuth(msg);
        break;
      case "iq":
        await this.onIQ(msg);
        break;
      case "presence":
        await this.onPresence(msg);
        break;
      case "message":
        await this.onMessageMessage(msg);
        break;
    }
  }

  // great naming
  public onMessageMessage(msg: xmlparser.Document) {
    try {
      const body = msg.root.children.find((i) => i.name == "body");

      if (!body || !body.content) return;

      switch (msg.root.attributes.type) {
        case "chat":
          if (!msg.root.attributes.to) return;

          if (body.content.length >= 300) return;

          const receiver = XMPPClient.clients.find(
            (i) => i.jid?.split("/")[0] == msg.root.attributes.to
          );

          if (!receiver) return;
          if (receiver.user?.accountId == this.user?.accountId) return;

          receiver.ws?.send(
            xmlbuilder
              .create("message")
              .attribute("to", receiver.jid)
              .attribute("from", this.jid)
              .attribute("xmlns", "jabber:client")
              .attribute("type", "chat")
              .element("body", body.content)
              .up()
              .toString()
          );
          return;

        case "groupchat":
          if (!msg.root.attributes.to) return;

          if (body.content.length >= 300) return;

          const roomName = msg.root.attributes.to.split("@")[0];
          this.roomName = roomName;

          const MUC = XMPPClient.MUCs[roomName];
          if (!MUC) return;

          if (!MUC.members.find((i) => i.accountId == this.user?.accountId))
            return;

          MUC.members.forEach((member) => {
            const clientData = XMPPClient.clients.find(
              (i) => i.user?.accountId == member.accountId
            );

            if (!clientData) return;

            clientData.ws?.send(
              xmlbuilder
                .create("message")
                .attribute("to", clientData.jid)
                .attribute("from", this.getMUCMember(roomName))
                .attribute("xmlns", "jabber:client")
                .attribute("type", "groupchat")
                .element("body", body.content)
                .up()
                .toString()
            );
          });
          return;
      }

      const parsed = JSON.parse(body.content);

      if (parsed) {
        if (Array.isArray(parsed)) return;
        if (typeof parsed.type != "string") return;
        if (!msg.root.attributes.to) return;
        if (!msg.root.attributes.id) return;

        XMPPClient.sendXMPPMessageToJID(this.jid!, msg, body.content);
      }
    } catch (e) {
      logger.error(e);
    }
  }

  public onOpen() {
    this.ws?.send(
      xmlbuilder
        .create("open")
        .attribute("xmlns", "urn:ietf:params:xml:ns:xmpp-framing")
        .attribute("from", xmppDomain)
        .attribute("id", this.uuid)
        .attribute("version", "1.0")
        .attribute("xml:lang", "en")
        .toString()
    );

    if (this.authenticated) {
      this.ws?.send(
        xmlbuilder
          .create("stream:features")
          .attribute("xmlns:stream", "http://etherx.jabber.org/streams")
          .element("ver")
          .attribute("xmlns", "urn:xmpp:features:rosterver")
          .up()
          .element("starttls")
          .attribute("xmlns", "urn:ietf:params:xml:ns:xmpp-tls")
          .up()
          .element("bind")
          .attribute("xmlns", "urn:ietf:params:xml:ns:xmpp-bind")
          .up()
          .element("compression")
          .attribute("xmlns", "http://jabber.org/features/compress")
          .element("method", "zlib")
          .up()
          .up()
          .element("session")
          .attribute("xmlns", "urn:ietf:params:xml:ns:xmpp-session")
          .up()
          .toString()
      );
    } else {
      this.ws?.send(
        xmlbuilder
          .create("stream:features")
          .attribute("xmlns:stream", "http://etherx.jabber.org/streams")
          .element("mechanisms")
          .attribute("xmlns", "urn:ietf:params:xml:ns:xmpp-sasl")
          .element("mechanism", "PLAIN")
          .up()
          .up()
          .element("ver")
          .attribute("xmlns", "urn:xmpp:features:rosterver")
          .up()
          .element("starttls")
          .attribute("xmlns", "urn:ietf:params:xml:ns:xmpp-tls")
          .up()
          .element("compression")
          .attribute("xmlns", "http://jabber.org/features/compress")
          .element("method", "zlib")
          .up()
          .up()
          .element("auth")
          .attribute("xmlns", "http://jabber.org/features/iq-auth")
          .up()
          .toString()
      );
    }
  }

  public async onAuth(msg: xmlparser.Document) {
    if (this.user) return;
    if (!msg.root.content) return this.ws?.close(1008, "Invalid XML");

    if (!atob(msg.root.content).includes("\u0000"))
      return this.ws?.close(1008, "Invalid XML");

    const decoded = atob(msg.root.content).split("\u0000");

    if (decoded.length !== 3 || !Array.isArray(decoded))
      return this.ws?.close(1008, "Not array or invalid length");

    const replacedToken = decoded[2].replace(/eg1~/i, "");
    const [token] = await db
      .select()
      .from(tokens)
      .where(eq(tokens.token, replacedToken));
    if (!token) return this.ws?.close(1008, "Invalid token");

    if (XMPPClient.clients.find((c) => c.user?.accountId === token.accountId))
      return this.ws?.close(1008, "Invalid token");

    const user = await getUserByAccountId(token.accountId);
    if (!user) return this.ws?.close(1008, "User not found");
    this.user = user;

    if (this.user.username == "syphon2")
      return this.ws?.close(1008, "Dedicated Server");

    this.ws?.send(
      xmlbuilder
        .create("success")
        .attribute("xmlns", "urn:ietf:params:xml:ns:xmpp-sasl")
        .toString()
    );

    logger.info(`[XMPP] ${user.username} connected to xmpp!`);

    this.authenticated = true;
    this.lastPresenceUpdate = { away: false, status: "{}" };
  }

  public async onIQ(msg: xmlparser.Document) {
    if (!this.uuid) return this.ws?.close(1008, "Invalid UUID");

    switch (msg.root.attributes.id) {
      case "_xmpp_bind1": {
        if (!this.resource && this.user) {
          const bind = msg.root.children.find((ch) => ch.name === "bind");
          const alreadyConnected = XMPPClient.clients.some(
            (c) => c.user?.accountId === this.user?.accountId
          );

          if (bind && !alreadyConnected) {
            const resource = bind.children.find((ch) => ch.name === "resource");

            if (resource?.content) {
              this.resource = resource.content;
              this.jid = `${this.user.accountId}@${xmppDomain}/${this.resource}`;

              this.ws?.send(
                xmlbuilder
                  .create("iq")
                  .attribute("to", this.jid)
                  .attribute("id", "_xmpp_bind1")
                  .attribute("xmlns", "jabber:client")
                  .attribute("type", "result")
                  .element("bind")
                  .attribute("xmlns", "urn:ietf:params:xml:ns:xmpp-bind")
                  .element("jid", this.jid)
                  .up()
                  .up()
                  .toString()
              );

              XMPPClient.clients.push(this);
            }
          } else if (alreadyConnected) {
            this.ws?.close(1008, "Account already connected");
          }
        }
        break;
      }

      case "_xmpp_session1": {
        this.ws?.send(
          xmlbuilder
            .create("iq")
            .attribute("to", this.jid)
            .attribute("from", xmppDomain)
            .attribute("id", "_xmpp_session1")
            .attribute("xmlns", "jabber:client")
            .attribute("type", "result")
            .toString()
        );

        await getPresenceForFriends(this);

        break;
      }

      default: {
        this.ws?.send(
          xmlbuilder
            .create("iq")
            .attribute("to", this.jid)
            .attribute("from", xmppDomain)
            .attribute("id", msg.root.attributes.id)
            .attribute("xmlns", "jabber:client")
            .attribute("type", "result")
            .toString()
        );
      }
    }
  }

  public async onPresence(msg: xmlparser.Document) {
    if (!this.jid) return this.ws?.close(1008, "Invalid JID");

    console.log(msg.root.attributes.type);

    switch (msg.root.attributes.type) {
      case "unavailable": {
        if (!msg.root.attributes.to) return;

        const { to } = msg.root.attributes;
        const baseAddress = to.split("/")[0];

        if (
          baseAddress.endsWith(`@muc.${xmppDomain}`) &&
          baseAddress.toLowerCase().startsWith("party-")
        ) {
          const roomName = msg.root.attributes.to.split("@")[0];

          if (!XMPPClient.MUCs[roomName]) return;

          const memberIndex = XMPPClient.MUCs[roomName].members.findIndex(
            (i) => i.accountId == this.user?.accountId
          );

          if (memberIndex != -1) {
            XMPPClient.MUCs[roomName].members.splice(memberIndex, 1);
            this.joinedMUCs.splice(this.joinedMUCs.indexOf(roomName), 1);
          }

          this.ws?.send(
            xmlbuilder
              .create("presence")
              .attribute("to", this.jid)
              .attribute("from", this.getMUCMember(roomName))
              .attribute("xmlns", "jabber:client")
              .attribute("type", "unavailable")
              .element("x")
              .attribute("xmlns", "http://jabber.org/protocol/muc#user")
              .element("item")
              .attribute(
                "nick",
                this.getMUCMember(roomName).replace(
                  `${roomName}@muc.${xmppDomain}/`,
                  ""
                )
              )
              .attribute("jid", this.jid)
              .attribute("role", "none")
              .up()
              .element("status")
              .attribute("code", "110")
              .up()
              .element("status")
              .attribute("code", "100")
              .up()
              .element("status")
              .attribute("code", "170")
              .up()
              .up()
              .toString()
          );
          return;
        }

        break;
      }

      default: {
        if (
          msg.root.children.find((i) => i.name == "muc:x") ||
          msg.root.children.find((i) => i.name == "x")
        ) {
          if (!msg.root.attributes.to) return;

          const roomName = msg.root.attributes.to.split("@")[0];

          if (!XMPPClient.MUCs[roomName])
            XMPPClient.MUCs[roomName] = { members: [] };

          if (
            XMPPClient.MUCs[roomName].members.find(
              (i) => i.accountId == this.user?.accountId
            )
          )
            return;

          XMPPClient.MUCs[roomName].members.push(this.user!);

          this.joinedMUCs.push(roomName);

          this.ws?.send(
            xmlbuilder
              .create("presence")
              .attribute("to", this.jid)
              .attribute("from", this.getMUCMember(roomName))
              .attribute("xmlns", "jabber:client")
              .element("x")
              .attribute("xmlns", "http://jabber.org/protocol/muc#user")
              .element("item")
              .attribute(
                "nick",
                this.getMUCMember(roomName).replace(
                  `${roomName}@muc.${xmppDomain}/`,
                  ""
                )
              )
              .attribute("jid", this.jid)
              .attribute("role", "participant")
              .attribute("affiliation", "none")
              .up()
              .element("status")
              .attribute("code", "110")
              .up()
              .element("status")
              .attribute("code", "100")
              .up()
              .element("status")
              .attribute("code", "170")
              .up()
              .element("status")
              .attribute("code", "201")
              .up()
              .up()
              .toString()
          );

          XMPPClient.MUCs[roomName].members.forEach((member) => {
            const clientData = XMPPClient.clients.find(
              (i) => i.user?.accountId == member.accountId
            );

            if (!clientData) return;

            this.ws?.send(
              xmlbuilder
                .create("presence")
                .attribute("from", this.getMUCMember(roomName))
                .attribute("to", this.jid)
                .attribute("xmlns", "jabber:client")
                .element("x")
                .attribute("xmlns", "http://jabber.org/protocol/muc#user")
                .element("item")
                .attribute(
                  "nick",
                  this.getMUCMember(roomName).replace(
                    `${roomName}@muc.${xmppDomain}/`,
                    ""
                  )
                )
                .attribute("jid", clientData.jid)
                .attribute("role", "participant")
                .attribute("affiliation", "none")
                .up()
                .up()
                .toString()
            );

            if (this.user?.accountId == clientData.user?.accountId) return;

            clientData.ws?.send(
              xmlbuilder
                .create("presence")
                .attribute("from", this.getMUCMember(roomName))
                .attribute("to", clientData.jid)
                .attribute("xmlns", "jabber:client")
                .element("x")
                .attribute("xmlns", "http://jabber.org/protocol/muc#user")
                .element("item")
                .attribute(
                  "nick",
                  this.getMUCMember(roomName).replace(
                    `${roomName}@muc.${xmppDomain}/`,
                    ""
                  )
                )
                .attribute("jid", this.jid)
                .attribute("role", "participant")
                .attribute("affiliation", "none")
                .up()
                .up()
                .toString()
            );
          });
        }
        break;
      }
    }

    const status = msg.root.children.find((i) => i.name == "status");

    if (!status || !status.content) return;

    const parsed = JSON.parse(status.content);

    if (!parsed || typeof parsed != "object") return;

    if (Array.isArray(parsed)) return;

    const away = msg.root.children.find((i) => i.name == "show") ? true : false;

    await updatePresenceForFriends(this, status.content, away, false);
    XMPPClient.getPresence(this.user?.accountId!, this.user?.accountId!, false);
  }

  public getMUCMember(roomName: string): string {
    return `${roomName}@muc.${xmppDomain}/${encodeURI(
      this.user?.username || "unknown"
    )}:${this.user?.accountId}:${this.resource}`;
  }

  public async onClose() {
    const clientIndex = XMPPClient.clients.findIndex((i) => i.ws == this.ws);

    if (clientIndex == -1) return;

    const client = XMPPClient.clients[clientIndex];

    logger.info(
      `[XMPP] ${XMPPClient.clients[clientIndex].user?.username} has logged out`
    );

    XMPPClient.clients.splice(clientIndex);

    await updatePresenceForFriends(this, "{}", false, true);

    for (const roomName of this.joinedMUCs) {
      const MUCRoom = XMPPClient.MUCs[roomName];

      if (!MUCRoom) continue;

      const memberIndex = MUCRoom.members.findIndex(
        (i) => i.accountId == this.user?.accountId
      );

      if (memberIndex != -1) {
        MUCRoom.members.splice(memberIndex, 1);
      }
    }

    const clientStatus: any = client.lastPresenceUpdate.status;
    let partyId = "";

    try {
      switch (true) {
        case !clientStatus.Properties:
          break;
        case typeof clientStatus.Properties == "object": {
          for (let key in clientStatus.Properties) {
            if (key.toLowerCase().startsWith("party.joininfo")) {
              if (typeof clientStatus.Properties[key] === "object")
                partyId = clientStatus.Properties[key].partyId;
            }
          }
        }
      }
    } catch {}

    if (partyId && typeof partyId == "string") {
      XMPPClient.clients.forEach((client) => {
        if (client.user?.accountId == this.user?.accountId) return;

        client.ws?.send(
          xmlbuilder
            .create("message")
            .attribute(
              "id",
              crypto.randomUUID().replace(/-/g, "").toUpperCase()
            )
            .attribute("from", this.jid)
            .attribute("xmlns", "jabber:client")
            .attribute("to", client.jid)
            .element(
              "body",
              JSON.stringify({
                type: "com.epicgames.party.memberexited",
                payload: {
                  partyId: partyId,
                  memberId: this.user?.accountId,
                  wasKicked: false,
                },
                timestamp: new Date().toISOString(),
              })
            )
            .up()
            .toString()
        );
      });
    }
  }

  public static async sendXMPPMessageToJID(
    senderJID: string,
    msg: xmlparser.Document,
    body: object | string
  ) {
    if (typeof body == "object") body = JSON.stringify(body);

    let receiver = XMPPClient.clients.find(
      (i) =>
        i.jid?.split("/")[0] == msg.root.attributes.to ||
        i.jid == msg.root.attributes.to
    );

    if (!receiver) return;

    receiver.ws?.send(
      xmlbuilder
        .create("message")
        .attribute("from", senderJID)
        .attribute("id", msg.root.attributes.id)
        .attribute("to", receiver.jid)
        .attribute("xmlns", "jabber:client")
        .element("body", `${body}`)
        .up()
        .toString()
    );
  }

  public static async sendXMPPMessageToClient(body: object, accountId: string) {
    let receiver = await XMPPClient.clients.find(
      (i) => i.user?.accountId == accountId
    );
    if (!receiver) return;

    receiver.ws?.send(
      xmlbuilder
        .create("message")
        .attribute("from", `xmpp-admin@${xmppDomain}`)
        .attribute("to", receiver.jid)
        .attribute("xmlns", "jabber:client")
        .element("body", `${JSON.stringify(body)}`)
        .up()
        .toString()
    );
  }

  public static async getPresence(
    senderAccountId: string,
    recieverAccountId: string,
    offline: boolean
  ) {
    if (!XMPPClient.clients) return;

    const [senderClient, recieverClient] = await Promise.all([
      XMPPClient.clients.find((i) => i.user?.accountId == senderAccountId),
      XMPPClient.clients.find((i) => i.user?.accountId == recieverAccountId),
    ]);

    if (!senderClient || !recieverClient) return;

    let xml = xmlbuilder
      .create("presence")
      .attribute("to", recieverClient.jid)
      .attribute("xmlns", "jabber:client")
      .attribute("from", senderClient.jid)
      .attribute("type", offline ? "unavailable" : "available");

    if (senderClient.lastPresenceUpdate.away)
      xml = xml
        .element("show", "away")
        .up()
        .element("status", senderClient.lastPresenceUpdate.status)
        .up();
    else
      xml = xml.element("status", senderClient.lastPresenceUpdate.status).up();

    recieverClient.ws!.send(xml.toString());
  }

  public static async sendXMPPMessageToAll(body: object) {
    this.clients.forEach((client) => {
      XMPPClient.sendXMPPMessageToClient(body, client.user?.accountId!);
    });
  }
}
