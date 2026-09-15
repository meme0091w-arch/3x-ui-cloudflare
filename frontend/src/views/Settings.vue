<template>
  <section class="space-y-6">
    <div>
      <div class="eyebrow">CONTROL CENTER</div>
      <h1 class="page-title">{{ t('settings.title') }}</h1>
      <p class="page-subtitle">{{ t('settings.subtitle') }}</p>
    </div>
    <div class="grid gap-5 xl:grid-cols-2">
      <form v-if="canEditSettings" class="card space-y-5" @submit.prevent="save">
        <div><h2 class="section-title">{{ t('settings.general') }}</h2><p class="section-copy">Panel identity and generated-link behavior.</p></div>
        <label class="block text-sm"><span class="field-label">{{ t('settings.panelName') }}</span><input v-model="form.panel_name" class="input" maxlength="80" /></label>
        <div class="rounded-2xl border border-brand-400/15 bg-brand-500/5 p-4">
          <div class="flex items-center justify-between gap-4"><div><div class="text-xs uppercase tracking-widest text-slate-500">{{ t('settings.detectedDomain') }}</div><div class="mt-1 font-mono text-sm text-slate-100 dark:text-slate-100">{{ context.hostname || '—' }}</div></div><span class="status-dot online" /></div>
          <p class="mt-2 text-xs leading-5 text-slate-500">{{ t('settings.domainAuto') }}</p>
        </div>
        <label class="block text-sm"><span class="field-label">{{ t('settings.defaultFormat') }}</span><select v-model="form.default_subscription_format" class="input"><option v-for="f in formats" :key="f">{{ f }}</option></select></label>
        <button class="btn-primary" :disabled="saving">{{ saving ? t('common.loading') : t('settings.save') }}</button>
        <p v-if="saved" class="text-sm text-emerald-300">{{ t('common.saved') }}</p>
      </form>
      <form class="card space-y-5" @submit.prevent="password">
        <div><h2 class="section-title">{{ t('settings.security') }}</h2><p class="section-copy">Rotate your administrator password and keep the session secure.</p></div>
        <input v-model="newPassword" type="password" class="input" minlength="10" autocomplete="new-password" :placeholder="t('login.newPassword')" required />
        <button class="btn-primary">{{ t('settings.password') }}</button>
        <p v-if="msg" class="text-sm text-emerald-300">{{ msg }}</p>
      </form>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';
const { t } = useI18n();
const auth = useAuthStore();
const formats = ['plain','base64','clash-meta','sing-box','v2rayn','nekobox'];
const form = ref<any>({ panel_name: '3X-UI', default_subscription_format: 'plain' });
const context = ref<any>({});
const saving = ref(false), saved = ref(false), newPassword = ref(''), msg = ref('');
const canEditSettings = computed(()=>!auth.permissions.length||auth.can('settings.read'));
async function load(){ context.value = await api.get<any>('/system/context');
  if(!canEditSettings.value) return;
  const s = await api.get<any>('/settings'); form.value = {...form.value,...(s.settings||{})}; }
async function save(){ saving.value=true; try { await api.put('/settings', form.value); saved.value=true; setTimeout(()=>saved.value=false,1500); } finally { saving.value=false; } }
async function password(){ await api.post('/auth/change-password',{newPassword:newPassword.value}); auth.clear(); location.href='/login'; }
onMounted(load);
</script>
