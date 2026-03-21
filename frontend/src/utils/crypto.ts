import type { CryptoKeys, EncryptedData } from '../../../shared/types';

/**
 * Browser crypto utility for generating ECDH keys, deriving shared AES-GCM secrets,
 * and performing message encryption/decryption for end-to-end chat security.
 */
export class CryptoService {
  private static instance: CryptoService;
  private keys: CryptoKeys | null = null;

  static getInstance(): CryptoService {
    if (!CryptoService.instance) {
      CryptoService.instance = new CryptoService();
    }
    return CryptoService.instance;
  }

  async generateKeyPair(): Promise<CryptoKeys> {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: 'P-256'
      },
      true,
      ['deriveKey', 'deriveBits']
    );

    this.keys = {
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey
    };

    return this.keys;
  }

  async deriveSharedSecret(publicKey: CryptoKey): Promise<CryptoKey> {
    if (!this.keys?.privateKey) {
      throw new Error('Private key not available');
    }

    const sharedSecret = await crypto.subtle.deriveKey(
      {
        name: 'ECDH',
        public: publicKey
      },
      this.keys.privateKey,
      {
        name: 'AES-GCM',
        length: 256
      },
      false,
      ['encrypt', 'decrypt']
    );

    if (this.keys) {
      this.keys.sharedSecret = sharedSecret;
    }

    return sharedSecret;
  }

  async encryptMessage(message: string, sharedSecret: CryptoKey): Promise<EncryptedData> {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      sharedSecret,
      data
    );

    const encryptedArray = new Uint8Array(encrypted);
    const ciphertext = btoa(String.fromCharCode(...encryptedArray));
    const ivString = btoa(String.fromCharCode(...iv));

    return {
      ciphertext,
      iv: ivString,
      tag: '' // AES-GCM includes auth tag in ciphertext
    };
  }

  async decryptMessage(encryptedData: EncryptedData, sharedSecret: CryptoKey): Promise<string> {
    try {
      const ciphertext = Uint8Array.from(atob(encryptedData.ciphertext), c => c.charCodeAt(0));
      const iv = Uint8Array.from(atob(encryptedData.iv), c => c.charCodeAt(0));

      const decrypted = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
        sharedSecret,
        ciphertext
      );

      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      throw new Error('Message decryption failed - possible tampering');
    }
  }

  async exportPublicKey(): Promise<string> {
    if (!this.keys?.publicKey) {
      throw new Error('Public key not available');
    }

    const exported = await crypto.subtle.exportKey('spki', this.keys.publicKey);
    return btoa(String.fromCharCode(...new Uint8Array(exported)));
  }

  async importPublicKey(publicKeyBase64: string): Promise<CryptoKey> {
    const publicKeyData = Uint8Array.from(atob(publicKeyBase64), c => c.charCodeAt(0));

    return await crypto.subtle.importKey(
      'spki',
      publicKeyData,
      {
        name: 'ECDH',
        namedCurve: 'P-256'
      },
      true,
      []
    );
  }

  getKeys(): CryptoKeys | null {
    return this.keys;
  }
}