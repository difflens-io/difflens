import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { compareInputs } from '../core/diff';
import {
  buildEmptyEditorDiffModel,
  buildEditorDiffModel,
  type EditorDiffModel
} from '../core/editorDiffModel';
import { selectDiffExecutionPlan, type DiffExecutionPlan } from '../core/diffExecution';
import {
  isLatestWorkerResponse,
  type DiffWorkerRequest,
  type DiffWorkerResponse
} from '../core/diffWorkerProtocol';
import type { CompareResult, DiffOptions, FormatMode } from '../core/types';

export type DiffComputation = {
  result: CompareResult;
  editorDiffModel: EditorDiffModel;
};

export type DiffComputationState = DiffComputation & {
  pending: boolean;
  plan: DiffExecutionPlan;
  error?: string;
};

let nextRequestId = 1;

export function useDiffComputation(
  left: string,
  right: string,
  formatMode: FormatMode,
  options: DiffOptions
): DiffComputationState {
  const plan = useMemo(
    () => selectDiffExecutionPlan({ left, right, formatMode }),
    [left, right, formatMode]
  );
  const latestRequestIdRef = useRef(0);
  const workerRef = useRef<Worker | null>(null);
  const fallback = useMemo(
    () => computeDiff('', '', formatMode, options),
    [formatMode, options]
  );
  const lastCompletedRef = useRef<DiffComputation>(fallback);
  const [workerState, setWorkerState] = useState<DiffComputationState | null>(null);

  const syncComputation = useMemo(() => {
    if (plan !== 'sync') return null;
    return computeDiff(left, right, formatMode, options);
  }, [left, right, formatMode, options, plan]);

  if (syncComputation) {
    lastCompletedRef.current = syncComputation;
  }

  useEffect(() => {
    if (plan !== 'worker') {
      setWorkerState(null);
      return;
    }

    const requestId = nextRequestId++;
    latestRequestIdRef.current = requestId;
    const previous = lastCompletedRef.current;

    setWorkerState({
      ...previous,
      pending: true,
      plan: 'worker'
    });

    try {
      const worker = getDiffWorker(workerRef);
      const handleMessage = (event: MessageEvent<DiffWorkerResponse>) => {
        const response = event.data;
        if (!isLatestWorkerResponse(latestRequestIdRef.current, response.id)) return;

        if (!response.ok) {
          const fallbackComputation = computeDiff(left, right, formatMode, options);
          lastCompletedRef.current = fallbackComputation;
          setWorkerState({
            ...fallbackComputation,
            pending: false,
            plan: 'worker',
            error: response.error
          });
          return;
        }

        const computation: DiffComputation = {
          result: response.result,
          editorDiffModel:
            response.editorDiffModel ?? buildEmptyEditorDiffModel(left, right)
        };
        lastCompletedRef.current = computation;
        setWorkerState({
          ...computation,
          pending: false,
          plan: 'worker'
        });
      };

      const handleError = () => {
        if (!isLatestWorkerResponse(latestRequestIdRef.current, requestId)) return;

        const fallbackComputation = computeDiff(left, right, formatMode, options);
        lastCompletedRef.current = fallbackComputation;
        setWorkerState({
          ...fallbackComputation,
          pending: false,
          plan: 'worker',
          error: 'Worker 计算失败，已回退到主线程'
        });
      };

      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', handleError);

      const request: DiffWorkerRequest = {
        id: requestId,
        left,
        right,
        formatMode,
        options,
        includeEditorModel: options.showDiffInEditors
      };
      worker.postMessage(request);

      return () => {
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
      };
    } catch (error) {
      const fallbackComputation = computeDiff(left, right, formatMode, options);
      lastCompletedRef.current = fallbackComputation;
      setWorkerState({
        ...fallbackComputation,
        pending: false,
        plan: 'worker',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }, [left, right, formatMode, options, plan]);

  if (syncComputation) {
    return {
      ...syncComputation,
      pending: false,
      plan: 'sync'
    };
  }

  return workerState ?? {
    ...lastCompletedRef.current,
    pending: true,
    plan: 'worker'
  };
}

export function computeDiff(
  left: string,
  right: string,
  formatMode: FormatMode,
  options: DiffOptions
): DiffComputation {
  const result = compareInputs(left, right, formatMode, options);
  return {
    result,
    editorDiffModel: options.showDiffInEditors
      ? buildEditorDiffModel(
          left,
          right,
          result.leftDetection.kind,
          result.rightDetection.kind,
          options
        )
      : buildEmptyEditorDiffModel(left, right)
  };
}

function getDiffWorker(workerRef: MutableRefObject<Worker | null>): Worker {
  if (!workerRef.current) {
    workerRef.current = new Worker(new URL('../workers/diffWorker.ts', import.meta.url), {
      type: 'module'
    });
  }

  return workerRef.current;
}
