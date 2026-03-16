<template>
  <div class="chat-container">
    <div class="chat-header">
      <div class="user-info">
        <div class="avatar" :style="{ backgroundColor: getAvatarColor(props.userId) }">
          {{ getInitials(props.userId) }}
        </div>
        <h2>User {{ props.userId }}</h2>
      </div>
      <div class="presence">
        <span :class="['status', otherUserPresence?.status || 'offline']">
          {{ otherUserPresence?.status || 'offline' }}
        </span>
        <span v-if="isTyping" class="typing">✍️ typing...</span>
      </div>
    </div>

    <div class="messages" ref="messagesContainer">
      <!-- Date separator for Today when empty -->
      <div v-if="messages.length === 0" class="date-separator">
        <span>Today</span>
      </div>
      
      <!-- Date separator before first message -->
      <div v-if="messages.length > 0" class="date-separator">
        <span>Today</span>
      </div>
      
      <!-- Encryption notice -->
      <div class="encryption-notice">
        <span>🔒 Chats are end-to-end encrypted. Only people in this chat can read them.</span>
      </div>
      
      <div
        v-for="(message, index) in messages"
        :key="index"
        :class="['message-wrapper', message.senderId === props.userId ? 'own' : 'other']"
        @mouseenter="hoveredMessageIndex = index"
        @mouseleave="hoveredMessageIndex = null"
      >
        <div 
          v-if="message.senderId !== props.userId"
          class="message-avatar"
          :style="{ backgroundColor: getAvatarColor(message.senderId) }"
        >
          {{ getInitials(message.senderId) }}
        </div>
        <div class="message-container">
          <div :class="['message', message.senderId === props.userId ? 'own' : 'other']">
            <div class="message-content">{{ message.data }}</div>
            <div class="message-time">
              {{ formatTime(message.timestamp) }}
              <span
                v-if="message.senderId === props.userId"
                :class="['delivery-status', getDeliveryStatusClass(message)]"
              >
                {{ getDeliveryStatus(message) }}
              </span>
            </div>
          </div>
          
          <!-- Reaction Picker (shows on hover) -->
          <div v-if="hoveredMessageIndex === index" class="reaction-picker">
            <button
              v-for="emoji in reactionEmojis"
              :key="emoji"
              @click="addReaction(index, emoji)"
              class="reaction-button"
              type="button"
            >
              {{ emoji }}
            </button>
          </div>
          
          <!-- Display Reactions -->
          <div v-if="message.reactions && message.reactions.length > 0" class="reactions-display">
            <span
              v-for="(reaction, rIndex) in getGroupedReactions(message.reactions)"
              :key="rIndex"
              class="reaction-bubble"
              :class="{ 'own-reaction': reaction.hasOwnReaction }"
              @click="addReaction(index, reaction.emoji)"
            >
              {{ reaction.emoji }} {{ reaction.count > 1 ? reaction.count : '' }}
            </span>
          </div>
        </div>
        <div 
          v-if="message.senderId === props.userId"
          class="message-avatar"
          :style="{ backgroundColor: getAvatarColor(message.senderId) }"
        >
          {{ getInitials(message.senderId) }}
        </div>
      </div>
    </div>

    <div class="input-area">
      <!-- Emoji Picker -->
      <div class="emoji-picker-container">
        <button 
          @click="toggleEmojiPicker" 
          class="emoji-button"
          type="button"
          :disabled="!isConnected || !isSecureSessionReady"
        >
          😊
        </button>
        <div v-if="showEmojiPicker" class="emoji-picker">
          <div class="emoji-grid">
            <span 
              v-for="emoji in emojis" 
              :key="emoji"
              @click="insertEmoji(emoji)"
              class="emoji-item"
            >
              {{ emoji }}
            </span>
          </div>
        </div>
      </div>
      
      <input
        v-model="newMessage"
        @input="handleTyping"
        @keyup.enter="sendMessage"
        placeholder="Type a message..."
        :disabled="!isConnected || !isSecureSessionReady"
      />
      <button @click="sendMessage" :disabled="!isConnected || !isSecureSessionReady || !newMessage.trim()">
        Send
      </button>
    </div>

    <div v-if="!isConnected" class="connection-status">
      Connecting...
    </div>

    <div v-else-if="!isSecureSessionReady" class="connection-status">
      Establishing secure session...
    </div>

    <div v-if="error" :class="error.includes('Will be delivered') ? 'info' : 'error'">
      {{ error }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { ChatService } from '../services/ChatService';
import type { ChatMessage, PresenceStatus } from '../../../shared/types';

const props = defineProps<{
  userId: string;
  otherUserId: string;
}>();

interface MessageReaction {
  emoji: string;
  userId: string;
}

interface ExtendedChatMessage extends ChatMessage {
  reactions?: MessageReaction[];
}

const messages = ref<ExtendedChatMessage[]>([]);
const newMessage = ref('');
const isConnected = ref(false);
const isSecureSessionReady = ref(false);
const isTyping = ref(false);
const error = ref('');
const otherUserPresence = ref<PresenceStatus | null>(null);
const messagesContainer = ref<HTMLElement>();
const typingTimeout = ref<ReturnType<typeof setTimeout> | null>(null);
const inactivityTimeout = ref<ReturnType<typeof setTimeout> | null>(null);
const INACTIVITY_DELAY = 120000; // 2 minutes in milliseconds
const showEmojiPicker = ref(false);
const hoveredMessageIndex = ref<number | null>(null);
const reactionEmojis = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

const emojis = ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '🔥', '✨', '💫', '⭐', '🌟', '💯', '🎉', '🎊', '🎈', '🎁'];

