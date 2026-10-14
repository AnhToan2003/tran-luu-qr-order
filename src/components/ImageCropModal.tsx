import React, { useState, useRef, useEffect, useCallback } from 'react';

export interface ImageCropModalProps {
  isOpen: boolean;
  imageSrc: string;
  onConfirm: (croppedDataUrl: string) => void;
  onCancel: () => void;
  containerSize?: number;
  boxSize?: number;
  outputSize?: number;
}

type DragMode = 'pan' | 'handle-left' | 'handle-right' | 'handle-top' | 'handle-bottom' | 'handle-tl' | 'handle-tr' | 'handle-bl' | 'handle-br' | null;

export const ImageCropModal: React.FC<ImageCropModalProps> = ({
  isOpen,
  imageSrc,
  onConfirm,
  onCancel,
  containerSize,
  boxSize,
  outputSize = 600,
}) => {
  const finalContainerSize = containerSize || boxSize || 340;
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [isLoaded, setIsLoaded] = useState(false);
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270

  // Horizontal and Vertical Crop Dimensions (in px relative to container)
  const [cropW, setCropW] = useState(280);
  const [cropH, setCropH] = useState(280);
  const [bgMode, setBgMode] = useState<'white' | 'transparent'>('white');

  const [dragMode, setDragMode] = useState<DragMode>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; initW: number; initH: number }>({ x: 0, y: 0, initW: 280, initH: 280 });
  const imgElementRef = useRef<HTMLImageElement | null>(null);

  const maxCropDim = finalContainerSize - 20; // 320px
  const minCropDim = 70;

  // Load natural image dimensions when imageSrc changes or modal opens
  useEffect(() => {
    if (!isOpen || !imageSrc) return;
    setIsLoaded(false);
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
    setRotation(0);
    setCropW(280);
    setCropH(280);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
      imgElementRef.current = img;
      setIsLoaded(true);

      // Auto preset crop box if image is naturally tall or wide
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        const ratio = img.naturalWidth / img.naturalHeight;
        if (ratio < 0.75) {
          // Tall bottle (Sting, Rockstar, Aquafina)
          setCropW(200);
          setCropH(280);
        } else if (ratio > 1.35) {
          // Wide product (Snack, Bánh)
          setCropW(280);
          setCropH(200);
        } else {
          setCropW(260);
          setCropH(260);
        }
      }
    };
    img.onerror = () => {
      setIsLoaded(false);
    };
    img.src = imageSrc;
  }, [isOpen, imageSrc]);

  // Compute cover baseScale based on current rotation and crop dimensions
  const isRotated90 = rotation % 180 !== 0;
  const effW = isRotated90 ? naturalSize.height : naturalSize.width;
  const effH = isRotated90 ? naturalSize.width : naturalSize.height;

  const coverScale = (effW > 0 && effH > 0) ? Math.max(cropW / effW, cropH / effH) : 1;
  const effectiveScale = coverScale * zoom;

  // Non-passive wheel handler for desktop zooming without page scroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !isOpen) return;

    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const step = e.deltaY < 0 ? 0.08 : -0.08;
      setZoom(prev => {
        const next = Math.round((prev + step) * 100) / 100;
        return Math.max(0.4, Math.min(3.5, next));
      });
    };

    el.addEventListener('wheel', onWheelNative, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheelNative);
    };
  }, [isOpen]);

  // Start pointer dragging (either pan or resizing a crop handle)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, mode: DragMode) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setDragMode(mode);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      initW: cropW,
      initH: cropH
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragMode) return;
    e.preventDefault();

    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    if (dragMode === 'pan') {
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      dragStartRef.current.x = e.clientX;
      dragStartRef.current.y = e.clientY;
      return;
    }

    // Handle edge and corner resizing (symmetrical expansion from center)
    const initW = dragStartRef.current.initW;
    const initH = dragStartRef.current.initH;

    if (dragMode === 'handle-left') {
      const nextW = Math.max(minCropDim, Math.min(maxCropDim, initW - dx * 2));
      setCropW(Math.round(nextW));
    } else if (dragMode === 'handle-right') {
      const nextW = Math.max(minCropDim, Math.min(maxCropDim, initW + dx * 2));
      setCropW(Math.round(nextW));
    } else if (dragMode === 'handle-top') {
      const nextH = Math.max(minCropDim, Math.min(maxCropDim, initH - dy * 2));
      setCropH(Math.round(nextH));
    } else if (dragMode === 'handle-bottom') {
      const nextH = Math.max(minCropDim, Math.min(maxCropDim, initH + dy * 2));
      setCropH(Math.round(nextH));
    } else if (dragMode === 'handle-br') {
      const nextW = Math.max(minCropDim, Math.min(maxCropDim, initW + dx * 2));
      const nextH = Math.max(minCropDim, Math.min(maxCropDim, initH + dy * 2));
      setCropW(Math.round(nextW));
      setCropH(Math.round(nextH));
    } else if (dragMode === 'handle-bl') {
      const nextW = Math.max(minCropDim, Math.min(maxCropDim, initW - dx * 2));
      const nextH = Math.max(minCropDim, Math.min(maxCropDim, initH + dy * 2));
      setCropW(Math.round(nextW));
      setCropH(Math.round(nextH));
    } else if (dragMode === 'handle-tr') {
      const nextW = Math.max(minCropDim, Math.min(maxCropDim, initW + dx * 2));
      const nextH = Math.max(minCropDim, Math.min(maxCropDim, initH - dy * 2));
      setCropW(Math.round(nextW));
      setCropH(Math.round(nextH));
    } else if (dragMode === 'handle-tl') {
      const nextW = Math.max(minCropDim, Math.min(maxCropDim, initW - dx * 2));
      const nextH = Math.max(minCropDim, Math.min(maxCropDim, initH - dy * 2));
      setCropW(Math.round(nextW));
      setCropH(Math.round(nextH));
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setDragMode(null);
  };

  // Quick preset ratios
  const handleSetRatioSquare = () => {
    setCropW(270);
    setCropH(270);
  };

  const handleSetRatioTall = () => {
    // 3:4 aspect ratio for bottles / cans
    setCropW(200);
    setCropH(280);
  };

  const handleSetRatioWide = () => {
    // 4:3 aspect ratio for snack boxes
    setCropW(280);
    setCropH(210);
  };

  const handleRotate = () => {
    setRotation(r => (r + 90) % 360);
  };

  const handleCenter = () => {
    setPan({ x: 0, y: 0 });
    setZoom(1.0);
  };

  // Crop & export to offscreen canvas
  const handleConfirmCrop = useCallback(async () => {
    if (!imgElementRef.current || effW === 0 || effH === 0) return;
    setIsProcessing(true);

    try {
      const img = imgElementRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = outputSize;
      canvas.height = outputSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Canvas context not available');
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // 1. Fill clean background: pure white #FFFFFF by default
      if (bgMode === 'white') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, outputSize, outputSize);
      } else {
        ctx.clearRect(0, 0, outputSize, outputSize);
      }

      // 2. Fit the cropped rectangular area (cropW x cropH) onto the square canvas with 6% padding
      const availableDim = outputSize * 0.90; // 540px
      const fitRatio = Math.min(availableDim / cropW, availableDim / cropH);

      const targetW = cropW * fitRatio;
      const targetH = cropH * fitRatio;
      const targetX = (outputSize - targetW) / 2;
      const targetY = (outputSize - targetH) / 2;

      // 3. Clip canvas to the user's cropped box so nothing outside spills over
      ctx.save();
      ctx.beginPath();
      ctx.rect(targetX, targetY, targetW, targetH);
      ctx.clip();

      // 4. Translate, rotate, scale and draw image centered
      const finalPanX = pan.x * fitRatio;
      const finalPanY = pan.y * fitRatio;
      ctx.translate(outputSize / 2 + finalPanX, outputSize / 2 + finalPanY);
      ctx.rotate((rotation * Math.PI) / 180);

      const finalScale = effectiveScale * fitRatio;
      ctx.scale(finalScale, finalScale);

      ctx.drawImage(img, -naturalSize.width / 2, -naturalSize.height / 2);
      ctx.restore();

      // Export as webp (or png if transparent)
      let croppedUrl = '';
      if (bgMode === 'transparent') {
        croppedUrl = canvas.toDataURL('image/png');
      } else {
        try {
          croppedUrl = canvas.toDataURL('image/webp', 0.88);
        } catch {
          croppedUrl = canvas.toDataURL('image/jpeg', 0.88);
        }
      }

      onConfirm(croppedUrl);
    } catch (err) {
      console.error('Failed to crop image:', err);
    } finally {
      setIsProcessing(false);
    }
  }, [bgMode, cropH, cropW, effH, effW, effectiveScale, naturalSize.height, naturalSize.width, onConfirm, outputSize, pan.x, pan.y, rotation]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2200,
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeInModal 0.2s ease-out'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isProcessing) {
          onCancel();
        }
      }}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '520px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '94vh'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '12px 18px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#F8FAFC'
          }}
        >
          <div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>✂️</span> Cắt & Zoom Ảnh (Ngang & Dọc)
            </div>
            <div style={{ fontSize: '11px', color: '#64748B', marginTop: '1px' }}>
              Kéo mép/góc để cắt ôm sản phẩm • Nền ngoài tự động phủ màu trắng tinh đồng bộ
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isProcessing}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '18px',
              color: '#64748B',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '6px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Viewport Area */}
        <div
          style={{
            backgroundColor: '#0F172A',
            padding: '16px 14px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            userSelect: 'none'
          }}
        >
          {/* Helper hint badge */}
          <div
            style={{
              position: 'absolute',
              top: '8px',
              backgroundColor: 'rgba(0, 0, 0, 0.72)',
              color: '#F8FAFC',
              fontSize: '11px',
              fontWeight: 600,
              padding: '3px 12px',
              borderRadius: '999px',
              backdropFilter: 'blur(4px)',
              zIndex: 15,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              pointerEvents: 'none',
              border: '1px solid rgba(255, 255, 255, 0.15)'
            }}
          >
            <span>↔ ↕</span> Kéo 4 mép hoặc góc để thu hẹp/mở rộng khung cắt ôm sản phẩm
          </div>

          {/* Viewport Frame */}
          <div
            ref={containerRef}
            style={{
              width: `${finalContainerSize}px`,
              height: `${finalContainerSize}px`,
              position: 'relative',
              overflow: 'hidden',
              borderRadius: '12px',
              touchAction: 'none',
              backgroundColor: '#1E293B',
              boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)'
            }}
          >
            {/* The Image (Pannable inside viewport) */}
            {isLoaded ? (
              <img
                src={imageSrc}
                alt="Product Crop Target"
                draggable={false}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transformOrigin: 'center center',
                  transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) rotate(${rotation}deg) scale(${effectiveScale})`,
                  pointerEvents: 'none',
                  maxWidth: 'none',
                  maxHeight: 'none',
                  transition: dragMode ? 'none' : 'transform 0.08s ease-out'
                }}
              />
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: '#94A3B8',
                  fontSize: '13px'
                }}
              >
                Đang tải ảnh...
              </div>
            )}

            {/* Crop Box with Dark Outer Mask and Resizable Handles */}
            <div
              onPointerDown={(e) => handlePointerDown(e, 'pan')}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: `${cropW}px`,
                height: `${cropH}px`,
                cursor: dragMode === 'pan' ? 'grabbing' : 'grab',
                boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.78)',
                border: '2px solid rgba(255, 255, 255, 0.95)',
                borderRadius: '8px',
                boxSizing: 'border-box'
              }}
            >
              {/* 3x3 Rule of thirds grid inside crop box */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gridTemplateRows: '1fr 1fr 1fr'
                }}
              >
                <div style={{ borderRight: '1px dashed rgba(255,255,255,0.3)', borderBottom: '1px dashed rgba(255,255,255,0.3)' }} />
                <div style={{ borderRight: '1px dashed rgba(255,255,255,0.3)', borderBottom: '1px dashed rgba(255,255,255,0.3)' }} />
                <div style={{ borderBottom: '1px dashed rgba(255,255,255,0.3)' }} />
                <div style={{ borderRight: '1px dashed rgba(255,255,255,0.3)', borderBottom: '1px dashed rgba(255,255,255,0.3)' }} />
                <div style={{ borderRight: '1px dashed rgba(255,255,255,0.3)', borderBottom: '1px dashed rgba(255,255,255,0.3)' }} />
                <div style={{ borderBottom: '1px dashed rgba(255,255,255,0.3)' }} />
                <div style={{ borderRight: '1px dashed rgba(255,255,255,0.3)' }} />
                <div style={{ borderRight: '1px dashed rgba(255,255,255,0.3)' }} />
                <div />
              </div>

              {/* Top Handle (Chiều dọc trên) */}
              <div
                onPointerDown={(e) => handlePointerDown(e, 'handle-top')}
                style={{
                  position: 'absolute',
                  top: -8,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '36px',
                  height: '14px',
                  backgroundColor: '#10B981',
                  borderRadius: '999px',
                  cursor: 'ns-resize',
                  zIndex: 20,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                  border: '2px solid #FFFFFF'
                }}
                title="Kéo để chỉnh chiều dọc (trên)"
              />

              {/* Bottom Handle (Chiều dọc dưới) */}
              <div
                onPointerDown={(e) => handlePointerDown(e, 'handle-bottom')}
                style={{
                  position: 'absolute',
                  bottom: -8,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '36px',
                  height: '14px',
                  backgroundColor: '#10B981',
                  borderRadius: '999px',
                  cursor: 'ns-resize',
                  zIndex: 20,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                  border: '2px solid #FFFFFF'
                }}
                title="Kéo để chỉnh chiều dọc (dưới)"
              />

              {/* Left Handle (Chiều ngang trái) */}
              <div
                onPointerDown={(e) => handlePointerDown(e, 'handle-left')}
                style={{
                  position: 'absolute',
                  left: -8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '14px',
                  height: '36px',
                  backgroundColor: '#10B981',
                  borderRadius: '999px',
                  cursor: 'ew-resize',
                  zIndex: 20,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                  border: '2px solid #FFFFFF'
                }}
                title="Kéo để chỉnh chiều ngang (trái)"
              />

              {/* Right Handle (Chiều ngang phải) */}
              <div
                onPointerDown={(e) => handlePointerDown(e, 'handle-right')}
                style={{
                  position: 'absolute',
                  right: -8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '14px',
                  height: '36px',
                  backgroundColor: '#10B981',
                  borderRadius: '999px',
                  cursor: 'ew-resize',
                  zIndex: 20,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                  border: '2px solid #FFFFFF'
                }}
                title="Kéo để chỉnh chiều ngang (phải)"
              />

              {/* 4 Corner Handles */}
              <div
                onPointerDown={(e) => handlePointerDown(e, 'handle-tl')}
                style={{
                  position: 'absolute',
                  top: -6,
                  left: -6,
                  width: '14px',
                  height: '14px',
                  backgroundColor: '#FFFFFF',
                  border: '3px solid #10B981',
                  borderRadius: '3px',
                  cursor: 'nwse-resize',
                  zIndex: 20
                }}
              />
              <div
                onPointerDown={(e) => handlePointerDown(e, 'handle-tr')}
                style={{
                  position: 'absolute',
                  top: -6,
                  right: -6,
                  width: '14px',
                  height: '14px',
                  backgroundColor: '#FFFFFF',
                  border: '3px solid #10B981',
                  borderRadius: '3px',
                  cursor: 'nesw-resize',
                  zIndex: 20
                }}
              />
              <div
                onPointerDown={(e) => handlePointerDown(e, 'handle-bl')}
                style={{
                  position: 'absolute',
                  bottom: -6,
                  left: -6,
                  width: '14px',
                  height: '14px',
                  backgroundColor: '#FFFFFF',
                  border: '3px solid #10B981',
                  borderRadius: '3px',
                  cursor: 'nesw-resize',
                  zIndex: 20
                }}
              />
              <div
                onPointerDown={(e) => handlePointerDown(e, 'handle-br')}
                style={{
                  position: 'absolute',
                  bottom: -6,
                  right: -6,
                  width: '14px',
                  height: '14px',
                  backgroundColor: '#FFFFFF',
                  border: '3px solid #10B981',
                  borderRadius: '3px',
                  cursor: 'nwse-resize',
                  zIndex: 20
                }}
              />
            </div>
          </div>
        </div>

        {/* Controls Toolbar */}
        <div style={{ padding: '14px 18px', backgroundColor: '#FFFFFF', borderBottom: '1px solid #F1F5F9' }}>
          {/* Preset Buttons for Quick Framing */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
            <button
              type="button"
              onClick={handleSetRatioTall}
              style={{
                padding: '5px 10px',
                fontSize: '11px',
                fontWeight: 700,
                backgroundColor: cropH > cropW ? '#ECFDF5' : '#F1F5F9',
                border: cropH > cropW ? '1px solid #10B981' : '1px solid #CBD5E1',
                borderRadius: '6px',
                color: cropH > cropW ? '#047857' : '#334155',
                cursor: 'pointer'
              }}
              title="Khung dọc ôm sát lon nước, chai nước dài"
            >
              📱 Ôm dọc (3:4 Chai/Lon)
            </button>
            <button
              type="button"
              onClick={handleSetRatioWide}
              style={{
                padding: '5px 10px',
                fontSize: '11px',
                fontWeight: 700,
                backgroundColor: cropW > cropH ? '#ECFDF5' : '#F1F5F9',
                border: cropW > cropH ? '1px solid #10B981' : '1px solid #CBD5E1',
                borderRadius: '6px',
                color: cropW > cropH ? '#047857' : '#334155',
                cursor: 'pointer'
              }}
              title="Khung ngang ôm sát hộp bánh, mì ly dài"
            >
              📺 Ôm ngang (4:3 Bánh/Mì)
            </button>
            <button
              type="button"
              onClick={handleSetRatioSquare}
              style={{
                padding: '5px 10px',
                fontSize: '11px',
                fontWeight: 700,
                backgroundColor: cropW === cropH ? '#ECFDF5' : '#F1F5F9',
                border: cropW === cropH ? '1px solid #10B981' : '1px solid #CBD5E1',
                borderRadius: '6px',
                color: cropW === cropH ? '#047857' : '#334155',
                cursor: 'pointer'
              }}
            >
              🔲 Vuông (1:1)
            </button>
            <button
              type="button"
              onClick={handleRotate}
              style={{
                padding: '5px 10px',
                fontSize: '11px',
                fontWeight: 600,
                backgroundColor: '#F8FAFC',
                border: '1px solid #CBD5E1',
                borderRadius: '6px',
                color: '#334155',
                cursor: 'pointer'
              }}
            >
              ↺ Xoay 90°
            </button>
            <button
              type="button"
              onClick={handleCenter}
              style={{
                padding: '5px 10px',
                fontSize: '11px',
                fontWeight: 600,
                backgroundColor: '#F8FAFC',
                border: '1px solid #CBD5E1',
                borderRadius: '6px',
                color: '#334155',
                cursor: 'pointer'
              }}
            >
              🎯 Căn giữa
            </button>
          </div>

          {/* Dimension & Zoom Sliders */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            {/* Chiều ngang (Width) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', minWidth: '60px' }}>
                ↔ Ngang:
              </span>
              <input
                type="range"
                min={minCropDim}
                max={maxCropDim}
                value={cropW}
                onChange={(e) => setCropW(parseInt(e.target.value, 10))}
                style={{ flex: 1, accentColor: '#10B981', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#10B981', minWidth: '35px', textAlign: 'right' }}>
                {cropW}px
              </span>
            </div>

            {/* Chiều dọc (Height) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', minWidth: '55px' }}>
                ↕ Dọc:
              </span>
              <input
                type="range"
                min={minCropDim}
                max={maxCropDim}
                value={cropH}
                onChange={(e) => setCropH(parseInt(e.target.value, 10))}
                style={{ flex: 1, accentColor: '#10B981', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#10B981', minWidth: '35px', textAlign: 'right' }}>
                {cropH}px
              </span>
            </div>
          </div>

          {/* Zoom Slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', minWidth: '60px' }}>
              🔍 Phóng to:
            </span>
            <input
              type="range"
              min="0.4"
              max="3.5"
              step="0.01"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: '#10B981', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#10B981', minWidth: '35px', textAlign: 'right' }}>
              {Math.round(zoom * 100)}%
            </span>
          </div>

          {/* Background color choice */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed #E2E8F0' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>
              Nền viền ngoài:
            </span>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 600, color: '#0F172A', cursor: 'pointer' }}>
              <input
                type="radio"
                name="bgMode"
                checked={bgMode === 'white'}
                onChange={() => setBgMode('white')}
                style={{ accentColor: '#10B981' }}
              />
              ⚪ Trắng tinh (#FFFFFF - Chuẩn Menu)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 600, color: '#64748B', cursor: 'pointer' }}>
              <input
                type="radio"
                name="bgMode"
                checked={bgMode === 'transparent'}
                onChange={() => setBgMode('transparent')}
                style={{ accentColor: '#10B981' }}
              />
              🔘 Trong suốt (PNG)
            </label>
          </div>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '12px 18px',
            backgroundColor: '#F8FAFC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap'
          }}
        >
          <div style={{ fontSize: '11px', color: '#059669', fontWeight: 600, maxWidth: '240px' }}>
            ✓ Nền ngoài phủ trắng tinh đồng bộ 100% với thẻ menu (không bị 2 màu)
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={isProcessing}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#475569',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Hủy Bỏ
            </button>
            <button
              type="button"
              onClick={handleConfirmCrop}
              disabled={isProcessing || !isLoaded}
              style={{
                padding: '8px 18px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: isProcessing ? '#94A3B8' : '#10B981',
                color: '#FFFFFF',
                fontSize: '13px',
                fontWeight: 800,
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 8px rgba(16, 185, 129, 0.35)'
              }}
            >
              {isProcessing ? 'Đang xử lý...' : '✓ Xác Nhận & Cắt Ảnh'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
