<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  mdiArrowRight,
  mdiCalendarMonthOutline,
  mdiChartTimelineVariant,
  mdiCircle,
  mdiFileDocumentOutline,
  mdiFilePlusOutline,
  mdiFire,
  mdiFolderMultipleOutline,
  mdiHelpCircleOutline,
  mdiHistory,
  mdiMagnify,
  mdiWeatherNight,
  mdiWeatherPartlyCloudy,
  mdiWeatherSunny,
  mdiWeatherSunsetDown,
  mdiWeatherSunsetUp,
  mdiFolderOutline,
} from '@mdi/js';
import appIconUrl from '../../app-icon.svg';
import { useRouter } from 'vue-router';
import { isTauri } from '@tauri-apps/api/core';

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

const RECENT_LIMIT = 5;
const HEATMAP_DAYS = 90;
const DAYS_PER_WEEK = 7;

const router = useRouter();
const openNote = useOpenNote();
const notes = ref<NoteSetEntry[]>([]);
const recentRefs = ref<RecentNote[]>([]);
const activity = ref<FileActivityEvent[]>([]);
const isCreateDialogOpen = ref(false);
const isErrorOpen = ref(false);
const errorMessage = ref('');

const noteKeyOf = (note: RecentNote): string =>
  `${note.filePath ?? ''}\u0000${note.dir ?? ''}\u0000${note.fileName}`;

const noteKeyOfEntry = (note: NoteSetEntry): string =>
  `${note.filePath ?? ''}\u0000${note.dir ?? ''}\u0000${note.fileName}`;

const noteByKey = computed(() => new Map(notes.value.map((note) => [noteKeyOfEntry(note), note])));

const recentNotes = computed(() => {
  const opened = recentRefs.value
    .map((item) => noteByKey.value.get(noteKeyOf(item)))
    .filter((item): item is NoteSetEntry => Boolean(item));
  if (opened.length) return opened.slice(0, RECENT_LIMIT);
  return [...notes.value]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, RECENT_LIMIT);
});

const today = new Date();
const dateLabel = today.toLocaleDateString('zh-CN', {
  month: 'long',
  day: 'numeric',
  weekday: 'long',
});

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

const heatmapDays = computed(() => {
  const start = new Date(today);
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

const activitySeries = computed(() => {
  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - 6 + index);
    return date;
  });
  const values = dates.map((date) => {
    const counts = activityByDay.value.get(dateKey(date));
    return {
      date,
      created: counts?.created ?? 0,
      modified: counts?.modified ?? 0,
      deleted: counts?.deleted ?? 0,
    };
  });
  const series: { kind: FileActivityKind; label: string; color: string }[] = [
    { kind: 'created', label: '新建', color: 'success' },
    { kind: 'modified', label: '修改', color: 'primary' },
    { kind: 'deleted', label: '删除', color: 'error' },
  ];
  return {
    values,
    series,
    total: (kind: FileActivityKind) => values.reduce((sum, item) => sum + item[kind], 0),
  };
});

const activityChart = computed(() => {
  const { values, series } = activitySeries.value;
  const max = Math.max(1, ...values.flatMap((v) => [v.created, v.modified, v.deleted]));
  const width = 640;
  const height = 220;
  const padLeft = 36;
  const padRight = 12;
  const padTop = 16;
  const padBottom = 32;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;
  const groupWidth = plotWidth / values.length;
  const barWidth = 14;
  const barGap = 4;
  const innerWidth = barWidth * series.length + barGap * (series.length - 1);

  const bars = values.flatMap((value, dayIndex) => {
    const groupLeft = padLeft + dayIndex * groupWidth + (groupWidth - innerWidth) / 2;
    return series.map((s, seriesIndex) => {
      const h = value[s.kind] > 0 ? Math.max((value[s.kind] / max) * plotHeight, 3) : 0;
      return {
        key: `${dayIndex}-${s.kind}`,
        kind: s.kind,
        x: groupLeft + seriesIndex * (barWidth + barGap),
        y: padTop + plotHeight - h,
        width: barWidth,
        height: h,
        value: value[s.kind],
        delay: dayIndex * 55 + seriesIndex * 25,
      };
    });
  });

  const gridLines = Array.from({ length: 5 }, (_, i) => ({
    y: padTop + (plotHeight / 4) * i,
    label: Math.round(max - (max / 4) * i),
  }));

  const labels = values.map((v, i) => ({
    x: padLeft + i * groupWidth + groupWidth / 2,
    text: v.date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
  }));

  return { width, height, padLeft, bars, gridLines, labels };
});

