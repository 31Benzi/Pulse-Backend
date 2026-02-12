import type { User } from "../database/schema";
import type { XMPPClient } from "../xmpp/xmpp-client";

export type WebSocketData = {
  XMPPClient: XMPPClient | null;
  connectedAt: Date;
  SecWebSocketKey: string;
};

export interface Friends {
  accepted: User[];
  incoming: User[];
  outgoing: User[];
  blocked: User[];
}

interface MUCRoom {
  members: User[];
}

export interface MUCs {
  [roomName: string]: MUCRoom;
}
