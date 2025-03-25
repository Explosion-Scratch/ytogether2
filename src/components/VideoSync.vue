<template>
    <div class="relative">
        <div
            v-if="!currentVideoId"
            class="aspect-video bg-gray-100 flex items-center justify-center text-gray-500 border border-gray-300 rounded"
        >
            <div class="text-center p-4">
                <div class="mb-2 text-2xl">📺</div>
                <p>Paste a YouTube URL to start watching together</p>
            </div>
        </div>
        <div
            v-else
            id="youtube-player"
            class="aspect-video transition-all duration-300 rounded overflow-hidden"
            style="
                box-shadow:
                    0px 0px 1px rgba(3, 7, 18, 0.02),
                    0px 1px 4px rgba(3, 7, 18, 0.03),
                    0px 2px 9px rgba(3, 7, 18, 0.05),
                    0px 4px 15px rgba(3, 7, 18, 0.06),
                    0px 6px 24px rgba(3, 7, 18, 0.08);
            "
        ></div>

        <div class="flex flex-col mt-4">
            <input
                v-model="videoIdInput"
                @input="handleInput"
                @paste="handlePaste"
                @keyup.enter="handleLoadVideoRequest"
                placeholder="Enter YouTube video ID or URL"
                class="w-full p-2 border border-gray-300 rounded-t transition-all duration-300 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 hover:shadow-md"
            />
            <button
                @click="handleLoadVideoRequest"
                class="w-full px-4 py-2 bg-teal-500 text-white rounded-b hover:bg-teal-600 focus:outline-none transition-all duration-300"
            >
                Watch
            </button>
        </div>

        <p v-if="errorMessage" class="mt-2 text-red-500 text-sm">
            {{ errorMessage }}
        </p>

        <div v-if="currentVideoId" class="mt-4">
            <div class="text-sm text-gray-600">
                Now playing:
                <span class="font-semibold">{{
                    currentVideoTitle || "YouTube Video"
                }}</span>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import peerService from "../utils/peerService";

const props = defineProps({
    roomId: {
        type: String,
        required: true,
    },
});

const videoIdInput = ref("");
const errorMessage = ref("");
const currentVideoId = ref("");
const currentVideoTitle = ref("");
const isAPIReady = ref(false);
const player = ref(null);
const isPlayerReady = ref(false);
const isSyncing = ref(false);
const lastSeekTime = ref(0);
const lastCheckedTime = ref(0);
const seekCheckInterval = ref(null);

// Setup YouTube API
onMounted(() => {
    // Setup message handling
    peerService.on("data", handlePeerMessage);

    // Setup new peer connections
    peerService.on("connect", (peerId) => {
        // If we have a video loaded, send it to the new peer
        if (currentVideoId.value && player.value && isPlayerReady.value) {
            console.log("Sending current video info to new peer:", peerId);
            peerService.send({
                type: "video_info",
                videoId: currentVideoId.value,
                currentTime: player.value.getCurrentTime(),
                playbackRate: player.value.getPlaybackRate(),
                paused:
                    player.value.getPlayerState() !== YT.PlayerState.PLAYING,
            });
        }
    });

    // Load YouTube API
    window.onYouTubeIframeAPIReady = () => {
        console.log("API Ready");
        isAPIReady.value = true;
        // Only create player if we have a video ID
        if (currentVideoId.value) {
            createPlayer(currentVideoId.value);
        }
    };

    loadYouTubeAPI();
});

onBeforeUnmount(() => {
    // Destroy player if it exists
    if (player.value) {
        player.value.destroy();
    }

    // Clear seek check interval
    if (seekCheckInterval.value) {
        clearInterval(seekCheckInterval.value);
    }
});

