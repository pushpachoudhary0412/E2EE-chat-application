import { HubConnection, HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { CryptoService } from '../utils/crypto';
import type { ChatMessage, MessageType, PresenceStatus, EncryptedData } from '../../../shared/types';

export class ChatService {
  private connection: HubConnection | null = null;
  private cryptoService = CryptoService.getInstance();
  private userId: string;
  private sharedSecret: CryptoKey | null = null;
  private otherUserPublicKey: CryptoKey | null = null;

  // Event handlers
  public onMessageReceived?: (message: ChatMessage) => void;
  public onPresenceUpdate?: (presence: PresenceStatus) => void;
  public onTypingStart?: (userId: string) => void;
  public onTypingStop?: (userId: string) => void;
  public onError?: (error: string) => void;
  public onHandshakeComplete?: () => void;

  constructor(userId: string) {
    this.userId = userId;
  }

  async connect(): Promise<void> {
    try {
      this.connection = new HubConnectionBuilder()
        .withUrl(`http://localhost:5214/chatHub?userId=${this.userId}`)
        .withAutomaticReconnect()
        .configureLogging(LogLevel.Information)
        .build();

      this.setupEventHandlers();
      await this.connection.start();
      console.log('Connected to chat hub');

      // Generate our key pair
      await this.cryptoService.generateKeyPair();
    } catch (error) {
      console.error('Failed to connect:', error);
      throw error;
    }
  }

  private setupEventHandlers(): void {
    if (!this.connection) return;

    this.connection.on('ReceiveMessage', async (message: any) => {
      try {
        if (message.type === 2 && this.sharedSecret) { // Chat type
          // Decrypt the message
          const encryptedData: EncryptedData = JSON.parse(message.data);
          const decryptedText = await this.cryptoService.decryptMessage(encryptedData, this.sharedSecret);

          const decryptedMessage: ChatMessage = {
            ...message,
            data: decryptedText,
            timestamp: new Date(message.timestamp)
          };

          this.onMessageReceived?.(decryptedMessage);
        } else if (message.type === 1) { // Handshake type
          // Handle handshake - extract public key
          const handshakeData = JSON.parse(message.data);
          this.otherUserPublicKey = await this.cryptoService.importPublicKey(handshakeData.publicKey);

          // Derive shared secret
          this.sharedSecret = await this.cryptoService.deriveSharedSecret(this.otherUserPublicKey);

          // Send our public key back
          const ourPublicKey = await this.cryptoService.exportPublicKey();
          await this.sendHandshakeResponse(ourPublicKey);

          this.onHandshakeComplete?.();
        }
      } catch (error) {
        console.error('Failed to process message:', error);
        this.onError?.('Failed to decrypt message');
      }
    });

    this.connection.on('UserPresence', (presence: PresenceStatus) => {
      this.onPresenceUpdate?.(presence);
    });

    this.connection.on('UserTyping', (userId: string) => {
      this.onTypingStart?.(userId);
    });

    this.connection.on('UserStoppedTyping', (userId: string) => {
      this.onTypingStop?.(userId);
    });

    this.connection.on('ReceiveError', (error: any) => {
      this.onError?.(error.message || 'Server error');
    });
  }

  async initiateHandshake(otherUserId: string): Promise<void> {
    if (!this.connection) throw new Error('Not connected');

    try {
      const publicKey = await this.cryptoService.exportPublicKey();
      const handshakeMessage = {
        type: 1, // Handshake
        senderId: this.userId,
        receiverId: otherUserId,
        data: JSON.stringify({ publicKey }),
        timestamp: new Date()
      };

      await this.connection.invoke('SendMessage', handshakeMessage);
    } catch (error) {
      console.error('Failed to initiate handshake:', error);
      throw error;
    }
  }

  private async sendHandshakeResponse(publicKey: string): Promise<void> {
    if (!this.connection || !this.otherUserPublicKey) return;

    const handshakeResponse = {
      type: 1, // Handshake
      senderId: this.userId,
      receiverId: '',
      data: JSON.stringify({ publicKey }),
      timestamp: new Date()
    };

    await this.connection.invoke('SendMessage', handshakeResponse);
  }

  async sendMessage(text: string): Promise<void> {
    if (!this.connection || !this.sharedSecret) {
      throw new Error('Not ready to send messages');
    }

    try {
      // Encrypt the message
      const encryptedData = await this.cryptoService.encryptMessage(text, this.sharedSecret);

      const message = {
        type: 2, // Chat
        senderId: this.userId,
        receiverId: '',
        data: JSON.stringify(encryptedData),
        timestamp: new Date()
      };

      await this.connection.invoke('SendMessage', message);

      // Also add to our own messages
      const ownMessage: ChatMessage = {
        type: 2 as any,
        senderId: this.userId,
        receiverId: '',
        data: text,
        timestamp: new Date()
      };
      this.onMessageReceived?.(ownMessage);
    } catch (error) {
      console.error('Failed to send message:', error);
      throw error;
    }
  }

  async sendTyping(): Promise<void> {
    if (!this.connection) return;
    await this.connection.invoke('SendTyping', this.userId);
  }

  async stopTyping(): Promise<void> {
    if (!this.connection) return;
    await this.connection.invoke('StopTyping', this.userId);
  }

  async updatePresence(status: string): Promise<void> {
    if (!this.connection) return;
    try {
      await this.connection.invoke('UpdatePresence', status);
    } catch (error) {
      console.error('Failed to update presence:', error);
    }
  }

  disconnect(): void {
    if (this.connection) {
      this.connection.stop();
      this.connection = null;
    }
  }
}
