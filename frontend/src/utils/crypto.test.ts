import { describe, it, expect, beforeEach } from 'vitest';
import { CryptoService } from './crypto';

describe('CryptoService - Security Tests', () => {
  let cryptoService1: CryptoService;
  let cryptoService2: CryptoService;

  beforeEach(async () => {
    cryptoService1 = new CryptoService();
    cryptoService2 = new CryptoService();
    await cryptoService1.generateKeyPair();
    await cryptoService2.generateKeyPair();
  });

  describe('Key Generation & Exchange', () => {
    it('should generate valid ECDH key pairs', async () => {
      const keys = cryptoService1.getKeys();
      expect(keys).toBeDefined();
      expect(keys?.privateKey).toBeDefined();
      expect(keys?.publicKey).toBeDefined();
    });

    it('should successfully exchange keys between two parties', async () => {
      const publicKey1Base64 = await cryptoService1.exportPublicKey();
      const publicKey2Base64 = await cryptoService2.exportPublicKey();

      const publicKey1 = await cryptoService2.importPublicKey(publicKey1Base64);
      const publicKey2 = await cryptoService1.importPublicKey(publicKey2Base64);

      const sharedSecret1 = await cryptoService1.deriveSharedSecret(publicKey2);
      const sharedSecret2 = await cryptoService2.deriveSharedSecret(publicKey1);

      // Verify both can communicate
      const message = 'Test message';
      const encrypted = await cryptoService1.encryptMessage(message, sharedSecret1);
      const decrypted = await cryptoService2.decryptMessage(encrypted, sharedSecret2);

      expect(decrypted).toBe(message);
    });

    it('should reject invalid public keys', async () => {
      await expect(
        cryptoService1.importPublicKey('invalid-key')
      ).rejects.toThrow();
    });
  });

  describe('Encryption & Decryption', () => {
    let sharedSecret1: CryptoKey;
    let sharedSecret2: CryptoKey;

    beforeEach(async () => {
      const publicKey1Base64 = await cryptoService1.exportPublicKey();
      const publicKey2Base64 = await cryptoService2.exportPublicKey();
      const publicKey1 = await cryptoService2.importPublicKey(publicKey1Base64);
      const publicKey2 = await cryptoService1.importPublicKey(publicKey2Base64);
      sharedSecret1 = await cryptoService1.deriveSharedSecret(publicKey2);
      sharedSecret2 = await cryptoService2.deriveSharedSecret(publicKey1);
    });

    it('should encrypt and decrypt messages correctly', async () => {
      const message = 'Hello, secure world!';
      const encrypted = await cryptoService1.encryptMessage(message, sharedSecret1);
      const decrypted = await cryptoService2.decryptMessage(encrypted, sharedSecret2);

      expect(decrypted).toBe(message);
    });

    it('should handle messages with emojis', async () => {
      const message = '👍 ❤️ 😂 Secure chat!';
      const encrypted = await cryptoService1.encryptMessage(message, sharedSecret1);
      const decrypted = await cryptoService2.decryptMessage(encrypted, sharedSecret2);

      expect(decrypted).toBe(message);
    });

    it('should use different IV for each encryption', async () => {
      const message = 'Same message';
      const encrypted1 = await cryptoService1.encryptMessage(message, sharedSecret1);
      const encrypted2 = await cryptoService1.encryptMessage(message, sharedSecret1);

      // Different IVs mean different ciphertexts
      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
    });
  });

  describe('Security & Tamper Detection', () => {
    let sharedSecret1: CryptoKey;
    let sharedSecret2: CryptoKey;

    beforeEach(async () => {
      const publicKey1Base64 = await cryptoService1.exportPublicKey();
      const publicKey2Base64 = await cryptoService2.exportPublicKey();
      const publicKey1 = await cryptoService2.importPublicKey(publicKey1Base64);
      const publicKey2 = await cryptoService1.importPublicKey(publicKey2Base64);
      sharedSecret1 = await cryptoService1.deriveSharedSecret(publicKey2);
      sharedSecret2 = await cryptoService2.deriveSharedSecret(publicKey1);
    });

    it('should detect tampered ciphertext', async () => {
      const message = 'Important message';
      const encrypted = await cryptoService1.encryptMessage(message, sharedSecret1);

      // Tamper with ciphertext
      const tampered = {
        ...encrypted,
        ciphertext: encrypted.ciphertext.substring(0, encrypted.ciphertext.length - 10) + 'XXXXXXXXXX'
      };

      await expect(
        cryptoService2.decryptMessage(tampered, sharedSecret2)
      ).rejects.toThrow('Message decryption failed');
    });

    it('should detect tampered IV', async () => {
      const message = 'Secure message';
      const encrypted = await cryptoService1.encryptMessage(message, sharedSecret1);

      // Tamper with IV
      const tampered = {
        ...encrypted,
        iv: encrypted.iv.substring(0, encrypted.iv.length - 4) + 'XXXX'
      };

      await expect(
        cryptoService2.decryptMessage(tampered, sharedSecret2)
      ).rejects.toThrow('Message decryption failed');
    });

    it('should fail to decrypt with wrong shared key', async () => {
      const message = 'Secret message';
      const encrypted = await cryptoService1.encryptMessage(message, sharedSecret1);

      // Create third party with different key
      const cryptoService3 = new CryptoService();
      await cryptoService3.generateKeyPair();
      const publicKey3Base64 = await cryptoService3.exportPublicKey();
      const publicKey3 = await cryptoService1.importPublicKey(publicKey3Base64);
      const wrongSharedSecret = await cryptoService1.deriveSharedSecret(publicKey3);

      await expect(
        cryptoService2.decryptMessage(encrypted, wrongSharedSecret)
      ).rejects.toThrow('Message decryption failed');
    });

    it('should verify AES-GCM authentication', async () => {
      const message = 'Authenticated message';
      const encrypted = await cryptoService1.encryptMessage(message, sharedSecret1);

      // Decode and tamper
      const binaryString = atob(encrypted.ciphertext);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      if (bytes.length > 10) {
        const currentByte = bytes[10];
        if (currentByte !== undefined) {
          bytes[10] = currentByte ^ 0xFF;
        }
      }

      const tampered = {
        ...encrypted,
        ciphertext: btoa(String.fromCharCode(...bytes))
      };

      await expect(
        cryptoService2.decryptMessage(tampered, sharedSecret2)
      ).rejects.toThrow('Message decryption failed');
    });
  });

  describe('Performance', () => {
    it('should handle multiple messages efficiently', async () => {
      const publicKey1Base64 = await cryptoService1.exportPublicKey();
      const publicKey2Base64 = await cryptoService2.exportPublicKey();
      const publicKey1 = await cryptoService2.importPublicKey(publicKey1Base64);
      const publicKey2 = await cryptoService1.importPublicKey(publicKey2Base64);
      const sharedSecret1 = await cryptoService1.deriveSharedSecret(publicKey2);
      const sharedSecret2 = await cryptoService2.deriveSharedSecret(publicKey1);

      const messages = Array.from({ length: 50 }, (_, i) => `Message ${i}`);
      const startTime = Date.now();

      for (const message of messages) {
        const encrypted = await cryptoService1.encryptMessage(message, sharedSecret1);
        const decrypted = await cryptoService2.decryptMessage(encrypted, sharedSecret2);
        expect(decrypted).toBe(message);
      }

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(3000); // 50 messages in < 3 seconds
    });
  });
});