function loadYouTubeAPI() {
    if (!document.getElementById("youtube-iframe-api")) {
        const tag = document.createElement("script");
        tag.id = "youtube-iframe-api";
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName("script")[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }
}

function handlePeerMessage(data) {
    console.log("Got messsage: ", data.type, data);
    switch (data.type) {
        case "pause":
            if (!isSyncing.value) {
                isSyncing.value = true;
                player.value.pauseVideo();
                setTimeout(() => {
                    isSyncing.value = false;
                }, 500);
            }
            break;
        case "play":
            if (!isSyncing.value) {
                isSyncing.value = true;
                player.value.playVideo();
                setTimeout(() => {
                    isSyncing.value = false;
                }, 500);
            }
            break;
        case "seek":
            if (!isSyncing.value) {
                isSyncing.value = true;
                if (Math.abs(player.value.getCurrentTime() - data.time) > 0.5) {
                    player.value.seekTo(data.time, true);
                }
                player.value.playVideo();
                lastSeekTime.value = data.time;
                setTimeout(() => {
                    isSyncing.value = false;
                }, 500);
            }
            break;
        case "speedChange":
            if (!isSyncing.value) {
                isSyncing.value = true;
                player.value.setPlaybackRate(data.rate);
                setTimeout(() => {
                    isSyncing.value = false;
                }, 500);
            }
            break;
        case "video_info":
            console.log("Received video info:", data.videoId);
            loadVideo(data.videoId);

            if (isAPIReady.value) {
                // After player is ready, we'll sync to the provided time
                const syncVideoState = () => {
                    if (player.value && isPlayerReady.value) {
                        // Apply playback rate
                        peerService.send({
                            type: "speedChange",
                            rate: data.playbackRate,
                        });

                        // Seek to position
                        peerService.send({
                            type: "seek",
                            time: data.currentTime,
                        });

                        // Set play/pause state
                        if (data.paused) {
                            peerService.send({ type: "pause" });
                        } else {
                            peerService.send({ type: "play" });
                        }
                    }
                };

                // Try to sync multiple times to ensure it works
                setTimeout(syncVideoState, 1000);
            }
            break;
        case "request_video_info":
            // Someone is requesting our current video info
            if (currentVideoId.value && player.value && isPlayerReady.value) {
                console.log("Sending requested video info to peers");
                peerService.send({
                    type: "video_info",
                    videoId: currentVideoId.value,
                    currentTime: player.value.getCurrentTime(),
                    playbackRate: player.value.getPlaybackRate(),
                    paused:
                        player.value.getPlayerState() !==
                        YT.PlayerState.PLAYING,
                });
            }
            break;
    }
}

function createPlayer(videoId) {
    if (player.value) {
        player.value.destroy();
    }

    player.value = new YT.Player("youtube-player", {
        height: "360",
        width: "640",
        videoId: videoId,
        playerVars: {
            origin: window.location.origin,
            playsinline: 1,
            modestbranding: 1,
            rel: 0,
        },
        events: {
            onReady: onPlayerReady,
            onStateChange: onPlayerStateChange,
            onPlaybackRateChange: onPlaybackRateChange,
            onError: onPlayerError,
        },
    });
}

function onPlayerReady() {
    isPlayerReady.value = true;
    // Get video title if available
    if (player.value && player.value.getVideoData) {
        currentVideoTitle.value = player.value.getVideoData().title;
    }

    // If we're joining a room, we'll get sync info
    if (props.roomId !== peerService.getId()) {
        requestSync();
    }

    // Start checking for seek events
    setupSeekDetection();
}

function setupSeekDetection() {
    // Clear any existing interval
    if (seekCheckInterval.value) {
        clearInterval(seekCheckInterval.value);
    }

    // Set up interval to check for seeks
    seekCheckInterval.value = setInterval(() => {
        if (!player.value || !isPlayerReady.value || isSyncing.value) return;

        const currentTime = player.value.getCurrentTime();
        if (Math.abs(currentTime - lastCheckedTime.value) > 1.5) {
            handleSeek();
        }
        lastCheckedTime.value = currentTime;
    }, 1000);
}

function requestSync() {
    peerService.send({ type: "request_video_info" });
}

function onPlayerStateChange(event) {
    // Don't broadcast changes if we're currently syncing
    if (isSyncing.value) return;

    if (event.data === YT.PlayerState.PLAYING) {
        peerService.send({ type: "play" });
        handleSeek();
        lastSeekTime.value = Date.now();
        lastCheckedTime.value = player.value.getCurrentTime();
    } else if (event.data === YT.PlayerState.PAUSED) {
        peerService.send({ type: "pause" });
        handleSeek();
    } else if (event.data === YT.PlayerState.BUFFERING) {
        // When buffering ends, it will enter PLAYING state and send a play event
    }
}

function onPlaybackRateChange(event) {
    if (isSyncing.value || !player.value || !isPlayerReady.value) return;

    peerService.send({
        type: "speedChange",
        rate: player.value.getPlaybackRate(),
    });
}

function onPlayerError() {
    errorMessage.value = "Error loading video. Please try another URL.";
    currentVideoId.value = "";
}

// Function to handle manual seeking
function handleSeek() {
    if (isSyncing.value || !player.value || !isPlayerReady.value) return;

    peerService.send({
        type: "seek",
        time: player.value.getCurrentTime(),
    });
}

function handleLoadVideoRequest() {
    const videoId = extractVideoId(videoIdInput.value);
    if (!videoId) {
        errorMessage.value = "Invalid YouTube video ID or URL.";
        return;
    }

    errorMessage.value = "";
    loadVideo(videoId);

    // Broadcast video to all connections with short delay to ensure player is created
    setTimeout(() => {
        console.log("Broadcasting video info to all peers");
        peerService.send({
            type: "video_info",
            videoId: videoId,
            currentTime: 0,
            playbackRate: 1,
            paused: true,
        });
    }, 1000);

    videoIdInput.value = "";
}

function loadVideo(videoId) {
    currentVideoId.value = videoId;
    console.log("Loading video: ", videoId);
    if (isAPIReady.value) {
        console.log("Creating player");
        setTimeout(() => createPlayer(videoId), 10);
    }
}

function extractVideoId(url) {
    const regex =
        /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}
</script>
