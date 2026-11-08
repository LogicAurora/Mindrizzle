<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  mdiArrowRight,
  mdiCalendarMonthOutline,
  mdiChartTimelineVariant,
  mdiFileDocumentOutline,
  mdiFilePlusOutline,
  mdiHelpCircleOutline,
  mdiHistory,
  mdiMagnify,
} from "@mdi/js";
import appIconUrl from "../../app-icon.svg";
import { useRouter } from "vue-router";

import NewFileDialog from "../Controls/NewFileDialog.vue";
import type { NoteSetEntry } from "../utils/noteSetStore";
import {
  fetchNoteSetEntry,
  loadNoteSetEntries,
} from "../utils/noteSetStore";
import {
  loadFileActivity,
  loadRecentNotes,
  type FileActivityEvent,
  type FileActivityKind,
  type RecentNote,
} from "../utils/homeActivity";
import { useOpenNote } from "../utils/useOpenNote";
import {
  commandPaletteShortcut,
  OPEN_COMMAND_PALETTE_EVENT,
} from "../utils/commandPaletteShortcut";
import {
  externalNotes,
  loadWorkspaceState,
  workspaceDirectories,
} from "../utils/workspaceStore";
import { getErrorMessage } from "../utils/getErrorMessage";

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
const errorMessage = ref("");

const noteKeyOf = (note: RecentNote): string =>
  `${note.filePath ?? ""}\u0000${note.dir ?? ""}\u0000${note.fileName}`;

const noteKeyOfEntry = (note: NoteSetEntry): string =>
  `${note.filePath ?? ""}\u0000${note.dir ?? ""}\u0000${note.fileName}`;

const noteByKey = computed(
  () => new Map(notes.value.map((note) => [noteKeyOfEntry(note), note])),
);

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
      title: `${date.toLocaleDateString("zh-CN")} · 新建 ${counts.created} · 修改 ${counts.modified} · 删除 ${counts.deleted}`,
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
  const max = Math.max(
    1,
    ...values.flatMap((item) => [item.created, item.modified, item.deleted]),
  );
  const series: { kind: FileActivityKind; label: string; color: string }[] = [
    { kind: "created", label: "新建", color: "#5b9b76" },
    { kind: "modified", label: "修改", color: "#7398cf" },
    { kind: "deleted", label: "删除", color: "#cf7d70" },
  ];
  return {
    values,
    series: series.map((item) => ({
      ...item,
      points: values
        .map((value, index) => {
          const x = 30 + index * 86;
          const y = 154 - (value[item.kind] / max) * 120;
          return `${x},${y}`;
        })
        .join(" "),
    })),
    total: (kind: FileActivityKind) =>
      values.reduce((sum, item) => sum + item[kind], 0),
  };
});

const greeting = computed(() => {
  const hour = new Date().getHours();
  if (hour < 6) return "夜深了";
  if (hour < 12) return "早上好";
  if (hour < 18) return "下午好";
  return "晚上好";
});

const heatmapStartTitle = computed(() => {
  const firstDay = heatmapDays.value[0]?.key;
  return firstDay ? new Date(`${firstDay}T00:00:00`).toLocaleDateString("zh-CN", { month: "long" }) : "";
});

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function loadHomeData() {
  errorMessage.value = "";
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
          return await fetchNoteSetEntry(
            fileName,
            undefined,
            record.path,
          );
        } catch (error) {
          console.warn(`最近打开的文件不可用：${fileName}`, error);
          return null;
        }
      }),
    );
    const merged = [...workspaceEntries.flat(), ...externalEntries].filter(
      (item): item is NoteSetEntry => item !== null,
    );
    notes.value = [
      ...new Map(merged.map((note) => [noteKeyOfEntry(note), note])).values(),
    ];
    recentRefs.value = loadRecentNotes();
    activity.value = loadFileActivity();
  } catch (error) {
    errorMessage.value = `首页内容加载失败：${getErrorMessage(error)}`;
    isErrorOpen.value = true;
  }
}

