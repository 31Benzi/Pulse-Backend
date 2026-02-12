export interface Session {
  ownerId?: string;
  ownerName?: string;
  serverName?: string;
  maxPublicPlayers: number;
  maxPrivatePlayers: number;
  shouldAdvertise: boolean;
  allowJoinInProgress: boolean;
  isDedicated: boolean;
  usesStats: boolean;
  allowInvites: boolean;
  usesPresence: boolean;
  allowJoinViaPresence: boolean;
  allowJoinViaPresenceFriendsOnly: boolean;
  buildUniqueId?: string;
  attributes: any;
  serverPort: number;
  openPrivatePlayers: number;
  openPublicPlayers: number;
  sortWeight: number;
  started: boolean;
  publicPlayers?: string[];
  privatePlayers?: string[];
  serverAddress?: string;
  lastUpdated?: string;
  id?: string;
}

export enum ServerStatus {
  ONLINE = "online",
  OFFLINE = "offline",
  MAINTENANCE = "maintenance",
}

export interface Servers {
  sessionId: string;
  status: ServerStatus;
  version: number;
  identifier: string;
  address: string;
  port: number;
  queue: string[];
  matchStarted: boolean;
  options: {
    region: string;
    userAgent: string;
    matchId: string;
    playlist: string;
  };
  teamAssignments: string[];
  isSendingAssignment: boolean;
  updatedAt: Date;
}
