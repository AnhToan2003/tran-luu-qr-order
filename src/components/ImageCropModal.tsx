import React, { useState, useRef, useEffect, useCallback } from 'react';

export interface CropBoxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CropConfig {
  cropBox: CropBoxRect;
  zoom: number;
  pan: { x: number; y: number };
  rotation: number;
  originalSrc: string;
}

export interface ImageCropModalProps {
  isOpen: boolean;
  imageSrc: string;
  onConfirm: (croppedDataUrl: string, config: CropConfig) => void;
  onCancel: () => void;
  initialConfig?: CropConfig | null;
  containerWidth?: number;
  containerHeight?: number;
  outputSize?: number;
}

type DragTarget =
  | 'handle-left'
  | 'handle-right'
  | 'handle-top'
  | 'handle-bottom'
  | 'handle-tl'
  | 'handle-tr'
  | 'handle-bl'
  | 'handle-br'
  | 'box-move'
  | 'pan-image'
  | null;

export const ImageCropModal: React.FC<ImageCropModalProps> = ({
  isOpen,
  imageSrc,
  onConfirm,
  onCancel,
  initialConfig,
  containerWidth = 380,
  containerHeight = 330,
  outputSize = 600,
}) => {
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [isLoaded, setIsLoaded] = useState(false);
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270

  // Crop box bounding rectangle in container coordinates (pixels)
  const [cropBox, setCropBox] = useState<CropBoxRect>({ x: 40, y: 30, w: 300, h: 270 });

  const [dragTarget, setDragTarget] = useState<DragTarget>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    initBox: CropBoxRect;
    initPan: { x: number; y: number };
  }>({
    pointerX: 0,
    pointerY: 0,
    initBox: { x: 40, y: 30, w: 300, h: 270 },
    initPan: { x: 0, y: 0 },
  });
  const imgElementRef = useRef<HTMLImageElement | null>(null);

  const minBoxDim = 40;

  // 1. Load natural image and restore previous crop config or compute smart defaults
  useEffect(() => {
    if (!isOpen || !imageSrc) return;
    setIsLoaded(false);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
      imgElementRef.current = img;
      setIsLoaded(true);

      // Restore previous configuration if editing existing/previous crop
      if (initialConfig && initialConfig.cropBox && initialConfig.cropBox.w > 0) {
        setCropBox(initialConfig.cropBox);
        setZoom(initialConfig.zoom || 1.0);
        setPan(initialConfig.pan || { x: 0, y: 0 });
        setRotation(initialConfig.rotation || 0);
      } else {
        // Smart initial framing: image stays fixed, box hugs product
        const effW = img.naturalWidth;
        const effH = img.naturalHeight;
        const fitScale = Math.min((containerWidth - 20) / effW, (containerHeight - 20) / effH);
        const dispW = effW * fitScale;
        const dispH = effH * fitScale;

        const imgLeft = Math.round((containerWidth - dispW) / 2);
        const imgTop = Math.round((containerHeight - dispH) / 2);

        setZoom(1.0);
        setPan({ x: 0, y: 0 });
        setRotation(0);

        // Initial box slightly inset from image bounds
        setCropBox({
          x: Math.max(10, imgLeft + Math.round(dispW * 0.05)),
          y: Math.max(10, imgTop + Math.round(dispH * 0.05)),
          w: Math.max(minBoxDim, Math.round(dispW * 0.90)),
          h: Math.max(minBoxDim, Math.round(dispH * 0.90)),
        });
      }
    };
    img.onerror = () => {
      setIsLoaded(false);
    };
    img.src = imageSrc;
  }, [isOpen, imageSrc, initialConfig, containerWidth, containerHeight]);

  // Compute fixed display scale for the stationary image
  const isRotated90 = rotation % 180 !== 0;
  const effW = isRotated90 ? naturalSize.height : naturalSize.width;
  const effH = isRotated90 ? naturalSize.width : naturalSize.height;

  // Base fit scale: image is stationary within viewport
  const baseFitScale = (effW > 0 && effH > 0)
    ? Math.min((containerWidth - 20) / effW, (containerHeight - 20) / effH)
    : 1;
  const imageDisplayScale = baseFitScale * zoom;

  // Non-passive wheel handler for zooming stationary image without page scroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !isOpen) return;

    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const step = e.deltaY < 0 ? 0.06 : -0.06;
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

  // 2. Drag Handlers: Image stays fixed ("ảnh giữ nguyên"), only crop edges move
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, target: DragTarget) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setDragTarget(target);
    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      initBox: { ...cropBox },
      initPan: { ...pan },
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragTarget) return;
    e.preventDefault();

    const dx = e.clientX - dragStartRef.current.pointerX;
    const dy = e.clientY - dragStartRef.current.pointerY;
    const init = dragStartRef.current.initBox;

    if (dragTarget === 'pan-image') {
      setPan({
        x: dragStartRef.current.initPan.x + dx,
        y: dragStartRef.current.initPan.y + dy,
      });
      return;
    }

    if (dragTarget === 'box-move') {
      const maxX = containerWidth - init.w;
      const maxY = containerHeight - init.h;
      setCropBox({
        ...init,
        x: Math.max(0, Math.min(maxX, init.x + dx)),
        y: Math.max(0, Math.min(maxY, init.y + dy)),
      });
      return;
    }

    // Edge and Corner handle resizing: adjusts crop box only
    let newX = init.x;
    let newY = init.y;
    let newW = init.w;
    let newH = init.h;

    // Horizontal handle adjustments
    if (dragTarget === 'handle-left' || dragTarget === 'handle-tl' || dragTarget === 'handle-bl') {
      const rightEdge = init.x + init.w;
      newX = Math.max(0, Math.min(rightEdge - minBoxDim, init.x + dx));
      newW = rightEdge - newX;
    } else if (dragTarget === 'handle-right' || dragTarget === 'handle-tr' || dragTarget === 'handle-br') {
      newW = Math.max(minBoxDim, Math.min(containerWidth - init.x, init.w + dx));
    }

    // Vertical handle adjustments
    if (dragTarget === 'handle-top' || dragTarget === 'handle-tl' || dragTarget === 'handle-tr') {
      const bottomEdge = init.y + init.h;
      newY = Math.max(0, Math.min(bottomEdge - minBoxDim, init.y + dy));
      newH = bottomEdge - newY;
    } else if (dragTarget === 'handle-bottom' || dragTarget === 'handle-bl' || dragTarget === 'handle-br') {
      newH = Math.max(minBoxDim, Math.min(containerHeight - init.y, init.h + dy));
    }

    setCropBox({
      x: Math.round(newX),
      y: Math.round(newY),
      w: Math.round(newW),
      h: Math.round(newH),
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setDragTarget(null);
  };

  // 3. Quick presets for instant framing
  const handleSetRatioTall = () => {
    // 3:4 aspect ratio for tall bottles/cans
    const h = Math.min(containerHeight - 20, 270);
    const w = Math.round(h * 0.72);
    setCropBox({
      x: Math.round((containerWidth - w) / 2),
      y: Math.round((containerHeight - h) / 2),
      w,
      h,
    });
  };

  const handleSetRatioWide = () => {
    // 4:3 aspect ratio for wide boxes/snacks
    const w = Math.min(containerWidth - 20, 300);
    const h = Math.round(w * 0.75);
    setCropBox({
      x: Math.round((containerWidth - w) / 2),
      y: Math.round((containerHeight - h) / 2),
      w,
      h,
    });
  };

  const handleSetRatioSquare = () => {
    const dim = Math.min(containerWidth - 30, containerHeight - 30, 260);
    setCropBox({
      x: Math.round((containerWidth - dim) / 2),
      y: Math.round((containerHeight - dim) / 2),
      w: dim,
      h: dim,
    });
  };

  const handleRotate = () => {
    setRotation(r => (r + 90) % 360);
  };

  const handleCenter = () => {
    setPan({ x: 0, y: 0 });
    setZoom(1.0);
  };

  // 4. Live Preview: Automatically zooms the product as user drags edges closer to the product!
  useEffect(() => {
    if (!previewCanvasRef.current || !imgElementRef.current || !isLoaded || cropBox.w <= 0 || cropBox.h <= 0) return;
    const canvas = previewCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pSize = 100;
    canvas.width = pSize;
    canvas.height = pSize;

    // Always pure white background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, pSize, pSize);

    // As user drags edges closer to product (smaller cropBox), fitRatio increases => product zooms in!
    const availableDim = pSize * 0.90; // 90px
    const fitRatio = Math.min(availableDim / cropBox.w, availableDim / cropBox.h);
    const targetW = cropBox.w * fitRatio;
    const targetH = cropBox.h * fitRatio;
    const targetX = (pSize - targetW) / 2;
    const targetY = (pSize - targetH) / 2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(targetX, targetY, targetW, targetH);
    ctx.clip();

    const boxCenterX = cropBox.x + cropBox.w / 2;
    const boxCenterY = cropBox.y + cropBox.h / 2;
    const imgCenterX = containerWidth / 2 + pan.x;
    const imgCenterY = containerHeight / 2 + pan.y;
    const deltaX = imgCenterX - boxCenterX;
    const deltaY = imgCenterY - boxCenterY;

    const canvasImgCenterX = pSize / 2 + deltaX * fitRatio;
    const canvasImgCenterY = pSize / 2 + deltaY * fitRatio;
    const canvasImgScale = imageDisplayScale * fitRatio;

    ctx.translate(canvasImgCenterX, canvasImgCenterY);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(canvasImgScale, canvasImgScale);
    ctx.drawImage(imgElementRef.current, -naturalSize.width / 2, -naturalSize.height / 2);
    ctx.restore();
  }, [cropBox, zoom, pan, rotation, isLoaded, imageDisplayScale, naturalSize.width, naturalSize.height, containerWidth, containerHeight]);

  // 5. Final Export: Offscreen 600x600 canvas with pure white background outside crop
  const handleConfirmCrop = useCallback(async () => {
    if (!imgElementRef.current || effW === 0 || effH === 0 || cropBox.w <= 0 || cropBox.h <= 0) return;
    setIsProcessing(true);

    try {
      const img = imgElementRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = outputSize;
      canvas.height = outputSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context not available');

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Pure white #FFFFFF background seamless with cards
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, outputSize, outputSize);

      // Fit the cropped area (cropBox.w x cropBox.h) onto 600x600 canvas with 6% margin
      const availableDim = outputSize * 0.90; // 540px
      const fitRatio = Math.min(availableDim / cropBox.w, availableDim / cropBox.h);
      const targetW = cropBox.w * fitRatio;
      const targetH = cropBox.h * fitRatio;
      const targetX = (outputSize - targetW) / 2;
      const targetY = (outputSize - targetH) / 2;

      // Clip canvas to the user's cropped box
      ctx.save();
      ctx.beginPath();
      ctx.rect(targetX, targetY, targetW, targetH);
      ctx.clip();

      const boxCenterX = cropBox.x + cropBox.w / 2;
      const boxCenterY = cropBox.y + cropBox.h / 2;
      const imgCenterX = containerWidth / 2 + pan.x;
      const imgCenterY = containerHeight / 2 + pan.y;
      const deltaX = imgCenterX - boxCenterX;
      const deltaY = imgCenterY - boxCenterY;

      const canvasImgCenterX = outputSize / 2 + deltaX * fitRatio;
      const canvasImgCenterY = outputSize / 2 + deltaY * fitRatio;
      const canvasImgScale = imageDisplayScale * fitRatio;

      ctx.translate(canvasImgCenterX, canvasImgCenterY);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(canvasImgScale, canvasImgScale);
      ctx.drawImage(img, -naturalSize.width / 2, -naturalSize.height / 2);
      ctx.restore();

      let croppedUrl = '';
      try {
        croppedUrl = canvas.toDataURL('image/webp', 0.88);
      } catch {
        croppedUrl = canvas.toDataURL('image/jpeg', 0.88);
      }

      // Return both cropped DataURL and cropConfig so reopening restores exact state
      const savedConfig: CropConfig = {
        cropBox: { ...cropBox },
        zoom,
        pan: { ...pan },
        rotation,
        originalSrc: imageSrc,
      };

      onConfirm(croppedUrl, savedConfig);
    } catch (err) {
      console.error('Failed to crop image:', err);
    } finally {
      setIsProcessing(false);
    }
  }, [cropBox, effH, effW, imageDisplayScale, naturalSize.height, naturalSize.width, onConfirm, outputSize, pan.x, pan.y, rotation, containerWidth, containerHeight, zoom, imageSrc]);

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
        animation: 'fadeInModal 0.2s ease-out',
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
          maxWidth: '540px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '94vh',
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
            backgroundColor: '#F8FAFC',
          }}
        >
          <div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>✂️</span> Cắt & Zoom Ảnh (Ngang & Dọc)
            </div>
            <div style={{ fontSize: '11px', color: '#64748B', marginTop: '1px' }}>
              Ảnh giữ nguyên • Kéo 4 mép ôm sát sản phẩm để phóng to hiển thị trên menu
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
              borderRadius: '6px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Viewport Area */}
        <div
          style={{
            backgroundColor: '#0F172A',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            userSelect: 'none',
          }}
        >
          {/* Helper hint badge */}
          <div
            style={{
              position: 'absolute',
              top: '6px',
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
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
              border: '1px solid rgba(255, 255, 255, 0.15)',
            }}
          >
            <span>↔ ↕</span> Kéo 4 mép xanh để thu hẹp khung ôm sát sản phẩm
          </div>

          {/* Viewport Container */}
          <div
            ref={containerRef}
            onPointerDown={(e) => handlePointerDown(e, 'pan-image')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{
              width: `${containerWidth}px`,
              height: `${containerHeight}px`,
              position: 'relative',
              overflow: 'hidden',
              borderRadius: '12px',
              touchAction: 'none',
              backgroundColor: '#1E293B',
              boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
              cursor: dragTarget === 'pan-image' ? 'grabbing' : 'grab',
            }}
          >
            {/* The Stationary Image: stays completely fixed when dragging crop handles */}
            {isLoaded ? (
              <img
                src={imageSrc}
                alt="Product Target"
                draggable={false}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transformOrigin: 'center center',
                  transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) rotate(${rotation}deg) scale(${imageDisplayScale})`,
                  pointerEvents: 'none',
                  maxWidth: 'none',
                  maxHeight: 'none',
                  userSelect: 'none',
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
                  fontSize: '13px',
                }}
              >
                Đang tải ảnh...
              </div>
            )}

            {/* The Interactive Crop Box: moves & resizes independently */}
            <div
              onPointerDown={(e) => handlePointerDown(e, 'box-move')}
              style={{
                position: 'absolute',
                left: `${cropBox.x}px`,
                top: `${cropBox.y}px`,
                width: `${cropBox.w}px`,
                height: `${cropBox.h}px`,
                cursor: dragTarget === 'box-move' ? 'grabbing' : 'move',
                boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.78)',
                border: '2px solid rgba(255, 255, 255, 0.95)',
                borderRadius: '6px',
                boxSizing: 'border-box',
                zIndex: 10,
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
                  gridTemplateRows: '1fr 1fr 1fr',
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

              {/* Top Handle (Chiều dọc mép trên) */}
              <div
                onPointerDown={(e) => handlePointerDown(e, 'handle-top')}
                style={{
                  position: 'absolute',
                  top: -9,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '42px',
                  height: '14px',
                  backgroundColor: '#10B981',
                  borderRadius: '999px',
                  cursor: 'ns-resize',
                  zIndex: 25,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                  border: '2px solid #FFFFFF',
                }}
                title="Kéo mép trên"
              />

              {/* Bottom Handle (Chiều dọc mép dưới) */}
              <div
                onPointerDown={(e) => handlePointerDown(e, 'handle-bottom')}
                style={{
                  position: 'absolute',
                  bottom: -9,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '42px',
                  height: '14px',
                  backgroundColor: '#10B981',
                  borderRadius: '999px',
                  cursor: 'ns-resize',
                  zIndex: 25,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                  border: '2px solid #FFFFFF',
                }}
                title="Kéo mép dưới"
              />

              {/* Left Handle (Chiều ngang mép trái) */}
              <div
                onPointerDown={(e) => handlePointerDown(e, 'handle-left')}
                style={{
                  position: 'absolute',
                  left: -9,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '14px',
                  height: '42px',
                  backgroundColor: '#10B981',
                  borderRadius: '999px',
                  cursor: 'ew-resize',
                  zIndex: 25,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                  border: '2px solid #FFFFFF',
                }}
                title="Kéo mép trái"
              />

              {/* Right Handle (Chiều ngang mép phải) */}
              <div
                onPointerDown={(e) => handlePointerDown(e, 'handle-right')}
                style={{
                  position: 'absolute',
                  right: -9,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '14px',
                  height: '42px',
                  backgroundColor: '#10B981',
                  borderRadius: '999px',
                  cursor: 'ew-resize',
                  zIndex: 25,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                  border: '2px solid #FFFFFF',
                }}
                title="Kéo mép phải"
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
                  zIndex: 25,
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
                  zIndex: 25,
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
                  zIndex: 25,
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
                  zIndex: 25,
                }}
              />
            </div>
          </div>
        </div>

        {/* Controls Toolbar + Live Menu Card Preview */}
        <div style={{ padding: '12px 18px', backgroundColor: '#FFFFFF', borderBottom: '1px solid #F1F5F9' }}>
          <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
            {/* Left Column: Presets & Controls */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Preset Buttons for Quick Framing */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                <button
                  type="button"
                  onClick={handleSetRatioTall}
                  style={{
                    padding: '5px 10px',
                    fontSize: '11px',
                    fontWeight: 700,
                    backgroundColor: cropBox.h > cropBox.w ? '#ECFDF5' : '#F1F5F9',
                    border: cropBox.h > cropBox.w ? '1px solid #10B981' : '1px solid #CBD5E1',
                    borderRadius: '6px',
                    color: cropBox.h > cropBox.w ? '#047857' : '#334155',
                    cursor: 'pointer',
                  }}
                  title="Khung dọc ôm sát lon nước, chai nước"
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
                    backgroundColor: cropBox.w > cropBox.h ? '#ECFDF5' : '#F1F5F9',
                    border: cropBox.w > cropBox.h ? '1px solid #10B981' : '1px solid #CBD5E1',
                    borderRadius: '6px',
                    color: cropBox.w > cropBox.h ? '#047857' : '#334155',
                    cursor: 'pointer',
                  }}
                  title="Khung ngang ôm sát hộp bánh, mì ly"
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
                    backgroundColor: cropBox.w === cropBox.h ? '#ECFDF5' : '#F1F5F9',
                    border: cropBox.w === cropBox.h ? '1px solid #10B981' : '1px solid #CBD5E1',
                    borderRadius: '6px',
                    color: cropBox.w === cropBox.h ? '#047857' : '#334155',
                    cursor: 'pointer',
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
                    cursor: 'pointer',
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
                    cursor: 'pointer',
                  }}
                >
                  🎯 Căn giữa
                </button>
              </div>

              {/* Sliders for explicit width & height if needed */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', minWidth: '55px' }}>
                    ↔ Ngang:
                  </span>
                  <input
                    type="range"
                    min={minBoxDim}
                    max={containerWidth - 20}
                    value={cropBox.w}
                    onChange={(e) => {
                      const newW = parseInt(e.target.value, 10);
                      const maxX = containerWidth - newW;
                      setCropBox(b => ({ ...b, w: newW, x: Math.min(b.x, maxX) }));
                    }}
                    style={{ flex: 1, accentColor: '#10B981', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#10B981', minWidth: '32px', textAlign: 'right' }}>
                    {cropBox.w}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', minWidth: '50px' }}>
                    ↕ Dọc:
                  </span>
                  <input
                    type="range"
                    min={minBoxDim}
                    max={containerHeight - 20}
                    value={cropBox.h}
                    onChange={(e) => {
                      const newH = parseInt(e.target.value, 10);
                      const maxY = containerHeight - newH;
                      setCropBox(b => ({ ...b, h: newH, y: Math.min(b.y, maxY) }));
                    }}
                    style={{ flex: 1, accentColor: '#10B981', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#10B981', minWidth: '32px', textAlign: 'right' }}>
                    {cropBox.h}
                  </span>
                </div>
              </div>

              {/* Zoom Slider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', minWidth: '55px' }}>
                  🔍 Zoom:
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
            </div>

            {/* Right Column: Live Menu Card Preview (Shows product expanding as box hugs tighter!) */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                flexShrink: 0,
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                padding: '6px 8px 8px',
              }}
            >
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#047857', marginBottom: '4px', letterSpacing: '0.2px' }}>
                👁️ MENU PREVIEW
              </div>
              <div
                style={{
                  width: '88px',
                  height: '88px',
                  backgroundColor: '#FFFFFF',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <canvas
                  ref={previewCanvasRef}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                  }}
                />
              </div>
              <div style={{ fontSize: '9px', color: '#64748B', marginTop: '3px' }}>
                Tỷ lệ chuẩn 1:1
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '12px 18px',
            backgroundColor: '#F8FAFC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '10px',
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={isProcessing}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#475569',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Hủy Bỏ
          </button>
          <button
            type="button"
            onClick={handleConfirmCrop}
            disabled={isProcessing || !isLoaded}
            style={{
              padding: '8px 20px',
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
              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.35)',
            }}
          >
            {isProcessing ? 'Đang xử lý...' : '✓ Xác Nhận & Cắt Ảnh'}
          </button>
        </div>
      </div>
    </div>
  );
};
