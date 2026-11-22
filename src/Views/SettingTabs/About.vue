<script setup lang="ts">
import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  mdiAlertCircleOutline,
  mdiCheck,
  mdiContentCopy,
  mdiDownload,
  mdiGithub,
  mdiInformationOutline,
  mdiLaptop,
  mdiMonitor,
  mdiMonitorScreenshot,
  mdiSourceCommit,
  mdiTagOutline,
  mdiTranslate,
  mdiWeb,
} from '@mdi/js';
import { computed, onMounted, ref } from 'vue';

import packageInfo from '../../../package.json';
import appIconUrl from '../../../app-icon.svg';
import AboutUpdatePanel from './AboutUpdatePanel.vue';
import MdrSettingsPageBase from './MdrSettingsPageBase.vue';
import { useSecretKnock } from '../../utils/easterEggs';
import { saveDeveloperMode } from '../../utils/developerMode';
import { pendingSettingsTab } from '../../utils/settingsTabIntent';
import { BRAND_CHINESE_TAGLINE, BRAND_ENGLISH_TAGLINE } from '../../utils/brandCopy';

const isGitCommitLoaded = ref(!isTauri());
const gitCommit = ref(isTauri() ? '读取中' : '不可用（网页预览）');
const isCopyComplete = ref(false);
const copyError = ref('');
const appVersion = packageInfo.version;
const copyrightYear = new Date().getFullYear();

const environment = computed(() => (isTauri() ? 'Tauri 桌面应用' : '浏览器预览'));
const systemPlatform = navigator.platform || '未知';
const browserInfo = navigator.userAgent;
const screenSize = `${window.screen.width} × ${window.screen.height}`;

const systemInfo = computed(() => [
  { title: '运行环境', value: environment.value, icon: mdiMonitor },
  { title: '系统平台', value: systemPlatform, icon: mdiLaptop },
  { title: '屏幕尺寸', value: screenSize, icon: mdiMonitorScreenshot },
  { title: '语言', value: navigator.language, icon: mdiTranslate },
]);

const quickLinks = [
  {
    name: '源代码',
    url: 'https://github.com/LogicAurora/Mindrizzle',
    icon: mdiGithub,
  },
  {
    name: '问题反馈',
    url: 'https://github.com/LogicAurora/Mindrizzle/issues',
    icon: mdiAlertCircleOutline,
  },
  {
    name: '版本发布',
    url: 'https://github.com/LogicAurora/Mindrizzle/releases',
    icon: mdiDownload,
  },
];

const openSourceProjects = [
  { name: 'Vue', url: 'https://github.com/vuejs/core' },
  { name: 'Vuetify', url: 'https://github.com/vuetifyjs/vuetify' },
  { name: 'Tauri', url: 'https://github.com/tauri-apps/tauri' },
  { name: 'ProseKit', url: 'https://github.com/ocavue/prosekit' },
  { name: 'ProseMirror', url: 'https://github.com/ProseMirror/prosemirror' },
  { name: 'KaTeX', url: 'https://github.com/KaTeX/KaTeX' },
  { name: 'highlight.js', url: 'https://github.com/highlightjs/highlight.js' },
];

const diagnosticText = computed(() =>
  [
    `应用版本：${appVersion}`,
    `Git 提交：${gitCommit.value}`,
    `运行环境：${environment.value}`,
    `系统平台：${systemPlatform}`,
    `浏览器：${browserInfo}`,
    `屏幕尺寸：${screenSize}`,
    `语言：${navigator.language}`,
  ].join('\n'),
);

async function loadGitCommit() {
  if (!isTauri() || isGitCommitLoaded.value) return;
  try {
    gitCommit.value = await invoke<string>('get_git_commit');
  } catch {
    gitCommit.value = '未知';
  } finally {
    isGitCommitLoaded.value = true;
  }
}

async function copyDiagnostics() {
  try {
    await navigator.clipboard.writeText(diagnosticText.value);
    isCopyComplete.value = true;
    copyError.value = '';
    window.setTimeout(() => {
      isCopyComplete.value = false;
    }, 2000);
  } catch {
    copyError.value = '无法访问剪贴板，请检查系统权限。';
  }
}

const knockVersion = useSecretKnock(() => {
  void openDeveloperTab();
});

const snackbar = ref(false);

