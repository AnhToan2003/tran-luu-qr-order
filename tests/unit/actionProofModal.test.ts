import { describe, it, expect, vi } from 'vitest';
import {
  promptActionProofModal,
  subscribeActionProofModal,
  ActionProofCancelledError,
  type ActionProofRequest
} from '../../src/lib/actionProofModal';
import { apiFetch, isActionProofCancelled } from '../../src/lib/api';

describe('actionProofModal pub/sub and resolution flow', () => {
  it('notifies subscribers when promptActionProofModal is called', async () => {
    let capturedRequest: ActionProofRequest | null = null;
    const unsubscribe = subscribeActionProofModal((req: ActionProofRequest | null) => {
      capturedRequest = req;
    });

    const promise = promptActionProofModal({
      action: 'courts.manage',
      title: 'Xác Nhận Mật Khẩu Quản Trị',
      description: 'Thao tác này cần xác nhận mật khẩu quản trị. Vui lòng nhập mật khẩu:'
    });

    const activeReq = capturedRequest as ActionProofRequest | null;
    expect(activeReq).not.toBeNull();
    expect(activeReq?.action).toBe('courts.manage');
    expect(activeReq?.title).toBe('Xác Nhận Mật Khẩu Quản Trị');

    // Simulate user completing verification
    const token = 'a'.repeat(64);
    activeReq?.resolve(token);

    const result = await promise;
    expect(result).toBe(token);

    // After resolve, current request is cleared
    expect(capturedRequest).toBeNull();
    unsubscribe();
  });

  it('rejects with ActionProofCancelledError when user cancels via onClose', async () => {
    let capturedRequest: ActionProofRequest | null = null;
    const unsubscribe = subscribeActionProofModal((req: ActionProofRequest | null) => {
      capturedRequest = req;
    });

    const promise = promptActionProofModal({
      action: 'inventory',
      title: 'Xác Nhận Mật Khẩu Quản Trị'
    });

    const activeReq = capturedRequest as ActionProofRequest | null;
    expect(activeReq).not.toBeNull();

    // User cancels the modal
    activeReq?.reject(new ActionProofCancelledError('Thao tác đã được hủy bởi quản trị viên.'));

    await expect(promise).rejects.toThrow(ActionProofCancelledError);
    await expect(promise).rejects.toThrow('Thao tác đã được hủy bởi quản trị viên.');

    expect(capturedRequest).toBeNull();
    unsubscribe();
  });

  it('does NOT reject when resolve is called first, ensuring no double notification bug', async () => {
    let capturedRequest: ActionProofRequest | null = null;
    const unsubscribe = subscribeActionProofModal((req: ActionProofRequest | null) => {
      capturedRequest = req;
    });

    const promise = promptActionProofModal({
      action: 'inventory'
    });

    const activeReq = capturedRequest as ActionProofRequest | null;
    expect(activeReq).not.toBeNull();

    // Simulate correct flow: resolve without calling onClose/reject
    const token = 'b'.repeat(64);
    activeReq?.resolve(token);

    const result = await promise;
    expect(result).toBe(token);

    unsubscribe();
  });

  it('apiFetch retries with x-action-proof upon modal resolution', async () => {
    const fetchMock = vi.fn();
    const token = 'c'.repeat(64);

    // First call returns 403 ACTION_PROOF_REQUIRED
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 'ACTION_PROOF_REQUIRED', message: 'Action proof required' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      })
    );
    // Retry call returns 200 OK
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    // Hook modal listener
    const unsubscribe = subscribeActionProofModal((req: ActionProofRequest | null) => {
      if (req) {
        req.resolve(token);
      }
    });

    const response = await apiFetch('/api/admin/courts/court-1', {
      method: 'PATCH',
      body: JSON.stringify({ isActive: false })
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCallHeaders = fetchMock.mock.calls[1][1].headers as Headers;
    expect(secondCallHeaders.get('x-action-proof')).toBe(token);

    unsubscribe();
    vi.unstubAllGlobals();
  });

  it('apiFetch throws ActionProofCancelledError when user cancels modal', async () => {
    const fetchMock = vi.fn();

    // First call returns 403 ACTION_PROOF_REQUIRED
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 'ACTION_PROOF_REQUIRED', message: 'Action proof required' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    // Hook modal listener and cancel
    const unsubscribe = subscribeActionProofModal((req: ActionProofRequest | null) => {
      if (req) {
        req.reject(new ActionProofCancelledError());
      }
    });

    let caughtError: unknown = null;
    try {
      await apiFetch('/api/admin/courts/court-1', {
        method: 'PATCH',
        body: JSON.stringify({ isActive: false })
      });
    } catch (err: unknown) {
      caughtError = err;
    }

    expect(caughtError).not.toBeNull();
    expect(isActionProofCancelled(caughtError)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    unsubscribe();
    vi.unstubAllGlobals();
  });
});