async function openRecentNote(note: NoteSetEntry) {
  try {
    await openNote(note);
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
  void router.push("/settings/about");
}

function formatDate(timestamp: number): string {
  if (!timestamp) return "未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
  }).format(timestamp);
}

onMounted(() => {
  void loadHomeData();
});
</script>

<template>
  <main class="home-page">
    <v-snackbar v-model="isErrorOpen" color="error" timeout="4000">
      {{ errorMessage }}
    </v-snackbar>
    <v-container fluid class="pa-4 pa-md-6">
      <header class="d-flex align-center justify-space-between">
        <div class="d-flex align-center ga-3">
          <v-avatar size="54">
            <img :src="appIconUrl" alt="" width="54" height="54" />
          </v-avatar>
          <h3 class="font-weight-bold">Mindrizzle</h3>
        </div>
        <v-btn
          :icon="mdiHelpCircleOutline"
          aria-label="帮助与关于"
          title="帮助与关于"
          variant="tonal"
          @click="openAbout"
        />
      </header>

      <section class="d-flex align-center justify-space-between flex-wrap ga-3 mb-5">
        <div>
          <h1 class="text-h5 font-weight-bold">{{ greeting }}，欢迎回来</h1>
          <p class="text-body-2 text-medium-emphasis mt-1 mb-0">今天想记下些什么？</p>
        </div>
        <div class="d-flex align-center flex-wrap ga-2">
          <v-btn
            :icon="mdiMagnify"
            aria-label="快速打开"
            :title="`快速打开（${commandPaletteShortcut}）`"
            variant="tonal"
            @click="showCommandPalette"
          />
          <v-btn
            color="primary"
            :prepend-icon="mdiFilePlusOutline"
            @click="isCreateDialogOpen = true"
          >
            新建文件
          </v-btn>
        </div>
      </section>

      <v-row class="home-content" density="compact">
        <v-col cols="12" md="6">
          <v-card class="home-panel">
            <v-card-item>
              <template #prepend>
                <v-avatar color="secondary" variant="tonal">
                  <v-icon :icon="mdiHistory" />
                </v-avatar>
              </template>
              <v-card-title>最近打开</v-card-title>
              <v-card-subtitle>继续上次的思路</v-card-subtitle>
              <template #append>
                <v-btn variant="text" size="small" to="/set">全部文件</v-btn>
              </template>
            </v-card-item>
            <v-card-text class="pt-0">
              <v-list v-if="recentNotes.length" class="home-note-list" lines="two">
                <v-list-item
                  v-for="note in recentNotes"
                  :key="noteKeyOfEntry(note)"
                  :title="note.name"
                  :subtitle="`${note.fileName}.mdrf · 最近编辑 ${formatDate(note.updatedAt)}`"
                  @click="openRecentNote(note)"
                >
                  <template #prepend>
                    <v-avatar color="secondary" variant="tonal" size="40">
                      <v-icon :icon="mdiFileDocumentOutline" />
                    </v-avatar>
                  </template>
                  <template #append>
                    <v-icon :icon="mdiArrowRight" size="small" />
                  </template>
                </v-list-item>
              </v-list>
              <v-list v-else class="home-note-list" density="compact">
                <v-list-item
                  :prepend-icon="mdiHistory"
                  title="还没有最近打开的文件"
                  subtitle="打开一份笔记后，会显示在这里。"
                />
              </v-list>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col cols="12" md="6">
          <v-card class="home-panel">
            <v-card-item>
              <template #prepend>
                <v-avatar color="success" variant="tonal">
                  <v-icon :icon="mdiCalendarMonthOutline" />
                </v-avatar>
              </template>
              <v-card-title>创作热力图</v-card-title>
              <v-card-subtitle>过去 90 天的文件活动</v-card-subtitle>
            </v-card-item>
            <v-card-text>
              <div class="heatmap-month">{{ heatmapStartTitle }} — 今天</div>
              <div class="heatmap-wrap" role="img" aria-label="过去 90 天文件活动热力图">
                <div class="heatmap-weekdays">
                  <span>一</span><span>三</span><span>五</span>
                </div>
                <div class="heatmap-grid">
                  <span
                    v-for="day in heatmapDays"
                    :key="day.key"
                    class="heatmap-cell"
                    :class="`heatmap-cell--${day.level}`"
                    :title="day.title"
                  />
                </div>
              </div>
              <div class="heatmap-legend text-caption text-medium-emphasis">
                少
                <span v-for="level in 5" :key="level" :class="`heatmap-cell--${level - 1}`" />
                多
              </div>
            </v-card-text>
          </v-card>

          <v-card class="home-panel mt-4">
            <v-card-item>
              <template #prepend>
                <v-avatar color="info" variant="tonal">
                  <v-icon :icon="mdiChartTimelineVariant" />
                </v-avatar>
              </template>
              <v-card-title>文件活动</v-card-title>
              <v-card-subtitle>最近 7 天新建、修改与删除</v-card-subtitle>
            </v-card-item>
            <v-card-text>
              <div class="activity-summary">
                <div v-for="item in activitySeries.series" :key="item.kind">
                  <span class="activity-dot" :style="{ background: item.color }" />
                  <span>{{ item.label }}</span>
                  <strong>{{ activitySeries.total(item.kind) }}</strong>
                </div>
              </div>
              <svg
                class="activity-chart"
                viewBox="0 0 560 190"
                role="img"
                aria-label="最近七天新建、修改、删除文件数量折线图"
              >
                <line v-for="y in [34, 74, 114, 154]" :key="y" x1="30" :y1="y" x2="546" :y2="y" class="chart-grid-line" />
                <polyline
                  v-for="item in activitySeries.series"
                  :key="item.kind"
                  :points="item.points"
                  fill="none"
                  :stroke="item.color"
                  stroke-width="3"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
                <text
                  v-for="(item, index) in activitySeries.values"
                  :key="dateKey(item.date)"
                  :x="30 + index * 86"
                  y="182"
                  text-anchor="middle"
                  class="chart-date"
                >
                  {{ item.date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }) }}
                </text>
              </svg>
              <div class="chart-note text-caption text-medium-emphasis">
                <v-icon :icon="mdiChartTimelineVariant" size="small" />
                仅统计本设备记录的文件操作
              </div>
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

