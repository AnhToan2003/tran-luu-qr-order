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
  // Cho phép intro diễn ra chậm rãi, mãn nhãn trong 1.6s để người dùng thưởng thức hiệu ứng bay lượn
  const [minTimerDone, setMinTimerDone] = useState(false);
  const [progress, setProgress] = useState(15);
  const [phase, setPhase] = useState<'loading' | 'success' | 'fading'>('loading');

  const displayCourt = courtName || (courtCode
    ? (courtCode.toLowerCase().startsWith('sân') ? courtCode : `Sân ${courtCode}`)
    : 'Sân Cầu Lông');

  // 1. Nhịp đồng hồ tối thiểu 1600ms để hoạt ảnh bay lượn trình diễn êm ái
  useEffect(() => {
    const timer = setTimeout(() => {
      setMinTimerDone(true);
    }, 1600);
    return () => clearTimeout(timer);
  }, []);

  // 2. Tiến trình chạy êm ái, nhịp nhàng theo thời gian
  useEffect(() => {
    if (phase !== 'loading' || errorMessage) return;
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 92) {
          clearInterval(interval);
          return 92;
        }
        return prev + Math.floor(Math.random() * 5) + 4;
      });
    }, 110);
    return () => clearInterval(interval);
  }, [phase, errorMessage]);

  // 3. Khi DỮ LIỆU ĐÃ SẴN SÀNG và ĐỦ THỜI GIAN -> Chuyển phase success
  useEffect(() => {
    if (isReady && minTimerDone && phase === 'loading' && !errorMessage) {
      setProgress(100);
      setPhase('success');
    }
  }, [isReady, minTimerDone, phase, errorMessage]);

  // 4. Giữ khoảnh khắc hoàn thành 400ms để người dùng cảm nhận kết nối thành công
  useEffect(() => {
    if (phase === 'success') {
      const timer = setTimeout(() => {
        setPhase('fading');
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  // 5. Fade out mượt mà 360ms
  useEffect(() => {
    if (phase === 'fading') {
      const timer = setTimeout(() => {
        onFinish();
      }, 360);
      return () => clearTimeout(timer);
    }
  }, [phase, onFinish]);

  // 6. Fallback an toàn (3.5s)
  useEffect(() => {
    const fallbackTimer = setTimeout(() => {
      if (!errorMessage) {
        setProgress(100);
        setPhase('fading');
      }
    }, 3500);
    return () => clearTimeout(fallbackTimer);
  }, [errorMessage]);

  return (
    <div
      role="dialog"
      aria-label="Màn hình khởi động phiên gọi nước"
      onClick={() => {
        // Cho phép chạm bất kỳ lúc nào để bỏ qua nhanh
        if (phase === 'success' || (minTimerDone && isReady)) {
          setPhase('fading');
        } else if (phase === 'loading') {
          setProgress(98);
          setMinTimerDone(true);
        }
      }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
        background: '#04160E',
        backgroundImage: 'radial-gradient(circle at 50% 36%, #0E3E2A 0%, #062216 55%, #020C08 100%)',
        color: '#FFFFFF',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 20px',
        boxSizing: 'border-box',
        overflow: 'hidden',
        transition: 'opacity 0.36s cubic-bezier(0.4, 0, 0.2, 1), transform 0.36s cubic-bezier(0.4, 0, 0.2, 1)',
        opacity: phase === 'fading' ? 0 : 1,
        transform: phase === 'fading' ? 'scale(1.05)' : 'scale(1)',
        pointerEvents: phase === 'fading' ? 'none' : 'auto',
        userSelect: 'none'
      }}
    >
      <style>{`
        /* ================= VŨ ĐIỆU CẦU LÔNG & NĂNG LƯỢNG THỂ THAO BAY LƯỢN ================= */

        /* 1. Quả cầu lông chính bay lượn theo đường cong khí động học (Glide 1) */
        @keyframes shuttleGlide1 {
          0% {
            transform: translate(-180px, -60px) rotate(-35deg) scale(0.65);
            opacity: 0;
          }
          20% {
            opacity: 0.85;
          }
          50% {
            transform: translate(-10px, 30px) rotate(15deg) scale(0.95);
            opacity: 0.95;
          }
          80% {
            opacity: 0.8;
          }
          100% {
            transform: translate(190px, -80px) rotate(55deg) scale(0.7);
            opacity: 0;
          }
        }

        /* 2. Quả cầu lông thứ hai bay lượn ngược chiều ở tầng sâu (Glide 2) */
        @keyframes shuttleGlide2 {
          0% {
            transform: translate(160px, 120px) rotate(145deg) scale(0.5);
            opacity: 0;
          }
          25% {
            opacity: 0.6;
          }
          60% {
            transform: translate(-40px, -30px) rotate(110deg) scale(0.75);
            opacity: 0.75;
          }
          85% {
            opacity: 0.5;
          }
          100% {
            transform: translate(-180px, 100px) rotate(85deg) scale(0.45);
            opacity: 0;
          }
        }

        /* 3. Dải lụa ánh sáng vung vợt (Ribbon Trail Flow) */
        @keyframes ribbonFlow {
          0% {
            stroke-dashoffset: 1000;
            opacity: 0.2;
          }
          50% {
            opacity: 0.75;
          }
          100% {
            stroke-dashoffset: 0;
            opacity: 0.2;
          }
        }

        /* 4. Logo lơ lửng 3D nhấp nhô êm ái (Levitating Float) */
        @keyframes logoLevitate {
          0%, 100% {
            transform: translateY(0) scale(1);
          }
          50% {
            transform: translateY(-9px) scale(1.02);
          }
        }

        /* 5. Vòng hạt năng lượng quay quanh logo (Orbital Ring Rotation) */
        @keyframes orbitSpin {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }

        /* 6. Hạt bụi ánh sáng phát quang bồng bềnh (Floating Energy Sparks) */
        @keyframes sparkFloat1 {
          0%, 100% {
            transform: translate(0, 0) scale(1);
            opacity: 0.3;
          }
          50% {
            transform: translate(25px, -35px) scale(1.4);
            opacity: 0.9;
          }
        }
        @keyframes sparkFloat2 {
          0%, 100% {
            transform: translate(0, 0) scale(1);
            opacity: 0.4;
          }
          50% {
            transform: translate(-30px, -45px) scale(1.3);
            opacity: 0.85;
          }
        }
        @keyframes sparkFloat3 {
          0%, 100% {
            transform: translate(0, 0) scale(1);
            opacity: 0.25;
          }
          50% {
            transform: translate(20px, 30px) scale(1.5);
            opacity: 0.8;
          }
        }

        /* 8. Hiệu ứng chữ ánh kim & Neon siêu sáng */
        @keyframes titleNeonGlow {
          0%, 100% {
            filter: drop-shadow(0 0 10px rgba(213, 239, 118, 0.8)) drop-shadow(0 0 25px rgba(213, 239, 118, 0.5)) drop-shadow(0 0 45px rgba(16, 185, 129, 0.4));
            transform: scale(1);
          }
          50% {
            filter: drop-shadow(0 0 18px rgba(213, 239, 118, 1)) drop-shadow(0 0 35px rgba(213, 239, 118, 0.85)) drop-shadow(0 0 65px rgba(16, 185, 129, 0.7));
            transform: scale(1.025);
          }
        }

        /* 9. Vệt sáng Laser quét qua chữ (Laser Light Sweep) */
        @keyframes laserSweep {
          0% {
            background-position: -200% center;
          }
          100% {
            background-position: 200% center;
          }
        }

        /* 10. Quầng sáng phía sau chữ (Backlight Pulse) */
        @keyframes backlightPulse {
          0%, 100% {
            opacity: 0.55;
            transform: translate(-50%, -50%) scale(0.95);
          }
          50% {
            opacity: 0.95;
            transform: translate(-50%, -50%) scale(1.15);
          }
        }
      `}</style>

      {/* ================= LỚP NỀN: CÁC DẢI SÁNG ĐƯỜNG CẦU (SWOOSH RIBBONS) ================= */}
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 1
        }}
        viewBox="0 0 400 700"
        fill="none"
      >
        <defs>
          <linearGradient id="ribbonGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10B981" stopOpacity="0" />
            <stop offset="40%" stopColor="#10B981" stopOpacity="0.8" />
            <stop offset="70%" stopColor="#D5EF76" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#D5EF76" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="ribbonGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#D5EF76" stopOpacity="0" />
            <stop offset="50%" stopColor="#34D399" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#059669" stopOpacity="0" />
          </linearGradient>
          <filter id="ribbonGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Dải cong uốn lượn 1: tượng trưng cho cú bỏ nhỏ / chém cầu mượt mà */}
        <path
          d="M -50 220 C 120 160, 280 420, 450 320"
          stroke="url(#ribbonGrad1)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray="600"
          filter="url(#ribbonGlow)"
          style={{ animation: 'ribbonFlow 6s infinite linear' }}
        />

        {/* Dải cong uốn lượn 2: tượng trưng cho cú phông cầu cao sâu */}
        <path
          d="M 450 180 C 260 280, 100 120, -50 380"
          stroke="url(#ribbonGrad2)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="500"
          filter="url(#ribbonGlow)"
          style={{ animation: 'ribbonFlow 8s infinite linear reverse' }}
        />
      </svg>

      {/* ================= LỚP CÁC QUẢ CẦU LÔNG NGHỆ THUẬT BAY LƯỢN ================= */}

      {/* QUẢ CẦU 1: Bay lướt vòng cung qua tâm với vệt sáng rực rỡ */}
      <div
        style={{
          position: 'absolute',
          top: '36%',
          left: '50%',
          width: '54px',
          height: '70px',
          pointerEvents: 'none',
          zIndex: 4,
          animation: 'shuttleGlide1 5.5s infinite cubic-bezier(0.4, 0, 0.2, 1)'
        }}
      >
        {/* Vệt sáng khí động học theo sau đuôi cầu */}
        <div
          style={{
            position: 'absolute',
            top: '-45px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '10px',
            height: '75px',
            background: 'linear-gradient(to top, rgba(213, 239, 118, 0.8), rgba(16, 185, 129, 0.4), transparent)',
            borderRadius: '999px',
            filter: 'blur(3px)'
          }}
        />
        {/* Vector quả cầu lông thanh lịch mạ ngọc */}
        <svg viewBox="0 0 60 76" width="100%" height="100%" fill="none">
          {/* Tán lông vũ trắng ngà phản quang */}
          <path
            d="M 12 18 L 30 60 L 48 18 C 38 12, 22 12, 12 18 Z"
            fill="rgba(255, 255, 255, 0.9)"
            stroke="#D5EF76"
            strokeWidth="1.6"
            filter="drop-shadow(0 0 8px rgba(213, 239, 118, 0.6))"
          />
          {/* Chỉ đan vòng tròn */}
          <line x1="18" y1="26" x2="42" y2="26" stroke="#059669" strokeWidth="1.2" />
          <line x1="22" y1="38" x2="38" y2="38" stroke="#059669" strokeWidth="1.2" />
          {/* Cọng lông vũ */}
          <line x1="20" y1="18" x2="30" y2="60" stroke="#10B981" strokeWidth="1.2" />
          <line x1="30" y1="15" x2="30" y2="60" stroke="#10B981" strokeWidth="1.2" />
          <line x1="40" y1="18" x2="30" y2="60" stroke="#10B981" strokeWidth="1.2" />
          {/* Đế bần cao cấp */}
          <ellipse cx="30" cy="62" rx="7.5" ry="5.5" fill="#D5EF76" stroke="#FFFFFF" strokeWidth="1.5" />
        </svg>
      </div>

      {/* QUẢ CẦU 2: Bay lượn nhẹ nhàng ở tầng sâu (nhỏ hơn, mờ ảo) */}
      <div
        style={{
          position: 'absolute',
          top: '38%',
          left: '50%',
          width: '38px',
          height: '50px',
          pointerEvents: 'none',
          zIndex: 2,
          animation: 'shuttleGlide2 7s infinite cubic-bezier(0.4, 0, 0.2, 1)'
        }}
      >
        <svg viewBox="0 0 60 76" width="100%" height="100%" fill="none" opacity="0.75">
          <path
            d="M 12 18 L 30 60 L 48 18 C 38 12, 22 12, 12 18 Z"
            fill="rgba(213, 239, 118, 0.7)"
            stroke="#10B981"
            strokeWidth="1.5"
            filter="drop-shadow(0 0 6px rgba(16, 185, 129, 0.5))"
          />
          <ellipse cx="30" cy="62" rx="7" ry="5" fill="#FFFFFF" />
        </svg>
      </div>

      {/* ================= CÁC ĐỐM SÁNG BỒNG BỀNH (FLOATING ENERGY SPARKS) ================= */}
      <div
        style={{
          position: 'absolute',
          top: '24%',
          left: '22%',
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: '#D5EF76',
          boxShadow: '0 0 12px #D5EF76, 0 0 24px #10B981',
          animation: 'sparkFloat1 4.5s infinite ease-in-out',
          pointerEvents: 'none',
          zIndex: 2
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '32%',
          right: '20%',
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          backgroundColor: '#10B981',
          boxShadow: '0 0 14px #10B981, 0 0 26px #D5EF76',
          animation: 'sparkFloat2 5.2s infinite ease-in-out',
          pointerEvents: 'none',
          zIndex: 2
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '30%',
          left: '26%',
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: '#D5EF76',
          boxShadow: '0 0 10px #D5EF76',
          animation: 'sparkFloat3 4.2s infinite ease-in-out',
          pointerEvents: 'none',
          zIndex: 2
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '26%',
          right: '25%',
          width: '7px',
          height: '7px',
          borderRadius: '50%',
          backgroundColor: '#34D399',
          boxShadow: '0 0 12px #34D399',
          animation: 'sparkFloat1 5.8s infinite ease-in-out reverse',
          pointerEvents: 'none',
          zIndex: 2
        }}
      />

      {/* ================= KHUNG TRUNG TÂM CHÍNH (LOGO + THÔNG TIN) ================= */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          maxWidth: '340px',
          width: '100%',
          zIndex: 5
        }}
      >
        {/* KHUNG CỤM LOGO NỔI 3D + QUỸ ĐẠO QUAY */}
        <div
          style={{
            position: 'relative',
            width: '150px',
            height: '150px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '18px',
            animation: 'logoLevitate 4.5s infinite ease-in-out'
          }}
        >
          {/* Lớp hào quang năng lượng tỏa tròn phía sau */}
          <div
            style={{
              position: 'absolute',
              width: '140px',
              height: '140px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(213, 239, 118, 0.28) 0%, rgba(16, 185, 129, 0.15) 50%, transparent 75%)',
              animation: 'auraBreath 3.5s infinite ease-in-out',
              pointerEvents: 'none'
            }}
          />

          {/* Vòng tròn quỹ đạo quay 360 độ (Orbital Satellite Ring) */}
          <div
            style={{
              position: 'absolute',
              width: '146px',
              height: '146px',
              borderRadius: '50%',
              border: '1.5px dashed rgba(213, 239, 118, 0.45)',
              animation: 'orbitSpin 12s infinite linear',
              pointerEvents: 'none'
            }}
          >
            {/* Hạt vệ tinh phát quang lướt trên quỹ đạo */}
            <div
              style={{
                position: 'absolute',
                top: '-5px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: '#D5EF76',
                boxShadow: '0 0 10px #D5EF76, 0 0 20px #10B981'
              }}
            />
          </div>

          {/* Khung chứa ảnh logo chính thức */}
          <div
            style={{
              width: '114px',
              height: '114px',
              borderRadius: '50%',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '3px solid #10B981',
              boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5), 0 0 20px rgba(16, 185, 129, 0.5)',
              backgroundColor: '#072419',
              flexShrink: 0,
              position: 'relative',
              zIndex: 3
            }}
          >
            <img
              src="/images/logo.jpg"
              alt="Sân Cầu Lông Trần Lựu"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: 'scale(1.16)',
                display: 'block'
              }}
            />
          </div>
        </div>

        {/* TÊN THƯƠNG HIỆU SIÊU NỔI BẬT VỚI BACKLIGHT & NEON GLOW */}
        <div style={{ position: 'relative', textAlign: 'center', marginBottom: '22px', zIndex: 5 }}>
          {/* Quầng sáng Backlight phát quang rực rỡ sau chữ */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '260px',
              height: '84px',
              borderRadius: '50%',
              background: 'radial-gradient(ellipse at center, rgba(213, 239, 118, 0.45) 0%, rgba(16, 185, 129, 0.25) 50%, transparent 80%)',
              filter: 'blur(20px)',
              pointerEvents: 'none',
              animation: 'backlightPulse 3s infinite ease-in-out',
              zIndex: -1
            }}
          />

          {/* Dòng 1: SÂN CẦU LÔNG */}
          <div
            style={{
              fontSize: '13px',
              fontWeight: 800,
              letterSpacing: '3.5px',
              textTransform: 'uppercase',
              color: '#A7F3D0',
              textShadow: '0 0 10px rgba(16, 185, 129, 0.7), 0 2px 4px rgba(0,0,0,0.8)',
              marginBottom: '3px'
            }}
          >
            SÂN CẦU LÔNG
          </div>

          {/* Dòng 2: TRẦN LỰU (SIÊU TO, SIÊU RỰC RỠ, CHUYỂN MÀU NEON) */}
          <h1
            style={{
              fontSize: '32px',
              fontWeight: 900,
              margin: '0 0 8px 0',
              letterSpacing: '2.5px',
              textTransform: 'uppercase',
              textAlign: 'center',
              lineHeight: 1.1,
              display: 'inline-block',
              background: 'linear-gradient(100deg, #D5EF76 0%, #FFFFFF 30%, #D5EF76 50%, #34D399 70%, #D5EF76 100%)',
              backgroundSize: '250% 100%',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              animation: 'laserSweep 3s infinite linear, titleNeonGlow 3s infinite ease-in-out',
              willChange: 'transform, filter, background-position'
            }}
          >
            TRẦN LỰU
          </h1>

          {/* Subtitle với 2 đường ánh sáng trang trí */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              marginTop: '2px'
            }}
          >
            <div
              style={{
                width: '32px',
                height: '1.5px',
                background: 'linear-gradient(90deg, transparent, #D5EF76)'
              }}
            />
            <p
              style={{
                fontSize: '13px',
                color: '#E2E8F0',
                margin: 0,
                fontWeight: 600,
                textAlign: 'center',
                letterSpacing: '0.4px',
                textShadow: '0 0 8px rgba(213, 239, 118, 0.4), 0 1px 4px rgba(0,0,0,0.7)'
              }}
            >
              Hệ thống gọi món phục vụ tận sân
            </p>
            <div
              style={{
                width: '32px',
                height: '1.5px',
                background: 'linear-gradient(90deg, #D5EF76, transparent)'
              }}
            />
          </div>
        </div>

        {/* HUY HIỆU VỊ TRÍ SÂN CẦU LÔNG */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 22px',
            borderRadius: '999px',
            backgroundColor: 'rgba(7, 36, 25, 0.8)',
            border: '1.5px solid rgba(213, 239, 118, 0.55)',
            boxShadow: '0 6px 20px rgba(0, 0, 0, 0.35), inset 0 0 12px rgba(213, 239, 118, 0.12)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            marginBottom: '24px'
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#D5EF76',
              boxShadow: '0 0 8px #D5EF76'
            }}
          />
          <span
            style={{
              fontSize: '12px',
              color: '#D1FAE5',
              fontWeight: 700,
              letterSpacing: '0.5px'
            }}
          >
            VỊ TRÍ:
          </span>
          <span
            style={{
              fontSize: '16px',
              fontWeight: 900,
              color: '#D5EF76',
              letterSpacing: '0.4px',
              textTransform: 'uppercase'
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
              maxWidth: '240px'
            }}
          >
            {/* Thanh loading mỏng có vệt sáng chạy */}
            <div
              style={{
                width: '100%',
                height: '3.5px',
                backgroundColor: 'rgba(255, 255, 255, 0.12)',
                borderRadius: '999px',
                overflow: 'hidden',
                marginBottom: '10px',
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)'
              }}
            >
              <div
                style={{
                  width: `${progress}%`,
                  height: '100%',
                  background: phase === 'success' || phase === 'fading'
                    ? '#D5EF76'
                    : 'linear-gradient(90deg, #10B981, #D5EF76)',
                  borderRadius: '999px',
                  boxShadow: '0 0 10px rgba(213, 239, 118, 0.7)',
                  transition: 'width 0.22s ease-out'
                }}
              />
            </div>

            {/* Dòng chữ trạng thái */}
            <div
              style={{
                fontSize: '12px',
                color: phase === 'success' || phase === 'fading' ? '#D5EF76' : 'rgba(255, 255, 255, 0.7)',
                fontWeight: 700,
                minHeight: '18px',
                textAlign: 'center',
                letterSpacing: '0.3px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {phase === 'success' || phase === 'fading' ? (
                <>
                  <span style={{ fontSize: '13px', fontWeight: 900 }}>✓</span> Đã kết nối • Sẵn sàng phục vụ
                </>
              ) : (
                'Đang chuẩn bị thực đơn tận sân...'
              )}
            </div>
          </div>
        ) : (
          /* HỘP BÁO LỖI */
          <div
            style={{
              maxWidth: '310px',
              padding: '12px 16px',
              backgroundColor: 'rgba(153, 27, 27, 0.9)',
              border: '1.5px solid #F87171',
              borderRadius: '12px',
              textAlign: 'center',
              backdropFilter: 'blur(10px)'
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#FEE2E2', marginBottom: '4px' }}>
              Không thể kết nối tới sân
            </div>
            <div style={{ fontSize: '11px', color: '#FCA5A5', marginBottom: '10px', lineHeight: 1.4 }}>
              {errorMessage}
            </div>
            <button
              type="button"
              onClick={onFinish}
              style={{
                padding: '5px 14px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: '#FFFFFF',
                color: '#991B1B',
                fontSize: '11px',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              Đóng
            </button>
          </div>
        )}
      </div>

      {/* CHỈ DẪN CHẠM BỎ QUA NHANH */}
      <div
        style={{
          position: 'absolute',
          bottom: '22px',
          fontSize: '11px',
          color: 'rgba(255, 255, 255, 0.4)',
          fontWeight: 500,
          letterSpacing: '0.3px',
          zIndex: 5
        }}
      >
        Chạm màn hình để vào nhanh
      </div>
    </div>
  );
};
