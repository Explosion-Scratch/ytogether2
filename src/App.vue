<template>
    <div
        class="h-screen bg-white text-gray-800 font-mono flex flex-col overflow-hidden"
    >
        <header class="bg-teal-600 text-white p-3 shadow-md">
            <div class="container mx-auto">
                <h1 class="text-lg font-bold my-0">YTogether</h1>
                <p class="text-xs text-teal-100">Watch YouTube videos</p>
            </div>
        </header>

        <main class="flex-1 flex overflow-hidden">
            <Room />
        </main>

        <footer class="bg-gray-100 p-3 text-center text-gray-500 text-sm">
            <p>Share the URL with friends to watch together</p>
        </footer>
    </div>
</template>

<script setup>
import { onMounted } from "vue";
import Room from "./components/Room.vue";

onMounted(() => {
    document.title = "YTogether - Watch YouTube Videos Together";
});
</script>
