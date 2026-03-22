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

Default backend URL in this project: `http://localhost:5214`

### Run frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend URL: `http://localhost:5173`

If your backend runs on a different URL, create `frontend/.env.local`:

```bash
cd frontend
cp .env.example .env.local
```

Then set:

```bash
VITE_API_BASE_URL=http://localhost:5214
```

Use the actual backend URL shown in the backend terminal `Now listening on: ...` output, for example:

```bash
VITE_API_BASE_URL=https://localhost:7152
```

### Open two users

Use two tabs/windows:

- User A: `http://localhost:5173`
- User B: `http://localhost:5173`

Then either keep the generated default user IDs shown in the setup screen and enter the opposite peer ID in the other tab, or manually enter your own pair such as `alice` -> `bob` in one tab and `bob` -> `alice` in the other.

You can also still open the app with query parameters directly if you prefer:

- `http://localhost:5173/?user=alice&peer=bob`
- `http://localhost:5173/?user=bob&peer=alice`

After both peers connect, a handshake runs automatically and secure messaging is enabled.

---

## 5) Message format (simple explanation)

Every message sent in the app has the same basic fields:

- **type** → what kind of event it is
- **senderId** → who sent it
- **receiverId** → who should receive it
- **data** → the actual content for that event
- **messageId** → unique ID for `chat`/`ack` flow
- **timestamp** → when it was created

The `type` can be one of these:

- `connect` → tells the peer “I’m connected”
- `handshake` → shares public key info to create the secure session
- `chat` → carries the encrypted chat payload
- `typing` → tells the peer typing started/stopped
- `ack` → confirms receiver processed a specific `chat` message
- `error` → safe protocol error returned by server

For normal understanding, that’s enough: **the same envelope is reused for all events, and only the `data` content changes by type**.

Presence (`online`, `offline`, `inactive`) is sent separately through the `UserPresence` event.

### Quick message type guide

| Type | Direction | `data` shape | Requires `messageId` | Purpose |
| --- | --- | --- | --- | --- |
| `connect` | Client → Hub → Peer | `{"status":"connected"}` | No | Signals peer availability and triggers handshake sequence. |
| `handshake` | Client ↔ Peer (via Hub) | `{"publicKey":"...","reply":boolean}` | No | Exchanges ECDH public keys to derive shared secret. |
| `chat` | Client → Hub → Peer | `{"ciphertext":"...","iv":"...","tag":""}` | Yes | Carries encrypted chat payload. |
| `typing` | Client → Hub → Peer | `{"isTyping":boolean}` | No | Indicates typing start/stop state. |
| `ack` | Receiver → Hub → Sender | `{"messageId":"..."}` | Yes | Confirms receiver processed/decrypted specific chat message. |
| `error` | Hub → Caller | `{"errorCode":"...","message":"..."}` | No | Returns safe protocol validation/routing errors. |

> If you want full developer-level schema details, see `shared/types.ts`.

---

## 6) Encryption design (how E2EE works here)

### Key agreement and secure channel

1. Each client generates an ephemeral `ECDH P-256` key pair in the browser.
2. One peer deterministically initiates the handshake first, and the other peer responds.
3. Peers exchange public keys via `handshake` messages.
4. Each client derives the same shared secret locally.
5. Shared secret is used as an `AES-GCM` key for chat message encryption/decryption.

The initiator is chosen deterministically from the two demo user IDs so both tabs do not start overlapping handshakes at the same time. This keeps the protocol stable while still producing the same shared secret on both sides.

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
- Hub enforces maximum protocol payload size (`data` max length: `8192` chars).
- `chat` and `ack` messages require non-empty `messageId`.
- Sender identity is checked against connection mapping.
- Offline recipient handling returns safe protocol errors.
- Disconnects update presence state and do not crash hub.
- Client performs runtime validation/parsing for protocol payloads and rejects malformed JSON safely.
- Delivery indicator now uses explicit ACK (`✓` sent, `✓✓` acknowledged).

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
- protocol parsing/validation, malformed payload rejection, messageId requirement, and payload-size guard

