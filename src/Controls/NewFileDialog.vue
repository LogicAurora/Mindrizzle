<script setup lang="ts">
import { ref, watch } from "vue";
import { useRouter } from "vue-router";
import {
  fileOperations,
  isValidNoteFileName,
  NOTE_FILE_NAME_RULE_HINT,
} from "../fileOperations";
import { invalidateNoteSetEntries } from "../utils/noteSetStore";
import { error as LogError } from "@tauri-apps/plugin-log";
import { recordRecentNote } from "../utils/homeActivity";

const props = defineProps<{ isOpen: boolean; dir?: string }>();
const emit = defineEmits<{ "update:close": [value: { status: boolean }] }>();

let dialog = ref(false);

watch(
  () => props.isOpen,
  (newVal) => {
    dialog.value = newVal;
  },
  { immediate: true },
);

watch(
  () => dialog.value,
  (newVal) => {
    if (!newVal) {
      emit("update:close", { status: false });
    }
  },
);

const title = ref("");
const description = ref("");
const fileName = ref("");

const shortRules = [
  (v: any) => !!v || "不可为空",
  (v: string) => v.length <= 30 || "太长了",
];

const longRules = [
  (v: any) => !!v || "不可为空",
  (v: string) => v.length <= 1000 || "太长了",
];

const fileNameAsyncError = ref<true | string>(true);

let debounceTimer: number | null = null;
const debouncedCheck = (name: string) => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(async () => {
    if (!name) {
      fileNameAsyncError.value = true;
      return;
    }
    if (!isValidNoteFileName(name)) {
      fileNameAsyncError.value = NOTE_FILE_NAME_RULE_HINT;
      return;
    }
    try {
      const valid = await fileOperations.isFileNameAvailable(name, props.dir);
      fileNameAsyncError.value = valid ? true : "文件名已被占用";
    } catch {
      fileNameAsyncError.value = "校验失败，请重试";
    }
  }, 500);
};

watch(fileName, (newVal) => debouncedCheck(newVal));

const fileRules = [
  () => fileNameAsyncError.value, // Vuetify 规则以 true 通过、字符串为错误提示
];

const infoForm = ref();
const router = useRouter();

import { getErrorMessage } from "../utils/getErrorMessage";

async function submit() {
  const { valid } = await infoForm.value.validate();
  if (!valid) return;

  try {
    const createdFileName = await fileOperations.createNote({
      meta: {
        title: title.value,
        description: description.value,
        tag: ["新笔记"],
      },
      fileName: fileName.value,
      dir: props.dir,
    });
    dialog.value = false;
    invalidateNoteSetEntries();
    recordRecentNote({
      fileName: createdFileName,
      ...(props.dir ? { dir: props.dir } : {}),
    });
    router.push({
      name: "editor",
      params: { fileName: createdFileName },
      query: props.dir ? { dir: props.dir } : {},
    });
  } catch (e) {
    LogError(getErrorMessage(e));
  }
}
</script>
<template>
  <v-dialog v-model="dialog" max-width="500">
    <v-card>
      <v-card-text>
        <v-form ref="infoForm">
          <v-text-field
            v-model="title"
            :counter="30"
            :rules="shortRules"
            label="标题"
          />
          <v-textarea
            v-model="description"
            :counter="1000"
            :rules="longRules"
            label="描述"
            auto-grow
          />
          <v-text-field
            v-model="fileName"
            :counter="30"
            :rules="fileRules"
            label="文件名（可选）"
            hint="留空则自动生成"
            persistent-hint
          />
        </v-form>
      </v-card-text>

      <v-card-actions>
        <v-btn color="error" variant="text" @click="dialog = false">
          取消
        </v-btn>
        <v-spacer />
        <v-btn color="primary" variant="text" @click="submit()"> 提交 </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