.activity-summary,
.activity-summary > div,
.chart-note {
  display: flex;
  align-items: center;
}

.home-note-list {
  padding: 0;
  background: transparent;
}

.heatmap-month {
  margin-bottom: 8px;
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.62);
}

.heatmap-wrap {
  display: flex;
  gap: 6px;
  overflow-x: auto;
}

.heatmap-weekdays {
  display: grid;
  grid-template-rows: repeat(7, 10px);
  gap: 3px;
  padding-top: 1px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 10px;
  line-height: 12px;
}

.heatmap-grid {
  display: grid;
  grid-auto-columns: 10px;
  grid-auto-flow: column;
  grid-template-rows: repeat(7, 10px);
  gap: 3px;
}

.heatmap-cell,
.heatmap-legend > span {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 0;
  background: rgba(var(--v-theme-on-surface), 0.08);
}

.heatmap-cell--1 {
  background: rgba(var(--v-theme-primary), 0.24);
}

.heatmap-cell--2 {
  background: rgba(var(--v-theme-primary), 0.44);
}

.heatmap-cell--3 {
  background: rgba(var(--v-theme-primary), 0.68);
}

.heatmap-cell--4 {
  background: rgb(var(--v-theme-primary));
}

.heatmap-legend {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 3px;
  margin-top: 8px;
}

.activity-summary {
  flex-wrap: wrap;
  gap: 12px;
}

.activity-summary > div {
  gap: 6px;
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.7);
}

.activity-summary strong {
  margin-left: 2px;
  color: rgb(var(--v-theme-on-surface));
}

.activity-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.activity-chart {
  display: block;
  width: 100%;
  margin-top: 8px;
  overflow: visible;
}

.chart-grid-line {
  stroke: rgba(var(--v-theme-on-surface), 0.08);
  stroke-width: 1;
}

.chart-date {
  fill: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 11px;
}

.chart-note {
  justify-content: flex-end;
  gap: 4px;
  margin-top: 0;
}
</style>
