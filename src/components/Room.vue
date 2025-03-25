<template>
    <div class="flex flex-col flex-1 max-w-6xl mx-auto">
        <div
            v-if="isNewRoom"
            class="mx-3 my-4 p-3 bg-teal-50 dark:bg-teal-900 border border-teal-200 dark:border-teal-700 rounded-md text-teal-700 dark:text-teal-300 text-sm"
        >
            <p>
                New room created with secure UUID! URL copied to clipboard for
                sharing.
            </p>
            <button
                @click="copyUrlToClipboard"
                class="mt-1 text-xs px-2 py-1 bg-teal-100 dark:bg-teal-800 hover:bg-teal-200 dark:hover:bg-teal-700 rounded transition-colors"
            >
                Copy URL again
            </button>
        </div>
        <div class="flex flex-1 flex-col lg:flex-row p-4 gap-4 overflow-auto">
            <div class="flex-1">
                <VideoSync :roomId="roomId" />
            </div>
            <div class="w-full lg:w-1/3">
                <Chat :roomId="roomId" />
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, provide } from "vue";
import peerService from "../utils/peerService";
import VideoSync from "./VideoSync.vue";
import Chat from "./Chat.vue";

const roomId = ref("");
const isNewRoom = ref(false);

// Provide roomId to child components
provide("roomId", roomId);

async function createNewRoom() {
    const newRoomId = await peerService.createRoom();
    roomId.value = newRoomId;
    updateRoomIdInUrl(newRoomId);
    isNewRoom.value = true;

    // Copy the URL to clipboard for easy sharing
    copyUrlToClipboard();
    console.log("Created new room with ID:", newRoomId);
    return newRoomId;
}

onMounted(async () => {
    const urlRoomId = new URLSearchParams(window.location.search).get("roomId");

    try {
        if (urlRoomId) {
            // We're joining an existing room
            roomId.value = urlRoomId;
            console.log("Joining room:", urlRoomId);

            try {
                await peerService.joinRoom(urlRoomId);
                console.log("Joined room:", urlRoomId);
            } catch (joinError) {
                console.error("Failed to join room:", joinError);
                console.log("Creating new room instead");
                await createNewRoom();
            }
        } else {
            // We're creating a new room
            await createNewRoom();
        }
    } catch (error) {
        console.error("Failed to initialize room:", error);
    }
});

function updateRoomIdInUrl(roomId) {
    const newUrl = `${window.location.pathname}?roomId=${roomId}`;
    window.history.pushState({ path: newUrl }, "", newUrl);
}

function copyUrlToClipboard() {
    // Small delay to ensure the URL is updated
    setTimeout(() => {
        try {
            navigator.clipboard.writeText(window.location.href).then(() => {
                console.log("URL copied to clipboard!");
            });
        } catch (err) {
            console.error("Failed to copy URL: ", err);
        }
    }, 100);
}
</script>
