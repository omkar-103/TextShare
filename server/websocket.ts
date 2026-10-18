import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import {
  getDocumentByShareCode,
  updateDocumentContent,
  hashPassword,
} from './db.js';

interface Participant {
  clientId: string;
  clientName: string;
  color: string;
  isOwner: boolean;
  canEdit: boolean;
  cursor?: { line: number; ch: number };
  selection?: { from: { line: number; ch: number }; to: { line: number; ch: number } };
  joinedAt: number;
}

interface RoomClient {
  ws: WebSocket;
  participant: Participant;
  shareCode: string;
  ownerToken?: string;
  password?: string;
}

interface DocumentRoom {
  shareCode: string;
  clients: Set<RoomClient>;
  content: string;
  version: number;
  lastSavedContent: string;
  lastSavedAt: number;
  saveTimer?: NodeJS.Timeout;
}

const rooms = new Map<string, DocumentRoom>();
let wssInstance: WebSocketServer | null = null;

const COLORS = [
  '#2563eb', // blue
  '#16a34a', // green
  '#d97706', // amber
  '#9333ea', // purple
  '#dc2626', // red
  '#0891b2', // cyan
  '#ea580c', // orange
  '#4f46e5', // indigo
];

function getRandomColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function broadcastToRoom(room: DocumentRoom, message: object, excludeClient?: RoomClient) {
  const data = JSON.stringify(message);
  for (const client of room.clients) {
    if (client !== excludeClient && client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(data);
      } catch (err) {
        console.error('Failed to send to client', err);
      }
    }
  }
}

function getRoomParticipants(room: DocumentRoom): Participant[] {
  return Array.from(room.clients).map((c) => c.participant);
}

function scheduleDurableSave(room: DocumentRoom, forceSnapshot = false) {
  if (room.saveTimer) {
    clearTimeout(room.saveTimer);
  }

  const doSave = async () => {
    try {
      const doc = await getDocumentByShareCode(room.shareCode);
      if (!doc) return;

      if (room.content !== room.lastSavedContent) {
        await updateDocumentContent({
          id: doc.id,
          content: room.content,
          createSnapshot: forceSnapshot || (Date.now() - room.lastSavedAt > 60000), // snapshot every minute of active editing
          actorName: 'Collaborative Editor',
        });
        room.lastSavedContent = room.content;
        room.lastSavedAt = Date.now();

        // Broadcast saved status
        broadcastToRoom(room, {
          type: 'save_status',
          status: 'saved',
          timestamp: Date.now(),
          version: room.version,
        });
      }
    } catch (err) {
      console.error('Failed to persist collaborative update to MongoDB:', err);
    }
  };

  if (forceSnapshot) {
    doSave();
  } else {
    room.saveTimer = setTimeout(doSave, 800); // 800ms debounce
  }
}

export function notifyPermissionChanged(shareCode: string, newMode: 'view' | 'edit') {
  const room = rooms.get(shareCode);
  if (!room) return;

  for (const client of room.clients) {
    if (!client.participant.isOwner) {
      client.participant.canEdit = newMode === 'edit';
    }
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(
        JSON.stringify({
          type: 'permission_changed',
          permissionMode: newMode,
          canEdit: client.participant.canEdit,
          message: `Permission updated to ${newMode === 'edit' ? 'Can Edit' : 'View Only'} by owner.`,
        })
      );
    }
  }

  // Broadcast updated participant list
  broadcastToRoom(room, {
    type: 'presence',
    participants: getRoomParticipants(room),
  });
}

export function notifyDocumentRevoked(shareCode: string) {
  const room = rooms.get(shareCode);
  if (!room) return;

  broadcastToRoom(room, {
    type: 'revoked',
    message: 'Access to this document has been revoked by the owner.',
  });

  // Disconnect non-owners
  for (const client of room.clients) {
    if (!client.participant.isOwner) {
      client.ws.close(4001, 'Document revoked');
    }
  }
}

export function notifyDocumentVersionRestored(shareCode: string, newContent: string, newVersion: number) {
  const room = rooms.get(shareCode);
  if (!room) return;

  room.content = newContent;
  room.lastSavedContent = newContent;
  room.version = newVersion;

  broadcastToRoom(room, {
    type: 'restored',
    content: newContent,
    version: newVersion,
    timestamp: Date.now(),
  });
}

