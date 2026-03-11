<script setup lang="ts">
import { ref } from 'vue'
import Chat from './components/Chat.vue'

const userId = ref(`user-${Math.random().toString(36).substring(7)}`)
const otherUserId = ref('other-user')
</script>

<template>
  <div id="app">
    <Chat :userId="userId" :otherUserId="otherUserId" />
  </div>
</template>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  margin: 0;
  padding: 0;
}

body {
  margin: 0;
  padding: 0;
}
</style>