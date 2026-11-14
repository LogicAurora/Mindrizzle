export interface NoteFileLocation {
  fileName: string;
  dir?: string;
  filePath?: string;
}

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
  dir?: string;
}

export interface MoveNoteRequest {
  fileName: string;
  dir?: string;
  targetDir?: string;
}

export interface ExternalNoteMoveRequest {
  filePath: string;
  dir?: string;
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

export interface ComponentDataScope extends NoteFileLocation {
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
  fetchFileNames(dir?: string): Promise<string[]>;
  isFileNameAvailable(fileName: string, dir?: string): Promise<boolean>;
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
