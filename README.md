# E2EE Chat Application

A one-to-one real-time chat app built with **ASP.NET Core + SignalR** (backend) and **Vue 3 + TypeScript** (frontend), using the browser **Web Crypto API** for end-to-end encryption.

The core design goal is simple:

> Chat plaintext is encrypted in the sender browser and decrypted only in the receiver browser. The server only routes protocol envelopes and encrypted payloads.

---

## 1) Project Highlights

- Real-time one-to-one communication
- End-to-end encrypted message transport
- Authenticated decryption failure on tampering
- Presence (`online`, `offline`, `inactive`) and typing indicators
- Defensive protocol validation (client + server)

This repository is intentionally a clear challenge implementation, not a full production messenger.

---

## 2) Tech stack

- **Backend:** ASP.NET Core (.NET 10), C#
- **Realtime transport:** SignalR hub
- **Frontend:** Vue 3, TypeScript, Vite
- **Crypto:** Web Crypto API (`ECDH P-256`, `AES-GCM 256-bit`)
- **Tests:** xUnit (`dotnet test`) + Vitest

---

## 3) Project structure

```text
backend/
  ChatApp.Backend/
    Hubs/ChatHub.cs
    Models/Message.cs
    Program.cs
  ChatApp.Backend.Tests/
    ChatHubTests.cs

frontend/
  src/components/Chat.vue
  src/services/ChatService.ts
  src/utils/crypto.ts
  src/utils/crypto.test.ts
  src/utils/protocol.test.ts

shared/
  types.ts
```

---

## 4) Getting Started (Run the App Locally)

### Prerequisites

- .NET SDK 10.0+
- Node.js 18+

### Run backend

```bash
cd backend/ChatApp.Backend
dotnet restore
dotnet run
```

Backend URL: `http://localhost:5214`

### Run frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend URL: `http://localhost:5173`

### Open two users

Use two tabs/windows:

- User A: `http://localhost:5173/?user=alice&peer=bob`
- User B: `http://localhost:5173/?user=bob&peer=alice`

After both connect, a handshake runs automatically and secure messaging is enabled.

---

## 5) Message format (simple explanation)

Every message sent in the app has the same basic fields:

- **type** → what kind of event it is
- **senderId** → who sent it
- **receiverId** → who should receive it
- **data** → the actual content for that event
- **timestamp** → when it was created

The `type` can be one of these:

- `connect` → tells the peer “I’m connected”
- `handshake` → shares public key info to create the secure session
- `chat` → carries the encrypted chat payload
- `typing` → tells the peer typing started/stopped
- `error` → safe protocol error returned by server

For normal understanding, that’s enough: **the same envelope is reused for all events, and only the `data` content changes by type**.

Presence (`online`, `offline`, `inactive`) is sent separately through the `UserPresence` event.

### Quick message type guide

| Message Type | Purpose |
| --- | --- |
| `connect` | Starts peer session signal (“I’m connected”). |
| `handshake` | Exchanges public key information to establish a secure session. |
| `chat` | Carries encrypted chat payload (`ciphertext` + `iv`). |
| `typing` | Sends typing on/off state to the peer. |
| `error` | Returns safe protocol errors from server validation. |

> If you want full developer-level schema details, see `shared/types.ts`.

---

## 6) Encryption design (how E2EE works here)

### Key agreement and secure channel

1. Each client generates an ephemeral `ECDH P-256` key pair in the browser.
2. Peers exchange public keys via `handshake` messages.
3. Each client derives the same shared secret locally.
4. Shared secret is used as an `AES-GCM` key for chat message encryption/decryption.

### Message encryption

- Each outgoing chat message uses a fresh random 12-byte IV.
- Plaintext is encrypted locally before send.
- Receiver decrypts locally.

### Tamper detection

`AES-GCM` provides authenticated encryption. If ciphertext/IV is altered, decrypt fails and message is rejected.

### What server can/cannot see

Server can see:

- sender and receiver IDs
- message types
- encrypted payload bytes
- presence/typing metadata

Server cannot see:

- chat plaintext
- shared secret keys

---

## 7) Reliability and validation behavior

- Hub validates message type and required fields (`type`, `senderId`, `receiverId`, `data`).
- Sender identity is checked against connection mapping.
- Offline recipient handling returns safe protocol errors.
- Disconnects update presence state and do not crash hub.
- Client performs runtime validation/parsing for protocol payloads and rejects malformed JSON safely.

---

## 8) Testing

### Frontend tests (Vitest)

```bash
cd frontend
npm run test:run
```

Covers:

- crypto round-trip
- invalid key handling
- tamper detection (ciphertext/IV)
- wrong-key decryption failure
- protocol parsing/validation and malformed payload rejection

### Backend tests (xUnit)

```bash
/Users/pushpa/.dotnet/dotnet test /Users/pushpa/Desktop/E2EE_Chat_App/E2EE_Chat_App.sln
```

Covers:

- invalid message rejection
- sender mismatch handling
- recipient offline handling
- chat/connect/typing forwarding
- presence update validation
- disconnect/offline transitions

### Optional build checks

```bash
cd frontend && npm run build
cd ../backend/ChatApp.Backend && /Users/pushpa/.dotnet/dotnet build
```

---

## 9) Known limits (important)

- Keys are in-memory only (refresh/reconnect requires new handshake).
- No long-term identity verification (not MITM-resistant yet).
- No encrypted offline message persistence.
- Metadata visibility remains at server level (who talks to whom, when).
- Single-instance in-memory presence/routing state on backend.

---

## 10) What I would improve next

1. Add signed long-term identity keys + fingerprint verification.
2. Add explicit message IDs and delivery ACK protocol.
3. Add Playwright two-client integration tests.
4. Add encrypted offline persistence and replay sync.
5. Replace query-string demo identities with authenticated users.
6. Add rate limits and payload-size safeguards.

---

