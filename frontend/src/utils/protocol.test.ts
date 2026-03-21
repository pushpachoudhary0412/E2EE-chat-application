import { describe, expect, it } from 'vitest';
import {
  MAX_PROTOCOL_DATA_LENGTH,
  parseAckPayload,
  parseConnectPayload,
  parseEncryptedData,
  parseHandshakePayload,
  parseProtocolErrorPayload,
  parseTypingPayload,
  validateChatMessage,
  validatePresenceStatus
} from '../../../shared/types';

describe('protocol validation', () => {
  it('accepts a valid chat message envelope', () => {
    const message = validateChatMessage({
      type: 'chat',
      senderId: 'alice',
      receiverId: 'bob',
      data: '{"ciphertext":"abc","iv":"def","tag":""}',
      messageId: 'msg-1',
      timestamp: new Date().toISOString()
    });

    expect(message.type).toBe('chat');
    expect(message.senderId).toBe('alice');
  });

  it('rejects invalid chat message envelopes safely', () => {
    expect(() =>
      validateChatMessage({
        type: 'not-a-type',
        senderId: 'alice',
        receiverId: 'bob',
        data: 'x',
        messageId: 'msg-1',
        timestamp: new Date().toISOString()
      })
    ).toThrow('Message type is invalid.');
  });

  it('rejects chat messages without messageId', () => {
    expect(() =>
      validateChatMessage({
        type: 'chat',
        senderId: 'alice',
        receiverId: 'bob',
        data: '{"ciphertext":"abc","iv":"def","tag":""}',
        timestamp: new Date().toISOString()
      })
    ).toThrow('messageId is required for chat and ack messages.');
  });

  it('rejects oversized payloads', () => {
    expect(() =>
      validateChatMessage({
        type: 'chat',
        senderId: 'alice',
        receiverId: 'bob',
        data: 'x'.repeat(MAX_PROTOCOL_DATA_LENGTH + 1),
        messageId: 'msg-oversize',
        timestamp: new Date().toISOString()
      })
    ).toThrow('Message data exceeds maximum allowed size.');
  });

  it('parses a valid connect payload', () => {
    const payload = parseConnectPayload(JSON.stringify({
      status: 'connected'
    }));

    expect(payload.status).toBe('connected');
  });

  it('parses a valid handshake payload', () => {
    const payload = parseHandshakePayload(JSON.stringify({
      publicKey: 'base64-public-key',
      reply: true
    }));

    expect(payload.publicKey).toBe('base64-public-key');
    expect(payload.reply).toBe(true);
  });

  it('rejects malformed handshake JSON', () => {
    expect(() => parseHandshakePayload('{')).toThrow('Handshake payload must be valid JSON.');
  });

  it('parses encrypted chat data', () => {
    const payload = parseEncryptedData(JSON.stringify({
      ciphertext: 'cipher',
      iv: 'iv',
      tag: ''
    }));

    expect(payload.ciphertext).toBe('cipher');
    expect(payload.iv).toBe('iv');
    expect(payload.tag).toBe('');
  });

  it('parses typing payloads', () => {
    const payload = parseTypingPayload(JSON.stringify({
      isTyping: true
    }));

    expect(payload.isTyping).toBe(true);
  });

  it('parses protocol error payloads', () => {
    const payload = parseProtocolErrorPayload(JSON.stringify({
      errorCode: 'INVALID_TYPE',
      message: 'Message type is invalid.'
    }));

    expect(payload.errorCode).toBe('INVALID_TYPE');
    expect(payload.message).toBe('Message type is invalid.');
  });

  it('parses ack payloads', () => {
    const payload = parseAckPayload(JSON.stringify({
      messageId: 'msg-123'
    }));

    expect(payload.messageId).toBe('msg-123');
  });

  it('rejects encrypted payloads missing required fields', () => {
    expect(() =>
      parseEncryptedData(JSON.stringify({
        ciphertext: 'cipher',
        tag: ''
      }))
    ).toThrow('Encrypted payload iv is required.');
  });

  it('accepts valid presence payloads', () => {
    const presence = validatePresenceStatus({
      userId: 'bob',
      status: 'inactive',
      lastSeen: new Date().toISOString()
    });

    expect(presence.status).toBe('inactive');
    expect(presence.lastSeen).toBeInstanceOf(Date);
  });

  it('rejects invalid presence payloads', () => {
    expect(() =>
      validatePresenceStatus({
        userId: 'bob',
        status: 'away',
        lastSeen: new Date().toISOString()
      })
    ).toThrow('Presence status is invalid.');
  });
});
