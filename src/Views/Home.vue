<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  mdiArrowRight,
  mdiCalendarBlankOutline,
  mdiCalendarMonthOutline,
  mdiChartTimelineVariant,
  mdiClockOutline,
  mdiCogOutline,
  mdiFileDocumentOutline,
  mdiFilePlusOutline,
  mdiFire,
  mdiFolderMultipleOutline,
  mdiFolderOutline,
  mdiFormatListBulleted,
  mdiHelpCircleOutline,
  mdiHistory,
  mdiMagnify,
  mdiShuffleVariant,
  mdiStar,
  mdiStarOutline,
  mdiWeatherNight,
  mdiWeatherPartlyCloudy,
  mdiWeatherSunny,
  mdiWeatherSunsetDown,
  mdiWeatherSunsetUp,
} from '@mdi/js';
import { useRouter } from 'vue-router';
import { isTauri } from '@tauri-apps/api/core';
import { useTheme } from 'vuetify';
import { use } from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import VChart from 'vue-echarts';

use([BarChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

const appIconUrl = new URL('../../app-icon.svg', import.meta.url).href;

import NewFileDialog from '../Controls/NewFileDialog.vue';
import { noteFileLocationOf } from '../fileOperations';
import type { NoteSetEntry } from '../utils/noteSetStore';
import { fetchNoteSetEntry, loadNoteSetEntries } from '../utils/noteSetStore';
import {
  loadFileActivity,
  loadRecentNotes,
  type FileActivityEvent,
  type FileActivityKind,
  type RecentNote,
} from '../utils/homeActivity';
import { useOpenNote } from '../utils/useOpenNote';
import {
  commandPaletteShortcut,
  OPEN_COMMAND_PALETTE_EVENT,
} from '../utils/commandPaletteShortcut';
import { externalNotes, loadWorkspaceState, workspaceDirectories } from '../utils/workspaceStore';
import { getErrorMessage } from '../utils/getErrorMessage';
import { tagLibrary, loadTagLibrary, resolveTagColor } from '../utils/tagStore';
import {
  isPinnedNote,
  loadPinnedNotes,
  pinKeyOf,
  pinnedKeys,
  prunePinnedKeys,
  togglePinnedNote,
} from '../utils/homePinned';
import { useTourKit, TourKitLayer } from '../utils/tour-kit';
import { homeTourSteps } from '../utils/tour-kit/tours/homeTour';
import { mdiCompassOutline } from '@mdi/js';
import { getSetting, setSetting } from '../utils/settingsStore.ts';

const RECENT_LIMIT = 5;
const HEATMAP_DAYS = 90;
const DAYS_PER_WEEK = 7;
const MONTHS_TREND = 6;
const HOURS_PER_DAY = 24;
const TOP_TAG_LIMIT = 12;

const router = useRouter();
const openNote = useOpenNote();
const theme = useTheme();
const tour = useTourKit({ steps: homeTourSteps });

const notes = ref<NoteSetEntry[]>([]);
const recentRefs = ref<RecentNote[]>([]);
const activity = ref<FileActivityEvent[]>([]);
const isCreateDialogOpen = ref(false);
const isErrorOpen = ref(false);
const errorMessage = ref('');

const today = ref(new Date());
let todayTimer: number | undefined;
let tourAutoStartTimer: number | undefined;

const noteByKey = computed(() => new Map(notes.value.map((note) => [pinKeyOf(note), note])));

const recentNotes = computed(() => {
  const opened = recentRefs.value
    .map((item) => noteByKey.value.get(pinKeyOf(item)))
    .filter((item): item is NoteSetEntry => Boolean(item));
  if (opened.length) return opened.slice(0, RECENT_LIMIT);
  return [...notes.value]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, RECENT_LIMIT);
});

const recentlyUpdated = computed(() =>
  [...notes.value].sort((left, right) => right.updatedAt - left.updatedAt).slice(0, RECENT_LIMIT),
);

const pinnedNotes = computed(() =>
  pinnedKeys.value
    .map((key) => noteByKey.value.get(key))
    .filter((note): note is NoteSetEntry => Boolean(note))
    .slice(0, 5),
);

const tagCloud = computed(() => {
  const counts = new Map<string, number>();
  for (const note of notes.value) {
    for (const tag of note.tag) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...tagLibrary.value]
    .map((entry) => ({ ...entry, count: counts.get(entry.name) ?? 0 }))
    .filter((entry) => entry.count > 0)
    .sort((left, right) => right.count - left.count)
    .slice(0, TOP_TAG_LIMIT);
});

const workspaceStats = computed(() => {
  const byDir = new Map<string, number>();
  let defaultCount = 0;
  for (const note of notes.value) {
    if (note.dir) byDir.set(note.dir, (byDir.get(note.dir) ?? 0) + 1);
    else if (!note.filePath) defaultCount += 1;
  }
  return {
    defaultCount,
    directories: workspaceDirectories.value.map((dir) => ({
      ...dir,
      count: byDir.get(dir.dir) ?? 0,
    })),
    externalCount: externalNotes.value.length,
  };
});

const dateLabel = computed(() =>
  today.value.toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }),
);

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const activityByDay = computed(() => {
  const counts = new Map<string, Record<FileActivityKind, number>>();
  for (const event of activity.value) {
    const key = dateKey(new Date(event.timestamp));
    const day = counts.get(key) ?? { created: 0, modified: 0, deleted: 0 };
    day[event.kind] += 1;
    counts.set(key, day);
  }
  return counts;
});

