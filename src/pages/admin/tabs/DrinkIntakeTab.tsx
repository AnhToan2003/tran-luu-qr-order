import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Product, formatVnd } from '../../../types/product';
import { apiFetch, stableRequestId, completeRequest } from '../../../lib/api';

interface DrinkIntakeTabProps {
  products: Product[];
  onRefreshProducts: () => void;
}

interface CategoryItem {
  id: string;
  name: string;
}

interface BatchIntakeItem {
  productId: string;
  name: string;
  volume: string;
  unit?: string;
  category: string;
  currentStock: number;
  imageSvg?: string;
  quantity: number;
  costPriceVnd: number;
  sellingPriceVnd: number;
}

// Helper: Process and optimize image file to compact WebP Data URL (< 50KB)
const processImageFile = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Vui lòng chọn file hình ảnh (PNG, JPG, WEBP, GIF, SVG)'));
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (file.type === 'image/svg+xml') {
        resolve(result);
        return;
      }
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDim = 500;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(result);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/webp', 0.82);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Không thể xử lý file ảnh này'));
      img.src = result;
    };
    reader.onerror = () => reject(new Error('Lỗi khi đọc file ảnh'));
    reader.readAsDataURL(file);
  });
};

// Component Drag & Drop Image Uploader
const ImageDropzone: React.FC<{
  imageUrl: string;
  onChange: (url: string) => void;
  disabled?: boolean;
}> = ({ imageUrl, onChange, disabled }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = async (file: File) => {
    setUploadError('');
    try {
      const dataUrl = await processImageFile(file);
      onChange(dataUrl);
    } catch (err: any) {
      setUploadError(err.message || 'Lỗi xử lý file ảnh');
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (disabled) return;
    setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  };

  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={{ display: 'block', fontWeight: 800, fontSize: '12px', color: '#475569', marginBottom: '6px' }}>
        HÌNH ẢNH SẢN PHẨM (KÉO THẢ HOẶC CHỌN TỪ MÁY)
      </label>

      {imageUrl ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          padding: '12px',
          borderRadius: '8px',
          border: '1px solid #CBD5E1',
          backgroundColor: '#F8FAFC'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '6px',
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <img
              src={imageUrl}
              alt="Preview"
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '12px', color: '#10B981', fontWeight: 700, marginBottom: '4px' }}>
              Đã tải ảnh thành công
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  padding: '4px 10px',
                  backgroundColor: '#FFFFFF',
                  color: '#334155',
                  border: '1px solid #CBD5E1',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Đổi ảnh khác
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange('')}
                style={{
                  padding: '4px 10px',
                  backgroundColor: '#FFF1F2',
                  color: '#E11D48',
                  border: '1px solid #FECDD3',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Xóa ảnh
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => !disabled && fileInputRef.current?.click()}
          style={{
            border: isDragging ? '2px dashed var(--color-primary)' : '2px dashed #CBD5E1',
            backgroundColor: isDragging ? '#F0FDF4' : '#F8FAFC',
            borderRadius: '8px',
            padding: '18px 16px',
            textAlign: 'center',
            cursor: disabled ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B', marginBottom: '2px' }}>
            Kéo và thả file ảnh vào đây, hoặc click để chọn từ máy
          </div>
          <div style={{ fontSize: '11px', color: '#64748B' }}>
            Hỗ trợ PNG, JPG, WEBP (tự động tối ưu dung lượng siêu nhẹ)
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={onFileChange}
      />

      {uploadError && (
        <div style={{ color: '#DC2626', fontSize: '12px', marginTop: '4px', fontWeight: 600 }}>
          {uploadError}
        </div>
      )}

    </div>
  );
};

export const DrinkIntakeTab: React.FC<DrinkIntakeTabProps> = ({
  products,
  onRefreshProducts
}) => {
  // Main Filter & Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');
  const [toastMessage, setToastMessage] = useState('');

  // Categories list from API
  const [categories, setCategories] = useState<CategoryItem[]>([
    { id: 'water', name: 'Nước suối' },
    { id: 'isotonic', name: 'Bù khoáng & Điện giải' },
    { id: 'soda', name: 'Nước ngọt có gas' },
    { id: 'energy', name: 'Nước tăng lực' },
    { id: 'tea', name: 'Trà & Cà phê' },
    { id: 'juice', name: 'Nước ép & Sữa' },
    { id: 'food', name: 'Mì ly & Đồ ăn' }
  ]);

  // Load categories from backend
  const loadCategories = async () => {
    try {
      const res = await apiFetch('/api/admin/categories');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.categories) && data.categories.length > 0) {
          setCategories(data.categories);
        }
      }
    } catch {
      // Keep defaults if fetch fails
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

const COMMON_UNITS = ['Chai', 'Lon', 'Ly', 'Gói', 'Hộp', 'Cây', 'Bịch', 'Cái'];

  // ================= MODAL 1: THÊM MÓN MỚI VÀO THỰC ĐƠN =================
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductTag, setNewProductTag] = useState('');
  const [newProductVolume, setNewProductVolume] = useState('500ml');
  const [newProductUnit, setNewProductUnit] = useState('Chai');
  const [newProductCategory, setNewProductCategory] = useState('water');
  const [newProductCostPrice, setNewProductCostPrice] = useState(5000);
  const [newProductSellingPrice, setNewProductSellingPrice] = useState(10000);
  const [newProductInitialStock, setNewProductInitialStock] = useState(0);
  const [newProductMinStock, setNewProductMinStock] = useState(5);
  const [newProductImage, setNewProductImage] = useState('');
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [createError, setCreateError] = useState('');

  // Inline Category Creator for Create Modal
  const [isAddingCategoryInCreate, setIsAddingCategoryInCreate] = useState(false);
  const [newCategoryNameInput, setNewCategoryNameInput] = useState('');
  const [isSavingCategory, setIsSavingCategory] = useState(false);

  const handleSaveNewCategory = async (targetForm: 'create' | 'edit') => {
    const trimmed = newCategoryNameInput.trim();
    if (!trimmed) return;
    setIsSavingCategory(true);
    try {
      const res = await apiFetch('/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Không thể tạo hạng mục mới');
      }
      const data = await res.json();
      if (Array.isArray(data.categories)) {
        setCategories(data.categories);
      }
      const newCatId = data.category?.id || trimmed;
      if (targetForm === 'create') {
        setNewProductCategory(newCatId);
        setIsAddingCategoryInCreate(false);
      } else {
        setEditCategory(newCatId);
        setIsAddingCategoryInEdit(false);
      }
      setNewCategoryNameInput('');
      showToast(`Đã thêm hạng mục "${trimmed}" thành công`);
    } catch (err: any) {
      alert(err.message || 'Lỗi thêm hạng mục');
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleOpenCreateModal = () => {
    setNewProductName('');
    setNewProductTag('');
    setNewProductVolume('500ml');
    setNewProductUnit('Chai');
    setNewProductCategory(categories[0]?.id || 'water');
    setNewProductCostPrice(5000);
    setNewProductSellingPrice(10000);
    setNewProductInitialStock(0);
    setNewProductMinStock(5);
    setNewProductImage('');
    setCreateError('');
    setIsAddingCategoryInCreate(false);
    setNewCategoryNameInput('');
    setIsCreateModalOpen(true);
  };

  const handleSubmitCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setIsSubmittingCreate(true);

    try {
      if (!newProductName.trim()) {
        throw new Error('Vui lòng nhập tên sản phẩm mới');
      }
      const createRes = await apiFetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProductName.trim(),
          tag: newProductTag.trim() || undefined,
          volume: newProductVolume.trim() || '500ml',
          unit: newProductUnit.trim() || 'Chai',
          category: newProductCategory,
          costPriceVnd: newProductCostPrice,
          priceVnd: newProductSellingPrice,
          stock: newProductInitialStock,
          minStockThreshold: newProductMinStock,
          imageSvg: newProductImage.trim() || '/images/products/aquafina-500ml.png',
          isAvailable: true
        })
      });

      if (!createRes.ok) {
        const errData = await createRes.json();
        throw new Error(errData.message || 'Không thể tạo sản phẩm');
      }

      setIsCreateModalOpen(false);
      onRefreshProducts();
      showToast(`Đã thêm sản phẩm "${newProductName.trim()}" vào thực đơn`);
    } catch (err: any) {
      setCreateError(err.message || 'Lỗi khi tạo sản phẩm mới');
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  // ================= MODAL 2: PHIẾU NHẬP HÀNG ĐA MÓN (BATCH INTAKE) =================
  const [isBatchIntakeModalOpen, setIsBatchIntakeModalOpen] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchIntakeItem[]>([]);
  const [batchTransferDate, setBatchTransferDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [batchResponsiblePerson, setBatchResponsiblePerson] = useState('');
  const [batchNote, setBatchNote] = useState('');
  const [batchSearch, setBatchSearch] = useState('');
  const [batchCategoryFilter, setBatchCategoryFilter] = useState('all');
  const [onlySelectedInBatch, setOnlySelectedInBatch] = useState(false);
  const [isSubmittingBatch, setIsSubmittingBatch] = useState(false);
  const [batchError, setBatchError] = useState('');

  // Initialize Batch Items from current products list
  const handleOpenBatchIntake = (preselectProductId?: string) => {
    const items: BatchIntakeItem[] = products.map(p => ({
      productId: p.id,
      name: p.name,
      volume: p.volume,
      unit: p.unit || 'Chai',
      category: p.category,
      currentStock: p.stock,
      imageSvg: p.imageSvg,
      quantity: p.id === preselectProductId ? 24 : 0,
      costPriceVnd: p.costPriceVnd || 0,
      sellingPriceVnd: p.priceVnd
    }));

    setBatchItems(items);
    setBatchTransferDate(new Date().toISOString().split('T')[0]);
    setBatchResponsiblePerson('');
    setBatchNote(preselectProductId ? `Nhập hàng bổ sung` : 'Nhập hàng vào kho quầy');
    setBatchSearch('');
    setBatchCategoryFilter('all');
    setOnlySelectedInBatch(false);
    setBatchError('');
    setIsBatchIntakeModalOpen(true);
  };

  const handleUpdateBatchQuantity = (productId: string, qty: number) => {
    setBatchItems(prev => prev.map(item => {
      if (item.productId === productId) {
        return { ...item, quantity: Math.max(0, qty) };
      }
      return item;
    }));
  };

  const handleUpdateBatchCostPrice = (productId: string, cost: number) => {
    setBatchItems(prev => prev.map(item => {
      if (item.productId === productId) {
        return { ...item, costPriceVnd: Math.max(0, cost) };
      }
      return item;
    }));
  };

  const handleUpdateBatchSellingPrice = (productId: string, price: number) => {
    setBatchItems(prev => prev.map(item => {
      if (item.productId === productId) {
        return { ...item, sellingPriceVnd: Math.max(0, price) };
      }
      return item;
    }));
  };

  // Filtered items in batch intake modal
  const filteredBatchItems = useMemo(() => {
    return batchItems.filter(item => {
      const matchSearch = item.name.toLowerCase().includes(batchSearch.toLowerCase()) ||
        item.volume.toLowerCase().includes(batchSearch.toLowerCase());
      const matchCat = batchCategoryFilter === 'all' || item.category === batchCategoryFilter;
      const matchSelected = !onlySelectedInBatch || item.quantity > 0;
      return matchSearch && matchCat && matchSelected;
    });
  }, [batchItems, batchSearch, batchCategoryFilter, onlySelectedInBatch]);

  // Batch summary totals
  const batchSummary = useMemo(() => {
    const selectedItems = batchItems.filter(i => i.quantity > 0);
    const totalCount = selectedItems.length;
    const totalQuantity = selectedItems.reduce((sum, i) => sum + i.quantity, 0);
    const totalCostVnd = selectedItems.reduce((sum, i) => sum + (i.quantity * i.costPriceVnd), 0);
    const totalStockAfter = batchItems.reduce((sum, i) => sum + (i.currentStock + i.quantity), 0);
    return { totalCount, totalQuantity, totalCostVnd, totalStockAfter, selectedItems };
  }, [batchItems]);

  const handleSubmitBatchIntake = async (e: React.FormEvent) => {
    e.preventDefault();
    setBatchError('');

    const itemsToSubmit = batchSummary.selectedItems.map(i => ({
      productId: i.productId,
      delta: i.quantity,
      costPriceVnd: i.costPriceVnd,
      sellingPriceVnd: i.sellingPriceVnd
    }));

    if (itemsToSubmit.length === 0) {
      setBatchError('Vui lòng nhập số lượng (> 0) cho ít nhất một món để tạo phiếu nhập');
      return;
    }

    setIsSubmittingBatch(true);
    try {
      const batchPayload = {
        items: itemsToSubmit,
        transferDate: batchTransferDate || undefined,
        responsiblePerson: batchResponsiblePerson.trim() || undefined,
        note: batchNote.trim() || 'Nhập hàng vào kho quầy'
      };
      const clientRequestId = stableRequestId('drink-batch', batchPayload);
      const res = await apiFetch('/api/admin/inventory/batch-intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...batchPayload,
          clientRequestId
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Lỗi khi xử lý phiếu nhập hàng');
      }

      completeRequest('drink-batch');
      setIsBatchIntakeModalOpen(false);
      onRefreshProducts();
      showToast(`Đã nhập kho thành công ${batchSummary.totalCount} mặt hàng (${batchSummary.totalQuantity} đơn vị)`);
    } catch (err: any) {
      setBatchError(err.message || 'Lỗi khi nhập hàng');
    } finally {
      setIsSubmittingBatch(false);
    }
  };

  // ================= MODAL 3: SỬA SẢN PHẨM =================
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editName, setEditName] = useState('');
  const [editTag, setEditTag] = useState('');
  const [editVolume, setEditVolume] = useState('');
  const [editUnit, setEditUnit] = useState('Chai');
  const [editCategory, setEditCategory] = useState('water');
  const [editCostPrice, setEditCostPrice] = useState(0);
  const [editSellingPrice, setEditSellingPrice] = useState(0);
  const [editMinStock, setEditMinStock] = useState(5);
  const [editImage, setEditImage] = useState('');
  const [editIsAvailable, setEditIsAvailable] = useState(true);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState('');
  const [isAddingCategoryInEdit, setIsAddingCategoryInEdit] = useState(false);

  const handleOpenEdit = (p: Product) => {
    setEditingProduct(p);
    setEditName(p.name);
    setEditTag(p.tag || '');
    setEditVolume(p.volume);
    setEditUnit(p.unit || 'Chai');
    setEditCategory(p.category);
    setEditCostPrice(p.costPriceVnd || 0);
    setEditSellingPrice(p.priceVnd);
    setEditMinStock(p.minStockThreshold || 5);
    setEditImage(p.imageSvg || '');
    setEditIsAvailable(p.isAvailable !== false);
    setEditError('');
    setIsAddingCategoryInEdit(false);
    setNewCategoryNameInput('');
  };

  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setEditError('');
    setIsSubmittingEdit(true);

    try {
      const res = await apiFetch(`/api/admin/products/${editingProduct.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          tag: editTag.trim(),
          volume: editVolume.trim(),
          unit: editUnit.trim() || 'Chai',
          category: editCategory,
          costPriceVnd: editCostPrice,
          priceVnd: editSellingPrice,
          minStockThreshold: editMinStock,
          imageSvg: editImage.trim(),
          isAvailable: editIsAvailable
        })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Không thể cập nhật sản phẩm');
      }
      setEditingProduct(null);
      onRefreshProducts();
      showToast(`Đã cập nhật sản phẩm "${editName.trim()}"`);
    } catch (err: any) {
      setEditError(err.message || 'Lỗi cập nhật sản phẩm');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleDeleteProduct = async (p: Product) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa sản phẩm "${p.name}" khỏi danh mục bán?`)) {
      return;
    }
    try {
      const res = await apiFetch(`/api/admin/products/${p.id}`, { method: 'DELETE' });
      if (!res.ok) {
        throw new Error('Lỗi khi xóa sản phẩm');
      }
      onRefreshProducts();
      showToast(`Đã xóa món "${p.name}" khỏi danh mục`);
    } catch (err: any) {
      alert(err.message || 'Không thể xóa sản phẩm');
    }
  };

  // Tính toán số lượng sản phẩm sắp hết và hết hàng
  const { lowStockCount, outOfStockCount } = useMemo(() => {
    let low = 0;
    let out = 0;
    products.forEach(p => {
      const s = p.stock ?? 0;
      const threshold = p.minStockThreshold !== undefined ? p.minStockThreshold : 5;
      if (s <= 0) {
        out++;
      } else if (s > 0 && s <= threshold) {
        low++;
      }
    });
    return { lowStockCount: low, outOfStockCount: out };
  }, [products]);

  // Filter products for main table
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.volume.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;
      let matchesStock = true;
      if (stockFilter === 'out') matchesStock = (p.stock ?? 0) <= 0;
      if (stockFilter === 'low') {
        const threshold = p.minStockThreshold !== undefined ? p.minStockThreshold : 5;
        matchesStock = (p.stock ?? 0) > 0 && (p.stock ?? 0) <= threshold;
      }
      return matchesSearch && matchesCategory && matchesStock;
    });
  }, [products, searchQuery, categoryFilter, stockFilter]);

  const getCategoryLabel = (catId: string) => {
    const found = categories.find(c => c.id === catId);
    return found ? found.name : catId;
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1300px', margin: '0 auto' }}>
      {/* TOAST NOTIFICATION */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '24px',
          backgroundColor: '#065F46',
          color: '#FFFFFF',
          padding: '12px 20px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 2000,
          fontWeight: 700,
          fontSize: '13px'
        }}>
          {toastMessage}
        </div>
      )}

      {/* HEADER SECTION */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px',
        marginBottom: '20px'
      }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', margin: 0 }}>
            Quản Lý & Nhập Kho Nước Giải Khát
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748B' }}>
            Tách biệt riêng tạo món mới vào menu và tạo phiếu nhập kho cho nhiều món cùng lúc
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {/* NÚT 1: THÊM MÓN MỚI (MODAL RIÊNG BIỆT) */}
          <button
            onClick={handleOpenCreateModal}
            style={{
              padding: '10px 18px',
              backgroundColor: '#FFFFFF',
              color: '#0F172A',
              border: '1px solid #CBD5E1',
              borderRadius: '8px',
              fontWeight: 800,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}
          >
            + Thêm Món Mới
          </button>

          {/* NÚT 2: NHẬP HÀNG VÀO KHO (PHIẾU NHẬP ĐA MÓN RIÊNG BIỆT) */}
          <button
            onClick={() => handleOpenBatchIntake()}
            style={{
              padding: '10px 20px',
              backgroundColor: 'var(--color-primary)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 800,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 6px rgba(10, 107, 74, 0.25)'
            }}
          >
            Nhập Hàng Vào Kho
          </button>
        </div>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div style={{
        backgroundColor: '#FFFFFF',
        padding: '14px 18px',
        borderRadius: '10px',
        border: '1px solid #E2E8F0',
        marginBottom: '18px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', flex: 1 }}>
          <input
            type="text"
            placeholder="Tìm theo tên nước, đồ ăn..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              padding: '8px 14px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              fontSize: '13px',
              minWidth: '220px',
              outline: 'none'
            }}
          />
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              fontSize: '13px',
              backgroundColor: '#FFFFFF',
              cursor: 'pointer'
            }}
          >
            <option value="all">Tất cả hạng mục ({products.length})</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => setStockFilter('all')}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 700,
                border: '1px solid #CBD5E1',
                backgroundColor: stockFilter === 'all' ? '#0F172A' : '#FFFFFF',
                color: stockFilter === 'all' ? '#FFFFFF' : '#475569',
                cursor: 'pointer'
              }}
            >
              Tất cả
            </button>
            <button
              onClick={() => setStockFilter(stockFilter === 'low' ? 'all' : 'low')}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 700,
                border: '1px solid #F59E0B',
                backgroundColor: stockFilter === 'low' ? '#F59E0B' : '#FEF3C7',
                color: stockFilter === 'low' ? '#FFFFFF' : '#B45309',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
              title="Lọc các đồ uống có tồn kho thấp (cần nhập thêm)"
            >
              <span>Sắp hết</span>
              <span style={{
                backgroundColor: stockFilter === 'low' ? 'rgba(255,255,255,0.3)' : '#F59E0B',
                color: '#FFFFFF',
                borderRadius: '10px',
                padding: '1px 6px',
                fontSize: '11px',
                fontWeight: 800
              }}>
                {lowStockCount}
              </span>
            </button>
            <button
              onClick={() => setStockFilter(stockFilter === 'out' ? 'all' : 'out')}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 700,
                border: '1px solid #EF4444',
                backgroundColor: stockFilter === 'out' ? '#EF4444' : '#FEE2E2',
                color: stockFilter === 'out' ? '#FFFFFF' : '#B91C1C',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
              title="Lọc các đồ uống đã hết sạch trong kho (tồn kho = 0)"
            >
              <span>Hết hàng</span>
              <span style={{
                backgroundColor: stockFilter === 'out' ? 'rgba(255,255,255,0.3)' : '#EF4444',
                color: '#FFFFFF',
                borderRadius: '10px',
                padding: '1px 6px',
                fontSize: '11px',
                fontWeight: 800
              }}>
                {outOfStockCount}
              </span>
            </button>
          </div>
        </div>

        <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>
          Hiển thị: <strong style={{ color: '#0F172A' }}>{filteredProducts.length}</strong> / {products.length} món
        </div>
      </div>

      {/* THÔNG BÁO NGỮ CẢNH KHI ĐANG LỌC SẮP HẾT HOẶC HẾT HÀNG */}
      {stockFilter === 'low' && (
        <div style={{
          padding: '10px 16px',
          backgroundColor: '#FEF3C7',
          border: '1px solid #FCD34D',
          borderRadius: '8px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          color: '#92400E',
          fontSize: '13px',
          fontWeight: 600
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px' }}>⚠️</span>
            <span>
              {lowStockCount > 0
                ? <>Đang lọc: Có <strong>{lowStockCount}</strong> món nước uống sắp hết hàng (tồn kho &le; ngưỡng cảnh báo).</>
                : <>Hiện tại <strong>không có món nào sắp hết hàng</strong>.</>}
            </span>
          </div>
          <button
            onClick={() => setStockFilter('all')}
            style={{
              padding: '4px 10px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #F59E0B',
              borderRadius: '6px',
              color: '#B45309',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            ✕ Xem tất cả
          </button>
        </div>
      )}

      {stockFilter === 'out' && (
        <div style={{
          padding: '10px 16px',
          backgroundColor: '#FEE2E2',
          border: '1px solid #FCA5A5',
          borderRadius: '8px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          color: '#991B1B',
          fontSize: '13px',
          fontWeight: 600
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px' }}>🚨</span>
            <span>
              {outOfStockCount > 0
                ? <>Đang lọc: Có <strong>{outOfStockCount}</strong> món nước uống đã hết sạch trong kho (tồn kho = 0).</>
                : <>Kho hàng đầy đủ! Hiện <strong>không có món nào hết hàng</strong>.</>}
            </span>
          </div>
          <button
            onClick={() => setStockFilter('all')}
            style={{
              padding: '4px 10px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #EF4444',
              borderRadius: '6px',
              color: '#B91C1C',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            ✕ Xem tất cả
          </button>
        </div>
      )}

      {/* PRODUCTS TABLE */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '10px',
        border: '1px solid #E2E8F0',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
              <th style={{ padding: '12px 16px', fontWeight: 800, color: '#475569', width: '70px' }}>Ảnh</th>
              <th style={{ padding: '12px 16px', fontWeight: 800, color: '#475569' }}>Tên sản phẩm</th>
              <th style={{ padding: '12px 16px', fontWeight: 800, color: '#475569' }}>Dung tích / ĐVT</th>
              <th style={{ padding: '12px 16px', fontWeight: 800, color: '#475569' }}>Hạng mục</th>
              <th style={{ padding: '12px 16px', fontWeight: 800, color: '#475569' }}>Tồn kho</th>
              <th style={{ padding: '12px 16px', fontWeight: 800, color: '#475569' }}>Giá vốn (nhập)</th>
              <th style={{ padding: '12px 16px', fontWeight: 800, color: '#475569' }}>Giá bán</th>
              <th style={{ padding: '12px 16px', fontWeight: 800, color: '#475569', textAlign: 'right' }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>
                    {stockFilter === 'out' ? '🎉' : stockFilter === 'low' ? '✨' : '🔍'}
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '14px', color: '#1E293B' }}>
                    {stockFilter === 'out'
                      ? 'Không có món nước nào hết hàng!'
                      : stockFilter === 'low'
                        ? 'Không có món nước nào sắp hết hàng!'
                        : 'Không tìm thấy món nước nào phù hợp với bộ lọc.'}
                  </div>
                  {stockFilter !== 'all' && (
                    <button
                      onClick={() => setStockFilter('all')}
                      style={{
                        marginTop: '12px',
                        padding: '6px 14px',
                        backgroundColor: '#0F172A',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Quay lại xem tất cả
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              filteredProducts.map((p, idx) => {
              const isOut = p.stock === 0;
              const isLow = p.stock > 0 && p.stock <= (p.minStockThreshold || 5);
              return (
                <tr
                  key={p.id}
                  style={{
                    borderBottom: '1px solid #F1F5F9',
                    backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#FAFBFD'
                  }}
                >
                  <td style={{ padding: '10px 16px' }}>
                    <div style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      backgroundColor: '#F1F5F9',
                      border: '1px solid #E2E8F0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <img
                        src={p.imageSvg || '/images/products/aquafina-500ml.png'}
                        alt={p.name}
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    </div>
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '14px' }}>{p.name}</div>
                    {p.tag && (
                      <span style={{ fontSize: '11px', color: '#64748B', backgroundColor: '#F1F5F9', padding: '2px 6px', borderRadius: '4px' }}>
                        {p.tag}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '10px 16px', color: '#475569', fontWeight: 600 }}>
                    {p.volume}
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 700,
                      backgroundColor: '#F1F5F9',
                      color: '#334155'
                    }}>
                      {getCategoryLabel(p.category)}
                    </span>
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{
                      padding: '4px 10px',
                      borderRadius: '12px',
                      fontWeight: 800,
                      fontSize: '12px',
                      backgroundColor: isOut ? '#FEE2E2' : isLow ? '#FEF3C7' : '#ECFDF5',
                      color: isOut ? '#DC2626' : isLow ? '#D97706' : '#059669'
                    }}>
                      {p.stock} {p.unit || 'món'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 16px', fontWeight: 700, color: '#64748B' }}>
                    {formatVnd(p.costPriceVnd || 0)}
                  </td>
                  <td style={{ padding: '10px 16px', fontWeight: 800, color: 'var(--color-primary)' }}>
                    {formatVnd(p.priceVnd)}
                  </td>
                  <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      <button
                        onClick={() => handleOpenBatchIntake(p.id)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: 'var(--color-primary-light)',
                          color: 'var(--color-primary)',
                          border: '1px solid var(--color-primary)',
                          borderRadius: '6px',
                          fontWeight: 700,
                          fontSize: '12px',
                          cursor: 'pointer'
                        }}
                      >
                        Nhập hàng
                      </button>
                      <button
                        onClick={() => handleOpenEdit(p)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#F1F5F9',
                          color: '#334155',
                          border: '1px solid #CBD5E1',
                          borderRadius: '6px',
                          fontWeight: 700,
                          fontSize: '12px',
                          cursor: 'pointer'
                        }}
                      >
                        Sửa
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(p)}
                        style={{
                          padding: '6px 10px',
                          backgroundColor: '#FFF1F2',
                          color: '#E11D48',
                          border: '1px solid #FECDD3',
                          borderRadius: '6px',
                          fontWeight: 700,
                          fontSize: '12px',
                          cursor: 'pointer'
                        }}
                      >
                        Xóa
                      </button>
                    </div>
                  </td>
                </tr>
              );
            }))}
          </tbody>
        </table>
      </div>

      {/* ================= MODAL 1: THÊM MÓN MỚI VÀO THỰC ĐƠN (ĐỘC LẬP HOÀN TOÀN) ================= */}
      {isCreateModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '560px',
            maxHeight: '92vh',
            overflowY: 'auto',
            padding: '24px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#0F172A' }}>
                  Thêm Món Mới Vào Thực Đơn
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>
                  Tạo sản phẩm mới, phân loại hạng mục và tải ảnh sản phẩm trực quan
                </p>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748B' }}
              >
                ✕
              </button>
            </div>

            {createError && (
              <div style={{
                backgroundColor: '#FEE2E2',
                color: '#B91C1C',
                padding: '10px 14px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
                marginBottom: '16px'
              }}>
                {createError}
              </div>
            )}

            <form onSubmit={handleSubmitCreateProduct}>
              {/* Tên sản phẩm */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontWeight: 800, fontSize: '12px', color: '#475569', marginBottom: '6px' }}>
                  TÊN SẢN PHẨM MỚI *
                </label>
                <input
                  type="text"
                  required
                  placeholder="VD: Nước tăng lực Monster Energy, Mì ly Modern..."
                  value={newProductName}
                  onChange={e => setNewProductName(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                />
              </div>

              {/* Tag nhãn phụ */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontWeight: 800, fontSize: '12px', color: '#475569', marginBottom: '6px' }}>
                  NHÃN PHỤ / TAG (TÙY CHỌN)
                </label>
                <input
                  type="text"
                  placeholder="VD: Tăng lực, Sườn hầm, Snack khoai tây, Ít đường, Cay nồng..."
                  value={newProductTag}
                  onChange={e => setNewProductTag(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                />
                <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>
                  Nhãn nhỏ nổi bật màu xanh hiển thị ở góc sản phẩm trên thực đơn
                </div>
              </div>

              {/* Dung tích, Đơn vị tính & Hạng mục */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 800, fontSize: '12px', color: '#475569', marginBottom: '6px' }}>
                    DUNG TÍCH / QUY CÁCH
                  </label>
                  <input
                    type="text"
                    placeholder="VD: 500ml, 65g..."
                    value={newProductVolume}
                    onChange={e => setNewProductVolume(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 800, fontSize: '12px', color: '#475569', marginBottom: '6px' }}>
                    ĐƠN VỊ TÍNH (ĐVT) *
                  </label>
                  <input
                    type="text"
                    required
                    list="common-units-list-create"
                    placeholder="VD: Chai, Lon, Ly..."
                    value={newProductUnit}
                    onChange={e => setNewProductUnit(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                  <datalist id="common-units-list-create">
                    {COMMON_UNITS.map(u => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontWeight: 800, fontSize: '12px', color: '#475569' }}>
                      HẠNG MỤC *
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsAddingCategoryInCreate(!isAddingCategoryInCreate)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-primary)',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        padding: 0
                      }}
                    >
                      {isAddingCategoryInCreate ? 'Đóng' : '+ Thêm hạng mục'}
                    </button>
                  </div>
                  <select
                    value={newProductCategory}
                    onChange={e => setNewProductCategory(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', backgroundColor: '#FFFFFF' }}
                  >
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Ô thêm hạng mục mới inline */}
              {isAddingCategoryInCreate && (
                <div style={{
                  marginBottom: '14px',
                  padding: '10px 12px',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '6px',
                  display: 'flex',
                  gap: '8px',
                  alignItems: 'center'
                }}>
                  <input
                    type="text"
                    placeholder="Nhập tên hạng mục mới (VD: Bia & Cồn nhẹ, Ăn vặt...)"
                    value={newCategoryNameInput}
                    onChange={e => setNewCategoryNameInput(e.target.value)}
                    style={{ flex: 1, padding: '8px 10px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '12px' }}
                  />
                  <button
                    type="button"
                    disabled={isSavingCategory || !newCategoryNameInput.trim()}
                    onClick={() => handleSaveNewCategory('create')}
                    style={{
                      padding: '8px 14px',
                      backgroundColor: 'var(--color-primary)',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    {isSavingCategory ? 'Đang lưu...' : 'Thêm'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingCategoryInCreate(false);
                      setNewCategoryNameInput('');
                    }}
                    style={{
                      padding: '8px 10px',
                      backgroundColor: '#FFFFFF',
                      color: '#64748B',
                      border: '1px solid #CBD5E1',
                      borderRadius: '4px',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    Hủy
                  </button>
                </div>
              )}

              {/* Giá vốn & Giá bán */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 800, fontSize: '12px', color: '#475569', marginBottom: '6px' }}>
                    ĐƠN GIÁ VỐN (VNĐ)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="500"
                    value={newProductCostPrice}
                    onChange={e => setNewProductCostPrice(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 800, fontSize: '12px', color: '#475569', marginBottom: '6px' }}>
                    GIÁ BÁN NIÊM YẾT (VNĐ) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    required
                    value={newProductSellingPrice}
                    onChange={e => setNewProductSellingPrice(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                </div>
              </div>

              {/* Tồn kho ban đầu & Ngưỡng báo */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 800, fontSize: '12px', color: '#475569', marginBottom: '6px' }}>
                    SỐ LƯỢNG TỒN KHO BAN ĐẦU
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newProductInitialStock}
                    onChange={e => setNewProductInitialStock(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 800, fontSize: '12px', color: '#475569', marginBottom: '6px' }}>
                    NGƯỠNG BÁO SẮP HẾT
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newProductMinStock}
                    onChange={e => setNewProductMinStock(Math.max(1, parseInt(e.target.value, 10) || 5))}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                </div>
              </div>

              {/* KHU VỰC KÉO THẢ ẢNH */}
              <ImageDropzone
                imageUrl={newProductImage}
                onChange={setNewProductImage}
                disabled={isSubmittingCreate}
              />

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    color: '#475569',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCreate}
                  style={{
                    padding: '10px 22px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: 'var(--color-primary)',
                    color: '#FFFFFF',
                    fontWeight: 800,
                    fontSize: '13px',
                    cursor: isSubmittingCreate ? 'not-allowed' : 'pointer',
                    opacity: isSubmittingCreate ? 0.7 : 1
                  }}
                >
                  {isSubmittingCreate ? 'Đang Tạo...' : 'Tạo Món Mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL 2: PHIẾU NHẬP HÀNG ĐA MÓN (BATCH INTAKE) ================= */}
      {isBatchIntakeModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '1040px',
            maxHeight: '92vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#0F172A' }}>
                  Phiếu Nhập Hàng Vào Kho Quầy Nước
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#64748B' }}>
                  Nhập đồng thời nhiều sản phẩm vào kho, tự động tính số lượng sau nhập, tổng tiền vốn và giá bán
                </p>
              </div>
              <button
                onClick={() => setIsBatchIntakeModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748B' }}
              >
                ✕
              </button>
            </div>

            {/* Error Message */}
            {batchError && (
              <div style={{
                margin: '12px 24px 0',
                backgroundColor: '#FEE2E2',
                color: '#B91C1C',
                padding: '10px 14px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600
              }}>
                {batchError}
              </div>
            )}

            {/* Modal Body with Scroll */}
            <div style={{ padding: '18px 24px', overflowY: 'auto', flex: 1 }}>
              {/* THÔNG TIN PHIẾU NHẬP CHUNG */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1.5fr',
                gap: '12px',
                padding: '14px',
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                marginBottom: '16px'
              }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 800, fontSize: '11px', color: '#475569', marginBottom: '4px' }}>
                    NGÀY NHẬN HÀNG *
                  </label>
                  <input
                    type="date"
                    required
                    value={batchTransferDate}
                    onChange={e => setBatchTransferDate(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 800, fontSize: '11px', color: '#475569', marginBottom: '4px' }}>
                    NGƯỜI PHỤ TRÁCH / GIAO NHẬN
                  </label>
                  <input
                    type="text"
                    placeholder="VD: Anh Tuấn (Kho), Quản lý ca..."
                    value={batchResponsiblePerson}
                    onChange={e => setBatchResponsiblePerson(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 800, fontSize: '11px', color: '#475569', marginBottom: '4px' }}>
                    GHI CHÚ PHIẾU NHẬP
                  </label>
                  <input
                    type="text"
                    placeholder="VD: Nhập thùng 24 chai từ nhà phân phối..."
                    value={batchNote}
                    onChange={e => setBatchNote(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px' }}
                  />
                </div>
              </div>

              {/* TÌM KIẾM VÀ BỘ LỌC TRONG MODAL */}
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '10px',
                marginBottom: '12px'
              }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
                  <input
                    type="text"
                    placeholder="Tìm nhanh món cần nhập..."
                    value={batchSearch}
                    onChange={e => setBatchSearch(e.target.value)}
                    style={{
                      padding: '7px 12px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontSize: '12px',
                      minWidth: '180px'
                    }}
                  />
                  <select
                    value={batchCategoryFilter}
                    onChange={e => setBatchCategoryFilter(e.target.value)}
                    style={{
                      padding: '7px 10px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontSize: '12px',
                      backgroundColor: '#FFFFFF'
                    }}
                  >
                    <option value="all">Tất cả hạng mục</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={onlySelectedInBatch}
                      onChange={e => setOnlySelectedInBatch(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    Chỉ xem món có chọn nhập ({batchSummary.totalCount})
                  </label>
                </div>
              </div>

              {/* BẢNG DANH SÁCH MÓN ĐỂ NHẬP KHO */}
              <div style={{
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                overflow: 'hidden'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                      <th style={{ padding: '10px 14px', fontWeight: 800, color: '#475569' }}>Mặt hàng</th>
                      <th style={{ padding: '10px 14px', fontWeight: 800, color: '#475569', textAlign: 'center', width: '150px' }}>
                        Số lượng nhập
                      </th>
                      <th style={{ padding: '10px 14px', fontWeight: 800, color: '#059669', textAlign: 'center', width: '130px', backgroundColor: '#ECFDF5' }}>
                        SL sau nhập
                      </th>
                      <th style={{ padding: '10px 14px', fontWeight: 800, color: '#475569', width: '120px' }}>
                        Giá vốn (VNĐ)
                      </th>
                      <th style={{ padding: '10px 14px', fontWeight: 800, color: '#475569', width: '120px' }}>
                        Giá bán niêm yết
                      </th>
                      <th style={{ padding: '10px 14px', fontWeight: 800, color: '#475569', textAlign: 'right', width: '120px' }}>
                        Thành tiền vốn
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBatchItems.map((item, idx) => {
                      const isSelected = item.quantity > 0;
                      const lineTotal = item.quantity * item.costPriceVnd;
                      const stockAfterIntake = item.currentStock + item.quantity;
                      return (
                        <tr
                          key={item.productId}
                          style={{
                            borderBottom: '1px solid #F1F5F9',
                            backgroundColor: isSelected ? '#F0FDF4' : idx % 2 === 0 ? '#FFFFFF' : '#FAFBFD',
                            transition: 'background-color 0.15s'
                          }}
                        >
                          {/* Mặt hàng */}
                          <td style={{ padding: '8px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '6px',
                                backgroundColor: '#FFFFFF',
                                border: '1px solid #E2E8F0',
                                overflow: 'hidden',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                              }}>
                                <img
                                  src={item.imageSvg || '/images/products/aquafina-500ml.png'}
                                  alt={item.name}
                                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                  }}
                                />
                              </div>
                              <div>
                                <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '13px' }}>
                                  {item.name}
                                </div>
                                <div style={{ fontSize: '11px', color: '#64748B' }}>
                                  {item.volume} &bull; Tồn hiện tại: <strong style={{ color: item.currentStock === 0 ? '#DC2626' : '#0F172A' }}>{item.currentStock} {item.unit || 'món'}</strong>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Số lượng nhập */}
                          <td style={{ padding: '8px 14px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                              <input
                                type="number"
                                min="0"
                                value={item.quantity === 0 ? '' : item.quantity}
                                placeholder="0"
                                onChange={e => handleUpdateBatchQuantity(item.productId, parseInt(e.target.value, 10) || 0)}
                                style={{
                                  width: '80px',
                                  padding: '6px 8px',
                                  borderRadius: '6px',
                                  border: isSelected ? '1.5px solid #10B981' : '1px solid #CBD5E1',
                                  textAlign: 'center',
                                  fontWeight: 800,
                                  fontSize: '13px',
                                  backgroundColor: isSelected ? '#FFFFFF' : '#F8FAFC'
                                }}
                              />
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateBatchQuantity(item.productId, item.quantity + 12)}
                                  style={{
                                    padding: '2px 5px',
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    borderRadius: '3px',
                                    border: '1px solid #CBD5E1',
                                    backgroundColor: '#FFFFFF',
                                    cursor: 'pointer'
                                  }}
                                >
                                  +12
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateBatchQuantity(item.productId, item.quantity + 24)}
                                  style={{
                                    padding: '2px 5px',
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    borderRadius: '3px',
                                    border: '1px solid #CBD5E1',
                                    backgroundColor: '#FFFFFF',
                                    cursor: 'pointer'
                                  }}
                                >
                                  +24
                                </button>
                                {isSelected && (
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateBatchQuantity(item.productId, 0)}
                                    style={{
                                      padding: '2px 5px',
                                      fontSize: '10px',
                                      fontWeight: 700,
                                      borderRadius: '3px',
                                      border: '1px solid #FECDD3',
                                      backgroundColor: '#FFF1F2',
                                      color: '#E11D48',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    Xóa
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* CỘT MỚI: SL SAU NHẬP = TỒN HIỆN TẠI + SL VỪA NHẬP */}
                          <td style={{ padding: '8px 14px', textAlign: 'center', backgroundColor: isSelected ? '#ECFDF5' : 'transparent' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              <span style={{
                                fontSize: '14px',
                                fontWeight: 900,
                                color: isSelected ? '#047857' : '#475569'
                              }}>
                                {stockAfterIntake}
                              </span>
                              {isSelected && (
                                <span style={{
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  color: '#059669',
                                  backgroundColor: '#D1FAE5',
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  marginTop: '2px'
                                }}>
                                  +{item.quantity} ({item.currentStock} &rarr; {stockAfterIntake})
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Đơn giá vốn */}
                          <td style={{ padding: '8px 14px' }}>
                            <input
                              type="number"
                              min="0"
                              step="500"
                              value={item.costPriceVnd}
                              onChange={e => handleUpdateBatchCostPrice(item.productId, parseInt(e.target.value, 10) || 0)}
                              style={{
                                width: '100%',
                                padding: '6px 8px',
                                borderRadius: '6px',
                                border: '1px solid #CBD5E1',
                                fontSize: '12px'
                              }}
                            />
                          </td>

                          {/* Giá bán niêm yết */}
                          <td style={{ padding: '8px 14px' }}>
                            <input
                              type="number"
                              min="0"
                              step="1000"
                              value={item.sellingPriceVnd}
                              onChange={e => handleUpdateBatchSellingPrice(item.productId, parseInt(e.target.value, 10) || 0)}
                              style={{
                                width: '100%',
                                padding: '6px 8px',
                                borderRadius: '6px',
                                border: '1px solid #CBD5E1',
                                fontSize: '12px'
                              }}
                            />
                          </td>

                          {/* Thành tiền */}
                          <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 800, color: isSelected ? '#0F172A' : '#94A3B8' }}>
                            {formatVnd(lineTotal)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer with Totals Summary */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid #E2E8F0',
              backgroundColor: '#F8FAFC',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '14px'
            }}>
              <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: '12px', color: '#64748B' }}>Số món nhập: </span>
                  <strong style={{ fontSize: '14px', color: '#0F172A' }}>{batchSummary.totalCount} món</strong>
                </div>
                <div>
                  <span style={{ fontSize: '12px', color: '#64748B' }}>Tổng số lượng: </span>
                  <strong style={{ fontSize: '14px', color: '#0F172A' }}>+{batchSummary.totalQuantity} đơn vị</strong>
                </div>
                <div>
                  <span style={{ fontSize: '12px', color: '#64748B' }}>Tổng tiền vốn: </span>
                  <strong style={{ fontSize: '17px', color: 'var(--color-primary)' }}>
                    {formatVnd(batchSummary.totalCostVnd)}
                  </strong>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsBatchIntakeModalOpen(false)}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    color: '#475569',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  Hủy Bỏ
                </button>
                <button
                  type="button"
                  disabled={isSubmittingBatch || batchSummary.totalCount === 0}
                  onClick={handleSubmitBatchIntake}
                  style={{
                    padding: '10px 24px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: 'var(--color-primary)',
                    color: '#FFFFFF',
                    fontWeight: 800,
                    fontSize: '13px',
                    cursor: (isSubmittingBatch || batchSummary.totalCount === 0) ? 'not-allowed' : 'pointer',
                    opacity: (isSubmittingBatch || batchSummary.totalCount === 0) ? 0.6 : 1,
                    boxShadow: '0 2px 6px rgba(10, 107, 74, 0.25)'
                  }}
                >
                  {isSubmittingBatch ? 'Đang Nhập Kho...' : `Xác Nhận Nhập Hàng (${batchSummary.totalCount} món)`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL 3: SỬA SẢN PHẨM ================= */}
      {editingProduct && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '540px',
            maxHeight: '92vh',
            overflowY: 'auto',
            padding: '24px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#0F172A' }}>
                Chỉnh Sửa Thông Tin Sản Phẩm
              </h3>
              <button
                onClick={() => setEditingProduct(null)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748B' }}
              >
                ✕
              </button>
            </div>

            {editError && (
              <div style={{ backgroundColor: '#FEE2E2', color: '#B91C1C', padding: '10px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, marginBottom: '16px' }}>
                {editError}
              </div>
            )}

            <form onSubmit={handleSubmitEdit}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontWeight: 800, fontSize: '12px', color: '#475569', marginBottom: '6px' }}>
                  TÊN SẢN PHẨM *
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                />
              </div>

              {/* Tag nhãn phụ */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontWeight: 800, fontSize: '12px', color: '#475569', marginBottom: '6px' }}>
                  NHÃN PHỤ / TAG (TÙY CHỌN)
                </label>
                <input
                  type="text"
                  placeholder="VD: Tăng lực, Sườn hầm, Snack khoai tây, Ít đường, Cay nồng..."
                  value={editTag}
                  onChange={e => setEditTag(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                />
                <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>
                  Nhãn nhỏ nổi bật màu xanh hiển thị ở góc sản phẩm trên thực đơn
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 800, fontSize: '12px', color: '#475569', marginBottom: '6px' }}>
                    DUNG TÍCH / QUY CÁCH
                  </label>
                  <input
                    type="text"
                    placeholder="VD: 500ml, 65g..."
                    value={editVolume}
                    onChange={e => setEditVolume(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 800, fontSize: '12px', color: '#475569', marginBottom: '6px' }}>
                    ĐƠN VỊ TÍNH (ĐVT) *
                  </label>
                  <input
                    type="text"
                    required
                    list="common-units-list-edit"
                    placeholder="VD: Chai, Lon, Ly..."
                    value={editUnit}
                    onChange={e => setEditUnit(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                  <datalist id="common-units-list-edit">
                    {COMMON_UNITS.map(u => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontWeight: 800, fontSize: '12px', color: '#475569' }}>
                      HẠNG MỤC *
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsAddingCategoryInEdit(!isAddingCategoryInEdit)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-primary)',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        padding: 0
                      }}
                    >
                      {isAddingCategoryInEdit ? 'Đóng' : '+ Thêm'}
                    </button>
                  </div>
                  <select
                    value={editCategory}
                    onChange={e => setEditCategory(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', backgroundColor: '#FFFFFF' }}
                  >
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Ô thêm hạng mục mới inline trong edit */}
              {isAddingCategoryInEdit && (
                <div style={{
                  marginBottom: '14px',
                  padding: '10px 12px',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '6px',
                  display: 'flex',
                  gap: '8px',
                  alignItems: 'center'
                }}>
                  <input
                    type="text"
                    placeholder="Tên hạng mục mới..."
                    value={newCategoryNameInput}
                    onChange={e => setNewCategoryNameInput(e.target.value)}
                    style={{ flex: 1, padding: '8px 10px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '12px' }}
                  />
                  <button
                    type="button"
                    disabled={isSavingCategory || !newCategoryNameInput.trim()}
                    onClick={() => handleSaveNewCategory('edit')}
                    style={{
                      padding: '8px 14px',
                      backgroundColor: 'var(--color-primary)',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Lưu
                  </button>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 800, fontSize: '12px', color: '#475569', marginBottom: '6px' }}>
                    GIÁ VỐN NHẬP (VNĐ)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="500"
                    value={editCostPrice}
                    onChange={e => setEditCostPrice(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 800, fontSize: '12px', color: '#475569', marginBottom: '6px' }}>
                    GIÁ BÁN (VNĐ) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    required
                    value={editSellingPrice}
                    onChange={e => setEditSellingPrice(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 800, fontSize: '12px', color: '#475569', marginBottom: '6px' }}>
                    NGƯỠNG BÁO SẮP HẾT
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={editMinStock}
                    onChange={e => setEditMinStock(Math.max(1, parseInt(e.target.value, 10) || 5))}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 800, fontSize: '12px', color: '#475569', marginBottom: '6px' }}>
                    TRẠNG THÁI BÁN
                  </label>
                  <select
                    value={editIsAvailable ? 'true' : 'false'}
                    onChange={e => setEditIsAvailable(e.target.value === 'true')}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', backgroundColor: '#FFFFFF' }}
                  >
                    <option value="true">Đang kinh doanh</option>
                    <option value="false">Tạm ngưng phục vụ</option>
                  </select>
                </div>
              </div>

              {/* KHU VỰC KÉO THẢ ẢNH TRONG FORM SỬA */}
              <ImageDropzone
                imageUrl={editImage}
                onChange={setEditImage}
                disabled={isSubmittingEdit}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    color: '#475569',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEdit}
                  style={{
                    padding: '10px 22px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: 'var(--color-primary)',
                    color: '#FFFFFF',
                    fontWeight: 800,
                    fontSize: '13px',
                    cursor: isSubmittingEdit ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isSubmittingEdit ? 'Đang Lưu...' : 'Lưu Thay Đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
