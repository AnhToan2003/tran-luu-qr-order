export class ActionProofCancelledError extends Error {
  public readonly isCancelled = true;
  public readonly code = 'ACTION_PROOF_CANCELLED';

  constructor(message = 'Thao tác đã được hủy bởi quản trị viên.') {
    super(message);
    this.name = 'ActionProofCancelledError';
  }
}

export interface ActionProofRequest {
  action: string;
  title?: string;
  description?: string;
  confirmButtonText?: string;
  resolve: (proofToken: string) => void;
  reject: (error: Error) => void;
}

type Listener = (request: ActionProofRequest | null) => void;
const listeners = new Set<Listener>();

let currentRequest: ActionProofRequest | null = null;

export function promptActionProofModal(params: {
  action: string;
  title?: string;
  description?: string;
  confirmButtonText?: string;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    currentRequest = {
      ...params,
      resolve: (token) => {
        currentRequest = null;
        notify();
        resolve(token);
      },
      reject: (err) => {
        currentRequest = null;
        notify();
        reject(err);
      }
    };
    notify();
  });
}

export function subscribeActionProofModal(listener: Listener): () => void {
  listeners.add(listener);
  listener(currentRequest);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  listeners.forEach(fn => {
    try {
      fn(currentRequest);
    } catch {
      // Ignore listener error
    }
  });
}
