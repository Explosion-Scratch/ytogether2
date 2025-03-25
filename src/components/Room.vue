<template>
    <div class="flex flex-col flex-1">
        <div
            v-if="isLoading"
            class="mx-10 mt-6 p-3 bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-md text-blue-700 dark:text-blue-300 text-sm flex items-center justify-center"
        >
            <svg
                class="animate-spin h-5 w-5 mr-2"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
            >
                <circle
                    class="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                ></circle>
                <path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
            </svg>
            {{ isLoading || "Loading..." }}
        </div>
        <div
            class="grid flex-1 grid-cols-[3fr_2fr] p-4 overflow-auto panes-h panes"
            ref="dragContainer"
            data-panes="2,1"
        >
            <VideoSync :roomId="roomId" />
            <div class="pane flex flex-col">
                <div
                    v-if="isNewRoom"
                    class="mb-6 p-3 bg-teal-50 dark:bg-teal-900 border border-teal-200 dark:border-teal-700 rounded-md text-teal-700 dark:text-teal-300 text-sm"
                >
                    <p>
                        New room created with secure UUID! URL copied to
                        clipboard for sharing.
                    </p>
                    <button
                        @click="copyUrlToClipboard"
                        class="mt-1 text-xs px-2 py-1 bg-teal-100 dark:bg-teal-800 hover:bg-teal-200 dark:hover:bg-teal-700 rounded transition-colors"
                    >
                        Copy URL again
                    </button>
                </div>

                <Chat :roomId="roomId" />
            </div>
        </div>
    </div>
</template>
<style>
@import "tailwindcss";

.gutter {
    @apply absolute bottom-0 right-0 z-30 opacity-50;
}
.gutter::after {
    content: "";
    @apply absolute inset-0 bg-teal-600 opacity-50 rounded;
}
.panes {
    @apply touch-none grid;
}

.pane {
    @apply relative overflow-hidden;
}

.pane:not(:has(.pane)) {
    @apply p-6;
}

.panes-h > .pane > .gutter {
    @apply cursor-col-resize top-0 bottom-0 w-2;
}

.panes-h > .pane > .gutter::after {
    @apply w-1 my-6;
}

.panes-v > .pane > .gutter {
    @apply cursor-row-resize left-0 h-2;
}

.panes-v > .pane > .gutter::after {
    @apply h-1 mx-6;
}
</style>
<script setup>
import { ref, onMounted, provide } from "vue";
import peerService from "../utils/peerService";
import VideoSync from "./VideoSync.vue";
import Chat from "./Chat.vue";

const roomId = ref("");
const isNewRoom = ref(false);
const isLoading = ref("");

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

const dragContainer = ref(null);

// DOM utils:
const el = (sel, par = document) => par.querySelector(sel);
const els = (sel, par = document) => par.querySelectorAll(sel);
const elNew = (tag, prop = {}) =>
    Object.assign(document.createElement(tag), prop);

// Resizable
let isResizing = false;
const resizableGrid = (elParent, idx) => {
    const isVert = elParent.classList.contains("panes-v");
    const elsPanes = elParent.querySelectorAll(":scope > .pane");

    let fr = elParent.getAttribute("data-panes")
        ? elParent.getAttribute("data-panes").split(",").map(Number)
        : [...elsPanes].map(() => 1);
    fr = fr.map((f) => f / fr.reduce((a, b) => a + b, 0));
    let elPaneCurr = null;
    let paneIndex = -1;
    let frStart = 0;
    let frNext = 0;
    const frToCSS = () => {
        elParent.style[
            isVert ? "grid-template-rows" : "grid-template-columns"
        ] = fr.join("fr ") + "fr";
    };

    const pointerDown = (evt) => {
        if (isResizing || !evt.target.closest(".gutter")) return;
        isResizing = true;
        elPaneCurr = evt.currentTarget;
        fr = [...elsPanes].map((elPane) =>
            isVert
                ? elPane.clientHeight / elParent.clientHeight
                : elPane.clientWidth / elParent.clientWidth,
        );
        paneIndex = [...elsPanes].indexOf(elPaneCurr);
        frStart = fr[paneIndex];
        frNext = fr[paneIndex + 1];
        addEventListener("pointermove", pointerMove);
        addEventListener("pointerup", pointerUp);
    };

    const pointerMove = (evt) => {
        evt.preventDefault();
        const paneBCR = elPaneCurr.getBoundingClientRect();
        const parentSize = isVert
            ? elParent.clientHeight
            : elParent.clientWidth;
        const pointer = {
            x: Math.max(
                0,
                Math.min(evt.clientX - paneBCR.left, elParent.clientWidth),
            ),
            y: Math.max(
                0,
                Math.min(evt.clientY - paneBCR.top, elParent.clientHeight),
            ),
        };
        const frRel = pointer[isVert ? "y" : "x"] / parentSize;
        const frDiff = frStart - frRel;
        fr[paneIndex] = Math.max(0.05, frRel);
        fr[paneIndex + 1] = Math.max(0.05, frNext + frDiff);
        frToCSS();
    };

    const pointerUp = (evt) => {
        removeEventListener("pointermove", pointerMove);
        removeEventListener("pointerup", pointerUp);
        isResizing = false;
    };

    [...elsPanes].slice(0, -1).forEach((elPane, i) => {
        elPane.append(
            elNew("div", {
                className: "gutter",
            }),
        );
        elPane.addEventListener("pointerdown", pointerDown);
    });
    frToCSS();
};

onMounted(async () => {
    const urlRoomId = new URLSearchParams(window.location.search).get("roomId");
    [...document.querySelectorAll(".panes")].forEach(resizableGrid);
    try {
        if (urlRoomId) {
            isLoading.value = "Joining room " + urlRoomId;
            // We're joining an existing room
            roomId.value = urlRoomId;
            console.log("Joining room:", urlRoomId);

            try {
                await peerService.joinRoom(urlRoomId);
                console.log("Joined room:", urlRoomId);
            } catch (joinError) {
                isLoading.value = "Failed to join room, creating room";
                console.error("Failed to join room:", joinError);
                console.log("Creating new room instead");
                await createNewRoom();
            }
        } else {
            isLoading.value = "Creating room";
            // We're creating a new room
            await createNewRoom();
        }
    } catch (error) {
        console.error("Failed to initialize room:", error);
    }
    isLoading.value = false;
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
