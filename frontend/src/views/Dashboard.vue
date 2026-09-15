<template>
<section class="space-y-5">
  <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
    <div><div class="eyebrow">COMMAND DECK</div><h1 class="page-title mt-2">{{t('dashboard.title')}}</h1><p class="page-subtitle">{{t('dashboard.subtitle')}}</p></div>
    <div class="flex items-center gap-2"><span class="live-pill"><span class="status-dot online"/> {{t('common.realtime')}}</span><span class="text-xs text-slate-600">{{updatedAt}}</span></div>
  </div>

  <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <div v-for="k in vitals" :key="k.key" class="metric-card">
      <div class="metric-head"><span>{{k.label}}</span><span class="metric-icon">{{k.icon}}</span></div>
      <div class="metric-value">{{k.value}}</div>
      <div class="mt-2 flex items-center justify-between text-[10px] text-slate-600"><span>{{k.caption}}</span><span class="text-emerald-400/80">● live</span></div>
      <div v-if="k.spark.length" class="sparkline" aria-hidden="true"><span v-for="(v,i) in k.spark" :key="i" :style="{height:Math.max(12,v)+'%'}"/></div>
    </div>
  </div>

  <div class="grid gap-4 xl:grid-cols-3">
    <div class="card xl:col-span-2">
      <div class="panel-head"><div><h2 class="section-title">{{t('dashboard.trafficTrend')}}</h2><p class="section-copy">{{t('dashboard.realTraffic')}}</p></div><div class="segmented"><button v-for="r in ranges" :key="r" :class="{active:range===r}" @click="range=r;loadChart()">{{r.toUpperCase()}}</button></div></div>
      <VChart class="h-80 w-full" :option="chart" autoresize/>
    </div>
    <div class="card">
      <div class="panel-head"><div><h2 class="section-title">{{t('dashboard.topUsers')}}</h2><p class="section-copy">{{t('dashboard.byUsage')}}</p></div></div>
      <div v-if="top.length" class="mt-4 space-y-4"><div v-for="u in top" :key="u.id"><div class="flex justify-between gap-3 text-sm"><span class="truncate text-slate-200">{{u.email||u.uuid}}</span><span class="shrink-0 font-mono text-xs text-slate-400">{{fmt(u.total_bytes)}}</span></div><div class="mt-2 h-1.5 rounded-full bg-white/5"><div class="h-1.5 rounded-full bg-gradient-to-r from-brand-500 via-indigo-400 to-cyan-400" :style="{width:Math.max(3,(u.total_bytes/top[0].total_bytes)*100)+'%'}"/></div></div></div>
      <div v-else class="empty-state">{{t('common.noData')}}</div>
    </div>
  </div>

  <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><div v-for="h in healthCards" :key="h.key" class="health-card"><div><div class="text-[10px] uppercase tracking-widest text-slate-600">{{t(h.label)}}</div><div class="mt-1 text-sm font-medium">{{h.ok?t('common.operational'):t('common.degraded')}}</div></div><span :class="['status-dot',h.ok?'online':'offline']"/></div></div>
</section>
</template>
<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'; import { useI18n } from 'vue-i18n'; import VChart from 'vue-echarts'; import { use } from 'echarts/core'; import { LineChart } from 'echarts/charts'; import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'; import { CanvasRenderer } from 'echarts/renderers'; import { api } from '../api/client';
use([LineChart,GridComponent,TooltipComponent,LegendComponent,CanvasRenderer]); const {t}=useI18n(); const range=ref('24h'),health=ref<any>({}),top=ref<any[]>([]),points=ref<any[]>([]),timer=ref<any>(),updatedAt=ref('—'); const ranges=['24h','7d','30d','90d'];
const fmt=(n:number)=>{n=Number(n)||0;if(n<1024)return`${n} B`;const u=['KB','MB','GB','TB'];let i=-1,x=n;while(x>=1024&&i<u.length-1){x/=1024;i++}return`${x.toFixed(x>=10?0:1)} ${u[i]}`};
const spark=(values:number[])=>{if(!values.length)return[];const max=Math.max(...values,1),min=Math.min(...values);return values.slice(-12).map(v=>18+((v-min)/(max-min||1))*82)};
const vitals=computed(()=>[
 {key:'active',label:t('dashboard.activeUsers'),value:health.value.activeUsers||0,caption:'eligible accounts',icon:'◎',spark:spark(points.value.map(p=>Number(p.users||0)))},
 {key:'online',label:t('dashboard.onlineUsers'),value:health.value.onlineUsers||0,caption:'seen in the last 5 min',icon:'◉',spark:spark(points.value.map(p=>Number(p.users||0)))},
 {key:'configs',label:'Total configs',value:health.value.totalConfigs||0,caption:`${health.value.activeConfigs||0} active`,icon:'◈',spark:[]},
 {key:'today',label:t('dashboard.today'),value:fmt(health.value.todayTrafficBytes||0),caption:`${fmt(health.value.monthTrafficBytes||0)} this month`,icon:'⌁',spark:spark(points.value.map(p=>Number(p.upload||0)+Number(p.download||0)))},
]);
const chart=computed(()=>({animation:true,animationDuration:650,tooltip:{trigger:'axis',backgroundColor:'rgba(10,15,27,.94)',borderColor:'rgba(148,163,184,.12)',textStyle:{color:'#e2e8f0'}},legend:{data:[t('traffic.upload'),t('traffic.download')],textStyle:{color:'#94a3b8'},top:0,right:0},grid:{left:8,right:8,top:38,bottom:22,containLabel:true},xAxis:{type:'category',boundaryGap:false,data:points.value.map(p=>p.bucket),axisLine:{lineStyle:{color:'rgba(148,163,184,.08)'}},axisLabel:{color:'#64748b',fontSize:9}},yAxis:{type:'value',splitLine:{lineStyle:{color:'rgba(148,163,184,.06)'}},axisLabel:{color:'#64748b',fontSize:9}},series:[{name:t('traffic.upload'),type:'line',smooth:.35,symbol:'none',lineStyle:{width:2},areaStyle:{opacity:.05},data:points.value.map(p=>Number(p.upload||0))},{name:t('traffic.download'),type:'line',smooth:.35,symbol:'none',lineStyle:{width:2},areaStyle:{opacity:.035},data:points.value.map(p=>Number(p.download||0))}]}));
const healthCards=computed(()=>[{key:'w',label:'dashboard.worker',ok:health.value.workerStatus==='ok'},{key:'d',label:'dashboard.database',ok:health.value.databaseStatus==='ok'},{key:'k',label:'dashboard.kv',ok:health.value.kvStatus==='ok'}]);
async function load(){health.value=await api.get('/dashboard/stats');top.value=(await api.get<any>('/dashboard/top-users')).users||[];updatedAt.value=new Date().toLocaleTimeString();await loadChart()} async function loadChart(){points.value=(await api.get<any>(`/dashboard/analytics/${range.value}`)).points||[]} onMounted(()=>{load();timer.value=setInterval(load,15000)});onUnmounted(()=>clearInterval(timer.value));
</script>