const totalOf = (key: string): number => {
  const day = activityByDay.value.get(key);
  return day ? day.created + day.modified + day.deleted : 0;
};

const heatmapDays = computed(() => {
  const start = new Date(today.value);
  const daysBeforeMonday = (start.getDay() + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK;
  start.setDate(start.getDate() - HEATMAP_DAYS - daysBeforeMonday);
  const dayCount = HEATMAP_DAYS + 1 + daysBeforeMonday;
  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const dayKey = dateKey(date);
    const counts = activityByDay.value.get(dayKey) ?? {
      created: 0,
      modified: 0,
      deleted: 0,
    };
    const total = counts.created + counts.modified + counts.deleted;
    return {
      key: dayKey,
      title: `${date.toLocaleDateString('zh-CN')} · 新建 ${counts.created} · 修改 ${counts.modified} · 删除 ${counts.deleted}`,
      level: total === 0 ? 0 : Math.min(4, Math.ceil(total / 2)),
    };
  });
});

const activeDays = computed(() => heatmapDays.value.filter((day) => day.level > 0).length);

const weekActivityCount = computed(() => {
  let sum = 0;
  const cursor = new Date(today.value);
  for (let i = 0; i < DAYS_PER_WEEK; i += 1) {
    sum += totalOf(dateKey(cursor));
    cursor.setDate(cursor.getDate() - 1);
  }
  return sum;
});

