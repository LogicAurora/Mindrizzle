export const loadEditorComponent = () => import('../Views/Editor.vue')

export type EditorBodyResult = { content: string } | { error: unknown }

export interface EditorNoteRef {
  fileName: string
  dir?: string
  filePath?: string
}

const noteKeyOf = (note: EditorNoteRef): string =>
	`${note.filePath ?? ''}\u0000${note.dir ?? ''}\u0000${note.fileName}`

let pendingEditorBody: { key: string; bodyPromise: Promise<EditorBodyResult> } | null = null

export function storePendingEditorBody(note: EditorNoteRef, bodyPromise: Promise<EditorBodyResult>) {
	pendingEditorBody = { key: noteKeyOf(note), bodyPromise }
}

export function takePendingEditorBody(note: EditorNoteRef) {
	if (!pendingEditorBody || pendingEditorBody.key !== noteKeyOf(note)) return null
	const bodyPromise = pendingEditorBody.bodyPromise
	pendingEditorBody = null
	return bodyPromise
}