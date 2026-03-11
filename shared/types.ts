export enum MessageType {
  Connect = 'connect',
  Handshake = 'handshake',
  Chat = 'chat',
  Typing = 'typing',
  Error = 'error'
}

export interface ChatMessage {
  type: MessageType;
  senderId: string;
  receiverId: string;
  data: string; // Encrypted for chat messages
  timestamp: Date;
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