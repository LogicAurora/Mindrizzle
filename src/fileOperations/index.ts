import { invoke, isTauri } from "@tauri-apps/api/core";

import { browserFileOperations } from "./browserStore";
import type {
  ComponentDataExportRequest,
  ComponentDataFile,
  ComponentDataScope,
  ComponentDataWriteRequest,
  CopyNoteRequest,
  CreateNoteRequest,
  ExternalNoteMoveRequest,
  FileOperations,
  MoveNoteRequest,
  NoteFileLocation,
  RenameNoteRequest,
} from "./types";
import { rememberTags } from "../utils/tagStore";

const route = <T>(native: () => Promise<T>, browser: () => Promise<T>) =>
  isTauri() ? native() : browser();

export const fileOperations: FileOperations = {
  fetchFileNames: (dir) =>
    route(
      () => invoke<string[]>("fetch_file_list", { dir }),
      () => browserFileOperations.fetchFileNames(dir),
    ),
  isFileNameAvailable: (fileName, dir) =>
    route(
      () => invoke<boolean>("is_file_name_valid", { fileName, dir }),
      () => browserFileOperations.isFileNameAvailable(fileName, dir),
    ),
  getNoteMeta: (location) =>
    route(
      () => invoke("get_mdr_file_meta", { ...location }),
      () => browserFileOperations.getNoteMeta(location),
    ),
  getNoteBody: (location, debugProgress) =>
    route(
      () => invoke("get_mdr_file_body", { ...location, debugProgress }),
      () => browserFileOperations.getNoteBody(location, debugProgress),
    ),
  setNoteBody: (location, content) =>
    route(
      () => invoke("set_mdr_file_body", { ...location, content }),
      () => browserFileOperations.setNoteBody(location, content),
    ),
  setNoteMeta: (location, meta) =>
    route(
      () =>
        invoke("set_mdr_file_meta", {
          ...location,
          mdrFileInfo: meta,
        }),
      () => browserFileOperations.setNoteMeta(location, meta),
    ),
  createNote: (request: CreateNoteRequest) => {
    rememberTags(request.meta.tag ?? []);
    return route(
      () =>
        invoke<string>("create_mdr_file", {
          fileName: request.fileName,
          dir: request.dir,
          mdrFileInfo: request.meta,
        }),
      () => browserFileOperations.createNote(request),
    )
  },
  moveNote: (request: MoveNoteRequest) =>
    route(
      () => invoke<string>("move_mdr_file", { ...request }),
      () => browserFileOperations.moveNote(request),
    ),
  moveExternalNote: (request: ExternalNoteMoveRequest) =>
    route(
      () => invoke<string>("move_mdrf_file", { ...request }),
      () => browserFileOperations.moveExternalNote(request),
    ),
  deleteNote: (location: NoteFileLocation) =>
    route(
      () => invoke("delete_mdrf_file", { ...location }),
      () => browserFileOperations.deleteNote(location),
    ),
  copyNote: (request: CopyNoteRequest) =>
    route(
      () =>
        invoke<string>("copy_mdrf_file", {
          ...request.location,
          newFileName: request.newFileName,
        }),
      () => browserFileOperations.copyNote(request),
    ),
  renameNote: (request: RenameNoteRequest) =>
    route(
      () =>
        invoke<string>("rename_mdrf_file", {
          ...request.location,
          newFileName: request.newFileName,
          ...(request.meta ? { mdrFileInfo: request.meta } : {}),
        }),
      () => browserFileOperations.renameNote(request),
    ),
  listComponentDataFiles: (scope: ComponentDataScope) =>
    route(
      () => invoke<string[]>("list_component_data_files", { request: scope }),
      () => browserFileOperations.listComponentDataFiles(scope),
    ),
  readComponentDataFile: (file: ComponentDataFile) =>
    route(
      () => invoke<string>("read_component_data_file", { request: file }),
      () => browserFileOperations.readComponentDataFile(file),
    ),
  writeComponentDataFile: (file: ComponentDataWriteRequest) =>
    route(
      () => invoke("write_component_data_file", { request: file }),
      () => browserFileOperations.writeComponentDataFile(file),
    ),
  deleteComponentDataFile: (file: ComponentDataFile) =>
    route(
      () => invoke("delete_component_data_file", { request: file }),
      () => browserFileOperations.deleteComponentDataFile(file),
    ),
  componentDataFileExists: (file: ComponentDataFile) =>
    route(
      () => invoke<boolean>("component_data_file_exists", { request: file }),
      () => browserFileOperations.componentDataFileExists(file),
    ),
  exportComponentDataFile: (file: ComponentDataExportRequest) =>
    route(
      () => invoke("export_component_data_file", { request: file }),
      () => browserFileOperations.exportComponentDataFile(file),
    ),
};

export {
  clearLocalNotes,
  clearTestNotes,
  createTestNotes,
  exportLocalNoteMdrf,
  importLocalNoteMdrf,
  moveLocalNoteToWorkspace,
} from "./browserStore";

export {
  isValidNoteFileName,
  NOTE_FILE_NAME_MAX_LEN,
  NOTE_FILE_NAME_RULE_HINT,
} from "./noteFileName";

export type {
  ComponentDataExportRequest,
  ComponentDataFile,
  ComponentDataScope,
  ComponentDataWriteRequest,
  CopyNoteRequest,
  CreateNoteRequest,
  ExternalNoteMoveRequest,
  NoteBody,
  NoteFileLocation,
  NoteMeta,
  NoteMetaView,
  RenameNoteRequest,
} from "./types";