const insertEmoji = (emoji: string) => {
  newMessage.value += emoji;
  showEmojiPicker.value = false;
};

const toggleEmojiPicker = () => {
  showEmojiPicker.value = !showEmojiPicker.value;
};

const addReaction = (messageIndex: number, emoji: string) => {
  const message = messages.value[messageIndex];
  if (!message) {
    return;
  }

  if (!message.reactions) {
    message.reactions = [];
  }
  
  // Check if user already reacted with this emoji
  const existingReaction = message.reactions.find(
    r => r.emoji === emoji && r.userId === props.userId
  );
  
  if (existingReaction) {
    // Remove reaction if clicking same emoji again
    message.reactions = message.reactions.filter(
      r => !(r.emoji === emoji && r.userId === props.userId)
    );
  } else {
    // Add new reaction
    message.reactions.push({ emoji, userId: props.userId });
  }
  
  hoveredMessageIndex.value = null;
};

const getGroupedReactions = (reactions: MessageReaction[]) => {
  const grouped = reactions.reduce((acc, reaction) => {
    const existingGroup = acc[reaction.emoji];
    if (!existingGroup) {
      acc[reaction.emoji] = {
        emoji: reaction.emoji,
        count: 0,
        hasOwnReaction: false
      };
    }
    const group = acc[reaction.emoji];
    if (!group) {
      return acc;
    }

    group.count++;
    if (reaction.userId === props.userId) {
      group.hasOwnReaction = true;
    }
    return acc;
  }, {} as Record<string, { emoji: string; count: number; hasOwnReaction: boolean }>);
  
  return Object.values(grouped);
};

// Preserve historical delivery state:
// if recipient is online/inactive at any point, mark all sent messages as delivered.
watch(otherUserPresence, (presence) => {
  if (!presence) return;

  const recipientAvailable = presence.status === 'online' || presence.status === 'inactive';
  if (!recipientAvailable) return;

  messages.value.forEach((message) => {
    if (message.senderId === props.userId) {
      message.deliveredToOnline = true;
    }
  });
});

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
  }, 5000);
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

const getDeliveryStatus = (message: ChatMessage) => {
  // For messages we sent
  if (message.senderId === props.userId) {
    // Once delivered to an online user, keep double tick permanently
    // Check if this message was ever delivered to an online recipient
    if (message.deliveredToOnline ?? false) {
      return '✓✓'; // Double tick - delivered to online user (permanent)
    } else if (otherUserPresence.value?.status === 'online' || otherUserPresence.value?.status === 'inactive') {
      return '✓✓'; // Double tick - delivered (recipient online now)
    } else {
      return '✓'; // Single tick - sent but not delivered yet
    }
  }
  return '';
};

const getDeliveryStatusClass = (message: ChatMessage) => {
  return getDeliveryStatus(message) === '✓✓' ? 'delivery-double' : 'delivery-single';
};

