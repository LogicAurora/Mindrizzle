import type { TaskItem } from '../../Registry/canvasComponents.ts'

export const createTaskId = () =>
  globalThis.crypto?.randomUUID?.() ?? `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export const normalizeTasks = (raw: unknown): TaskItem[] => {
  const source = Array.isArray(raw) ? raw : []
  return source
    .filter((item) => !!item && typeof item === 'object')
    .map((item) => {
      const task = item as Partial<TaskItem>
      return {
        id: typeof task.id === 'string' && task.id ? task.id : createTaskId(),
        text: String(task.text ?? ''),
        done: task.done === true,
      }
    })
}
