import React, { useState, useEffect } from 'react';
import { AdminPasswordConfirmModal } from './AdminPasswordConfirmModal';
import { subscribeActionProofModal, ActionProofRequest } from '../lib/actionProofModal';

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
      title={request.title || 'Xác Nhận Mật Khẩu Quản Trị'}
      actionDescription={request.description || 'Thao tác này cần xác nhận mật khẩu quản trị. Vui lòng nhập mật khẩu:'}
      confirmButtonText={request.confirmButtonText || 'Xác Nhận Mật Khẩu'}
      action={request.action}
      onClose={() => {
        request.reject(new Error('Đã hủy xác nhận mật khẩu quản trị.'));
      }}
      onSuccess={(proofToken) => {
        request.resolve(proofToken || '');
      }}
    />
  );
};
