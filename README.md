# E2EE Chat Application

A real-time, end-to-end encrypted chat application built with ASP.NET Core and Vue.js.

## Features

- **End-to-End Encryption**: Messages are encrypted client-side using ECDH key exchange and AES-GCM
- **Real-time Communication**: Powered by SignalR for instant messaging
- **Presence Indicators**: Shows online/offline/inactive status
- **Typing Indicators**: Real-time typing notifications
- **Message Integrity**: HMAC verification prevents tampering detection
- **Graceful Error Handling**: Safe handling of invalid messages and connection issues

## Architecture

### Backend (ASP.NET Core)
- **SignalR Hub**: Handles real-time communication and message routing
- **Message Validation**: Server validates message format but doesn't decrypt content
- **User Presence**: Tracks and broadcasts user online status
- **CORS Support**: Allows frontend connections from different origins

### Frontend (Vue 3)
- **Web Crypto API**: Client-side encryption/decryption
- **SignalR Client**: Real-time connection to backend
- **Reactive UI**: Vue 3 Composition API for state management
- **TypeScript**: Type-safe development

### Encryption Protocol

1. **Key Exchange**: ECDH (Elliptic Curve Diffie-Hellman)
   - Each client generates an ECDH key pair
   - Public keys are exchanged via handshake messages
   - Shared secret is derived from private key + other's public key

2. **Message Encryption**: AES-GCM (Authenticated Encryption)
   - 256-bit key derived from ECDH shared secret
   - Each message uses a unique initialization vector (IV)
   - Authentication tag prevents tampering

3. **Security Properties**:
   - **Perfect Forward Secrecy**: New keys for each session
   - **Authentication**: Messages include integrity checks
   - **Confidentiality**: Only intended recipients can decrypt

## Setup Instructions

### Prerequisites
- .NET 6.0 or later
- Node.js 16 or later
- npm or yarn

### Backend Setup

```bash
cd E2EE_Chat_App/backend/ChatApp.Backend
dotnet restore
dotnet run
```

The backend will start on `http://localhost:5214` (check console output for exact port)

### Frontend Setup

```bash
cd E2EE_Chat_App/frontend
npm install
npm run dev
```

The frontend will start on `http://localhost:5173`

## Usage

1. Open two browser windows/tabs
2. Each user gets a unique ID (or you can specify one in the URL)
3. Start chatting - messages are automatically encrypted/decrypted

## Message Protocol

```typescript
enum MessageType {
  Connect = 'connect',
  Handshake = 'handshake',
  Chat = 'chat',
  Typing = 'typing',
  Error = 'error'
}

interface ChatMessage {
  type: MessageType;
  senderId: string;
  receiverId: string;
  data: string; // Encrypted for chat messages
  timestamp: Date;
}
```

## Security Limitations

1. **Browser Storage**: Keys exist only in memory (not persisted)
2. **No Server Backup**: Lost connections require new key exchange
3. **Browser Security**: Relies on browser's crypto implementation
4. **Network Security**: HTTPS recommended for production
5. **Key Exchange**: Requires both users to be online simultaneously

## Future Improvements

- **Persistent Sessions**: Store encrypted keys in secure browser storage
- **Group Chat**: Extend protocol for multiple participants
- **Message History**: Encrypted message storage with key rotation
- **File Sharing**: Encrypted file transfer capabilities
- **Offline Messages**: Queue messages when recipient is offline
- **Key Verification**: Manual key verification (fingerprint comparison)

## Testing

### Crypto Tests
```bash
npm run test:crypto
```

Tests verify:
- Encryption/decryption round-trip
- Tampered message detection
- Key exchange validation

### Protocol Tests
```bash
npm run test:protocol
```

Tests verify:
- JSON serialization/deserialization
- Invalid message rejection
- Connection lifecycle handling

## Technologies Used

- **Backend**: ASP.NET Core 6, SignalR, C#
- **Frontend**: Vue 3, TypeScript, Web Crypto API
- **Real-time**: SignalR with WebSockets
- **Encryption**: ECDH + AES-GCM
- **Build Tools**: Vite, npm

## License

MIT License