const streak = computed(() => {
  let count = 0;
  const cursor = new Date(today.value);
  for (let i = 0; i < 366; i += 1) {
    const total = totalOf(dateKey(cursor));
    if (total > 0) count += 1;
    else if (i > 0) break;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
});

const stats = computed(() => [
  {
    label: '全部笔记',
    value: `${notes.value.length}`,
    icon: mdiFileDocumentOutline,
    color: 'primary',
    to: '/set',
  },
  {
    label: '近 7 天操作',
    value: `${weekActivityCount.value}`,
    icon: mdiChartTimelineVariant,
    color: 'info',
  },
  { label: '连续创作', value: `${streak.value} 天`, icon: mdiFire, color: 'warning' },
  {
    label: '近 90 天活跃',
    value: `${activeDays.value} 天`,
    icon: mdiCalendarMonthOutline,
    color: 'success',
  },
]);

interface QuickAction {
  label: string;
  icon: string;
  color: string;
  to?: string;
  action?: 'new' | 'palette';
}

const quickActions: QuickAction[] = [
  { label: '新建文件', icon: mdiFilePlusOutline, color: 'primary', action: 'new' },
  { label: '快速打开', icon: mdiMagnify, color: 'success', action: 'palette' },
  { label: '便签集', icon: mdiFormatListBulleted, color: 'secondary', to: '/set' },
  { label: '记事板', icon: mdiCalendarBlankOutline, color: 'info', to: '/board' },
  { label: '设置', icon: mdiCogOutline, color: 'warning', to: '/settings/about' },
];

function runQuickAction(item: QuickAction) {
  if (item.action === 'new') isCreateDialogOpen.value = true;
  else if (item.action === 'palette') showCommandPalette();
}

const greeting = computed(() => {
  const hour = today.value.getHours();
  if (hour < 6) return { text: '夜深了', icon: mdiWeatherNight, theme: 'night' };
  if (hour < 12) return { text: '早上好', icon: mdiWeatherSunsetUp, theme: 'morning' };
  if (hour < 18) return { text: '下午好', icon: mdiWeatherSunny, theme: 'afternoon' };
  if (hour < 21) return { text: '晚上好', icon: mdiWeatherSunsetDown, theme: 'evening' };
  return { text: '夜深了', icon: mdiWeatherPartlyCloudy, theme: 'night' };
});

// ---------- 图表 ----------
interface ChartColors {
  primary: string;
  success: string;
  error: string;
  info: string;
  onSurface: string;
}

// Vuetify 的 theme.global.current 在 computed 里追踪不稳，改成 ref + watch 显式刷新
const readChartColors = (): ChartColors => {
  const c = theme.current.value.colors;
  return {
    primary: String(c.primary ?? '#1867C0'),
    success: String(c.success ?? '#2E7D32'),
    error: String(c.error ?? '#D32F2F'),
    info: String(c.info ?? '#0288D1'),
    onSurface: String(c['on-surface'] ?? c['on-background'] ?? '#212121'),
  };
};

const chartColors = ref<ChartColors>(readChartColors());

watch(
  () => theme.global.name.value,
  () => {
    chartColors.value = readChartColors();
  },
);

// ECharts 各版本对 8 位 hex 支持不一致，统一输出 rgba()
const withAlpha = (hex: string, alpha: number): string => {
  if (!hex.startsWith('#')) return hex;
  const raw = hex.slice(1);
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : raw;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const weeklyCompare = computed(() => {
  const labels: string[] = [];
  const thisWeek: number[] = [];
  const lastWeek: number[] = [];
  for (let i = 0; i < DAYS_PER_WEEK; i += 1) {
    const d = new Date(today.value);
    d.setDate(d.getDate() - (DAYS_PER_WEEK - 1 - i));
    labels.push(d.toLocaleDateString('zh-CN', { weekday: 'short' }));
    thisWeek.push(totalOf(dateKey(d)));
    const last = new Date(d);
    last.setDate(last.getDate() - DAYS_PER_WEEK);
    lastWeek.push(totalOf(dateKey(last)));
  }
  return { labels, thisWeek, lastWeek };
});

const weeklyOption = computed(() => {
  const c = chartColors.value;
  const data = weeklyCompare.value;
  const axisText = withAlpha(c.onSurface, 0.6);
  return {
    tooltip: { trigger: 'axis' },
    legend: {
      data: ['本周', '上周'],
      top: 4,
      right: 8,
      icon: 'roundRect',
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: axisText, fontSize: 11 },
    },
    grid: { left: 36, right: 12, top: 36, bottom: 24 },
    xAxis: {
      type: 'category',
      data: data.labels,
      axisLine: { lineStyle: { color: withAlpha(c.onSurface, 0.18) } },
      axisLabel: { color: axisText, fontSize: 11 },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { color: axisText, fontSize: 11 },
      splitLine: { lineStyle: { color: withAlpha(c.onSurface, 0.08) } },
    },
    series: [
      {
        name: '本周',
        type: 'bar',
        data: data.thisWeek,
        barWidth: 10,
        itemStyle: { color: c.primary, borderRadius: [3, 3, 0, 0] },
      },
      {
        name: '上周',
        type: 'bar',
        data: data.lastWeek,
        barWidth: 10,
        itemStyle: { color: withAlpha(c.primary, 0.3), borderRadius: [3, 3, 0, 0] },
      },
    ],
  };
});

const hourlyActivity = computed(() => {
  const counts = new Array<number>(HOURS_PER_DAY).fill(0);
  for (const event of activity.value) {
    counts[new Date(event.timestamp).getHours()] += 1;
  }
  return counts;
});

const hourlyOption = computed(() => {
  const c = chartColors.value;
  const axisText = withAlpha(c.onSurface, 0.6);
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 36, right: 12, top: 16, bottom: 24 },
    xAxis: {
      type: 'category',
      data: Array.from({ length: HOURS_PER_DAY }, (_, i) => `${i}`),
      axisLine: { lineStyle: { color: withAlpha(c.onSurface, 0.18) } },
      axisLabel: { color: axisText, fontSize: 10, interval: 3 },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { color: axisText, fontSize: 11 },
      splitLine: { lineStyle: { color: withAlpha(c.onSurface, 0.08) } },
    },
    series: [
      {
        type: 'bar',
        data: hourlyActivity.value,
        barWidth: '60%',
        itemStyle: { color: c.info, borderRadius: [2, 2, 0, 0] },
      },
    ],
  };
});

const monthlyTrend = computed(() => {
  const months = Array.from({ length: MONTHS_TREND }, (_, i) => {
    const d = new Date(
      today.value.getFullYear(),
      today.value.getMonth() - (MONTHS_TREND - 1 - i),
      1,
    );
    return {
      label: d.toLocaleDateString('zh-CN', { month: 'short' }),
      year: d.getFullYear(),
      month: d.getMonth(),
      created: 0,
      modified: 0,
      deleted: 0,
    };
  });
  for (const event of activity.value) {
    const d = new Date(event.timestamp);
    const monthDiff =
      (today.value.getFullYear() - d.getFullYear()) * 12 + today.value.getMonth() - d.getMonth();
    if (monthDiff < 0 || monthDiff >= MONTHS_TREND) continue;
    months[MONTHS_TREND - 1 - monthDiff][event.kind] += 1;
  }
  return months;
});

