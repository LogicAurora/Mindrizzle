// SPDX-License-Identifier: MIT
import { onBeforeUnmount, ref } from 'vue'

// 提示只是瞬时反馈，常驻会把块内容挡在后面
const NOTICE_HIDE_DELAY = 4_000

export const useAutoHideNotice = (delay = NOTICE_HIDE_DELAY) => {
  const notice = ref('')
  let hideTimer: number | undefined

  const clearNotice = () => {
    if (hideTimer !== undefined) window.clearTimeout(hideTimer)
    hideTimer = undefined
    notice.value = ''
  }

  const showNotice = (message: string) => {
    if (hideTimer !== undefined) window.clearTimeout(hideTimer)
    notice.value = message
    hideTimer = window.setTimeout(() => {
      hideTimer = undefined
      notice.value = ''
    }, delay)
  }

  onBeforeUnmount(clearNotice)

  return { notice, showNotice, clearNotice }
}
