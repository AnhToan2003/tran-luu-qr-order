import React, { useState } from 'react';

interface TemporaryCredential {
  username: string;
  userId?: string;
  tempPassword: string;
}

interface TemporaryCredentialsModalProps {
  credentials: TemporaryCredential[];
  onClose: () => void;
}

export const TemporaryCredentialsModal: React.FC<TemporaryCredentialsModalProps> = ({
  credentials,
  onClose
}) => {
  const [copiedMap, setCopiedMap] = useState<Record<string, boolean>>({});
  const [copiedAll, setCopiedAll] = useState(false);

  const copySingle = async (username: string, pass: string) => {
    try {
      await navigator.clipboard.writeText(`${username}: ${pass}`);
      setCopiedMap(prev => ({ ...prev, [username]: true }));
      setTimeout(() => {
        setCopiedMap(prev => ({ ...prev, [username]: false }));
      }, 2000);
    } catch {
      alert('Không thể truy cập Clipboard. Vui lòng sao chép thủ công.');
    }
  };

  const copyAll = async () => {
    try {
      const content = credentials.map(c => `Tài khoản: ${c.username} | Mật khẩu tạm: ${c.tempPassword}`).join('\n');
      await navigator.clipboard.writeText(content);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2500);
    } catch {
      alert('Không thể sao chép toàn bộ.');
    }
  };

  const downloadTxt = () => {
    const header = `# DANH SÁCH MẬT KHẨU TẠM THỜI TÀI KHOẢN HỆ THỐNG\n# Thời gian tạo: ${new Date().toLocaleString('vi-VN')}\n# Lưu ý: Mật khẩu này chỉ được cấp 1 lần. Nhân viên cần đổi mật khẩu tại lần đăng nhập đầu tiên.\n\n`;
    const rows = credentials.map((c, i) => `${i + 1}. Tài khoản: ${c.username}\n   Mật khẩu tạm: ${c.tempPassword}\n`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mat_khau_tam_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '16px'
    }}>
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        maxWidth: '560px',
        width: '100%',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #E5E7EB',
          backgroundColor: '#F9FAFB'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>🔑</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#111827' }}>
                Cấp Phát Mật Khẩu Tạm Thời ({credentials.length} tài khoản)
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#4B5563' }}>
                Hệ thống đã phục hồi tài khoản và sinh mật khẩu ngẫu nhiên an toàn.
              </p>
            </div>
          </div>
        </div>

        {/* Warning Alert */}
        <div style={{
          margin: '16px 24px 8px',
          padding: '12px 16px',
          backgroundColor: '#FEF2F2',
          border: '1px solid #FCA5A5',
          borderRadius: '8px',
          display: 'flex',
          gap: '10px',
          alignItems: 'flex-start'
        }}>
          <span style={{ fontSize: '18px' }}>⚠️</span>
          <div style={{ fontSize: '12px', color: '#991B1B', lineHeight: '1.5' }}>
            <strong>LƯU Ý QUAN TRỌNG:</strong> Danh sách mật khẩu này <u>CHỈ XUẤT HIỆN DUY NHẤT 1 LẦN NÀY</u> và không được lưu trên trình duyệt vì lý do bảo mật. Vui lòng tải file hoặc sao chép ngay để phân phối cho nhân viên.
          </div>
        </div>

        {/* Credentials Table */}
        <div style={{ padding: '8px 24px', overflowY: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #E5E7EB', textAlign: 'left', color: '#6B7280' }}>
                <th style={{ padding: '8px 12px' }}>Tài khoản</th>
                <th style={{ padding: '8px 12px' }}>Mật khẩu tạm</th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {credentials.map(c => (
                <tr key={c.username} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1F2937' }}>
                    {c.username}
                  </td>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '14px', color: '#2563EB', fontWeight: 700 }}>
                    {c.tempPassword}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <button
                      onClick={() => void copySingle(c.username, c.tempPassword)}
                      style={{
                        padding: '4px 10px',
                        fontSize: '12px',
                        borderRadius: '6px',
                        border: '1px solid #D1D5DB',
                        background: copiedMap[c.username] ? '#D1FAE5' : '#FFFFFF',
                        color: copiedMap[c.username] ? '#065F46' : '#374151',
                        cursor: 'pointer',
                        fontWeight: 600
                      }}
                    >
                      {copiedMap[c.username] ? '✓ Đã chép' : 'Sao chép'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer Actions */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #E5E7EB',
          backgroundColor: '#F9FAFB',
          display: 'flex',
          gap: '12px',
          justifyContent: 'space-between',
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => void copyAll()}
              style={{
                padding: '8px 14px',
                fontSize: '13px',
                borderRadius: '8px',
                border: '1px solid #2563EB',
                background: copiedAll ? '#10B981' : '#2563EB',
                color: '#FFFFFF',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              {copiedAll ? '✓ Đã chép toàn bộ' : '📋 Chép toàn bộ'}
            </button>
            <button
              onClick={downloadTxt}
              style={{
                padding: '8px 14px',
                fontSize: '13px',
                borderRadius: '8px',
                border: '1px solid #D1D5DB',
                background: '#FFFFFF',
                color: '#374151',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              📥 Tải file .txt
            </button>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '8px 18px',
              fontSize: '13px',
              borderRadius: '8px',
              border: 'none',
              background: '#4B5563',
              color: '#FFFFFF',
              cursor: 'pointer',
              fontWeight: 700
            }}
          >
            Đã lưu & Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
