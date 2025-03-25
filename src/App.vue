<template>
    <div
        class="h-screen bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 font-mono flex flex-col overflow-auto"
    >
        <header class="bg-teal-600 dark:bg-teal-800 text-white p-2 shadow-md">
            <div class="px-4 mx-auto flex items-center justify-between">
                <h1 class="text-lg p-0 font-bold !my-0">YTogether</h1>
                <p class="text-xs text-teal-100">Watch YouTube videos</p>
            </div>
        </header>

        <main class="flex-1 flex">
            <Room />
        </main>
    </div>
</template>

<script setup>
import { onMounted } from "vue";
import Room from "./components/Room.vue";

onMounted(() => {
    document.title = "YTogether - Watch YouTube Videos Together";
});
</script>