const monthlyOption = computed(() => {
  const c = chartColors.value;
  const data = monthlyTrend.value;
  const axisText = withAlpha(c.onSurface, 0.6);
  return {
    tooltip: { trigger: 'axis' },
    legend: {
      data: ['新建', '修改', '删除'],
      top: 4,
      right: 8,
      icon: 'roundRect',
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: axisText, fontSize: 11 },
    },
    grid: { left: 36, right: 12, top: 36, bottom: 24 },
    xAxis: {
      type: 'category',
      data: data.map((m) => m.label),
      axisLine: { lineStyle: { color: withAlpha(c.onSurface, 0.18) } },
      axisLabel: { color: axisText, fontSize: 11 },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { color: axisText, fontSize: 11 },
      splitLine: { lineStyle: { color: withAlpha(c.onSurface, 0.08) } },
    },
    series: [
      {
        name: '新建',
        type: 'bar',
        stack: 'total',
        data: data.map((m) => m.created),
        barWidth: 16,
        itemStyle: { color: c.success },
      },
      {
        name: '修改',
        type: 'bar',
        stack: 'total',
        data: data.map((m) => m.modified),
        itemStyle: { color: c.primary },
      },
      {
        name: '删除',
        type: 'bar',
        stack: 'total',
        data: data.map((m) => m.deleted),
        itemStyle: { color: c.error, borderRadius: [3, 3, 0, 0] },
      },
    ],
  };
});

// ---------- 交互 ----------
async function loadHomeData() {
  errorMessage.value = '';
  try {
    await Promise.all([loadWorkspaceState(), loadTagLibrary(), loadPinnedNotes()]);
    const directories = [undefined, ...workspaceDirectories.value.map((dir) => dir.dir)];
    const workspaceEntries = await Promise.all(
      directories.map((directory) => loadNoteSetEntries(directory)),
    );
    const externalEntries = await Promise.all(
      externalNotes.value.map(async (record) => {
        const fileName = record.localName ?? record.fileName;
        try {
          return await fetchNoteSetEntry(fileName, undefined, record.path);
        } catch (error) {
          console.warn(`最近打开的文件不可用：${fileName}`, error);
          return null;
        }
      }),
    );
    const merged = [...workspaceEntries.flat(), ...externalEntries].filter(
      (item): item is NoteSetEntry => item !== null,
    );
    notes.value = [...new Map(merged.map((note) => [pinKeyOf(note), note])).values()];
    recentRefs.value = loadRecentNotes();
    activity.value = loadFileActivity();
    await prunePinnedKeys(new Set(notes.value.map((note) => pinKeyOf(note))));
  } catch (error) {
    errorMessage.value = `首页内容加载失败：${getErrorMessage(error)}`;
    isErrorOpen.value = true;
  }
}

async function openNoteEntry(note: NoteSetEntry) {
  try {
    await openNote(noteFileLocationOf(note));
    recentRefs.value = loadRecentNotes();
  } catch (error) {
    errorMessage.value = `打开失败：${getErrorMessage(error)}`;
    isErrorOpen.value = true;
  }
}

async function togglePinned(note: NoteSetEntry) {
  await togglePinnedNote(note);
}

function showCommandPalette() {
  window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT));
}

function openAbout() {
  void router.push('/settings/about');
}

function openTag(tag: string) {
  void router.push({ path: '/set', query: { tags: tag } });
}

function openWorkspace(dir?: string) {
  void router.push(dir ? { path: '/set', query: { workspace: dir } } : '/set');
}

function openRandom() {
  const list = notes.value;
  if (!list.length) return;
  void openNoteEntry(list[Math.floor(Math.random() * list.length)]);
}

