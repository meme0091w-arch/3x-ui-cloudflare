<template>
  <div class="app-shell">
    <aside :class="['sidebar', { 'sidebar-open': open }]">
      <div class="sidebar-inner">
        <div class="brand-row">
          <div class="brand-mark"><span>3X</span><i /></div>
          <div class="min-w-0"><div class="brand-title">3X-UI</div><div class="brand-sub">CLOUDFLARE NATIVE</div></div>
          <button class="icon-btn lg:hidden" @click="open=false">×</button>
        </div>
        <div class="sidebar-section">{{ t('common.navigation') }}</div>
        <nav class="nav-list">
          <RouterLink v-for="n in nav" :key="n.to" :to="n.to" @click="open=false" class="nav-item" :class="{active: route.path===n.to}"><span class="nav-icon">{{n.icon}}</span><span>{{t(n.label)}}</span></RouterLink>
        </nav>
        <div class="sidebar-bottom">
          <div class="flex items-center gap-2 px-1"><a v-for="s in socials" :key="s.label" :href="s.href" target="_blank" rel="noopener noreferrer" :aria-label="s.label" class="icon-btn" v-html="s.icon"></a></div>
          <RouterLink to="/about" class="about-mini"><span>✦</span><span>{{t('nav.about')}}</span></RouterLink>
          <div class="user-chip"><div class="avatar">{{(auth.admin?.username||'A').slice(0,1).toUpperCase()}}</div><div class="min-w-0 flex-1"><div class="truncate text-sm font-medium text-slate-100">{{auth.admin?.username||'admin'}}</div><div class="text-[10px] uppercase tracking-widest text-slate-600">{{auth.role}}</div></div><button class="icon-btn" @click="auth.logout().then(()=>router.push('/login'))" :title="t('common.signOut')">↪</button></div>
          <div class="footer-brand">Created by PIXEL &amp; PING Team</div>
        </div>
      </div>
    </aside>
    <div v-if="open" class="mobile-scrim lg:hidden" @click="open=false" />
    <main class="main-area">
      <header class="topbar">
        <div class="flex items-center gap-3"><button class="icon-btn lg:hidden" @click="open=true">☰</button><div class="crumb"><span>3X-UI</span><span>/</span><strong>{{String(route.name||'dashboard').replace(/-/g,' ')}}</strong></div></div>
        <div class="top-actions">
          <div class="live-pill"><span class="status-dot online"/> {{ t('common.live') }}</div>
          <select v-model="locale" class="locale-select" :aria-label="t('common.language')"><option v-for="x in locales" :key="x.code" :value="x.code">{{x.flag}} {{x.label}}</option></select>
          <button class="icon-btn" @click="toggleTheme" :title="dark?t('common.light'):t('common.dark')">{{dark?'☀':'◐'}}</button>
        </div>
      </header>
      <div class="page-wrap"><RouterView/></div>
    </main>
    <div v-if="auth.mustChangePassword" class="modal-backdrop"><form class="card w-full max-w-md" @submit.prevent="changePassword"><div class="mb-2 eyebrow">SECURITY</div><h2 class="text-xl font-bold">{{t('login.change')}}</h2><p class="mb-5 mt-2 text-sm text-slate-400">{{t('login.first')}}</p><input v-model="newPassword" type="password" class="input mb-3" :placeholder="t('login.newPassword')" minlength="10" required/><button class="btn-primary w-full" :disabled="saving">{{saving?t('common.loading'):t('login.change')}}</button><p v-if="error" class="mt-3 text-sm text-red-300">{{error}}</p></form></div>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'; import { useRoute, useRouter } from 'vue-router'; import { useI18n } from 'vue-i18n'; import { useDark, useToggle } from '@vueuse/core'; import { useAuthStore } from '../stores/auth'; import { setLocale, availableLocales } from '../i18n'; import { api } from '../api/client';
const route=useRoute(),router=useRouter(),{t,locale}=useI18n(),auth=useAuthStore(),locales=availableLocales,open=ref(false),newPassword=ref(''),saving=ref(false),error=ref('');
const socials=[{label:'Telegram',href:'https://t.me/Pixel_Ping',icon:'<svg viewBox="0 0 24 24"><path fill="currentColor" d="m21.7 4.2-3 14.2c-.2 1-.8 1.2-1.6.8l-4.4-3.2-2.1 2c-.2.2-.4.4-.8.4l.3-4.5 8.2-7.4c.4-.3-.1-.5-.6-.2L7.5 12.9l-4.3-1.4c-.9-.3-.9-.9.2-1.3L20.2 4c.8-.3 1.8.2 1.5.2Z"/></svg>'},{label:'GitHub',href:'https://github.com/samyarahad',icon:'<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.9c-2.8.6-3.4-1.2-3.4-1.2-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.6 1 1.6 1 .9 1.6 2.4 1.1 3 .8.1-.7.4-1.1.6-1.4-2.2-.2-4.5-1.1-4.5-4.8 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.7 9.7 0 0 1 5.1 0c2-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.7-2.3 4.6-4.5 4.8.4.3.7 1 .7 1.9V21c0 .3.2.6.7.5A10 10 0 0 0 12 2Z"/></svg>'},{label:'YouTube',href:'https://www.youtube.com/channel/ShadowDrop-024',icon:'<svg viewBox="0 0 24 24"><path fill="currentColor" d="M21.6 7.2a2.8 2.8 0 0 0-2-2C17.8 4.7 12 4.7 12 4.7s-5.8 0-7.6.5a2.8 2.8 0 0 0-2 2C1.9 9 1.9 12 1.9 12s0 3 .5 4.8a2.8 2.8 0 0 0 2 2c1.8.5 7.6.5 7.6.5s5.8 0 7.6-.5a2.8 2.8 0 0 0 2-2c.5-1.8.5-4.8.5-4.8s0-3-.5-4.8ZM10 15.4V8.6l6 3.4-6 3.4Z"/></svg>'}];
const dark=useDark({storageKey:'3xui-theme',attribute:'class',valueDark:'dark',valueLight:'light'}); const toggleDark=useToggle(dark); const toggleTheme=()=>toggleDark(); watch(locale,v=>setLocale(String(v)));
const allNav=[{to:'/',icon:'⌂',label:'nav.dashboard',perm:'dashboard.read'},{to:'/inbounds',icon:'◈',label:'nav.inbounds',perm:'configs.read'},{to:'/clients',icon:'◎',label:'nav.clients',perm:'users.read'},{to:'/subscriptions',icon:'↗',label:'nav.subscriptions',perm:'subscriptions.read'},{to:'/traffic',icon:'⌁',label:'nav.traffic',perm:'traffic.read'},{to:'/analytics',icon:'◒',label:'nav.analytics',perm:'dashboard.read'},{to:'/logs',icon:'≡',label:'nav.logs',perm:'logs.read'},{to:'/settings',icon:'⚙',label:'nav.settings',perm:''},{to:'/backup',icon:'↥',label:'nav.backup',perm:'backup.read'},{to:'/admin',icon:'♙',label:'nav.admin',perm:'admin.read'}];
// Showing links a role cannot open just produced 403s.
const nav=computed(()=>allNav.filter(n=>!n.perm||!auth.permissions.length||auth.can(n.perm)));
async function changePassword(){saving.value=true;error.value='';try{await api.post('/auth/change-password',{newPassword:newPassword.value});auth.mustChangePassword=false;auth.clear();await router.push('/login')}catch(e){error.value=(e as Error).message}finally{saving.value=false}}
</script>
