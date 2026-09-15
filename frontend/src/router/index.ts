import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';

// Permission required to open each page. The API enforces these anyway; without
// them a viewer saw every nav item and got a wall of 403s (and an unhandled
// rejection that left the page blank).
const REQUIRED: Record<string, string> = {
  dashboard: 'dashboard.read',
  inbounds: 'configs.read',
  clients: 'users.read',
  subscriptions: 'subscriptions.read',
  traffic: 'traffic.read',
  analytics: 'dashboard.read',
  logs: 'logs.read',
  backup: 'backup.read',
  admin: 'admin.read'
  // `settings` is deliberately absent: it also hosts the change-your-own-password
  // form, which every role must be able to reach.
};

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('../views/Login.vue') },
    { path: '/about', name: 'about-public', component: () => import('../views/About.vue') },
    {
      path: '/', component: () => import('../views/AppShell.vue'), meta: { requiresAuth: true },
      children: [
        { path: '', name: 'dashboard', component: () => import('../views/Dashboard.vue') },
        { path: 'inbounds', name: 'inbounds', component: () => import('../views/Inbounds.vue') },
        { path: 'clients', name: 'clients', component: () => import('../views/Clients.vue') },
        { path: 'subscriptions', name: 'subscriptions', component: () => import('../views/Subscriptions.vue') },
        { path: 'traffic', name: 'traffic', component: () => import('../views/Traffic.vue') },
        { path: 'analytics', name: 'analytics', component: () => import('../views/Analytics.vue') },
        { path: 'logs', name: 'logs', component: () => import('../views/Logs.vue') },
        { path: 'settings', name: 'settings', component: () => import('../views/Settings.vue') },
        { path: 'backup', name: 'backup', component: () => import('../views/Backup.vue') },
        { path: 'admin', name: 'admin', component: () => import('../views/Admin.vue') }
      ]
    },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
});

router.beforeEach(async to => {
  const a = useAuthStore();
  if (to.meta.requiresAuth && !a.isAuthenticated) return { name: 'login' };
  if (to.name === 'login' && a.isAuthenticated) return { name: 'dashboard' };

  // loadMe() used to run only inside login(), so a plain page refresh left
  // `admin` null and `permissions` empty for the rest of the session: the
  // sidebar showed a hardcoded "admin" and every permission check said no.
  if (a.isAuthenticated && !a.permissions.length) await a.loadMe();
  if (to.meta.requiresAuth && !a.isAuthenticated) return { name: 'login' };

  const need = REQUIRED[String(to.name || '')];
  if (need && a.permissions.length && !a.can(need)) return { name: 'dashboard' };
  return true;
});

export default router;
