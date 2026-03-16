<script setup lang="ts">
import { computed, ref } from 'vue';
import Chat from './components/Chat.vue';

const searchParams = new URLSearchParams(window.location.search);
const initialUserId = searchParams.get('user')?.trim() || `user-${Math.random().toString(36).slice(2, 8)}`;
const initialPeerId = searchParams.get('peer')?.trim() || '';

const userIdInput = ref(initialUserId);
const otherUserIdInput = ref(initialPeerId);
const sessionStarted = ref(Boolean(initialPeerId));

const trimmedUserId = computed(() => userIdInput.value.trim());
const trimmedOtherUserId = computed(() => otherUserIdInput.value.trim());
const canStart = computed(() =>
  trimmedUserId.value.length > 0 &&
  trimmedOtherUserId.value.length > 0 &&
  trimmedUserId.value !== trimmedOtherUserId.value
);

const startChat = () => {
  if (!canStart.value) {
    return;
  }

  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set('user', trimmedUserId.value);
  nextUrl.searchParams.set('peer', trimmedOtherUserId.value);
  window.history.replaceState({}, '', nextUrl);
  sessionStarted.value = true;
};
</script>

<template>
  <div id="app">
    <div v-if="!sessionStarted" class="setup-shell">
      <div class="setup-card">
        <p class="eyebrow">Secure Chat Setup</p>
        <h1>Choose the two chat identities</h1>
        <p class="setup-copy">
          Open a second tab and swap the two IDs so both peers point at each other.
        </p>

        <label class="field">
          <span>Your user ID</span>
          <input v-model="userIdInput" autocomplete="off" spellcheck="false" />
        </label>

        <label class="field">
          <span>Other user ID</span>
          <input v-model="otherUserIdInput" autocomplete="off" spellcheck="false" />
        </label>

        <button type="button" class="start-button" :disabled="!canStart" @click="startChat">
          Start secure chat
        </button>

        <p class="setup-hint">
          Example: one tab uses `alice` → `bob`, the other uses `bob` → `alice`.
        </p>
      </div>
    </div>

    <Chat
      v-else
      :user-id="trimmedUserId"
      :other-user-id="trimmedOtherUserId"
    />
  </div>
</template>

<style>
:root {
  font-family: "Avenir Next", "Segoe UI", sans-serif;
}

body {
  margin: 0;
  padding: 0;
}

#app {
  min-height: 100vh;
}

.setup-shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background:
    radial-gradient(circle at top, rgba(255, 255, 255, 0.75), transparent 36%),
    linear-gradient(135deg, #eef2ff 0%, #dbeafe 50%, #e0f2fe 100%);
}

.setup-card {
  width: min(100%, 460px);
  padding: 32px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 24px 60px rgba(30, 41, 59, 0.18);
}

.eyebrow {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #2563eb;
}

.setup-card h1 {
  margin: 0 0 12px;
  font-size: 32px;
  line-height: 1.1;
  color: #0f172a;
}

.setup-copy,
.setup-hint {
  margin: 0;
  color: #475569;
}

.setup-copy {
  margin-bottom: 24px;
}

.setup-hint {
  margin-top: 14px;
  font-size: 14px;
}

.field {
  display: block;
  margin-bottom: 16px;
}

.field span {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

.field input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #cbd5e1;
  border-radius: 14px;
  padding: 14px 16px;
  font: inherit;
}

.start-button {
  width: 100%;
  border: none;
  border-radius: 999px;
  padding: 14px 18px;
  font: inherit;
  font-weight: 700;
  color: white;
  background: linear-gradient(135deg, #2563eb 0%, #0f766e 100%);
  cursor: pointer;
}

.start-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
</style>
