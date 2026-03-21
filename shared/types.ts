export type MessageType = 'connect' | 'handshake' | 'chat' | 'typing' | 'ack' | 'error';

export const MAX_PROTOCOL_DATA_LENGTH = 8192;

const MESSAGE_TYPES: ReadonlySet<MessageType> = new Set([
  'connect',
  'handshake',
  'chat',
  'typing',
  'ack',
  'error'
]);

const PRESENCE_STATUSES: ReadonlySet<PresenceStatus['status']> = new Set([
  'online',
  'offline',
  'inactive'
]);

export interface ChatMessage {
  type: MessageType;
  senderId: string;
  receiverId: string;
  data: string; // Encrypted for chat messages
  messageId?: string;
  timestamp: Date | string;
  deliveredToOnline?: boolean; // Tracks if message was delivered to an online recipient
}

export interface ErrorMessage {
  errorCode: string;
  message: string;
}

export interface PresenceStatus {
  userId: string;
  status: 'online' | 'offline' | 'inactive';
  lastSeen: Date;
}

export interface HandshakePayload {
  publicKey: string;
  reply?: boolean;
}

export interface ConnectPayload {
  status: 'connected';
}

export interface TypingPayload {
  isTyping: boolean;
}

export interface AckPayload {
  messageId: string;
}

export interface ProtocolErrorPayload {
  errorCode: string;
  message: string;
}

export interface CryptoKeys {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  sharedSecret?: CryptoKey;
}

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  tag: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isMessageType(value: unknown): value is MessageType {
  return typeof value === 'string' && MESSAGE_TYPES.has(value as MessageType);
}

function parseJsonObject(raw: string, label: string): Record<string, unknown> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }

  if (!isRecord(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }

  return parsed;
}

export function validateChatMessage(message: unknown): ChatMessage {
  if (!isRecord(message)) {
    throw new Error('Message must be an object.');
  }

  const { type, senderId, receiverId, data, timestamp, deliveredToOnline } = message;
  const messageId = message.messageId;

  if (!isMessageType(type)) {
    throw new Error('Message type is invalid.');
  }

  if (typeof senderId !== 'string' || senderId.trim().length === 0) {
    throw new Error('Sender ID is required.');
  }

  if (typeof receiverId !== 'string' || receiverId.trim().length === 0) {
    throw new Error('Receiver ID is required.');
  }

  if (typeof data !== 'string' || data.length === 0) {
    throw new Error('Message data is required.');
  }

  if (data.length > MAX_PROTOCOL_DATA_LENGTH) {
    throw new Error('Message data exceeds maximum allowed size.');
  }

  if (messageId !== undefined && (typeof messageId !== 'string' || messageId.trim().length === 0)) {
    throw new Error('messageId must be a non-empty string when provided.');
  }

  if ((type === 'chat' || type === 'ack') && (typeof messageId !== 'string' || messageId.trim().length === 0)) {
    throw new Error('messageId is required for chat and ack messages.');
  }

  if (!(timestamp instanceof Date) && typeof timestamp !== 'string') {
    throw new Error('Timestamp must be a Date or ISO string.');
  }

  if (deliveredToOnline !== undefined && typeof deliveredToOnline !== 'boolean') {
    throw new Error('deliveredToOnline must be a boolean when provided.');
  }

  return {
    type,
    senderId,
    receiverId,
    data,
    messageId,
    timestamp,
    deliveredToOnline
  };
}

export function validatePresenceStatus(presence: unknown): PresenceStatus {
  if (!isRecord(presence)) {
    throw new Error('Presence payload must be an object.');
  }

  const { userId, status, lastSeen } = presence;

  if (typeof userId !== 'string' || userId.trim().length === 0) {
    throw new Error('Presence userId is required.');
  }

  if (typeof status !== 'string' || !PRESENCE_STATUSES.has(status as PresenceStatus['status'])) {
    throw new Error('Presence status is invalid.');
  }

  const parsedLastSeen = lastSeen instanceof Date ? lastSeen : new Date(String(lastSeen));
  if (Number.isNaN(parsedLastSeen.getTime())) {
    throw new Error('Presence lastSeen is invalid.');
  }

  return {
    userId,
    status: status as PresenceStatus['status'],
    lastSeen: parsedLastSeen
  };
}

export function parseHandshakePayload(raw: string): HandshakePayload {
  const parsed = parseJsonObject(raw, 'Handshake payload');
  const { publicKey, reply } = parsed;

  if (typeof publicKey !== 'string' || publicKey.length === 0) {
    throw new Error('Handshake public key is required.');
  }

  if (reply !== undefined && typeof reply !== 'boolean') {
    throw new Error('Handshake reply flag must be a boolean.');
  }

  return {
    publicKey,
    reply
  };
}

export function parseEncryptedData(raw: string): EncryptedData {
  const parsed = parseJsonObject(raw, 'Encrypted payload');
  const { ciphertext, iv, tag } = parsed;

  if (typeof ciphertext !== 'string' || ciphertext.length === 0) {
    throw new Error('Encrypted payload ciphertext is required.');
  }

  if (typeof iv !== 'string' || iv.length === 0) {
    throw new Error('Encrypted payload iv is required.');
  }

  if (typeof tag !== 'string') {
    throw new Error('Encrypted payload tag must be a string.');
  }

  return {
    ciphertext,
    iv,
    tag
  };
}

export function parseConnectPayload(raw: string): ConnectPayload {
  const parsed = parseJsonObject(raw, 'Connect payload');
  const { status } = parsed;

  if (status !== 'connected') {
    throw new Error('Connect payload status must be "connected".');
  }

  return { status };
}

export function parseTypingPayload(raw: string): TypingPayload {
  const parsed = parseJsonObject(raw, 'Typing payload');
  const { isTyping } = parsed;

  if (typeof isTyping !== 'boolean') {
    throw new Error('Typing payload isTyping must be a boolean.');
  }

  return { isTyping };
}

export function parseAckPayload(raw: string): AckPayload {
  const parsed = parseJsonObject(raw, 'Ack payload');
  const { messageId } = parsed;

  if (typeof messageId !== 'string' || messageId.trim().length === 0) {
    throw new Error('Ack payload messageId is required.');
  }

  return { messageId };
}

export function parseProtocolErrorPayload(raw: string): ProtocolErrorPayload {
  const parsed = parseJsonObject(raw, 'Error payload');
  const { errorCode, message } = parsed;

  if (typeof errorCode !== 'string' || errorCode.length === 0) {
    throw new Error('Error payload errorCode is required.');
  }

  if (typeof message !== 'string' || message.length === 0) {
    throw new Error('Error payload message is required.');
  }

  return {
    errorCode,
    message
  };
}