const getAvatarColor = (userId: string) => {
  // Generate a consistent color based on userId
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 65%, 55%)`;
};

const getInitials = (userId: string) => {
  // Extract first letter or first meaningful character
  const match = userId.match(/[a-zA-Z]/);
  return match ? match[0].toUpperCase() : 'U';
};

const formatTime = (date: Date | string) => {
  const normalizedDate = date instanceof Date ? date : new Date(date);
  return normalizedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const scrollToBottom = () => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
  });
};

onMounted(async () => {
  chatService = new ChatService(props.userId, props.otherUserId);

  chatService.onMessageReceived = (message) => {
    messages.value.push(message);
    scrollToBottom();
  };

  chatService.onPresenceUpdate = (presence) => {
    if (presence.userId === props.otherUserId) {
      otherUserPresence.value = presence;
    }
  };

  chatService.onConnectionStateChange = (connected) => {
    isConnected.value = connected;
    if (!connected) {
      isSecureSessionReady.value = false;
      isTyping.value = false;
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

  chatService.onHandshakeComplete = () => {
    isSecureSessionReady.value = true;
    error.value = '';
  };

  try {
    await chatService.connect();
    isConnected.value = true;
    await chatService.initiateHandshake();
    
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
  isSecureSessionReady.value = false;
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

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 18px;
  color: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  flex-shrink: 0;
}

.chat-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #2d3748;
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat-header h2::before {
  content: '🔒';
  font-size: 20px;
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

.date-separator {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 16px 0;
  width: 100%;
}

.date-separator span {
  background: rgba(102, 126, 234, 0.1);
  color: #667eea;
  padding: 4px 12px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.encryption-notice {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 8px 0 24px 0;
  width: 100%;
}

.encryption-notice span {
  background: rgba(255, 193, 7, 0.1);
  color: #9ca3af;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 500;
  text-align: center;
  max-width: 90%;
  line-height: 1.4;
}

.message-wrapper {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  width: 100%;
}

.message-wrapper.own {
  justify-content: flex-end;
}

.message-wrapper.other {
  justify-content: flex-start;
}

.message-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 70%;
  position: relative;
}

.message-wrapper.own .message-container {
  align-items: flex-end;
}

.message-wrapper.other .message-container {
  align-items: flex-start;
}

.message-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 14px;
  color: white;
  flex-shrink: 0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.message {
  max-width: 100%;
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
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
}

.delivery-status {
  font-size: 12px;
  font-weight: 600;
  opacity: 0.9;
}

.message.own .delivery-status {
  color: rgba(255, 255, 255, 0.9);
}

.reaction-picker {
  display: flex;
  gap: 4px;
  padding: 6px;
  background: white;
  border: 2px solid #e2e8f0;
  border-radius: 20px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  animation: slideIn 0.2s ease-out;
  width: fit-content;
}

.message-wrapper.own .reaction-picker {
  align-self: flex-end;
}

.message-wrapper.other .reaction-picker {
  align-self: flex-start;
}

.reaction-button {
  width: 32px;
  height: 32px;
  padding: 0;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 50%;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: none;
}

.reaction-button:hover {
  background: rgba(102, 126, 234, 0.1);
  border-color: #667eea;
  transform: scale(1.15);
  box-shadow: 0 2px 6px rgba(102, 126, 234, 0.2);
}

.reactions-display {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.reaction-bubble {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 4px 10px;
  background: white;
  border: 2px solid #e2e8f0;
  border-radius: 12px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.reaction-bubble:hover {
  border-color: #667eea;
  transform: scale(1.05);
  box-shadow: 0 2px 6px rgba(102, 126, 234, 0.2);
}

.reaction-bubble.own-reaction {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.15) 0%, rgba(118, 75, 162, 0.15) 100%);
  border-color: #667eea;
  font-weight: 600;
}

.input-area {
  display: flex;
  padding: 20px 24px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-top: 2px solid #667eea;
  gap: 12px;
  position: relative;
}

.emoji-picker-container {
  position: relative;
}

.emoji-button {
  width: 48px;
  height: 48px;
  padding: 0;
  background: white;
  border: 2px solid #e2e8f0;
  border-radius: 50%;
  font-size: 24px;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.emoji-button:hover:not(:disabled) {
  border-color: #667eea;
  transform: scale(1.1);
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.2);
}

.emoji-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.emoji-picker {
  position: absolute;
  bottom: 60px;
  left: 0;
  background: white;
  border: 2px solid #e2e8f0;
  border-radius: 16px;
  padding: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  animation: slideUp 0.2s ease-out;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.emoji-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
  padding: 4px;
}

.emoji-grid::-webkit-scrollbar {
  width: 6px;
}

.emoji-grid::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.05);
  border-radius: 3px;
}

.emoji-grid::-webkit-scrollbar-thumb {
  background: #667eea;
  border-radius: 3px;
}

.emoji-item {
  font-size: 24px;
  cursor: pointer;
  padding: 8px;
  border-radius: 8px;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.emoji-item:hover {
  background: rgba(102, 126, 234, 0.1);
  transform: scale(1.2);
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

.info {
  padding: 12px 24px;
  text-align: center;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  font-weight: 500;
  border-bottom: 2px solid #1d4ed8;
}

/* UI polish */
.chat-container {
  height: 100dvh;
  max-width: 900px;
  background: linear-gradient(180deg, #f8f9ff 0%, #eef1ff 100%);
  border-radius: 20px;
  border: 1px solid rgba(102, 126, 234, 0.15);
}

.messages {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.9) 0%, rgba(248, 250, 255, 0.95) 100%);
}

.message {
  box-shadow: 0 6px 18px rgba(34, 42, 84, 0.08);
}

.message.other {
  border: 1px solid #e7ecf5;
}

.delivery-status {
  font-weight: 700;
  letter-spacing: 0.2px;
  display: inline-flex;
  min-width: 18px;
  justify-content: center;
}

.message.own .delivery-status.delivery-double {
  color: #d2e4ff;
}

.message.own .delivery-status.delivery-single {
  color: rgba(255, 255, 255, 0.78);
}

@media (max-width: 768px) {
  .chat-container {
    max-width: 100%;
    border-radius: 0;
    border: none;
    box-shadow: none;
  }

  .message-container {
    max-width: 82%;
  }
}

</style>
