# E2EE Chat Application

A one-to-one real-time chat app built with ASP.NET Core, SignalR, Vue 3, and the browser Web Crypto API. Chat messages are encrypted in the browser before they leave the sender, and the server only routes encrypted payloads.

## Features

- One-to-one real-time chat over SignalR
- Browser-side end-to-end encryption using ECDH + AES-GCM
- Tamper detection through AES-GCM authenticated decryption
- Online, offline, and inactive presence states
- Typing indicators routed to the active peer only
- Server-side validation for invalid messages and bad receivers

## Stack

- Backend: ASP.NET Core / C#
- Frontend: Vue 3 + TypeScript + Vite
- Real-time transport: SignalR
- Crypto: Web Crypto API

## How To Run

### Prerequisites

- .NET SDK 10.0 or later
- Node.js 18 or later

### Backend

```bash
cd backend/ChatApp.Backend
dotnet restore
dotnet run
```

The backend listens on `http://localhost:5214`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173`.

## Using The Chat

Open two browser tabs and configure opposite user IDs:

- Tab 1: `alice` talking to `bob`
- Tab 2: `bob` talking to `alice`

You can either:

- Use the setup form shown on first load, or
- Open direct URLs such as `http://localhost:5173/?user=alice&peer=bob` and `http://localhost:5173/?user=bob&peer=alice`

Once both peers are connected, they exchange public keys through a handshake message and the UI enables encrypted chat input.

## Message Format

All SignalR chat messages use this shape:

```ts
type MessageType = 'connect' | 'handshake' | 'chat' | 'typing' | 'error';

interface ChatMessage {
  type: MessageType;
  senderId: string;
  receiverId: string;
  data: string;
  timestamp: string | Date;
}
```

Usage by message type:

- `connect`: `data` contains JSON like `{"status":"connected"}` and is used as a peer-to-peer protocol signal
- `handshake`: `data` contains JSON with the sender public key and a `reply` flag
- `chat`: `data` contains JSON with encrypted payload fields (`ciphertext`, `iv`, `tag`)
- `typing`: `data` contains JSON like `{"isTyping":true}` or `{"isTyping":false}`
- `error`: `data` contains JSON with `errorCode` and `message`

All of these protocol messages are routed through the same SignalR hub method and the same `ReceiveMessage` client event. Presence updates remain a separate status stream because they are not part of the encrypted chat protocol.

## Encryption Approach

The app uses an ephemeral per-session key exchange:

1. Each browser generates an ECDH P-256 key pair.
2. The two peers exchange public keys through SignalR handshake messages.
3. Each side derives the same AES-GCM 256-bit shared secret locally.
4. Chat text is encrypted in the browser with a fresh IV for every message.
5. The recipient decrypts locally. If the ciphertext or IV was changed, AES-GCM decryption fails and the message is rejected.

### What The Server Can See

The server can see:

- sender and receiver IDs
- message type
- encrypted payload bytes
- presence and typing events

The server cannot read plaintext chat content because it never receives the shared secret.

## Limits

- Keys live only in memory, so refreshing or reconnecting requires a new handshake.
- There is no identity verification beyond user IDs, so this is not resistant to active impersonation or man-in-the-middle attacks.
- Messages are not stored for offline delivery.
- The server still sees metadata such as who is talking to whom and when.
- AES-GCM provides integrity for encrypted chat payloads, but this demo does not include signed identity keys or a trust-on-first-use flow.

## Testing

### Crypto tests

```bash
cd frontend
npm run test:run
```

The crypto tests cover:

- encrypt -> decrypt round trips
- invalid key handling
- tamper detection for ciphertext and IV
- decryption failure with the wrong shared key

### Backend hub tests

```bash
/Users/pushpa/.dotnet/dotnet test E2EE_Chat_App.sln
```

The backend tests cover:

- invalid message types are rejected safely
- missing or mismatched sender state returns errors
- offline recipients return safe errors
- connect and typing envelopes are forwarded correctly
- valid chat messages are forwarded only to the intended recipient
- invalid presence updates are rejected
- disconnecting the last connection marks the user offline without crashing

### Protocol validation tests

The frontend test suite also covers runtime protocol validation:

- valid message envelopes round-trip through runtime guards
- malformed JSON handshake payloads are rejected safely
- encrypted payloads missing required fields are rejected safely
- invalid presence payloads are rejected safely

### Build checks

```bash
cd frontend
npm run build

cd ../backend/ChatApp.Backend
/Users/pushpa/.dotnet/dotnet build
```

## What I Would Improve Next

- Add signed long-term identity keys and fingerprint verification
- Add Playwright-based two-tab integration tests
- Support offline message queues with encrypted persistence
- Add explicit delivery acknowledgements instead of inferred status
- Replace the demo setup screen with authenticated users and contact selection