function openDeveloperTab() {
  snackbar.value = true;
  void saveDeveloperMode(true).catch(() => undefined);
  pendingSettingsTab.value = 'developer';
}

onMounted(() => {
  void loadGitCommit();
});
</script>

<template>
  <MdrSettingsPageBase
    title="关于"
    subtitle="版本信息、应用更新与开源鸣谢。"
    :icon="mdiInformationOutline"
  >
    <!-- 品牌横幅 -->
    <template #header>
      <section class="about-hero fade-in">
        <span class="about-hero-glow about-hero-glow--1" />
        <span class="about-hero-glow about-hero-glow--2" />
        <div class="about-hero-main">
          <v-avatar class="about-hero-logo" rounded="lg" aria-hidden="true">
            <v-img :src="appIconUrl" alt="" />
          </v-avatar>
          <div class="about-hero-copy">
            <div class="about-hero-eyebrow">
              关于应用 <span>{{ BRAND_ENGLISH_TAGLINE }}</span>
            </div>
            <h1 class="about-hero-title">Mindrizzle</h1>
            <p class="about-hero-tagline">{{ BRAND_CHINESE_TAGLINE }}</p>
          </div>
        </div>
        <div class="about-hero-meta">
          <div class="about-hero-chips">
            <button
              type="button"
              class="about-chip about-chip--action"
              title="点击版本号"
              @click="knockVersion"
            >
              <v-icon :icon="mdiTagOutline" size="14" />
              <span>{{ appVersion }}</span>
            </button>
            <span class="about-chip">
              <v-icon :icon="mdiSourceCommit" size="14" />
              <span>{{ gitCommit }}</span>
            </span>
            <span class="about-chip">
              <v-icon :icon="mdiMonitor" size="14" />
              <span>{{ environment }}</span>
            </span>
          </div>
          <a
            class="about-hero-link"
            href="https://github.com/LogicAurora/Mindrizzle"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="在 GitHub 上查看项目"
            title="GitHub"
          >
            <v-icon :icon="mdiGithub" size="20" />
          </a>
        </div>
      </section>
    </template>

    <AboutUpdatePanel />

    <!-- 系统信息 -->
    <section class="settings-section system-section">
      <div class="settings-section-head">
        <div>
          <div class="settings-section-title">系统信息</div>
          <div class="settings-section-caption">当前运行环境的详细参数</div>
        </div>
        <v-btn
          :prepend-icon="isCopyComplete ? mdiCheck : mdiContentCopy"
          :color="isCopyComplete ? 'success' : undefined"
          variant="text"
          size="small"
          @click="copyDiagnostics"
        >
          {{ isCopyComplete ? '已复制' : '复制全部' }}
        </v-btn>
      </div>
      <v-row density="compact">
        <v-col v-for="info in systemInfo" :key="info.title" cols="6" sm="3">
          <div class="info-cell">
            <v-icon :icon="info.icon" size="18" class="info-icon" />
            <div class="info-body">
              <div class="info-label">{{ info.title }}</div>
              <div class="info-value">{{ info.value }}</div>
            </div>
          </div>
        </v-col>
      </v-row>
      <div class="browser-row">
        <v-icon :icon="mdiWeb" size="18" class="info-icon" />
        <div class="info-body">
          <div class="info-label">浏览器标识</div>
          <div class="info-value info-value--mono">{{ browserInfo }}</div>
        </div>
      </div>
      <v-alert
        v-if="copyError"
        class="mt-3"
        density="compact"
        type="error"
        variant="tonal"
        :icon="mdiAlertCircleOutline"
      >
        {{ copyError }}
      </v-alert>
    </section>

    <!-- 快速链接 -->
    <section class="settings-section quick-section">
      <div class="settings-section-head">
        <div>
          <div class="settings-section-title">快速链接</div>
          <div class="settings-section-caption">项目主页、问题反馈与版本发布</div>
        </div>
      </div>
      <div class="quick-grid">
        <a
          v-for="link in quickLinks"
          :key="link.name"
          :href="link.url"
          target="_blank"
          rel="noopener noreferrer"
          class="quick-card"
        >
          <v-icon :icon="link.icon" size="20" class="quick-icon" />
          <span class="quick-name">{{ link.name }}</span>
        </a>
      </div>
    </section>

    <!-- 开源鸣谢 -->
    <section class="settings-section credits-section">
      <div class="settings-section-head">
        <div>
          <div class="settings-section-title">开源鸣谢</div>
          <div class="settings-section-caption">
            感谢以下项目与社区贡献者，让 Mindrizzle 得以持续成长。
          </div>
        </div>
      </div>
      <div class="credits-grid">
        <a
          v-for="project in openSourceProjects"
          :key="project.name"
          :href="project.url"
          target="_blank"
          rel="noopener noreferrer"
          class="credit-card"
        >
          <span class="credit-name">{{ project.name }}</span>
          <v-icon :icon="mdiGithub" size="14" class="credit-icon" />
        </a>
      </div>
    </section>

    <!-- 版权 -->
    <footer class="about-footer">
      <div class="footer-links">
        <a
          href="https://github.com/LogicAurora/Mindrizzle/graphs/contributors"
          target="_blank"
          rel="noopener noreferrer"
        >
          贡献者
        </a>
        <span class="footer-dot">·</span>
        <a
          href="https://github.com/LogicAurora/Mindrizzle/blob/main/LICENSE"
          target="_blank"
          rel="noopener noreferrer"
        >
          GNU GPL v3.0
        </a>
        <span>特别感谢每一位为Mindrizzle做出贡献的开发者！！！</span>
      </div>
      <div class="footer-copy">版权所有 © {{ copyrightYear }} The LogicAurora Authors</div>
    </footer>

    <v-snackbar v-model="snackbar" :timeout="3000" location="bottom"> 已开启开发者模式 </v-snackbar>
  </MdrSettingsPageBase>
