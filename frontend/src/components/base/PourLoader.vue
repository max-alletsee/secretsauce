<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: 'sm' | 'md' | 'lg'
    label?: string
  }>(),
  {
    size: 'md',
    label: 'Loading',
  },
)
</script>

<template>
  <div role="status" :class="['pour-loader', `pour-loader--${size}`]">
    <div class="pour-loader__track" aria-hidden="true">
      <div class="pour-loader__dot" />
    </div>
    <span class="sr-only">{{ label }}</span>
  </div>
</template>

<style scoped>
.pour-loader {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* Size variants — track height determines the drop distance */
.pour-loader--sm {
  --loader-dot-size: 6px;
  --loader-track-height: 18px;
}

.pour-loader--md {
  --loader-dot-size: 10px;
  --loader-track-height: 32px;
}

.pour-loader--lg {
  --loader-dot-size: 14px;
  --loader-track-height: 48px;
}

.pour-loader__track {
  position: relative;
  width: var(--loader-dot-size);
  height: var(--loader-track-height);
  overflow: hidden;
}

.pour-loader__dot {
  width: var(--loader-dot-size);
  height: var(--loader-dot-size);
  border-radius: 50%;
  background: var(--color-primary);
  position: absolute;
  top: 0;
  left: 0;
  animation: pour-drop 0.8s cubic-bezier(0.55, 0, 1, 0.45) infinite;
}

@keyframes pour-drop {
  0% {
    top: 0;
    opacity: 1;
  }
  80% {
    top: calc(var(--loader-track-height) - var(--loader-dot-size));
    opacity: 1;
  }
  100% {
    top: calc(var(--loader-track-height) - var(--loader-dot-size));
    opacity: 0;
  }
}

/* Visually-hidden utility — accessible text off-screen */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* Reduced motion: static centered dot, no animation */
@media (prefers-reduced-motion: reduce) {
  .pour-loader__dot {
    animation: none;
    top: 50%;
    transform: translateY(-50%);
    opacity: 1;
  }
}
</style>
