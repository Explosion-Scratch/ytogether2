<template>
    <div
        class="flex flex-col h-full border border-gray-300 rounded overflow-hidden transition-all duration-300 hover:shadow-md"
    >
        <div class="bg-gray-100 p-2 border-b border-gray-300 text-sm">
            <span>Room ID: {{ roomId }}</span>
        </div>
        <div ref="chatContainer" class="flex-1 p-4 overflow-y-auto">
            <div v-for="(msg, index) in messages" :key="index" class="mb-3">
                <div class="text-xs text-gray-500 mb-1">{{ msg.sender }}</div>
                <div
                    class="bg-gray-50 p-2 rounded"
                    v-html="formatMessage(msg.content)"
                ></div>
            </div>
        </div>
        <input
            v-model="message"
            @keyup.enter="sendMessage"
            placeholder="Type a message..."
            class="p-2 border-t border-gray-300 w-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 hover:shadow-inner"
        />
    </div>
</template>

<script setup>
import { ref, computed, inject, onMounted, watch, nextTick } from "vue";
import { marked } from "marked";
import DOMPurify from "dompurify";
import peerService from "../utils/peerService";

const props = defineProps({
    roomId: {
        type: String,
        required: true,
    },
});

const message = ref("");
const messages = ref([]);
const chatContainer = ref(null);

// Initialize chat
onMounted(() => {
    // Setup message handling
    peerService.on("data", handlePeerMessage);

    // Send chat history to new connections
    peerService.on("connect", () => {
        // Send existing messages to new peer
        if (messages.value.length > 0) {
            peerService.send({
                type: "chat_history",
                messages: messages.value,
            });
        }

        console.log("Chat initialized");
        // Add welcome message for the host
        if (peerService.getId() === props.roomId) {
            console.log("You are the host of this room");
            addMessage(
                "System",
                "Welcome to your room! Share the URL to invite others.",
            );
        }
    });
});

function handlePeerMessage(data) {
    if (data.type === "chat") {
        addMessage(data.sender, data.content);
    } else if (data.type === "chat_history") {
        // Only update messages if we don't have any
        if (messages.value.length === 0 && data.messages.length > 0) {
            messages.value = data.messages;
            scrollToBottom();
        }
    }
}

function sendMessage() {
    if (message.value.trim()) {
        const messageContent = message.value;

        // Add to local messages
        addMessage(peerService.getId(), messageContent);

        // Send to all connections
        peerService.send({
            type: "chat",
            sender: peerService.getId(),
            content: messageContent,
        });

        message.value = "";
    }
}

function addMessage(sender, content) {
    // For UUIDs, use first 6 chars to make display cleaner
    const displayName = sender.includes("-")
        ? `${sender.substring(0, 6)}...`
        : sender.substring(0, 6);

    messages.value.push({
        sender: displayName,
        content: content,
        timestamp: new Date(),
    });
    scrollToBottom();
}

function formatMessage(text) {
    return DOMPurify.sanitize(marked.parse(text));
}

function scrollToBottom() {
    nextTick(() => {
        if (chatContainer.value) {
            chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
        }
    });
}
</script>