</template>

<style scoped>
/* ---------- Hero ---------- */
.about-hero {
  position: relative;
  overflow: hidden;
  padding: 32px;
  border-radius: 20px;
  color: rgb(var(--v-theme-on-primary));
  background: linear-gradient(
    135deg,
    rgb(var(--v-theme-primary)) 0%,
    rgba(var(--v-theme-primary), 0.82) 100%
  );
}

.about-hero-glow {
  position: absolute;
  border-radius: 50%;
  background: rgba(var(--v-theme-on-primary), 0.09);
  pointer-events: none;
}
.about-hero-glow--1 {
  top: -90px;
  right: -80px;
  width: 320px;
  height: 320px;
  animation: about-drift-a 18s ease-in-out infinite;
}
.about-hero-glow--2 {
  right: 15%;
  bottom: -140px;
  width: 280px;
  height: 280px;
  background: rgba(var(--v-theme-on-primary), 0.06);
  animation: about-drift-b 22s ease-in-out infinite;
}

@keyframes about-drift-a {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  50% {
    transform: translate(-24px, 20px) scale(1.06);
  }
}
@keyframes about-drift-b {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  50% {
    transform: translate(24px, -18px) scale(1.04);
  }
}

.about-hero-main {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  gap: 22px;
}

.about-hero-logo {
  flex: 0 0 80px;
  /* 尺寸必须写在这里覆盖 Vuetify 的 density 默认值；用 size prop 会注入内联样式，
     小屏媒体查询改不动高度，logo 被拉成 60×80 */
  width: 80px;
  height: 80px;
  background: transparent;
}

.about-hero-copy {
  min-width: 0;
  padding-top: 4px;
}

.about-hero-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  opacity: 0.85;
}

.about-hero-eyebrow span {
  padding-left: 10px;
  border-left: 1px solid rgba(var(--v-theme-on-primary), 0.38);
  font-size: 0.65rem;
  font-weight: 500;
  opacity: 0.85;
}

.about-hero-title {
  margin: 10px 0 0;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 2.4rem;
  font-weight: 500;
  line-height: 1.1;
  letter-spacing: -0.02em;
}

.about-hero-tagline {
  max-width: 540px;
  margin: 10px 0 0;
  font-size: 0.95rem;
  line-height: 1.65;
  opacity: 0.88;
}

.about-hero-meta {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid rgba(var(--v-theme-on-primary), 0.16);
}

.about-hero-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.about-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border: 1px solid rgba(var(--v-theme-on-primary), 0.22);
  border-radius: 999px;
  background: rgba(var(--v-theme-on-primary), 0.12);
  color: inherit;
  font-family: inherit;
  font-size: 0.72rem;
  font-weight: 500;
  backdrop-filter: blur(6px);
}

