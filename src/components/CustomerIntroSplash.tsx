import React, { useState, useEffect } from 'react';

interface CustomerIntroSplashProps {
  courtCode: string;
  courtName?: string;
  isReady: boolean;
  errorMessage?: string;
  onFinish: () => void;
}

export const CustomerIntroSplash: React.FC<CustomerIntroSplashProps> = ({
  courtCode,
  courtName,
  isReady,
  errorMessage,
  onFinish
}) => {
  const [minTimerDone, setMinTimerDone] = useState(false);
  const [progress, setProgress] = useState(25);
  const [phase, setPhase] = useState<'loading' | 'success' | 'fading'>('loading');

  // Định dạng tên sân hiển thị thân thiện ngay tức thì
  const displayCourt = courtName || (courtCode
    ? (courtCode.toLowerCase().startsWith('sân') ? courtCode : `Sân ${courtCode}`)
    : 'Sân Cầu Lông');

  // 1. Đồng hồ thời gian tối thiểu (750ms) để khách kịp nhìn nhận diện thương hiệu
  useEffect(() => {
    const timer = setTimeout(() => {
      setMinTimerDone(true);
    }, 750);
    return () => clearTimeout(timer);
  }, []);

  // 2. Mô phỏng thanh tiến trình mượt mà trong lúc chờ API hoàn tất
  useEffect(() => {
    if (phase !== 'loading' || errorMessage) return;
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 88) {
          clearInterval(interval);
          return 88;
        }
        return prev + Math.floor(Math.random() * 8) + 6;
      });
    }, 120);
    return () => clearInterval(interval);
  }, [phase, errorMessage]);

  // 3. BƯỚC 1: Khi DỮ LIỆU ĐÃ SẴN SÀNG và ĐỦ THỜI GIAN TỐI THIỂU -> Chuyển sang phase 'success'
  useEffect(() => {
    if (isReady && minTimerDone && phase === 'loading' && !errorMessage) {
      setProgress(100);
      setPhase('success');
    }
  }, [isReady, minTimerDone, phase, errorMessage]);

  // 4. BƯỚC 2: Khi đã ở phase 'success' -> Giữ thông báo kết nối thành công 350ms rồi bắt đầu mờ dần 'fading'
  useEffect(() => {
    if (phase === 'success') {
      const timer = setTimeout(() => {
        setPhase('fading');
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  // 5. BƯỚC 3: Khi đang ở phase 'fading' -> Chờ hiệu ứng CSS mờ dần 300ms rồi gọi onFinish()
  useEffect(() => {
    if (phase === 'fading') {
      const timer = setTimeout(() => {
        onFinish();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [phase, onFinish]);

  // 6. Cơ chế an toàn (Fallback): Nếu sau 3.0s vẫn chưa xong -> Tự động fade-out vào trang
  useEffect(() => {
    const fallbackTimer = setTimeout(() => {
      if (!errorMessage) {
        setProgress(100);
        setPhase('fading');
      }
    }, 3000);
    return () => clearTimeout(fallbackTimer);
  }, [errorMessage]);

  return (
    <div
      role="dialog"
      aria-label="Màn hình khởi động phiên gọi nước"
      onClick={() => {
        // Cho phép bấm vào màn hình nếu đã kết nối thành công hoặc lỗi để vào nhanh
        if (phase === 'success') {
          setPhase('fading');
        }
      }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
        background: 'radial-gradient(circle at 50% 36%, #0D4530 0%, #06281B 65%, #02140D 100%)',
        color: '#FFFFFF',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 20px',
        boxSizing: 'border-box',
        overflow: 'hidden',
        transition: 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        opacity: phase === 'fading' ? 0 : 1,
        transform: phase === 'fading' ? 'scale(1.05)' : 'scale(1)',
        pointerEvents: phase === 'fading' ? 'none' : 'auto'
      }}
    >
      <style>{`
        @keyframes introLogoPulse {
          0% { transform: scale(1); box-shadow: 0 0 25px rgba(16, 185, 129, 0.35); }
          50% { transform: scale(1.04); box-shadow: 0 0 45px rgba(16, 185, 129, 0.65); }
          100% { transform: scale(1); box-shadow: 0 0 25px rgba(16, 185, 129, 0.35); }
        }
        @keyframes introBadgeGlow {
          0% { border-color: rgba(52, 211, 153, 0.4); }
          50% { border-color: rgba(52, 211, 153, 0.9); }
          100% { border-color: rgba(52, 211, 153, 0.4); }
        }
      `}</style>

      {/* VÒNG TRÒN LOGO THƯƠNG HIỆU */}
      <div
        style={{
          width: '124px',
          height: '124px',
          borderRadius: '50%',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '3.5px solid #10B981',
          backgroundColor: '#09251B',
          animation: 'introLogoPulse 2.2s infinite ease-in-out',
          marginBottom: '22px',
          flexShrink: 0
        }}
      >
        <img
          src="/images/logo.jpg"
          alt="Sân Cầu Lông Trần Lựu"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: 'scale(1.15)',
            display: 'block'
          }}
        />
      </div>

      {/* TÊN THƯƠNG HIỆU */}
      <div style={{ textAlign: 'center', marginBottom: '18px' }}>
        <h1
          style={{
            fontSize: '22px',
            fontWeight: 900,
            color: '#FFFFFF',
            margin: '0 0 6px 0',
            letterSpacing: '0.01em',
            textTransform: 'uppercase'
          }}
        >
          Sân Cầu Lông Trần Lựu
        </h1>
        <p
          style={{
            fontSize: '13px',
            color: '#A7F3D0',
            margin: 0,
            fontWeight: 600,
            letterSpacing: '0.02em'
          }}
        >
          Hệ thống gọi món phục vụ tận sân
        </p>
      </div>

      {/* HUY HIỆU CÁ NHÂN HÓA SÂN VỪA QUÉT */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 20px',
          borderRadius: '999px',
          backgroundColor: 'rgba(6, 78, 59, 0.65)',
          border: '1.5px solid rgba(52, 211, 153, 0.5)',
          backdropFilter: 'blur(8px)',
          animation: 'introBadgeGlow 2s infinite ease-in-out',
          marginBottom: '24px'
        }}
      >
        <span style={{ fontSize: '13px', color: '#D1FAE5', fontWeight: 600 }}>
          Vị trí:
        </span>
        <span
          style={{
            fontSize: '16px',
            fontWeight: 900,
            color: '#34D399',
            textTransform: 'uppercase',
            letterSpacing: '0.03em'
          }}
        >
          {displayCourt}
        </span>
      </div>

      {/* THANH TIẾN TRÌNH & TRẠNG THÁI */}
      {!errorMessage ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '100%',
            maxWidth: '260px'
          }}
        >
          {/* Thanh chạy Loading bar */}
          <div
            style={{
              width: '100%',
              height: '5px',
              backgroundColor: 'rgba(255, 255, 255, 0.12)',
              borderRadius: '999px',
              overflow: 'hidden',
              marginBottom: '12px'
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                height: '100%',
                background: phase === 'success' || phase === 'fading'
                  ? 'linear-gradient(90deg, #10B981, #34D399)'
                  : 'linear-gradient(90deg, #059669 0%, #10B981 60%, #34D399 100%)',
                borderRadius: '999px',
                transition: 'width 0.22s ease-out'
              }}
            />
          </div>

          {/* Dòng chữ trạng thái */}
          <div
            style={{
              fontSize: '12px',
              color: phase === 'success' || phase === 'fading' ? '#34D399' : '#94A3B8',
              fontWeight: 700,
              minHeight: '18px',
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {phase === 'success' || phase === 'fading' ? (
              <>
                <span style={{ fontSize: '14px' }}>✓</span> Kết nối thành công!
              </>
            ) : (
              'Đang thiết lập phiên gọi món bảo mật...'
            )}
          </div>
        </div>
      ) : (
        /* HỘP BÁO LỖI NẾU QR SAI HOẶC MẠNG HỎNG */
        <div
          style={{
            maxWidth: '340px',
            padding: '14px 18px',
            backgroundColor: 'rgba(153, 27, 27, 0.85)',
            border: '1.5px solid #F87171',
            borderRadius: '14px',
            textAlign: 'center',
            backdropFilter: 'blur(8px)'
          }}
        >
          <div style={{ fontSize: '14px', fontWeight: 800, color: '#FEE2E2', marginBottom: '6px' }}>
            ⚠️ Không thể kết nối tới sân
          </div>
          <div style={{ fontSize: '12px', color: '#FCA5A5', marginBottom: '12px', lineHeight: 1.4 }}>
            {errorMessage}
          </div>
          <button
            type="button"
            onClick={onFinish}
            style={{
              padding: '6px 16px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#FFFFFF',
              color: '#991B1B',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            Đóng thông báo
          </button>
        </div>
      )}
    </div>
  );
};
