import type { EditorDiffModel } from './editorDiffModel';
import type { CompareResult, DiffOptions, FormatMode } from './types';

export type DiffWorkerRequest = {
  id: number;
  left: string;
  right: string;
  formatMode: FormatMode;
  options: DiffOptions;
  includeEditorModel: boolean;
};

export type DiffWorkerSuccessResponse = {
  id: number;
  ok: true;
  result: CompareResult;
  editorDiffModel?: EditorDiffModel;
};

export type DiffWorkerErrorResponse = {
  id: number;
  ok: false;
  error: string;
};

export type DiffWorkerResponse = DiffWorkerSuccessResponse | DiffWorkerErrorResponse;

export function isLatestWorkerResponse(latestRequestId: number, responseId: number): boolean {
  return latestRequestId === responseId;
}
