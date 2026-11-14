// SPDX-License-Identifier: MIT
import { ref } from 'vue';

// 跨页面请求设置页切到某个 tab（如关于页连点版本号），由设置页消费后清空
export const pendingSettingsTab = ref<string | null>(null);