### Backend tests (xUnit)

```bash
dotnet test E2EE_Chat_App.sln
```

Covers:

- invalid message rejection
- sender mismatch handling
- recipient offline handling
- chat/connect/typing forwarding
- presence update validation
- disconnect/offline transitions
- messageId validation and payload-size rejection

### Optional build checks

```bash
cd frontend && npm run build
cd ../backend/ChatApp.Backend && dotnet build
```

---

## 9) Known limits (important)

- Keys are in-memory only (refresh/reconnect requires new handshake).
- No long-term identity verification (not MITM-resistant yet).
- User identity is demo-based (`user`/`peer` query or input), not authenticated accounts.
- No encrypted offline message persistence.
- Metadata visibility remains at server level (who talks to whom, when).
- Single-instance in-memory presence/routing state on backend.
- Current routing is optimized for one active receiver connection per user rather than multi-device fan-out.

---

## 10) End-to-End Code Flow

1. **Identity setup (demo mode)**
   - `frontend/src/App.vue` reads `user` and `peer` from query params (or input fields) and starts a session.

2. **Realtime connection**
   - `frontend/src/services/ChatService.ts` connects to SignalR hub:
   - `http://localhost:5214/chatHub?userId=<userId>`

3. **Secure handshake**
   - Each client creates ephemeral ECDH keys (`frontend/src/utils/crypto.ts`).
   - Exactly one side initiates the handshake, and the peer responds with its public key.
   - Clients exchange public keys through `handshake` protocol messages.
   - Both derive the same shared AES-GCM key locally.

4. **Sending a chat message**
   - UI captures plaintext in `frontend/src/components/Chat.vue`.
   - `ChatService` encrypts plaintext via `CryptoService`.
   - Encrypted payload is wrapped into a `chat` envelope (`messageId` included) and sent to hub.

5. **Hub validation and routing**
   - `backend/ChatApp.Backend/Hubs/ChatHub.cs` validates envelope fields, message type, payload size, sender mapping, and recipient status.
   - If valid, it routes the message only to the intended receiver connection; otherwise returns a safe `error` envelope.

6. **Receiving and decrypting**
   - Receiver `ChatService` validates envelope using shared protocol types (`shared/types.ts`).
   - It decrypts chat payload locally in browser and pushes plaintext to UI.

7. **Delivery acknowledgement (ACK)**
   - Receiver sends `ack` with same `messageId`.
   - Sender marks message delivered in UI (`✓✓`) when ACK is received.

8. **Presence, typing, and errors**
   - Presence updates flow via `UserPresence` events.
   - Typing uses `typing` envelopes.
   - Protocol/security failures are surfaced as safe error messages.

### File responsibility map (quick reference)

- `frontend/src/components/Chat.vue`: UI rendering, input handling, delivery state display.
- `frontend/src/services/ChatService.ts`: SignalR orchestration, protocol send/receive, handshake lifecycle.
- `frontend/src/utils/crypto.ts`: ECDH key generation/derivation and AES-GCM encrypt/decrypt.
- `backend/ChatApp.Backend/Hubs/ChatHub.cs`: server-side validation, routing, presence broadcast.
- `backend/ChatApp.Backend/Models/Message.cs`: protocol model types.
- `shared/types.ts`: shared protocol schema + runtime validation/parsing.

---

## 11) What I would improve next

1. Add long-term identity keys and fingerprint verification so peers can detect impersonation or man-in-the-middle attacks.
2. Add end-to-end browser integration tests that simulate two tabs performing handshake, encrypted messaging, typing, and reconnect flows.
3. Improve delivery robustness with encrypted local persistence and support for multiple active devices per user instead of a single primary receiver connection.
4. Replace demo query-string identities with authenticated user accounts and a proper session/token-based identity model.
5. Add richer messaging features such as encrypted attachments and searchable chat history.

---
