export type WorkspaceLocation = { kind: 'default' } | { kind: 'custom'; dir: string };

export type NoteFileLocation =
  | { kind: 'workspace'; fileName: string; workspace: WorkspaceLocation }
  | { kind: 'externalFile'; fileName: string; filePath: string };

export interface NoteFileContext {
  fileName: string;
  dir?: string;
  filePath?: string;
}

export const workspaceLocationOf = (dir?: string): WorkspaceLocation =>
  dir ? { kind: 'custom', dir } : { kind: 'default' };

export const noteFileLocationOf = ({
  fileName,
  dir,
  filePath,
}: NoteFileContext): NoteFileLocation =>
  filePath
    ? { kind: 'externalFile', fileName, filePath }
    : { kind: 'workspace', fileName, workspace: workspaceLocationOf(dir) };

export const noteFileContextOf = (location: NoteFileLocation): NoteFileContext => {
  if (location.kind === 'externalFile') {
    return { fileName: location.fileName, filePath: location.filePath };
  }
  return {
    fileName: location.fileName,
    ...(location.workspace.kind === 'custom' ? { dir: location.workspace.dir } : {}),
  };
};

export interface NoteMeta {
  title: string;
  description: string;
  tag: string[];
}

export interface NoteMetaView extends NoteMeta {
  updatedAt: number;
}

export interface NoteBody {
  content: string;
}

export interface CreateNoteRequest {
  fileName: string;
  meta: NoteMeta;
  workspace: WorkspaceLocation;
}

export interface MoveNoteRequest {
  location: NoteFileLocation;
  workspace: WorkspaceLocation;
}

export interface ExternalNoteMoveRequest {
  location: NoteFileLocation;
  workspace: WorkspaceLocation;
}

export interface RenameNoteRequest {
  location: NoteFileLocation;
  newFileName: string;
  meta?: NoteMeta;
}

export interface CopyNoteRequest {
  location: NoteFileLocation;
  newFileName: string;
}

export interface ComponentDataScope {
  location: NoteFileLocation;
  uuid: string;
}

export interface ComponentDataFile extends ComponentDataScope {
  path: string;
}

export interface ComponentDataWriteRequest extends ComponentDataFile {
  contentBase64: string;
}

export interface ComponentDataExportRequest extends ComponentDataFile {
  targetPath: string;
}

export interface FileOperations {
  fetchFileNames(workspace: WorkspaceLocation): Promise<string[]>;
  isFileNameAvailable(fileName: string, workspace: WorkspaceLocation): Promise<boolean>;
  getNoteMeta(location: NoteFileLocation): Promise<NoteMetaView>;
  getNoteBody(location: NoteFileLocation, debugProgress?: boolean): Promise<NoteBody>;
  setNoteBody(location: NoteFileLocation, content: string): Promise<void>;
  setNoteMeta(location: NoteFileLocation, meta: NoteMeta): Promise<void>;
  createNote(request: CreateNoteRequest): Promise<string>;
  moveNote(request: MoveNoteRequest): Promise<string>;
  moveExternalNote(request: ExternalNoteMoveRequest): Promise<string>;
  deleteNote(location: NoteFileLocation): Promise<void>;
  copyNote(request: CopyNoteRequest): Promise<string>;
  renameNote(request: RenameNoteRequest): Promise<string>;
  listComponentDataFiles(scope: ComponentDataScope): Promise<string[]>;
  readComponentDataFile(file: ComponentDataFile): Promise<string>;
  writeComponentDataFile(file: ComponentDataWriteRequest): Promise<void>;
  deleteComponentDataFile(file: ComponentDataFile): Promise<void>;
  componentDataFileExists(file: ComponentDataFile): Promise<boolean>;
  exportComponentDataFile(file: ComponentDataExportRequest): Promise<void>;
}
