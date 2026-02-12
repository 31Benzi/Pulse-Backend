import type { ServerWebSocket } from "bun";
import { queryServersPrepared } from "../../database/serverManager"; // Assuming this is correctly typed
import logger from "../../utils/logger";

export class MatchmakerClient {
  public static clients: MatchmakerClient[] = [];
  private static waitingClientsByPlaylistRegion: Map<
    string,
    MatchmakerClient[]
  > = new Map();
  private static activePollers: Map<string, NodeJS.Timeout> = new Map();
  private static readonly POLLING_INTERVAL_MS = 5000;

  private ticketId: string;
  private matchId: string;
  private sessionId: string | null = null;

  public playlist: string;
  public region: string;

  public ws: ServerWebSocket<unknown>;

  public constructor(
    ws: ServerWebSocket<unknown>,
    matchId: string,
    playlist: string,
    region: string
  ) {
    this.ws = ws;
    this.ticketId = new Bun.CryptoHasher("md5") // Consider sha256 for better uniqueness
      .update(`3${Date.now()}`) // Add more entropy
      .digest("hex");
    this.matchId = matchId;
    this.playlist = playlist;
    this.region = region;

    MatchmakerClient.clients.push(this);
    logger.info(
      `[Matchmaker] Client connected for playlist: ${this.playlist}, region: ${this.region}. Ticket: ${this.ticketId}`
    );
  }

  private getQueueKey(): string {
    return `${this.playlist}-${this.region}`;
  }

  private static getQueueKey(playlist: string, region: string): string {
    return `${playlist}-${region}`;
  }

  public sendConnecting(): void {
    this.ws.send(
      JSON.stringify({
        payload: {
          state: "Connecting",
        },
        name: "StatusUpdate",
      })
    );
  }

  public sendWaiting(): void {
    const globalClientCount = MatchmakerClient.clients.length;
    this.ws.send(
      JSON.stringify({
        payload: {
          totalPlayers: globalClientCount,
          connectedPlayers: globalClientCount,
          state: "Waiting",
        },
        name: "StatusUpdate",
      })
    );
  }

  public sendQueued(): void {
    const queueKey = this.getQueueKey();
    let queue = MatchmakerClient.waitingClientsByPlaylistRegion.get(queueKey);
    if (!queue) {
      queue = [];
      MatchmakerClient.waitingClientsByPlaylistRegion.set(queueKey, queue);
    }
    if (!queue.includes(this)) {
      queue.push(this);
    }

    this.ws.send(
      JSON.stringify({
        payload: {
          ticketId: this.ticketId,
          queuedPlayers: queue.length,
          estimatedWaitSec: 3,
          status: {},
          state: "Queued",
        },
        name: "StatusUpdate",
      })
    );

    MatchmakerClient.ensurePollerActive(this.playlist, this.region);
  }

