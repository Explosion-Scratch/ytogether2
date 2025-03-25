<template>
    <div
        class="flex flex-col h-full border border-gray-300 dark:border-gray-700 rounded overflow-auto transition-all duration-300 hover:shadow-md dark:hover:shadow-lg"
    >
        <div
            class="grid grid-cols-2 gap-4 bg-gray-100 dark:bg-gray-800 p-3 border-b border-gray-300 dark:border-gray-700 text-sm"
        >
            <div class="flex flex-col">
                <span class="font-semibold">Room ID:</span>
                <span class="text-nowrap overflow-hidden text-ellipsis">{{
                    roomId
                }}</span>
            </div>
            <div class="flex flex-col" v-if="userName">
                <span class="font-semibold">Your name:</span>
                <span class="text-nowrap overflow-hidden text-ellipsis">{{
                    userName
                }}</span>
            </div>
        </div>
        <div ref="chatContainer" class="flex-1 p-4 overflow-y-auto">
            <div v-for="(msg, index) in messages" :key="index" class="mb-3">
                <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    {{ msg.sender }}
                </div>
                <div
                    class="bg-gray-50 dark:bg-gray-700 p-2 rounded"
                    v-html="formatMessage(msg.content)"
                ></div>
            </div>
        </div>
        <div
            v-if="!userName"
            class="p-3 bg-teal-50 dark:bg-teal-900 border-t border-teal-200 dark:border-teal-700"
        >
            <div class="text-sm mb-2">Enter your name to join the chat:</div>
            <div class="flex">
                <input
                    v-model="userNameInput"
                    placeholder="Your name"
                    class="flex-1 p-2 border border-gray-300 dark:border-gray-700 rounded-l transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 dark:bg-gray-800 dark:text-white"
                />
                <button
                    @click="setUserName"
                    class="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-r focus:outline-none transition-all duration-300 dark:bg-teal-600 dark:hover:bg-teal-700"
                >
                    Join
                </button>
            </div>
        </div>
        <input
            v-if="userName"
            v-model="message"
            @keyup.enter="sendMessage"
            placeholder="Type a message..."
            class="p-2 border-t border-gray-300 dark:border-gray-700 w-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 hover:shadow-inner dark:bg-gray-800 dark:text-white"
        />
    </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from "vue";
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
const userName = ref("");
const userNameInput = ref("");

// Initialize chat
onMounted(() => {
    // Load username from localStorage if it exists
    const savedName = localStorage.getItem("ytogether_username");
    if (savedName) {
        userName.value = savedName;
    }

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

function setUserName() {
    if (userNameInput.value.trim()) {
        userName.value = userNameInput.value.trim();
        localStorage.setItem("ytogether_username", userName.value);
        userNameInput.value = "";
    }
}

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
    if (message.value.trim() && userName.value) {
        const messageContent = message.value;

        // Add to local messages
        addMessage(userName.value, messageContent);

        // Send to all connections
        peerService.send({
            type: "chat",
            sender: userName.value,
            content: messageContent,
        });

        message.value = "";
    }
}

function addMessage(sender, content) {
    const displayName =
        sender === peerService.getId() && userName.value
            ? userName.value
            : sender;

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
