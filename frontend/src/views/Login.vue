<template>
  <div class="login-page">
    <div class="login-aurora aurora-a"/><div class="login-aurora aurora-b"/>
    <div class="login-top"><div class="brand-mark"><span>3X</span><i/></div><div class="flex items-center gap-2"><select v-model="locale" class="locale-select"><option v-for="x in locales" :key="x.code" :value="x.code">{{x.flag}} {{x.label}}</option></select><button class="icon-btn" @click="toggleTheme">{{dark?'☀':'◐'}}</button></div></div>
    <main class="login-center">
      <div class="login-card">
        <div class="mb-8"><div class="eyebrow">CLOUDFLARE NATIVE EDITION</div><h1 class="mt-2 text-3xl font-bold tracking-tight">{{t('login.title')}}</h1><p class="mt-2 text-sm leading-6 text-slate-500">{{t('login.subtitle')}}</p></div>
        <form @submit.prevent="submit" class="space-y-4">
          <label class="block text-sm"><span class="field-label">{{t('login.username')}}</span><input v-model="username" class="input" autocomplete="username" required/></label>
          <label class="block text-sm"><span class="field-label">{{t('login.password')}}</span><input v-model="password" class="input" type="password" autocomplete="current-password" required/></label>
          <button class="btn-primary w-full py-3" :disabled="loading">{{loading?t('common.loading'):t('login.submit')}}</button>
          <p v-if="error" class="rounded-xl border border-red-400/10 bg-red-500/10 p-3 text-sm text-red-300">{{error}}</p>
        </form>
        <div class="mt-8 border-t border-white/5 pt-5"><div class="flex items-center justify-between text-[11px] text-slate-600"><span>Created by PIXEL &amp; PING Team</span><RouterLink to="/about" class="hover:text-brand-300">{{t('nav.about')}}</RouterLink></div><div class="mt-4 flex items-center justify-center gap-2"><a v-for="s in socials" :key="s.label" :href="s.href" target="_blank" rel="noopener noreferrer" :aria-label="s.label" class="icon-btn" v-html="s.icon"></a></div></div>
      </div>
    </main>
  </div>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue'; import { useRouter } from 'vue-router'; import { useI18n } from 'vue-i18n'; import { useDark, useToggle } from '@vueuse/core'; import { useAuthStore } from '../stores/auth'; import { availableLocales, setLocale } from '../i18n';
const {t,locale}=useI18n(),router=useRouter(),auth=useAuthStore(),locales=availableLocales,username=ref(''),password=ref(''),loading=ref(false),error=ref('');
const socials=[{label:'Telegram',href:'https://t.me/Pixel_Ping',icon:'<svg viewBox="0 0 24 24"><path fill="currentColor" d="m21.7 4.2-3 14.2c-.2 1-.8 1.2-1.6.8l-4.4-3.2-2.1 2c-.2.2-.4.4-.8.4l.3-4.5 8.2-7.4c.4-.3-.1-.5-.6-.2L7.5 12.9l-4.3-1.4c-.9-.3-.9-.9.2-1.3L20.2 4c.8-.3 1.8.2 1.5.2Z"/></svg>'},{label:'GitHub',href:'https://github.com/samyarahad',icon:'<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.9c-2.8.6-3.4-1.2-3.4-1.2-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.6 1 1.6 1 .9 1.6 2.4 1.1 3 .8.1-.7.4-1.1.6-1.4-2.2-.2-4.5-1.1-4.5-4.8 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.7 9.7 0 0 1 5.1 0c2-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.7-2.3 4.6-4.5 4.8.4.3.7 1 .7 1.9V21c0 .3.2.6.7.5A10 10 0 0 0 12 2Z"/></svg>'},{label:'YouTube',href:'https://www.youtube.com/channel/ShadowDrop-024',icon:'<svg viewBox="0 0 24 24"><path fill="currentColor" d="M21.6 7.2a2.8 2.8 0 0 0-2-2C17.8 4.7 12 4.7 12 4.7s-5.8 0-7.6.5a2.8 2.8 0 0 0-2 2C1.9 9 1.9 12 1.9 12s0 3 .5 4.8a2.8 2.8 0 0 0 2 2c1.8.5 7.6.5 7.6.5s5.8 0 7.6-.5a2.8 2.8 0 0 0 2-2c.5-1.8.5-4.8.5-4.8s0-3-.5-4.8ZM10 15.4V8.6l6 3.4-6 3.4Z"/></svg>'}]; const dark=useDark({storageKey:'3xui-theme',attribute:'class',valueDark:'dark',valueLight:'light'}); const toggleTheme=useToggle(dark); watch(locale,v=>setLocale(String(v)));
async function submit(){loading.value=true;error.value='';try{await auth.login(username.value,password.value);await router.push('/')}catch(e){error.value=(e as Error).message}finally{loading.value=false}}
</script>
