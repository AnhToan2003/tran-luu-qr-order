import React from 'react';
import { sound, RingtoneStyle } from '../../../lib/sound';

interface SettingsTabProps {
  isAcceptingOrders: boolean;
  onToggleAcceptingOrders: () => void;
  isSoundActive: boolean;
  onToggleSound: () => void;
  isVoiceActive: boolean;
  onToggleVoice: () => void;
  soundVolume: number;
  onSetVolume: (vol: number) => void;
  ringtoneStyle: RingtoneStyle;
  onSetRingtone: (style: RingtoneStyle) => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  isAcceptingOrders,
  onToggleAcceptingOrders,
  isSoundActive,
  onToggleSound,
  isVoiceActive,
  onToggleVoice,
  soundVolume,
  onSetVolume,
  ringtoneStyle,
  onSetRingtone
}) => {
  return (
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* HEADER */}
      <div>
        <h2 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--color-deep)', margin: 0 }}>
          Cài Đặt Chung
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748B' }}>
          Quản lý vận hành nhận đơn, âm thanh chuông báo và giọng đọc tiếng Việt của quầy
        </p>
      </div>

      {/* CÀI ĐẶT VẬN HÀNH & CHUÔNG BÁO */}
      <div style={{
        backgroundColor: '#FFFFFF',
        padding: '24px',
        borderRadius: '12px',
        border: '1px solid #E2E8F0',
        display: 'flex',
        flexDirection: 'column',
        gap: '22px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
      }}>
        {/* 1. Công tắc nhận đơn */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '18px', borderBottom: '1px solid #F1F5F9' }}>
          <div>
            <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '15px' }}>Công tắc nhận đơn toàn sân</div>
            <div style={{ fontSize: '13px', color: '#64748B', marginTop: '3px' }}>
              Khi tạm tắt, khách quét mã QR tại sân sẽ thấy thông báo quầy đang tạm ngưng phục vụ
            </div>
          </div>
          <button
            onClick={onToggleAcceptingOrders}
            style={{
              padding: '8px 22px',
              borderRadius: '8px',
              backgroundColor: isAcceptingOrders ? 'var(--color-primary)' : '#EF4444',
              color: '#FFFFFF',
              fontWeight: 800,
              fontSize: '13px',
              border: 'none',
              cursor: 'pointer',
              boxShadow: isAcceptingOrders ? '0 2px 6px rgba(10, 107, 74, 0.25)' : 'none'
            }}
          >
            {isAcceptingOrders ? 'ĐANG MỞ' : 'TẠM TẮT'}
          </button>
        </div>

        {/* 2. Chuông báo quầy */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '18px', borderBottom: '1px solid #F1F5F9' }}>
          <div>
            <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '15px' }}>Chuông báo quầy khi có đơn mới</div>
            <div style={{ fontSize: '13px', color: isSoundActive ? '#16A34A' : '#64748B', marginTop: '3px', fontWeight: 600 }}>
              {isSoundActive ? 'Chuông đang bật (phát âm thanh tức thời khi khách gọi nước)' : 'Chuông đang tắt (không phát âm thanh)'}
            </div>
          </div>
          <button
            onClick={onToggleSound}
            style={{
              padding: '8px 22px',
              borderRadius: '8px',
              backgroundColor: isSoundActive ? 'var(--color-primary)' : '#EF4444',
              color: '#FFFFFF',
              fontWeight: 800,
              fontSize: '13px',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            {isSoundActive ? 'ĐANG BẬT' : 'ĐANG TẮT'}
          </button>
        </div>

        {/* 3. Ringtone style */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '18px', borderBottom: '1px solid #F1F5F9', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '15px' }}>Giai điệu nhạc chuông báo đơn</div>
            <div style={{ fontSize: '13px', color: '#64748B', marginTop: '3px' }}>
              Chọn giai điệu vui tai, nhận biết từ xa khi đang bận pha chế hoặc nhặt cầu
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {[
              { id: 'classic', label: 'Sound 1 (Chuông ngân)' },
              { id: 'chime', label: 'Sound 2 (Nhịp vui)' },
              { id: 'urgent', label: 'Sound 3 (Báo động nhanh)' },
              { id: 'gentle', label: 'Sound 4 (Êm dịu)' }
            ].map(rt => (
              <button
                key={rt.id}
                onClick={() => {
                  onSetRingtone(rt.id as RingtoneStyle);
                  sound.playOrderChime({ style: rt.id as RingtoneStyle, withVoice: false });
                }}
                style={{
                  padding: '7px 14px',
                  borderRadius: '6px',
                  backgroundColor: ringtoneStyle === rt.id ? 'var(--color-primary)' : '#F8FAFC',
                  color: ringtoneStyle === rt.id ? '#FFFFFF' : '#0F172A',
                  fontWeight: 800,
                  fontSize: '12px',
                  border: '1px solid #CBD5E1',
                  cursor: 'pointer'
                }}
              >
                {rt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 4. Volume level */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '18px', borderBottom: '1px solid #F1F5F9', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '15px' }}>Âm lượng chuông quầy</div>
            <div style={{ fontSize: '13px', color: '#64748B', marginTop: '3px' }}>
              Điều chỉnh âm lượng phù hợp với không gian sân cầu lông
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {[
              { label: '100% (Lớn nhất)', value: 1.0 },
              { label: '80% (Vừa)', value: 0.8 },
              { label: '50% (Nhẹ)', value: 0.5 }
            ].map(lvl => (
              <button
                key={lvl.value}
                onClick={() => onSetVolume(lvl.value)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  backgroundColor: Math.abs(soundVolume - lvl.value) < 0.05 ? 'var(--color-primary)' : '#F8FAFC',
                  color: Math.abs(soundVolume - lvl.value) < 0.05 ? '#FFFFFF' : '#0F172A',
                  fontWeight: 800,
                  fontSize: '12px',
                  border: '1px solid #CBD5E1',
                  cursor: 'pointer'
                }}
              >
                {lvl.label}
              </button>
            ))}
          </div>
        </div>

        {/* 5. Voice announcement */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '15px' }}>Đọc thông báo tiếng Việt trên loa</div>
            <div style={{ fontSize: '13px', color: isVoiceActive ? '#16A34A' : '#64748B', marginTop: '3px', fontWeight: 600 }}>
              {isVoiceActive ? 'Giọng nói đang bật ("Thông báo! Quầy ơi có đơn hàng tại sân...")' : 'Giọng nói đang tắt (chỉ phát tiếng chuông)'}
            </div>
          </div>
          <button
            onClick={onToggleVoice}
            style={{
              padding: '8px 22px',
              borderRadius: '8px',
              backgroundColor: isVoiceActive ? 'var(--color-primary)' : '#F1F5F9',
              color: isVoiceActive ? '#FFFFFF' : '#0F172A',
              fontWeight: 800,
              fontSize: '13px',
              border: '1px solid #CBD5E1',
              cursor: 'pointer'
            }}
          >
            {isVoiceActive ? 'ĐANG BẬT' : 'BẬT ĐỌC LOA'}
          </button>
        </div>
      </div>
    </div>
  );
};