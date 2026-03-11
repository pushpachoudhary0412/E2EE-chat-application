<template>
  <div class="chat-container">
    <div class="chat-header">
      <h2>E2EE Chat - User {{ userId }}</h2>
      <div class="presence">
        <span :class="['status', otherUserPresence?.status || 'offline']">
          {{ otherUserPresence?.status || 'offline' }}
        </span>
        <span v-if="isTyping" class="typing">✍️ typing...</span>
      </div>
    </div>

    <div class="messages" ref="messagesContainer">
      <div
        v-for="(message, index) in messages"
        :key="index"
        :class="['message', message.senderId === userId ? 'own' : 'other']"
      >
        <div class="message-content">{{ message.data }}</div>
        <div class="message-time">{{ formatTime(message.timestamp) }}</div>
      </div>
    </div>

    <div class="input-area">
      <input
        v-model="newMessage"
        @input="handleTyping"
        @keyup.enter="sendMessage"
        placeholder="Type a message..."
        :disabled="!isConnected"
      />
      <button @click="sendMessage" :disabled="!isConnected || !newMessage.trim()">
        Send
      </button>
    </div>

    <div v-if="!isConnected" class="connection-status">
      Connecting...
    </div>

    <div v-if="error" class="error">
      {{ error }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { ChatService } from '../services/ChatService';
import type { ChatMessage, PresenceStatus } from '../../../shared/types';

const props = defineProps<{
  userId: string;
  otherUserId: string;
}>();

const messages = ref<ChatMessage[]>([]);
const newMessage = ref('');
const isConnected = ref(false);
const isTyping = ref(false);
const error = ref('');
const otherUserPresence = ref<PresenceStatus | null>(null);
const messagesContainer = ref<HTMLElement>();
const typingTimeout = ref<NodeJS.Timeout | null>(null);
const connectedUsers = ref<string[]>([]);
const inactivityTimeout = ref<NodeJS.Timeout | null>(null);
const INACTIVITY_DELAY = 120000; // 2 minutes in milliseconds

let chatService: ChatService;

const resetInactivityTimer = () => {
  if (!chatService) return;

  // Clear existing timer
  if (inactivityTimeout.value) {
    clearTimeout(inactivityTimeout.value);
  }

  // Send active status if we were inactive
  chatService.updatePresence('online');

  // Set new inactivity timer
  inactivityTimeout.value = setTimeout(() => {
    chatService.updatePresence('inactive');
    console.log('User became inactive');
  }, INACTIVITY_DELAY);
};

const handleTyping = () => {
  if (!chatService) return;
  
  if (typingTimeout.value) {
    clearTimeout(typingTimeout.value);
  }

  chatService.sendTyping();
  console.log('Sending typing indicator');
  
  // Reset inactivity timer on typing
  resetInactivityTimer();
  
  typingTimeout.value = setTimeout(() => {
    chatService.stopTyping();
    console.log('Stopping typing indicator');
  }, 1000);
};

const sendMessage = async () => {
  if (!newMessage.value.trim()) return;

  try {
    await chatService.sendMessage(newMessage.value.trim());
    newMessage.value = '';
    chatService.stopTyping();
    
    // Reset inactivity timer when sending a message
    resetInactivityTimer();
  } catch (err) {
    error.value = 'Failed to send message';
  }
};

const formatTime = (date: Date) => {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const scrollToBottom = () => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
  });
};

