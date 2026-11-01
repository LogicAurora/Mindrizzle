import { mdiLinkVariant } from "@mdi/js";

import { LINK_BLOCK_CONSTRAINTS } from "../Registry/componentConstraints.ts";
import type { LinkBlockConfig } from "../Registry/canvasComponents.ts";
import { defineBlock } from "../Sdk/defineBlock.ts";
import LinkBlockEmbed from "./LinkBlock/LinkBlockEmbed.vue";
import LinkSettings from "./LinkBlock/LinkSettings.vue";

export default defineBlock<LinkBlockConfig>({
  key: "LinkBlock",
  title: "链接",
  description: "记录网址并展示站点信息",
  icon: mdiLinkVariant,
  addId: "add-link",
  order: 60,
  constraints: LINK_BLOCK_CONSTRAINTS,
  defaultConfig: () => ({
    url: "",
    title: "",
    description: "",
    siteName: "",
    imageUrl: "",
  }),
  defaultSize: { w: 320, h: 170 },
  // 拖拽栏显示站点名比 url 更好认
  titleOf: (config) => (config.siteName ? `链接 : ${config.siteName}` : "链接"),
  settings: LinkSettings,
  // 网址/封面地址都很长，窄面板里会被截成看不出区别
  settingsWidth: 320,
  embed: {
    nodeName: "LinkBlock",
    component: LinkBlockEmbed,
    toProps: (config) => ({
      url: config.url,
      title: config.title,
      description: config.description,
      siteName: config.siteName,
      imageUrl: config.imageUrl,
    }),
    fromProps: (props) => ({
      url: String(props.url ?? ""),
      title: String(props.title ?? ""),
      description: String(props.description ?? ""),
      siteName: String(props.siteName ?? ""),
      imageUrl: String(props.imageUrl ?? ""),
    }),
  },
});