const activeDays = computed(() => heatmapDays.value.filter((day) => day.level > 0).length);

const weekActivityCount = computed(() =>
  activitySeries.value.values.reduce((sum, v) => sum + v.created + v.modified + v.deleted, 0),
);

const streak = computed(() => {
  let count = 0;
  const cursor = new Date(today);
  for (let i = 0; i < 366; i += 1) {
    const day = activityByDay.value.get(dateKey(cursor));
    const total = day ? day.created + day.modified + day.deleted : 0;
    if (total > 0) {
      count += 1;
    } else if (i > 0) {
      break;
    }
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

const workspaceSummary = computed(() => ({
  directories: workspaceDirectories.value.length,
  external: externalNotes.value.length,
}));

const greeting = computed(() => {
  const hour = new Date().getHours();
  if (hour < 6) return { text: '夜深了', icon: mdiWeatherNight, theme: 'night' };
  if (hour < 12) return { text: '早上好', icon: mdiWeatherSunsetUp, theme: 'morning' };
  if (hour < 18) return { text: '下午好', icon: mdiWeatherSunny, theme: 'afternoon' };
  if (hour < 21) return { text: '晚上好', icon: mdiWeatherSunsetDown, theme: 'evening' };
  return { text: '夜深了', icon: mdiWeatherPartlyCloudy, theme: 'night' };
});

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function directoryName(path: string): string {
  const normalized = path.replace(/[/\\]+$/, '');
  const parts = normalized.split(/[/\\]/);
  return parts[parts.length - 1] || normalized;
}

async function loadHomeData() {
  errorMessage.value = '';
  try {
    await loadWorkspaceState();
    const directories = [
      undefined,
      ...workspaceDirectories.value.map((directory) => directory.dir),
    ];
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
    notes.value = [...new Map(merged.map((note) => [noteKeyOfEntry(note), note])).values()];
    recentRefs.value = loadRecentNotes();
    activity.value = loadFileActivity();
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

function showCommandPalette() {
  window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT));
}

function openAbout() {
  void router.push('/settings/about');
}

function formatDate(timestamp: number): string {
  if (!timestamp) return '未知';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  }).format(timestamp);
}

onMounted(() => {
  void loadHomeData();
});
</script>

<template>
  <main class="home-page">
    <v-snackbar v-model="isErrorOpen" color="error" timeout="4000" location="bottom">
      {{ errorMessage }}
    </v-snackbar>

    <v-container fluid class="pa-4 pa-md-6">
      <!-- 品牌条 -->
      <header class="d-flex align-center justify-space-between mb-4 fade-up">
        <div class="d-flex align-center ga-3">
          <v-avatar size="44" rounded="lg" style="overflow: visible; background: transparent">
            <v-img :src="appIconUrl" alt="" />
          </v-avatar>
          <span class="text-body-1 font-weight-medium">Mindrizzle</span>
        </div>
        <v-btn
          :icon="mdiHelpCircleOutline"
          aria-label="帮助与关于"
          title="帮助与关于"
          variant="text"
          @click="openAbout"
        />
      </header>

      <!-- 欢迎横幅：随时间切换氛围，光斑缓慢漂浮 -->
      <v-card
        class="hero-banner fade-up"
        :class="`hero-banner--${greeting.theme}`"
        rounded="xl"
        :elevation="0"
      >
        <span class="hero-glow hero-glow--a" />
        <span class="hero-glow hero-glow--b" />
        <div class="hero-content d-flex flex-wrap align-center justify-space-between ga-4">
          <div>
            <div class="hero-eyebrow">
              <v-icon :icon="greeting.icon" size="14" />
              <span>{{ dateLabel }}</span>
            </div>
            <h1 class="hero-title">{{ greeting.text }}，欢迎回来</h1>
            <p class="hero-subtitle">今天想记下些什么？</p>
          </div>
          <div class="d-flex flex-wrap ga-2">
            <v-btn
              variant="flat"
              color="surface"
              :prepend-icon="mdiMagnify"
              :title="`快速打开（${commandPaletteShortcut}）`"
              class="hero-btn"
              @click="showCommandPalette"
            >
              快速打开
            </v-btn>
            <v-btn
              variant="flat"
              :prepend-icon="mdiFilePlusOutline"
              class="hero-btn hero-btn--primary"
              @click="isCreateDialogOpen = true"
            >
              新建文件
            </v-btn>
          </div>
        </div>
      </v-card>

      <!-- 统计条：逐个淡入 -->
      <v-row class="mb-1">
        <v-col
          v-for="(stat, i) in stats"
          :key="stat.label"
          cols="6"
          md="3"
          class="fade-up"
          :style="{ animationDelay: `${120 + i * 70}ms` }"
        >
          <v-card variant="flat" border rounded="lg" class="stat-card pa-4 h-100">
            <div class="d-flex align-center ga-3">
              <v-avatar :color="stat.color" variant="tonal" rounded="lg" size="36">
                <v-icon :icon="stat.icon" size="20" />
              </v-avatar>
              <div>
                <div class="text-h6 font-weight-bold stat-value">{{ stat.value }}</div>
                <div class="text-caption text-medium-emphasis">{{ stat.label }}</div>
              </div>
            </div>
          </v-card>
        </v-col>
      </v-row>

      <v-row>
        <v-col cols="12" lg="8">
          <!-- 最近打开 -->
          <v-card
            variant="flat"
            border
            rounded="lg"
            class="lift fade-up"
            style="animation-delay: 320ms"
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
                  :key="noteKeyOfEntry(note)"
                  :title="note.name"
                  :subtitle="`${note.fileName}.mdrf · 最近编辑 ${formatDate(note.updatedAt)}`"
                  rounded="lg"
                  class="list-item-hover"
                  @click="openNoteEntry(note)"
                >
                  <template #prepend>
                    <v-avatar color="secondary" variant="tonal" rounded="lg">
                      <v-icon :icon="mdiFileDocumentOutline" />
                    </v-avatar>
                  </template>
                  <template #append>
                    <v-icon
                      :icon="mdiArrowRight"
                      size="small"
                      color="medium-emphasis"
                      class="list-arrow"
                    />
                  </template>
                </v-list-item>
              </v-list>
              <div v-else class="text-center py-8 text-medium-emphasis">
                <v-icon :icon="mdiHistory" size="32" />
                <p class="text-body-2 font-weight-medium mt-2 mb-1">还没有最近打开的文件</p>
                <p class="text-caption mb-0">打开一份笔记后，会显示在这里。</p>
              </div>
            </v-card-text>
          </v-card>

          <!-- 文件活动 -->
          <v-card
            variant="flat"
            border
            rounded="lg"
            class="lift fade-up mt-4"
            style="animation-delay: 400ms"
          >
            <v-card-item>
              <template #prepend>
                <v-avatar color="info" variant="tonal" rounded="lg">
                  <v-icon :icon="mdiChartTimelineVariant" />
                </v-avatar>
              </template>
              <v-card-title>文件活动</v-card-title>
              <v-card-subtitle>最近 7 天新建、修改与删除</v-card-subtitle>
            </v-card-item>
            <v-card-text class="pt-0">
              <div class="d-flex flex-wrap align-center ga-4 mb-2">
                <div
                  v-for="item in activitySeries.series"
                  :key="item.kind"
                  class="d-flex align-center ga-2 text-caption"
                >
                  <v-icon :icon="mdiCircle" :color="item.color" size="10" />
                  <span class="text-medium-emphasis">{{ item.label }}</span>
                  <strong>{{ activitySeries.total(item.kind) }}</strong>
                </div>
              </div>
              <svg
                class="activity-chart"
                :viewBox="`0 0 ${activityChart.width} ${activityChart.height}`"
                role="img"
                aria-label="最近七天新建、修改、删除文件数量柱状图"
              >
                <g v-for="line in activityChart.gridLines" :key="line.y">
                  <line
                    :x1="activityChart.padLeft"
                    :y1="line.y"
                    :x2="activityChart.width - 12"
                    :y2="line.y"
                    class="chart-grid-line"
                  />
                  <text
                    :x="activityChart.padLeft - 8"
                    :y="line.y + 4"
                    text-anchor="end"
                    class="chart-axis"
                  >
                    {{ line.label }}
                  </text>
                </g>
                <rect
                  v-for="bar in activityChart.bars"
                  :key="bar.key"
                  :x="bar.x"
                  :y="bar.y"
                  :width="bar.width"
                  :height="bar.height"
                  rx="3"
                  :data-kind="bar.kind"
                  :style="{ animationDelay: `${bar.delay}ms` }"
                >
                  <title>{{ bar.value }}</title>
                </rect>
                <text
                  v-for="(label, i) in activityChart.labels"
                  :key="i"
                  :x="label.x"
                  :y="activityChart.height - 10"
                  text-anchor="middle"
                  class="chart-axis"
                >
                  {{ label.text }}
                </text>
              </svg>
              <div class="d-flex align-center justify-end ga-1 text-caption text-medium-emphasis">
                <v-icon :icon="mdiChartTimelineVariant" size="small" />
                仅统计本设备记录的文件操作
              </div>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col cols="12" lg="4">
          <!-- 热力图 -->
          <v-card
            variant="flat"
            border
            rounded="lg"
            class="lift fade-up"
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
              <div class="text-caption text-medium-emphasis mb-2">过去 90 天 — 今天</div>
              <div
                class="d-flex ga-2 overflow-x-auto"
                role="img"
                aria-label="过去 90 天文件活动热力图"
              >
                <div class="heatmap-weekdays"><span>一</span><span>三</span><span>五</span></div>
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
            variant="flat"
            border
            rounded="lg"
            class="lift fade-up mt-4"
            style="animation-delay: 520ms"
          >
            <v-card-item>
              <template #prepend>
                <v-avatar color="primary" variant="tonal" rounded="lg">
                  <v-icon :icon="mdiFolderMultipleOutline" />
                </v-avatar>
              </template>
              <v-card-title>工作区</v-card-title>
              <v-card-subtitle>
                {{ workspaceSummary.directories }} 个目录 ·
                {{ workspaceSummary.external }} 个外部文件
              </v-card-subtitle>
            </v-card-item>
            <v-card-text class="pt-0">
              <v-list v-if="workspaceDirectories.length" density="compact" class="pa-0">
                <v-list-item
                  v-for="dir in workspaceDirectories.slice(0, 3)"
                  :key="dir.dir"
                  rounded="lg"
                >
                  <template #prepend>
                    <v-icon :icon="mdiFolderOutline" size="20" color="primary" />
                  </template>
                  <v-list-item-title class="text-body-2">
                    {{ directoryName(dir.dir) }}
                  </v-list-item-title>
                  <v-list-item-subtitle class="text-caption" style="overflow-wrap: anywhere">
                    {{ dir.dir }}
                  </v-list-item-subtitle>
                </v-list-item>
              </v-list>
              <div v-else class="text-caption text-medium-emphasis text-center py-3">
                还没有挂载任何目录
              </div>
              <v-btn
                v-if="workspaceDirectories.length > 3"
                variant="text"
                size="small"
                to="/set"
                block
                class="mt-2"
              >
                查看全部 {{ workspaceDirectories.length }} 个目录
              </v-btn>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </v-container>

    <NewFileDialog
      :is-open="isCreateDialogOpen"
      @update:close="isCreateDialogOpen = $event.status"
    />
  </main>
</template>

<style scoped>
.home-page {
  height: 100%;
  overflow: auto;
  background: rgb(var(--v-theme-background));
}

/* ---------- 入场 ---------- */
.fade-up {
  opacity: 0;
  animation: fade-up 0.55s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}

@keyframes fade-up {
  from {
    opacity: 0;
    transform: translateY(14px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ---------- 欢迎横幅 ---------- */
.hero-banner {
  position: relative;
  overflow: hidden;
  color: rgb(var(--v-theme-on-primary));
  background: rgb(var(--v-theme-primary));
  margin-bottom: 16px;
}

/* 每个时段一层柔和的角向渐变，制造氛围 */
.hero-banner--morning {
  background:
    radial-gradient(120% 140% at 0% 0%, rgba(255, 200, 150, 0.35), transparent 55%),
    radial-gradient(100% 120% at 100% 100%, rgba(255, 230, 160, 0.28), transparent 60%),
    rgb(var(--v-theme-primary));
}

.hero-banner--afternoon {
  background:
    radial-gradient(120% 140% at 100% 0%, rgba(160, 200, 255, 0.32), transparent 55%),
    radial-gradient(100% 120% at 0% 100%, rgba(200, 180, 255, 0.22), transparent 60%),
    rgb(var(--v-theme-primary));
}

.hero-banner--evening {
  background:
    radial-gradient(120% 140% at 0% 100%, rgba(255, 160, 120, 0.3), transparent 55%),
    radial-gradient(100% 120% at 100% 0%, rgba(180, 140, 220, 0.28), transparent 60%),
    rgb(var(--v-theme-primary));
}

.hero-banner--night {
  background:
    radial-gradient(120% 140% at 100% 0%, rgba(120, 140, 220, 0.32), transparent 55%),
    radial-gradient(100% 120% at 0% 100%, rgba(90, 90, 150, 0.32), transparent 60%),
    rgb(var(--v-theme-primary));
}

/* 漂浮光斑 */
.hero-glow {
  position: absolute;
  border-radius: 50%;
  background: rgba(var(--v-theme-on-primary), 0.1);
  pointer-events: none;
  will-change: transform;
}

.hero-glow--a {
  top: -60px;
  right: -40px;
  width: 220px;
  height: 220px;
  animation: float-a 14s ease-in-out infinite;
}

.hero-glow--b {
  bottom: -100px;
  left: 30%;
  width: 260px;
  height: 260px;
  background: rgba(var(--v-theme-on-primary), 0.06);
  animation: float-b 18s ease-in-out infinite;
}

@keyframes float-a {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }

  50% {
    transform: translate(-24px, 20px) scale(1.08);
  }
}

@keyframes float-b {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }

  50% {
    transform: translate(30px, -18px) scale(1.05);
  }
}

.hero-content {
  position: relative;
  z-index: 1;
  padding: 24px;
}

@media (min-width: 960px) {
  .hero-content {
    padding: 32px;
  }
}

.hero-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  opacity: 0.82;
}

.hero-title {
  margin: 10px 0 0;
  font-size: 1.65rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.2;
}

@media (min-width: 960px) {
  .hero-title {
    font-size: 2rem;
  }
}

.hero-subtitle {
  margin: 6px 0 0;
  font-size: 0.95rem;
  opacity: 0.85;
}

.hero-btn {
  text-transform: none;
}

.hero-btn--primary {
  color: rgb(var(--v-theme-primary));
  background: rgb(var(--v-theme-on-primary));
}

/* ---------- 卡片悬停 ---------- */
.lift {
  transition:
    transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1),
    box-shadow 0.22s ease;
}

