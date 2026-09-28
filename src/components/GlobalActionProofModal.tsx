import React, { useState, useEffect } from 'react';
import { AdminPasswordConfirmModal } from './AdminPasswordConfirmModal';
import { subscribeActionProofModal, ActionProofRequest, ActionProofCancelledError } from '../lib/actionProofModal';

export const GlobalActionProofModal: React.FC = () => {
  const [request, setRequest] = useState<ActionProofRequest | null>(null);

  useEffect(() => {
    return subscribeActionProofModal(req => {
      setRequest(req);
    });
  }, []);

  if (!request) return null;

  return (
    <AdminPasswordConfirmModal
      isOpen={Boolean(request)}
      title={request.title || 'Xác Nhận Quyền Thao Tác'}
      actionDescription={request.description || 'Thao tác này cần xác nhận mật khẩu tài khoản của bạn để thực hiện. Vui lòng nhập mật khẩu:'}
      confirmButtonText={request.confirmButtonText || 'Xác Nhận Mật Khẩu'}
      action={request.action}
      onClose={() => {
        request.reject(new ActionProofCancelledError('Thao tác đã được hủy bởi quản trị viên.'));
      }}
      onSuccess={(proofToken) => {
        request.resolve(proofToken || '');
      }}
    />
  );
};
