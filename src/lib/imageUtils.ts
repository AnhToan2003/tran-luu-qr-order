/**
 * Browser-side client image compressor using HTML5 Canvas.
 * Downscales oversized images to max 400x400 and encodes to WebP/JPEG
 * to keep product image SVG/data-URI small and lightning fast.
 */

export async function compressImage(
  file: File | Blob,
  maxWidth = 400,
  maxHeight = 400,
  quality = 0.82
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve(reader.result as string);
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Prefer image/webp if supported, fallback to image/jpeg
        try {
          const webpData = canvas.toDataURL('image/webp', quality);
          if (webpData.startsWith('data:image/webp')) {
            return resolve(webpData);
          }
        } catch {}

        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Không thể tải hình ảnh để nén'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Không thể đọc file hình ảnh'));
    reader.readAsDataURL(file);
  });
}