.lift:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(var(--v-theme-on-surface), 0.08);
}

.stat-card {
  transition:
    transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1),
    box-shadow 0.22s ease;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 18px rgba(var(--v-theme-on-surface), 0.08);
}

.stat-value {
  font-variant-numeric: tabular-nums;
}

/* 列表项 hover 时箭头右移 */
.list-item-hover {
  transition: background 0.15s ease;
}

.list-arrow {
  transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.list-item-hover:hover .list-arrow {
  transform: translateX(3px);
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

/* ---------- 柱状图 ---------- */
.activity-chart {
  display: block;
  width: 100%;
}

.chart-grid-line {
  stroke: rgba(var(--v-theme-on-surface), 0.07);
  stroke-width: 1;
}

.chart-axis {
  fill: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 11px;
}

/* 柱子从底部生长 */
.activity-chart rect {
  transform-box: fill-box;
  transform-origin: bottom;
  animation: grow-bar 0.65s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  transition: opacity 0.15s ease;
}

.activity-chart rect:hover {
  opacity: 0.75;
}

@keyframes grow-bar {
  from {
    transform: scaleY(0);
  }

  to {
    transform: scaleY(1);
  }
}

.activity-chart rect[data-kind='created'] {
  fill: rgb(var(--v-theme-success));
}

.activity-chart rect[data-kind='modified'] {
  fill: rgb(var(--v-theme-primary));
}

.activity-chart rect[data-kind='deleted'] {
  fill: rgb(var(--v-theme-error));
}

/* ---------- 减少动效 ---------- */
@media (prefers-reduced-motion: reduce) {
  .fade-up,
  .hero-glow,
  .heatmap-grid,
  .activity-chart rect {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
  }

  .lift,
  .stat-card,
  .list-arrow,
  .heatmap-cell {
    transition: none !important;
  }
}
</style>
