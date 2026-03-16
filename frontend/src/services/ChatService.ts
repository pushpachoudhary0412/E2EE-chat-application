import { HubConnection, HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { CryptoService } from '../utils/crypto';
import {
  parseConnectPayload,
  parseEncryptedData,
  parseHandshakePayload,
  parseProtocolErrorPayload,
  parseTypingPayload,
  validateChatMessage,
  validatePresenceStatus,
  type ChatMessage,
  type ConnectPayload,
  type EncryptedData,
  type HandshakePayload,
  type MessageType,
  type ProtocolErrorPayload,
  type PresenceStatus
} from '../../../shared/types';

export class ChatService {
  private connection: HubConnection | null = null;
  private readonly cryptoService = CryptoService.getInstance();
  private readonly userId: string;
  private readonly otherUserId: string;
  private sharedSecret: CryptoKey | null = null;
  private otherUserOnline = false;
  private handshakeStarted = false;
  private handshakeComplete = false;

  public onMessageReceived?: (message: ChatMessage) => void;
  public onPresenceUpdate?: (presence: PresenceStatus) => void;
  public onTypingStart?: (userId: string) => void;
  public onTypingStop?: (userId: string) => void;
  public onError?: (error: string) => void;
  public onHandshakeComplete?: () => void;
  public onConnectionStateChange?: (connected: boolean) => void;

  constructor(userId: string, otherUserId: string) {
    this.userId = userId;
    this.otherUserId = otherUserId;
  }

  async connect(): Promise<void> {
    await this.cryptoService.generateKeyPair();

    this.connection = new HubConnectionBuilder()
      .withUrl(`http://localhost:5214/chatHub?userId=${encodeURIComponent(this.userId)}`)
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Information)
      .build();

    this.setupEventHandlers();
    await this.connection.start();
    this.onConnectionStateChange?.(true);
    await this.sendProtocolMessage('connect', { status: 'connected' });
  }

  async initiateHandshake(): Promise<void> {
    if (this.handshakeStarted || this.handshakeComplete) {
      return;
    }

    this.handshakeStarted = true;
    const publicKey = await this.cryptoService.exportPublicKey();
    await this.sendProtocolMessage('handshake', {
      publicKey,
      reply: false
    });
  }

  async sendMessage(text: string): Promise<void> {
    if (!this.sharedSecret) {
      throw new Error('Secure session has not been established yet.');
    }

    const encryptedData = await this.cryptoService.encryptMessage(text, this.sharedSecret);
    await this.sendProtocolMessage('chat', encryptedData);

    this.onMessageReceived?.({
      type: 'chat',
      senderId: this.userId,
      receiverId: this.otherUserId,
      data: text,
      timestamp: new Date(),
      deliveredToOnline: this.otherUserOnline
    });
  }

  async sendTyping(): Promise<void> {
    await this.sendProtocolMessage('typing', { isTyping: true });
  }

  async stopTyping(): Promise<void> {
    await this.sendProtocolMessage('typing', { isTyping: false });
  }

  async updatePresence(status: PresenceStatus['status']): Promise<void> {
    if (!this.connection) return;

    try {
      await this.connection.invoke('UpdatePresence', status);
    } catch (error) {
      console.error('Failed to update presence:', error);
    }
  }

  disconnect(): void {
    if (this.connection) {
      void this.connection.stop();
      this.connection = null;
    }
  }

  private setupEventHandlers(): void {
    if (!this.connection) {
      return;
    }

    this.connection.on('ReceiveMessage', async (message: ChatMessage) => {
      try {
        const validatedMessage = validateChatMessage(message);

        if (validatedMessage.receiverId !== this.userId) {
          return;
        }

        if (validatedMessage.type === 'error') {
          const errorPayload: ProtocolErrorPayload = parseProtocolErrorPayload(validatedMessage.data);
          this.onError?.(errorPayload.message);
          return;
        }

        if (validatedMessage.senderId !== this.otherUserId && validatedMessage.type !== 'connect') {
          return;
        }

        if (validatedMessage.type === 'connect') {
          const connectPayload: ConnectPayload = parseConnectPayload(validatedMessage.data);
          if (connectPayload.status === 'connected' && !this.handshakeStarted && !this.handshakeComplete) {
            await this.initiateHandshake();
          }
          return;
        }

        if (validatedMessage.type === 'handshake') {
          await this.handleHandshake(validatedMessage);
          return;
        }

        if (validatedMessage.type === 'typing') {
          const typingPayload = parseTypingPayload(validatedMessage.data);
          if (typingPayload.isTyping) {
            this.onTypingStart?.(validatedMessage.senderId);
          } else {
            this.onTypingStop?.(validatedMessage.senderId);
          }
          return;
        }

        if (validatedMessage.type !== 'chat' || !this.sharedSecret) {
          return;
        }

        const encryptedData = parseEncryptedData(validatedMessage.data) as EncryptedData;
        const decryptedText = await this.cryptoService.decryptMessage(encryptedData, this.sharedSecret);

        this.onMessageReceived?.({
          ...validatedMessage,
          data: decryptedText,
          timestamp: new Date(validatedMessage.timestamp)
        });
      } catch (error) {
        console.error('Failed to process message:', error);
        this.onError?.('Failed to process an incoming secure message.');
      }
    });

    this.connection.on('UserPresence', (presence: PresenceStatus) => {
      const validatedPresence = validatePresenceStatus(presence);

      if (validatedPresence.userId !== this.otherUserId) {
        return;
      }

      this.otherUserOnline = validatedPresence.status === 'online' || validatedPresence.status === 'inactive';
      this.onPresenceUpdate?.({
        ...validatedPresence,
        lastSeen: new Date(validatedPresence.lastSeen)
      });
    });

    this.connection.onreconnected(() => {
      this.onConnectionStateChange?.(true);
      this.handshakeStarted = false;
      this.handshakeComplete = false;
      void this.cryptoService.generateKeyPair()
        .then(async () => {
          await this.sendProtocolMessage('connect', { status: 'connected' });
          await this.initiateHandshake();
        })
        .catch((error) => {
          console.error('Failed to re-establish secure session:', error);
          this.onError?.('Failed to re-establish the secure session.');
        });
    });

    this.connection.onreconnecting(() => {
      this.sharedSecret = null;
      this.handshakeStarted = false;
      this.handshakeComplete = false;
      this.onConnectionStateChange?.(false);
    });

    this.connection.onclose(() => {
      this.sharedSecret = null;
      this.handshakeStarted = false;
      this.handshakeComplete = false;
      this.onConnectionStateChange?.(false);
    });
  }

  private async handleHandshake(message: ChatMessage): Promise<void> {
    const handshakeData: HandshakePayload = parseHandshakePayload(message.data);
    const otherUserPublicKey = await this.cryptoService.importPublicKey(handshakeData.publicKey);
    this.sharedSecret = await this.cryptoService.deriveSharedSecret(otherUserPublicKey);
    this.handshakeComplete = true;

    if (!handshakeData.reply) {
      const publicKey = await this.cryptoService.exportPublicKey();
      await this.sendProtocolMessage('handshake', {
        publicKey,
        reply: true
      });
    }

    this.onHandshakeComplete?.();
  }

  private async sendProtocolMessage(
    type: MessageType,
    payload: ConnectPayload | HandshakePayload | EncryptedData | { isTyping: boolean }
  ): Promise<void> {
    if (type === 'error') {
      throw new Error('Clients cannot send protocol error messages.');
    }

    if (!this.connection) {
      throw new Error('Not connected');
    }

    const message: ChatMessage = {
      type,
      senderId: this.userId,
      receiverId: this.otherUserId,
      data: JSON.stringify(payload),
      timestamp: new Date()
    };

    await this.connection.invoke('SendMessage', message);
  }
}
