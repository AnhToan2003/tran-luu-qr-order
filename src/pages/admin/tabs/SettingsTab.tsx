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
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: 'var(--color-deep)', marginBottom: '16px' }}>
        Cài Đặt Hệ Thống Vận Hành
      </h2>

      <div style={{ backgroundColor: 'var(--color-surface)', padding: '20px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* 1. Accepting orders */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '16px', borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <div style={{ fontWeight: 800, color: 'var(--color-deep)', fontSize: 'var(--font-size-md)' }}>Công tắc nhận đơn toàn sân</div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              Khi tắt, khách quét mã QR sẽ nhận thông báo quầy đang tạm ngưng nhận món
            </div>
          </div>
          <button
            onClick={onToggleAcceptingOrders}
            style={{
              padding: '8px 18px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: isAcceptingOrders ? 'var(--color-primary)' : '#EF4444',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: 'var(--font-size-sm)',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            {isAcceptingOrders ? 'ĐANG MỞ' : 'TẠM TẮT'}
          </button>
        </div>

        {/* 2. Sound notification toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '16px', borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <div style={{ fontWeight: 800, color: 'var(--color-deep)', fontSize: 'var(--font-size-md)' }}>Chuông báo quầy khi có đơn mới</div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: isSoundActive ? '#16A34A' : 'var(--color-text-muted)', marginTop: '2px', fontWeight: 600 }}>
              {isSoundActive ? 'Chuông đang bật (phát âm tức thời khi khách đặt nước)' : 'Chuông đang tắt'}
            </div>
          </div>
          <button
            onClick={onToggleSound}
            style={{
              padding: '8px 18px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: isSoundActive ? 'var(--color-primary)' : 'var(--color-bg)',
              color: isSoundActive ? '#FFFFFF' : 'var(--color-deep)',
              fontWeight: 700,
              fontSize: 'var(--font-size-sm)',
              border: '1px solid var(--color-border)',
              cursor: 'pointer'
            }}
          >
            {isSoundActive ? 'ĐANG BẬT' : 'BẬT CHUÔNG'}
          </button>
        </div>

        {/* 3. Ringtone Style Selector */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: '16px', borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <div style={{ fontWeight: 800, color: 'var(--color-deep)', fontSize: 'var(--font-size-md)' }}>Giai điệu nhạc chuông báo đơn</div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              Chọn giai điệu nổi bật, vui tai giúp nhân viên nhận biết ngay từ xa
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', minWidth: '320px' }}>
            {[
              { id: 'sound1', label: 'Sound 1' },
              { id: 'sound2', label: 'Sound 2' },
              { id: 'sound3', label: 'Sound 3' },
              { id: 'sound4', label: 'Sound 4' },
            ].map(item => (
              <button
                key={item.id}
                onClick={() => {
                  onSetRingtone(item.id as RingtoneStyle);
                  sound.enableSound();
                  sound.playOrderChime({ style: item.id as RingtoneStyle, withVoice: false });
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: ringtoneStyle === item.id ? 'var(--color-primary)' : 'var(--color-bg)',
                  color: ringtoneStyle === item.id ? '#FFFFFF' : 'var(--color-deep)',
                  fontWeight: 700,
                  fontSize: 'var(--font-size-xs)',
                  border: '1px solid var(--color-border)',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.15s ease'
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* 4. Sound Volume selector */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '16px', borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <div style={{ fontWeight: 800, color: 'var(--color-deep)', fontSize: 'var(--font-size-md)' }}>Mức âm lượng chuông quầy</div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              Điều chỉnh độ to của chuông để phù hợp với độ ồn tại sân cầu lông
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {[
              { label: '100% (Lớn nhất)', value: 1.0 },
              { label: '80% (Vừa)', value: 0.8 },
              { label: '50% (Nhẹ)', value: 0.5 },
            ].map(lvl => (
              <button
                key={lvl.value}
                onClick={() => onSetVolume(lvl.value)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: Math.abs(soundVolume - lvl.value) < 0.05 ? 'var(--color-primary)' : 'var(--color-bg)',
                  color: Math.abs(soundVolume - lvl.value) < 0.05 ? '#FFFFFF' : 'var(--color-deep)',
                  fontWeight: 700,
                  fontSize: 'var(--font-size-xs)',
                  border: '1px solid var(--color-border)',
                  cursor: 'pointer'
                }}
              >
                {lvl.label}
              </button>
            ))}
          </div>
        </div>

        {/* 5. Voice announcement toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '16px', borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <div style={{ fontWeight: 800, color: 'var(--color-deep)', fontSize: 'var(--font-size-md)' }}>Đọc loa thông báo tiếng Việt</div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: isVoiceActive ? '#16A34A' : 'var(--color-text-muted)', marginTop: '2px', fontWeight: 600 }}>
              {isVoiceActive ? 'Tự động đọc to rõ: "Thông báo! Quầy ơi, có đơn hàng mới tại sân..."' : 'Giọng nói đang tắt (chỉ reo chuông)'}
            </div>
          </div>
          <button
            onClick={onToggleVoice}
            style={{
              padding: '8px 18px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: isVoiceActive ? 'var(--color-primary)' : 'var(--color-bg)',
              color: isVoiceActive ? '#FFFFFF' : 'var(--color-deep)',
              fontWeight: 700,
              fontSize: 'var(--font-size-sm)',
              border: '1px solid var(--color-border)',
              cursor: 'pointer'
            }}
          >
            {isVoiceActive ? 'ĐANG BẬT' : 'BẬT ĐỌC LOA'}
          </button>
        </div>

        {/* 6. Sound test */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 800, color: 'var(--color-deep)', fontSize: 'var(--font-size-md)' }}>Kiểm tra âm thanh thực tế</div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              Phát giai điệu chuông đã chọn cùng giọng đọc mẫu để kiểm tra độ rõ trên loa quầy
            </div>
          </div>
          <button
            onClick={() => {
              sound.enableSound();
              sound.playOrderChime({
                withVoice: isVoiceActive,
                courtId: '05'
              });
            }}
            style={{
              padding: '10px 20px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-primary-light)',
              color: 'var(--color-primary)',
              border: '1px solid var(--color-primary)',
              fontWeight: 700,
              fontSize: 'var(--font-size-sm)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            Phát Thử Chuông & Giọng Nói
          </button>
        </div>
      </div>
    </div>
  );
};