  private static ensurePollerActive(playlist: string, region: string): void {
    const queueKey = MatchmakerClient.getQueueKey(playlist, region);

    if (MatchmakerClient.activePollers.has(queueKey)) {
      return;
    }

    logger.info(`[Matchmaker] Starting poller for ${queueKey}`);
    const intervalId = setInterval(async () => {
      const clientsInQueue =
        MatchmakerClient.waitingClientsByPlaylistRegion.get(queueKey);

      if (!clientsInQueue || clientsInQueue.length === 0) {
        logger.info(
          `[Matchmaker] Stopping poller for ${queueKey} as queue is empty.`
        );
        clearInterval(intervalId);
        MatchmakerClient.activePollers.delete(queueKey);
        MatchmakerClient.waitingClientsByPlaylistRegion.delete(queueKey);
        return;
      }

      try {
        logger.info(
          `[Matchmaker] Poller for ${queueKey} querying servers. Clients waiting: ${clientsInQueue.length}`
        );
        const foundServers = await queryServersPrepared.execute({
          playlist: playlist,
          region: region,
        });

        if (foundServers.length > 0) {
          const serverToJoin = foundServers[0];
          logger.info(
            `[Matchmaker] Poller for ${queueKey} found server: ${serverToJoin.sessionId}. Assigning ${clientsInQueue.length} clients.`
          );

          const clientsToAssign = [...clientsInQueue];
          clientsInQueue.length = 0;

          for (const client of clientsToAssign) {
            client.sessionId = serverToJoin.sessionId;
            client.sendSessionAssignment();
            setTimeout(() => {}, 3000);
            client.sendJoin(serverToJoin.sessionId);
          }

          clearInterval(intervalId);
          MatchmakerClient.activePollers.delete(queueKey);
          MatchmakerClient.waitingClientsByPlaylistRegion.delete(queueKey);
          logger.info(
            `[Matchmaker] Poller for ${queueKey} processed clients and stopped.`
          );
        } else {
          logger.info(
            `[Matchmaker] Poller for ${queueKey} found no servers. Will retry.`
          );
          clientsInQueue.forEach((client) => {
            client.ws.send(
              JSON.stringify({
                name: "StatusUpdate",
                payload: {
                  state: "Queued",
                  ticketId: client.ticketId,
                  queuedPlayers: clientsInQueue.length,
                  estimatedWaitSec: 10, // Update estimate if needed
                  status: { message: "Still searching for servers..." },
                },
              })
            );
          });
        }
      } catch (error) {
        logger.error(`[Matchmaker] Error in poller for ${queueKey}:`, error);
      }
    }, MatchmakerClient.POLLING_INTERVAL_MS);

    MatchmakerClient.activePollers.set(queueKey, intervalId);
  }

  public sendSessionAssignment(): void {
    if (!this.matchId) {
      logger.warn(
        `[Matchmaker] Client ${this.ticketId} is missing matchId for SessionAssignment.`
      );
      return;
    }
    this.ws.send(
      JSON.stringify({
        payload: {
          matchId: this.matchId,
          state: "SessionAssignment",
        },
        name: "StatusUpdate",
      })
    );
  }

  public sendJoin(sessionId: string): void {
    this.sessionId = sessionId;
    if (!this.matchId) {
      logger.warn(
        `[Matchmaker] Client ${this.ticketId} is missing matchId for Play.`
      );
      return;
    }
    this.ws.send(
      JSON.stringify({
        payload: {
          matchId: this.matchId,
          sessionId: this.sessionId,
          joinDelaySec: 1,
        },
        name: "Play",
      })
    );
  }

  public static handleDisconnect(client: MatchmakerClient): void {
    logger.info(
      `[Matchmaker] Handling disconnect for client: ${client.ticketId}, Playlist: ${client.playlist}, Region: ${client.region}`
    );

    // Remove from global client list
    this.clients = this.clients.filter((c) => c.ticketId !== client.ticketId);

    // Remove from specific waiting queue
    const queueKey = client.getQueueKey();
    const queue = this.waitingClientsByPlaylistRegion.get(queueKey);
    if (queue) {
      const updatedQueue = queue.filter((c) => c.ticketId !== client.ticketId);
      if (updatedQueue.length > 0) {
        this.waitingClientsByPlaylistRegion.set(queueKey, updatedQueue);
      } else {
        // If queue becomes empty, remove it and stop its poller
        this.waitingClientsByPlaylistRegion.delete(queueKey);
        const intervalId = this.activePollers.get(queueKey);
        if (intervalId) {
          logger.info(
            `[Matchmaker] Stopping poller for ${queueKey} due to client disconnect making queue empty.`
          );
          clearInterval(intervalId);
          this.activePollers.delete(queueKey);
        }
      }
    }
    logger.info(
      `[Matchmaker] Client ${client.ticketId} removed. Global clients: ${
        this.clients.length
      }. Queue ${queueKey} size: ${
        (this.waitingClientsByPlaylistRegion.get(queueKey) || []).length
      }`
    );
  }
}