.about-chip--action {
  cursor: pointer;
  transition:
    background 0.16s ease,
    transform 0.16s ease;
}
.about-chip--action:hover {
  background: rgba(var(--v-theme-on-primary), 0.22);
}
.about-chip--action:active {
  transform: scale(0.96);
}

.about-hero-link {
  display: inline-flex;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(var(--v-theme-on-primary), 0.22);
  border-radius: 50%;
  background: rgba(var(--v-theme-on-primary), 0.12);
  color: inherit;
  text-decoration: none;
  transition: background 0.16s ease;
}
.about-hero-link:hover {
  background: rgba(var(--v-theme-on-primary), 0.22);
}

/* ---------- 系统信息 ---------- */
.system-section {
  margin-top: 24px;
}

.info-cell {
  display: flex;
  height: 100%;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(var(--v-theme-on-surface), 0.03);
}

.info-icon {
  flex: none;
  margin-top: 2px;
  color: rgb(var(--v-theme-primary));
  opacity: 0.8;
}

.info-body {
  min-width: 0;
  flex: 1;
}

.info-label {
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 0.7rem;
  font-weight: 500;
  letter-spacing: 0.02em;
}

.info-value {
  margin-top: 2px;
  color: rgb(var(--v-theme-on-surface));
  font-size: 0.85rem;
  font-weight: 500;
  overflow-wrap: anywhere;
}

.info-value--mono {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 0.72rem;
  font-weight: 400;
  line-height: 1.55;
  color: rgba(var(--v-theme-on-surface), 0.7);
}

.browser-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 12px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(var(--v-theme-on-surface), 0.03);
}

/* ---------- 快速链接 ---------- */
.quick-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 8px;
}

.quick-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 10px;
  color: rgb(var(--v-theme-on-surface));
  font-size: 0.85rem;
  text-decoration: none;
  transition:
    background 0.16s ease,
    border-color 0.16s ease,
    transform 0.16s ease;
}
.quick-card:hover {
  border-color: rgba(var(--v-theme-primary), 0.4);
  background: rgba(var(--v-theme-primary), 0.06);
  transform: translateY(-1px);
}

.quick-icon {
  color: rgb(var(--v-theme-primary));
  opacity: 0.8;
}

.quick-name {
  font-weight: 500;
}

/* ---------- 鸣谢 ---------- */
.credits-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
}

.credit-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(var(--v-theme-on-surface), 0.04);
  color: rgb(var(--v-theme-on-surface));
  font-size: 0.8rem;
  text-decoration: none;
  transition:
    background 0.16s ease,
    color 0.16s ease,
    transform 0.16s ease;
}
.credit-card:hover {
  background: rgba(var(--v-theme-primary), 0.1);
  color: rgb(var(--v-theme-primary));
  transform: translateY(-1px);
}

.credit-icon {
  opacity: 0.35;
  transition: opacity 0.16s ease;
}
.credit-card:hover .credit-icon {
  opacity: 0.85;
}

.credit-name {
  font-weight: 500;
}

/* ---------- 页脚 ---------- */
.about-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 20px;
  margin-top: 32px;
  padding-top: 16px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 0.75rem;
}

.footer-links {
  display: flex;
  align-items: center;
  gap: 6px;
}

.footer-links a {
  color: rgb(var(--v-theme-primary));
  text-decoration: none;
}
.footer-links a:hover {
  text-decoration: underline;
}

.footer-dot {
  opacity: 0.5;
}

/* ---------- 入场 ---------- */
.fade-in {
  animation: fade-in 0.5s ease both;
}
@keyframes fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* ---------- 响应式 ---------- */
@media (max-width: 600px) {
  .about-hero {
    padding: 24px 20px;
    border-radius: 16px;
  }
  .about-hero-main {
    gap: 14px;
  }
  .about-hero-logo {
    width: 60px;
    height: 60px;
    flex-basis: 60px;
  }
  .about-hero-title {
    font-size: 2rem;
  }
  .about-hero-tagline {
    font-size: 0.875rem;
  }
  .about-hero-meta {
    margin-top: 16px;
    padding-top: 14px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .about-hero-glow {
    animation: none !important;
  }
  .credit-card,
  .quick-card,
  .about-chip--action,
  .about-hero-link {
    transition: none !important;
  }
}
</style>
