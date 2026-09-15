<template>
  <section class="space-y-6">
    <div class="hero-card">
      <div class="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div><div class="eyebrow">CLOUDFLARE NATIVE</div><h1 class="page-title mt-2">3X-UI</h1><p class="mt-3 max-w-2xl text-sm leading-6 text-slate-400">{{ t('about.description') }}</p></div>
        <div class="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm"><div class="text-xs text-slate-500">{{ t('about.deployment') }}</div><div class="mt-1 font-mono text-slate-100">{{ context.hostname || '—' }}</div></div>
      </div>
    </div>
    <div class="grid gap-4 md:grid-cols-3">
      <a v-for="s in socials" :key="s.label" :href="s.href" target="_blank" rel="noopener noreferrer" class="card social-card group"><div class="social-icon" v-html="s.icon"></div><div><div class="font-semibold text-slate-100">{{ s.label }}</div><div class="mt-1 text-xs text-slate-500">{{ s.text }}</div></div><span class="ms-auto text-slate-600 transition group-hover:translate-x-1 group-hover:text-brand-300">↗</span></a>
    </div>
    <div class="card flex flex-col gap-2 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between"><span>{{ t('about.footer') }}</span><span class="font-mono text-xs text-slate-600">Cloudflare Workers · D1 · KV · WebSockets</span></div>
  </section>
</template>
<script setup lang="ts">
import { onMounted, ref } from 'vue'; import { useI18n } from 'vue-i18n'; import { api } from '../api/client';
const { t }=useI18n(); const context=ref<any>({});
const socials=[
 {label:'Telegram',text:'Pixel & Ping',href:'https://t.me/Pixel_Ping',icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m21.7 4.2-3 14.2c-.2 1-.8 1.2-1.6.8l-4.4-3.2-2.1 2c-.2.2-.4.4-.8.4l.3-4.5 8.2-7.4c.4-.3-.1-.5-.6-.2L7.5 12.9l-4.3-1.4c-.9-.3-.9-.9.2-1.3L20.2 4c.8-.3 1.8.2 1.5.2Z"/></svg>'},
 {label:'GitHub',text:'samyarahad',href:'https://github.com/samyarahad',icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.9c-2.8.6-3.4-1.2-3.4-1.2-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.6 1 1.6 1 .9 1.6 2.4 1.1 3 .8.1-.7.4-1.1.6-1.4-2.2-.2-4.5-1.1-4.5-4.8 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.7 9.7 0 0 1 5.1 0c2-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.7-2.3 4.6-4.5 4.8.4.3.7 1 .7 1.9V21c0 .3.2.6.7.5A10 10 0 0 0 12 2Z"/></svg>'},
 {label:'YouTube',text:'ShadowDrop-024',href:'https://www.youtube.com/channel/ShadowDrop-024',icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.6 7.2a2.8 2.8 0 0 0-2-2C17.8 4.7 12 4.7 12 4.7s-5.8 0-7.6.5a2.8 2.8 0 0 0-2 2C1.9 9 1.9 12 1.9 12s0 3 .5 4.8a2.8 2.8 0 0 0 2 2c1.8.5 7.6.5 7.6.5s5.8 0 7.6-.5a2.8 2.8 0 0 0 2-2c.5-1.8.5-4.8.5-4.8s0-3-.5-4.8ZM10 15.4V8.6l6 3.4-6 3.4Z"/></svg>'}
];
onMounted(async()=>{context.value=await api.get('/system/context')});
</script>