function formatRelative(timestamp: number): string {
  if (!timestamp) return '未知';
  const minutes = Math.round((Date.now() - timestamp) / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(timestamp).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

// 完成与跳过都算“看过引导”，否则用户每次启动都会被重新弹一遍
const markTourDone = () => {
  setSetting('tour-home-done', true).catch((error) => {
    console.warn('记录引导完成状态失败', error);
  });
};

onMounted(async () => {
  void loadHomeData();
  todayTimer = window.setInterval(() => {
    const now = new Date();
    if (dateKey(now) !== dateKey(today.value)) today.value = now;
  }, 60_000);
  tour.onComplete(markTourDone);
  tour.onExit(markTourDone);
  if (await getSetting<boolean>('tour-home-done')) return;
  tourAutoStartTimer = window.setTimeout(() => tour.start(), 600);
});

onBeforeUnmount(() => {
  if (todayTimer !== undefined) window.clearInterval(todayTimer);
  if (tourAutoStartTimer !== undefined) window.clearTimeout(tourAutoStartTimer);
});
</script>

<template>
  <main class="home-page">
    <v-snackbar v-model="isErrorOpen" color="error" timeout="4000" location="bottom">
      {{ errorMessage }}
    </v-snackbar>

    <v-container fluid class="home-container pa-4 pa-md-6">
      <!-- 顶部栏 -->
      <header class="d-flex align-center justify-space-between mb-4 fade-up">
        <div class="d-flex align-center ga-3">
          <v-avatar size="40" rounded="lg" style="overflow: visible; background: transparent">
            <v-img :src="appIconUrl" alt="" />
          </v-avatar>
          <span class="text-body-1 font-weight-medium">Mindrizzle</span>
        </div>
        <div class="d-flex align-center ga-1">
          <v-btn
            variant="text"
            size="small"
            :prepend-icon="mdiCompassOutline"
            class="text-none"
            @click="tour.start()"
          >
            引导
          </v-btn>
          <v-btn
            :icon="mdiHelpCircleOutline"
            aria-label="帮助与关于"
            title="帮助与关于"
            variant="text"
            @click="openAbout"
          />
        </div>
      </header>

      <!-- 问候条（精简版 Hero） -->
      <v-card
        class="hero-banner fade-up mb-4"
        :class="`hero-banner--${greeting.theme}`"
        rounded="lg"
        :elevation="0"
      >
        <div class="d-flex flex-wrap align-center justify-space-between ga-3 pa-4 pa-md-5">
          <div class="min-w-0">
            <div class="hero-eyebrow">
              <v-icon :icon="greeting.icon" size="14" />
              <span>{{ dateLabel }}</span>
            </div>
            <h1 class="hero-title">{{ greeting.text }}</h1>
          </div>
          <div class="d-flex flex-wrap ga-2">
            <v-btn
              variant="outlined"
              color="white"
              :prepend-icon="mdiMagnify"
              :title="`快速打开（${commandPaletteShortcut}）`"
              class="text-none"
              data-tour="home-quick-open"
              @click="showCommandPalette"
            >
              快速打开
            </v-btn>
            <v-btn
              variant="flat"
              color="white"
              :prepend-icon="mdiFilePlusOutline"
              class="text-none font-weight-bold"
              data-tour="home-new-file"
              @click="isCreateDialogOpen = true"
            >
              新建文件
            </v-btn>
          </div>
        </div>
      </v-card>

      <!-- 统计条 -->
      <v-row density="compact" class="mb-4" data-tour="home-stats">
        <v-col v-for="(stat, i) in stats" :key="stat.label" cols="6" sm="3">
          <v-card
            variant="flat"
            border
            rounded="lg"
            hover
            :to="stat.to"
            :link="!!stat.to"
            class="fade-up h-100"
            :style="{ animationDelay: `${120 + i * 60}ms` }"
          >
            <div class="d-flex align-center ga-3 pa-3">
              <v-avatar :color="stat.color" variant="tonal" rounded="lg" size="36">
                <v-icon :icon="stat.icon" size="20" />
              </v-avatar>
              <div class="min-w-0">
                <div class="text-h6 font-weight-bold stat-value">{{ stat.value }}</div>
                <div class="text-caption text-medium-emphasis text-truncate">{{ stat.label }}</div>
              </div>
            </div>
          </v-card>
        </v-col>
      </v-row>

      <!-- 快捷操作 -->
      <div class="d-flex flex-wrap ga-2 mb-4">
        <v-btn
          v-for="action in quickActions"
          :key="action.label"
          :to="action.to"
          :prepend-icon="action.icon"
          :color="action.color"
          variant="tonal"
          class="text-none"
          @click="runQuickAction(action)"
        >
          {{ action.label }}
        </v-btn>
      </div>

      <!-- 主体两列 -->
      <v-row density="compact">
        <!-- 左列：列表 + 图表 -->
        <v-col cols="12" md="8" class="d-flex flex-column ga-4">
          <!-- 最近打开 -->
          <v-card
            data-tour="home-recent"
            variant="flat"
            border
            rounded="lg"
            hover
            class="fade-up"
            style="animation-delay: 200ms"
          >
            <v-card-item>
              <template #prepend>
                <v-avatar color="secondary" variant="tonal" rounded="lg">
                  <v-icon :icon="mdiHistory" />
                </v-avatar>
              </template>
              <v-card-title>最近打开</v-card-title>
              <v-card-subtitle>继续上次的思路</v-card-subtitle>
              <template #append>
                <v-btn variant="text" size="small" to="/set" :append-icon="mdiArrowRight">
                  全部
                </v-btn>
              </template>
            </v-card-item>
            <v-card-text class="pt-0">
              <v-list v-if="recentNotes.length" lines="two" class="pa-0">
                <v-list-item
                  v-for="note in recentNotes"
                  :key="pinKeyOf(note)"
                  rounded="lg"
                  @click="openNoteEntry(note)"
                >
                  <template #prepend>
                    <v-avatar color="secondary" variant="tonal" rounded="lg">
                      <v-icon :icon="mdiFileDocumentOutline" />
                    </v-avatar>
                  </template>
                  <v-list-item-title>{{ note.name }}</v-list-item-title>
                  <v-list-item-subtitle v-if="note.description">
                    {{ note.description }}
                  </v-list-item-subtitle>
                  <v-list-item-subtitle v-else>
                    {{ note.fileName }}.mdrf · {{ formatRelative(note.updatedAt) }}
                  </v-list-item-subtitle>
                  <template #append>
                    <div class="d-flex align-center ga-1">
                      <v-chip
                        v-for="tag in note.tag.slice(0, 2)"
                        :key="tag"
                        :color="resolveTagColor(tag)"
                        size="x-small"
                        variant="tonal"
                      >
                        {{ tag }}
                      </v-chip>
                      <v-btn
                        :icon="isPinnedNote(note) ? mdiStar : mdiStarOutline"
                        :color="isPinnedNote(note) ? 'warning' : undefined"
                        :title="isPinnedNote(note) ? '取消置顶' : '置顶'"
                        size="small"
                        variant="text"
                        @click.stop="togglePinned(note)"
                      />
                    </div>
                  </template>
                </v-list-item>
              </v-list>
              <v-empty-state
                v-else
                :icon="mdiHistory"
                title="还没有最近打开的文件"
                text="打开一份笔记后，会显示在这里"
              />
            </v-card-text>
          </v-card>

          <!-- 最近更新 -->
          <v-card
            variant="flat"
            border
            rounded="lg"
            hover
            class="fade-up"
            style="animation-delay: 260ms"
          >
            <v-card-item>
              <template #prepend>
                <v-avatar color="primary" variant="tonal" rounded="lg">
                  <v-icon :icon="mdiClockOutline" />
                </v-avatar>
              </template>
              <v-card-title>最近更新</v-card-title>
              <v-card-subtitle>按最后编辑时间排序</v-card-subtitle>
              <template #append>
                <v-btn variant="text" size="small" to="/set" :append-icon="mdiArrowRight">
                  全部
                </v-btn>
              </template>
            </v-card-item>
            <v-card-text class="pt-0">
              <v-list v-if="recentlyUpdated.length" lines="two" class="pa-0">
                <v-list-item
                  v-for="note in recentlyUpdated"
                  :key="pinKeyOf(note)"
                  rounded="lg"
                  @click="openNoteEntry(note)"
                >
                  <template #prepend>
                    <v-avatar color="primary" variant="tonal" rounded="lg">
                      <v-icon :icon="mdiFileDocumentOutline" />
                    </v-avatar>
                  </template>
                  <v-list-item-title>{{ note.name }}</v-list-item-title>
                  <v-list-item-subtitle>
                    {{ note.fileName }}.mdrf · {{ formatRelative(note.updatedAt) }}
                  </v-list-item-subtitle>
                  <template #append>
                    <v-btn
                      :icon="isPinnedNote(note) ? mdiStar : mdiStarOutline"
                      :color="isPinnedNote(note) ? 'warning' : undefined"
                      :title="isPinnedNote(note) ? '取消置顶' : '置顶'"
                      size="small"
                      variant="text"
                      @click.stop="togglePinned(note)"
                    />
                  </template>
                </v-list-item>
              </v-list>
              <v-empty-state
                v-else
                :icon="mdiClockOutline"
                title="还没有笔记"
                text="点击上方新建文件开始记录"
              />
            </v-card-text>
          </v-card>

          <!-- 文件活动 -->
          <v-card
            data-tour="home-charts"
            variant="flat"
            border
            rounded="lg"
            hover
            class="fade-up"
            style="animation-delay: 320ms"
          >
            <v-card-item>
              <template #prepend>
                <v-avatar color="info" variant="tonal" rounded="lg">
                  <v-icon :icon="mdiChartTimelineVariant" />
                </v-avatar>
              </template>
              <v-card-title>文件活动</v-card-title>
              <v-card-subtitle>本周对比 · 活跃时段 · 月度趋势</v-card-subtitle>
            </v-card-item>
            <v-card-text class="pt-0">
              <div class="text-caption text-medium-emphasis mb-1">本周 vs 上周</div>
              <VChart :option="weeklyOption" autoresize class="chart chart--tall" />
              <v-divider class="my-3" />
              <div class="text-caption text-medium-emphasis mb-1">24 小时活跃时段</div>
              <VChart :option="hourlyOption" autoresize class="chart" />
              <v-divider class="my-3" />
              <div class="text-caption text-medium-emphasis mb-1">近 6 月操作趋势</div>
              <VChart :option="monthlyOption" autoresize class="chart chart--tall" />
              <div
                class="d-flex align-center justify-end ga-1 text-caption text-medium-emphasis mt-2"
              >
                <v-icon :icon="mdiChartTimelineVariant" size="small" />
                仅统计本设备记录的文件操作
              </div>
            </v-card-text>
          </v-card>
        </v-col>

        <!-- 右列：卡片组 -->
        <v-col cols="12" md="4" class="d-flex flex-column ga-4">
          <!-- 收藏 -->
          <v-card
            data-tour="home-pinned"
            variant="flat"
            border
            rounded="lg"
            hover
            class="fade-up"
            style="animation-delay: 240ms"
          >
            <v-card-item>
              <template #prepend>
                <v-avatar color="warning" variant="tonal" rounded="lg">
                  <v-icon :icon="mdiStar" />
                </v-avatar>
              </template>
              <v-card-title>收藏</v-card-title>
              <v-card-subtitle>置顶的笔记会出现在这里</v-card-subtitle>
            </v-card-item>
            <v-card-text class="pt-0">
              <v-list v-if="pinnedNotes.length" lines="two" class="pa-0">
                <v-list-item
                  v-for="note in pinnedNotes"
                  :key="pinKeyOf(note)"
                  rounded="lg"
                  @click="openNoteEntry(note)"
                >
                  <template #prepend>
                    <v-icon :icon="mdiStar" color="warning" />
                  </template>
                  <v-list-item-title>{{ note.name }}</v-list-item-title>
                  <v-list-item-subtitle>{{ note.fileName }}.mdrf</v-list-item-subtitle>
                  <template #append>
                    <v-btn
                      :icon="mdiStar"
                      color="warning"
                      title="取消置顶"
                      size="small"
                      variant="text"
                      @click.stop="togglePinned(note)"
                    />
                  </template>
                </v-list-item>
              </v-list>
              <v-empty-state
                v-else
                :icon="mdiStarOutline"
                title="还没有收藏"
                text="点击笔记右侧的星星置顶"
              />
              <v-btn
                variant="tonal"
                color="warning"
                size="small"
                block
                :prepend-icon="mdiShuffleVariant"
                class="mt-3"
                :disabled="!notes.length"
                @click="openRandom"
              >
                随机回顾一篇
              </v-btn>
            </v-card-text>
          </v-card>

          <!-- 标签云 -->
          <v-card
            data-tour="home-tags"
            variant="flat"
            border
            rounded="lg"
            hover
            class="fade-up"
            style="animation-delay: 300ms"
          >
            <v-card-item>
              <template #prepend>
                <v-avatar color="info" variant="tonal" rounded="lg">
                  <v-icon :icon="mdiFormatListBulleted" />
                </v-avatar>
              </template>
              <v-card-title>标签云</v-card-title>
              <v-card-subtitle>点击标签筛选便签</v-card-subtitle>
            </v-card-item>
            <v-card-text class="pt-0">
              <div v-if="tagCloud.length" class="d-flex flex-wrap ga-2">
                <v-chip
                  v-for="tag in tagCloud"
                  :key="tag.name"
                  :color="tag.color"
                  variant="tonal"
                  class="text-none"
                  @click="openTag(tag.name)"
                >
                  {{ tag.name }}
                  <span class="text-caption ms-1">({{ tag.count }}个)</span>
                </v-chip>
              </div>
              <v-empty-state
                v-else
                :icon="mdiFormatListBulleted"
                title="还没有标签"
                text="给笔记打上标签后会显示在这里"
              />
            </v-card-text>
          </v-card>

          <!-- 热力图 -->
          <v-card
            data-tour="home-heatmap"
            variant="flat"
            border
            rounded="lg"
            hover
            class="fade-up"
            style="animation-delay: 360ms"
          >
            <v-card-item>
              <template #prepend>
                <v-avatar color="success" variant="tonal" rounded="lg">
                  <v-icon :icon="mdiCalendarMonthOutline" />
                </v-avatar>
              </template>
              <v-card-title>创作热力图</v-card-title>
              <v-card-subtitle>过去 90 天的文件活动</v-card-subtitle>
            </v-card-item>
            <v-card-text class="pt-0">
              <div
                class="d-flex ga-2 overflow-x-auto"
                role="img"
                aria-label="过去 90 天文件活动热力图"
              >
                <div class="heatmap-weekdays">
                  <span>一</span><span>三</span><span>五</span>
                </div>
                <div class="heatmap-grid">
                  <span
                    v-for="day in heatmapDays"
                    :key="day.key"
                    class="heatmap-cell rounded-sm"
                    :class="`heatmap-level-${day.level}`"
                    :title="day.title"
                  />
                </div>
              </div>
              <div
                class="d-flex align-center justify-end ga-1 mt-3 text-caption text-medium-emphasis"
              >
                <span>少</span>
                <span
                  v-for="level in 5"
                  :key="level"
                  class="heatmap-legend-cell rounded-sm"
                  :class="`heatmap-level-${level - 1}`"
                />
                <span>多</span>
              </div>
            </v-card-text>
          </v-card>

          <!-- 工作区 -->
          <v-card
            v-if="isTauri()"
            data-tour="home-workspace"
            variant="flat"
            border
            rounded="lg"
            hover
            class="fade-up"
            style="animation-delay: 400ms"
          >
            <v-card-item>
              <template #prepend>
                <v-avatar color="primary" variant="tonal" rounded="lg">
                  <v-icon :icon="mdiFolderMultipleOutline" />
                </v-avatar>
              </template>
              <v-card-title>工作区</v-card-title>
              <v-card-subtitle>
                {{ workspaceStats.directories.length }} 个目录 · 默认
                {{ workspaceStats.defaultCount }} 篇 · 外部
                {{ workspaceStats.externalCount }} 个
              </v-card-subtitle>
            </v-card-item>
            <v-card-text class="pt-0">
              <v-list density="compact" class="pa-0">
                <v-list-item rounded="lg" @click="openWorkspace()">
                  <template #prepend>
                    <v-icon :icon="mdiFolderOutline" size="20" color="primary" />
                  </template>
                  <v-list-item-title class="text-body-2">默认工作区</v-list-item-title>
                  <v-list-item-subtitle class="text-caption">
                    {{ workspaceStats.defaultCount }} 篇笔记
                  </v-list-item-subtitle>
                </v-list-item>
                <v-list-item
                  v-for="dir in workspaceStats.directories.slice(0, 3)"
                  :key="dir.id"
                  rounded="lg"
                  @click="openWorkspace(dir.dir)"
                >
                  <template #prepend>
                    <v-icon :icon="mdiFolderOutline" size="20" color="primary" />
                  </template>
                  <v-list-item-title class="text-body-2">{{ dir.name }}</v-list-item-title>
                  <v-list-item-subtitle class="text-caption" style="overflow-wrap: anywhere">
                    {{ dir.count }} 篇 · {{ dir.dir }}
                  </v-list-item-subtitle>
                </v-list-item>
              </v-list>
              <v-btn
                v-if="workspaceStats.directories.length > 3"
                variant="text"
                size="small"
                to="/set"
                block
                class="mt-2"
              >
                查看全部 {{ workspaceStats.directories.length }} 个目录
              </v-btn>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </v-container>

    <NewFileDialog :is-open="isCreateDialogOpen" @update:close="isCreateDialogOpen = $event.status" />
    <TourKitLayer :tour="tour" />
  </main>
</template>

<style scoped>
.home-container {
  max-width: 1680px;
  margin: 0 auto;
}

/* ---------- Hero（精简） ---------- */
.hero-banner {
  position: relative;
  overflow: hidden;
  color: rgb(var(--v-theme-on-primary));
  background: rgb(var(--v-theme-primary));
}

.hero-banner--morning {
  background:
    radial-gradient(120% 140% at 0% 0%, rgba(255, 200, 150, 0.3), transparent 55%),
    rgb(var(--v-theme-primary));
}

.hero-banner--afternoon {
  background:
    radial-gradient(120% 140% at 100% 0%, rgba(160, 200, 255, 0.28), transparent 55%),
    rgb(var(--v-theme-primary));
}

.hero-banner--evening {
  background:
    radial-gradient(120% 140% at 0% 100%, rgba(255, 160, 120, 0.28), transparent 55%),
    rgb(var(--v-theme-primary));
}

.hero-banner--night {
  background:
    radial-gradient(120% 140% at 100% 0%, rgba(120, 140, 220, 0.3), transparent 55%),
    rgb(var(--v-theme-primary));
}

.hero-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.72rem;
  font-weight: 600;
  opacity: 0.8;
}

.hero-title {
  margin: 6px 0 0;
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.2;
}

@media (min-width: 960px) {
  .hero-title {
    font-size: 1.6rem;
  }
}

/* ---------- 减少动效 ---------- */
@media (prefers-reduced-motion: reduce) {
  .fade-up,
  .heatmap-grid {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
  }

  .heatmap-cell {
    transition: none !important;
  }
}

.stat-value {
  font-variant-numeric: tabular-nums;
}

/* ---------- 图表 ---------- */
.chart {
  width: 100%;
  height: 160px;
}

.chart--tall {
  height: 200px;
}

/* ---------- 热力图 ---------- */
.heatmap-grid {
  display: grid;
  grid-auto-columns: 11px;
  grid-auto-flow: column;
  grid-template-rows: repeat(7, 11px);
  gap: 3px;
  animation: fade-in 0.8s ease both;
}

@keyframes fade-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

.heatmap-weekdays {
  display: grid;
  grid-template-rows: repeat(7, 11px);
  gap: 3px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 10px;
  line-height: 11px;
}

.heatmap-cell {
  width: 11px;
  height: 11px;
  background: rgba(var(--v-theme-on-surface), 0.07);
  transition: transform 0.12s ease;
}

.heatmap-cell:hover {
  transform: scale(1.18);
}

.heatmap-legend-cell {
  display: inline-block;
  width: 10px;
  height: 10px;
}

.heatmap-level-0 {
  background: rgba(var(--v-theme-on-surface), 0.07);
}

.heatmap-level-1 {
  background: rgba(var(--v-theme-primary), 0.18);
}

.heatmap-level-2 {
  background: rgba(var(--v-theme-primary), 0.38);
}

.heatmap-level-3 {
  background: rgba(var(--v-theme-primary), 0.62);
}

.heatmap-level-4 {
  background: rgb(var(--v-theme-primary));
}

/* ---------- 减少动效 ---------- */
@media (prefers-reduced-motion: reduce) {
  .fade-up,
  .hero-glow,
  .heatmap-grid {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
  }

  .heatmap-cell {
    transition: none !important;
  }
}
</style>
