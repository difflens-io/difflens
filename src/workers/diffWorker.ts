import { compareInputs } from '../core/diff';
import { buildEditorDiffModel } from '../core/editorDiffModel';
import type { DiffWorkerRequest, DiffWorkerResponse } from '../core/diffWorkerProtocol';

self.onmessage = (event: MessageEvent<DiffWorkerRequest>) => {
  const request = event.data;

  try {
    const result = compareInputs(request.left, request.right, request.formatMode, request.options);
    const response: DiffWorkerResponse = {
      id: request.id,
      ok: true,
      result,
      ...(request.includeEditorModel
        ? {
            editorDiffModel: buildEditorDiffModel(
              request.left,
              request.right,
              result.leftDetection.kind,
              result.rightDetection.kind,
              request.options
            )
          }
        : {})
    };

    self.postMessage(response);
  } catch (error) {
    const response: DiffWorkerResponse = {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };

    self.postMessage(response);
  }
};