onMounted(async () => {
  chatService = new ChatService(props.userId);

  chatService.onMessageReceived = (message) => {
    messages.value.push(message);
    scrollToBottom();
  };

  chatService.onPresenceUpdate = (presence) => {
    // Track any user that's not us
    if (presence.userId !== props.userId) {
      otherUserPresence.value = presence;
      
      if (presence.status === 'online' && !connectedUsers.value.includes(presence.userId)) {
        connectedUsers.value.push(presence.userId);
      } else if (presence.status === 'offline') {
        connectedUsers.value = connectedUsers.value.filter(id => id !== presence.userId);
      }
    }
  };

  chatService.onTypingStart = (userId) => {
    // Show typing for any user that's not us
    console.log('Received typing start from:', userId, 'Our ID:', props.userId);
    if (userId !== props.userId) {
      isTyping.value = true;
      console.log('Showing typing indicator - isTyping is now:', isTyping.value);
    }
  };

  chatService.onTypingStop = (userId) => {
    // Hide typing for any user that's not us
    console.log('Received typing stop from:', userId);
    if (userId !== props.userId) {
      isTyping.value = false;
      console.log('Hiding typing indicator - isTyping is now:', isTyping.value);
    }
  };

  chatService.onError = (err) => {
    error.value = err;
  };

  try {
    await chatService.connect();
    isConnected.value = true;
    await chatService.initiateHandshake(props.otherUserId);
    
    // Start inactivity tracking
    resetInactivityTimer();
    
    // Track user activity
    window.addEventListener('mousemove', resetInactivityTimer);
    window.addEventListener('keypress', resetInactivityTimer);
    window.addEventListener('click', resetInactivityTimer);
    window.addEventListener('scroll', resetInactivityTimer);
  } catch (err) {
    error.value = 'Failed to connect to chat';
  }
});

onUnmounted(() => {
  chatService?.disconnect();
  if (typingTimeout.value) {
    clearTimeout(typingTimeout.value);
  }
  if (inactivityTimeout.value) {
    clearTimeout(inactivityTimeout.value);
  }
  
  // Remove activity listeners
  window.removeEventListener('mousemove', resetInactivityTimer);
  window.removeEventListener('keypress', resetInactivityTimer);
  window.removeEventListener('click', resetInactivityTimer);
  window.removeEventListener('scroll', resetInactivityTimer);
});
</script>

<style scoped>
.chat-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-width: 800px;
  margin: 0 auto;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-bottom: 2px solid #667eea;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.chat-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #2d3748;
  display: flex;
  align-items: center;
  gap: 10px;
}

.chat-header h2::before {
  content: '🔒';
  font-size: 24px;
}

.presence {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status {
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.status.online {
  background: linear-gradient(135deg, #56ab2f 0%, #a8e063 100%);
  color: white;
}

.status.offline {
  background: linear-gradient(135deg, #bdc3c7 0%, #95a5a6 100%);
  color: white;
}

.status.inactive {
  background: linear-gradient(135deg, #f2994a 0%, #f2c94c 100%);
  color: white;
}

.typing {
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-style: italic;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.8;
    transform: scale(1.05);
  }
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.messages::-webkit-scrollbar {
  width: 8px;
}

.messages::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.05);
}

.messages::-webkit-scrollbar-thumb {
  background: #667eea;
  border-radius: 4px;
}

.message {
  max-width: 70%;
  padding: 12px 16px;
  border-radius: 18px;
  word-wrap: break-word;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message.own {
  align-self: flex-end;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-bottom-right-radius: 4px;
}

.message.other {
  align-self: flex-start;
  background: white;
  color: #2d3748;
  border: 2px solid #e2e8f0;
  border-bottom-left-radius: 4px;
}

.message-content {
  font-size: 15px;
  line-height: 1.5;
}

.message-time {
  font-size: 11px;
  margin-top: 6px;
  opacity: 0.7;
  text-align: right;
}

.input-area {
  display: flex;
  padding: 20px 24px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-top: 2px solid #667eea;
  gap: 12px;
}

input {
  flex: 1;
  padding: 14px 18px;
  border: 2px solid #e2e8f0;
  border-radius: 25px;
  font-size: 15px;
  outline: none;
  transition: all 0.3s ease;
}

input:focus {
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

input:disabled {
  background: #f7fafc;
  cursor: not-allowed;
}

button {
  padding: 14px 28px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 25px;
  cursor: pointer;
  font-weight: 600;
  font-size: 15px;
  transition: all 0.3s ease;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
}

button:active:not(:disabled) {
  transform: translateY(0);
}

button:disabled {
  background: linear-gradient(135deg, #cbd5e0 0%, #a0aec0 100%);
  cursor: not-allowed;
  box-shadow: none;
}

.connection-status {
  padding: 12px 24px;
  text-align: center;
  background: #fef5e7;
  color: #f39c12;
  font-weight: 500;
  border-bottom: 2px solid #f39c12;
}

.error {
  padding: 12px 24px;
  text-align: center;
  background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%);
  color: white;
  font-weight: 500;
  border-bottom: 2px solid #c92a2a;
}
</style>