export function setupWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  wssInstance = wss;

  wss.on('connection', (ws: WebSocket) => {
    let currentClient: RoomClient | null = null;
    let isAlive = true;

    ws.on('pong', () => {
      isAlive = true;
    });

    ws.on('message', async (raw: string) => {
      try {
        const msg = JSON.parse(raw.toString());

        switch (msg.type) {
          case 'join': {
            const { shareCode, ownerToken, password, clientId, clientName } = msg;
            if (!shareCode) {
              ws.send(JSON.stringify({ type: 'error', message: 'Missing shareCode' }));
              return;
            }

            const doc = await getDocumentByShareCode(shareCode);
            if (!doc) {
              ws.send(JSON.stringify({ type: 'error', message: 'Document not found' }));
              ws.close(4004, 'Document not found');
              return;
            }

            // Expiration check
            if (doc.expiresAt && doc.expiresAt <= Date.now()) {
              ws.send(JSON.stringify({ type: 'expired', message: 'Document has expired' }));
              ws.close(4010, 'Document expired');
              return;
            }

            // Revocation check
            if (doc.revokedAt) {
              ws.send(JSON.stringify({ type: 'revoked', message: 'Document access revoked' }));
              ws.close(4001, 'Document revoked');
              return;
            }

            // Password check
            const isOwner = Boolean(ownerToken && ownerToken === doc.ownerToken);
            if (doc.passwordHash && !isOwner) {
              if (!password || hashPassword(password) !== doc.passwordHash) {
                ws.send(JSON.stringify({ type: 'auth_required', message: 'Password required' }));
                return;
              }
            }

            const canEdit = isOwner || doc.permissionMode === 'edit';

            // Get or create room
            let room = rooms.get(shareCode);
            if (!room) {
              room = {
                shareCode,
                clients: new Set(),
                content: doc.content,
                version: doc.contentVersion,
                lastSavedContent: doc.content,
                lastSavedAt: Date.now(),
              };
              rooms.set(shareCode, room);
            }

            const safeClientId = clientId || `client_${Math.random().toString(36).slice(2, 9)}`;
            const safeClientName = clientName || (isOwner ? 'Owner' : `User ${room.clients.size + 1}`);

            const participant: Participant = {
              clientId: safeClientId,
              clientName: safeClientName,
              color: getRandomColor(),
              isOwner,
              canEdit,
              joinedAt: Date.now(),
            };

            currentClient = {
              ws,
              participant,
              shareCode,
              ownerToken,
              password,
            };

            room.clients.add(currentClient);

            // Send init state to the joining client
            ws.send(
              JSON.stringify({
                type: 'init',
                content: room.content,
                version: room.version,
                permissionMode: doc.permissionMode,
                canEdit,
                isOwner,
                title: doc.title,
                language: doc.language,
                expiresAt: doc.expiresAt,
                participants: getRoomParticipants(room),
                yourId: safeClientId,
              })
            );

            // Broadcast presence to others
            broadcastToRoom(
              room,
              {
                type: 'user_joined',
                participant,
                participants: getRoomParticipants(room),
              },
              currentClient
            );
            break;
          }

          case 'edit': {
            if (!currentClient) return;
            const room = rooms.get(currentClient.shareCode);
            if (!room) return;

            const doc = await getDocumentByShareCode(currentClient.shareCode);
            if (!doc) return;

            // Recheck expiration on every edit
            if (doc.expiresAt && doc.expiresAt <= Date.now()) {
              ws.send(JSON.stringify({ type: 'expired', message: 'Document has expired' }));
              ws.close(4010, 'Document expired');
              return;
            }

            // Recheck revocation
            if (doc.revokedAt) {
              ws.send(JSON.stringify({ type: 'revoked', message: 'Document access revoked' }));
              ws.close(4001, 'Document revoked');
              return;
            }

            // Verify edit permission
            const allowedToEdit = currentClient.participant.isOwner || doc.permissionMode === 'edit';
            if (!allowedToEdit) {
              ws.send(
                JSON.stringify({
                  type: 'error',
                  message: 'Document is view-only. Edits not permitted.',
                })
              );
              return;
            }

            const newContent = typeof msg.content === 'string' ? msg.content : '';
            room.content = newContent;
            room.version += 1;

            // Send immediate saving indicator
            ws.send(
              JSON.stringify({
                type: 'save_status',
                status: 'saving',
                version: room.version,
              })
            );

            // Broadcast delta/sync to all other clients
            broadcastToRoom(
              room,
              {
                type: 'sync',
                content: room.content,
                version: room.version,
                senderId: currentClient.participant.clientId,
                timestamp: Date.now(),
              },
              currentClient
            );

            // Debounced durable persistence to MongoDB Atlas
            scheduleDurableSave(room, msg.forceSnapshot === true);
            break;
          }

          case 'cursor': {
            if (!currentClient) return;
            const room = rooms.get(currentClient.shareCode);
            if (!room) return;

            currentClient.participant.cursor = msg.cursor;
            currentClient.participant.selection = msg.selection;

            broadcastToRoom(
              room,
              {
                type: 'cursor_update',
                clientId: currentClient.participant.clientId,
                cursor: msg.cursor,
                selection: msg.selection,
              },
              currentClient
            );
            break;
          }

          case 'ping': {
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            break;
          }

          default:
            break;
        }
      } catch (err) {
        console.error('WebSocket message parsing error', err);
      }
    });

    const cleanupClient = async () => {
      if (currentClient) {
        const room = rooms.get(currentClient.shareCode);
        if (room) {
          room.clients.delete(currentClient);
          if (room.clients.size === 0) {
            // Save state immediately if any unsaved changes
            if (room.content !== room.lastSavedContent) {
              try {
                const doc = await getDocumentByShareCode(room.shareCode);
                if (doc) {
                  await updateDocumentContent({
                    id: doc.id,
                    content: room.content,
                    createSnapshot: true,
                    actorName: 'Last Connected Editor',
                  });
                }
              } catch (err) {
                console.error('Failed to save room content on close:', err);
              }
            }
            if (room.saveTimer) clearTimeout(room.saveTimer);
            rooms.delete(currentClient.shareCode);
          } else {
            // Broadcast user left
            broadcastToRoom(room, {
              type: 'user_left',
              clientId: currentClient.participant.clientId,
              participants: getRoomParticipants(room),
            });
          }
        }
        currentClient = null;
      }
    };

    ws.on('close', cleanupClient);
    ws.on('error', cleanupClient);
  });

  // Heartbeat ping interval
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    });
  }, 30000);
  interval.unref();

  wss.on('close', () => {
    clearInterval(interval);
  });

  return wss;
}
