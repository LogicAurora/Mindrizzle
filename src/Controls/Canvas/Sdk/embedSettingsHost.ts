import type { InjectionKey, Ref } from 'vue'

// 插入块的设置面板挂在 body（避免被编辑器 overflow 裁掉），块组件往这个宿主里 Teleport 自己的设置内容
export const EMBED_SETTINGS_HOST_KEY: InjectionKey<Ref<HTMLElement | null>> = Symbol('mdr:embed-settings-host')
