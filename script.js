// ===== CẤU HÌNH =====
const STORAGE_KEY = 'archive_data';
const HISTORY_KEY = 'archive_history';

// ===== STATE =====
let data = { stories: [], games: [] };
let historyData = []; 
let currentTab = 'stories';
let editingId = null;
let searchQuery = '';
let activeFilters = {}; 
let currentProgressItem = null; 
let uploadedImageBase64 = ''; 
let sortBy = 'newest'; 
let filterFavorites = false; 

// ===== LOAD / SAVE / BACKUP =====
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      data.stories = parsed.stories || [];
      data.games = parsed.games || [];
    }
    const histRaw = localStorage.getItem(HISTORY_KEY);
    if (histRaw) historyData = JSON.parse(histRaw);
  } catch (e) { console.error('Lỗi đọc dữ liệu:', e); }
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    localStorage.setItem(HISTORY_KEY, JSON.stringify(historyData));
  } catch (e) { alert('Bộ nhớ đầy! Không thể lưu thêm dữ liệu hoặc ảnh quá lớn.'); }
}

function exportData() {
  const backup = { stories: data.stories, games: data.games, history: historyData };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup_archive_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!confirm('CẢNH BÁO: Phục hồi sẽ GHI ĐÈ toàn bộ dữ liệu hiện tại. Bạn có chắc chắn?')) {
    e.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const parsed = JSON.parse(evt.target.result);
      if (parsed.stories && parsed.games) {
        data.stories = parsed.stories;
        data.games = parsed.games;
        if (parsed.history) historyData = parsed.history;
        saveData();
        render();
        renderHistory();
        alert('Phục hồi dữ liệu thành công!');
      } else { alert('File không đúng định dạng!'); }
    } catch (err) { alert('Lỗi đọc file JSON!'); }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ===== HELPERS =====
function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function getCurrentList() { return currentTab === 'stories' ? data.stories : data.games; }

// ===== RENDER CHÍNH =====
function render() {
  let list = getCurrentList();
  
  // 1. Lọc
  let filtered = list.filter(item => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchSearch = ((item.title || '').toLowerCase().includes(q) ||
        (item.author || '').toLowerCase().includes(q) ||
        (item.description || '').toLowerCase().includes(q) ||
        (item.tags || []).some(t => t.toLowerCase().includes(q)));
      if (!matchSearch) return false;
    }
    if (filterFavorites && !item.isFavorite) return false; 
    for (const category in activeFilters) {
      const selected = activeFilters[category];
      if (selected && selected.length > 0) {
        if (!selected.some(val => (item.tags || []).includes(val))) return false;
      }
    }
    return true;
  });

  // 2. Sắp xếp
  filtered.sort((a, b) => {
    if (a.isFavorite && !b.isFavorite) return -1;
    if (!a.isFavorite && b.isFavorite) return 1;
    
    if (sortBy === 'name') return a.title.localeCompare(b.title);
    if (sortBy === 'updated') return (b.updatedAt || 0) - (a.updatedAt || 0);
    return (b.createdAt || 0) - (a.createdAt || 0); 
  });

  const container = document.getElementById('itemsList');
  const emptyMsg = document.getElementById('emptyMessage');

  if (filtered.length === 0) {
    container.innerHTML = '';
    emptyMsg.style.display = 'block';
    emptyMsg.textContent = 'Không tìm thấy kết quả phù hợp.';
    return;
  }

  emptyMsg.style.display = 'none';
  const isStory = currentTab === 'stories';
  const placeholder = isStory ? '📖' : '🎮';

  container.innerHTML = filtered.map(item => {
    const tags = (item.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
    const imageHtml = item.image
      ? `<img src="${escapeHtml(item.image)}" class="item-image" onerror="this.outerHTML='<div class=\\'item-image-placeholder\\'>${placeholder}</div>'">`
      : `<div class="item-image-placeholder">${placeholder}</div>`;

    const openBtn = item.link ? `<button class="btn-open" data-action="open" data-id="${item.id}">🔗 Mở</button>` : '';
    const favClass = item.isFavorite ? 'active' : '';

    return `
      <div class="item-card" data-id="${item.id}">
        <button class="btn-fav ${favClass}" data-action="fav" data-id="${item.id}">⭐</button>
        ${imageHtml}
        <div class="item-body">
          <div class="item-title">${escapeHtml(item.title)}</div>
          ${item.author ? `<div class="item-author">✍️ ${escapeHtml(item.author)}</div>` : ''}
          ${item.description ? `<div class="item-desc">${escapeHtml(item.description)}</div>` : ''}
          ${tags ? `<div class="item-tags">${tags}</div>` : ''}
        </div>
        <div class="item-actions">
          ${openBtn}
          <button class="btn-edit" data-action="edit" data-id="${item.id}">✏️ Sửa</button>
          <button class="btn-delete" data-action="delete" data-id="${item.id}">🗑️ Xóa</button>
        </div>
      </div>
    `;
  }).join('');
}

// ===== RENDER LỊCH SỬ =====
function renderHistory() {
  const container = document.getElementById('historyList');
  const emptyMsg = document.getElementById('emptyHistoryMsg');
  if (historyData.length === 0) {
    container.innerHTML = '';
    emptyMsg.style.display = 'block';
    return;
  }
  emptyMsg.style.display = 'none';
  const sortedHistory = [...historyData].sort((a, b) => b.lastReadAt - a.lastReadAt);

  container.innerHTML = sortedHistory.map(hist => {
    const isStory = hist.type === 'story';
    const placeholder = isStory ? '📖' : '🎮';
    const imageHtml = hist.image
      ? `<img src="${escapeHtml(hist.image)}" class="item-image" onerror="this.outerHTML='<div class=\\'item-image-placeholder\\'>${placeholder}</div>'">`
      : `<div class="item-image-placeholder">${placeholder}</div>`;

    return `
      <div class="item-card">
        ${imageHtml}
        <div class="item-body">
          <div class="item-title">${escapeHtml(hist.title)}</div>
          <div class="item-author">${isStory ? '📖 Truyện' : '🎮 Game'}</div>
          <div class="progress-badge">Đang ở: ${escapeHtml(hist.progress)}</div>
          <div class="item-desc" style="font-size: 0.75rem; color: #666; margin-top: 0.5rem;">Lưu lúc: ${new Date(hist.lastReadAt).toLocaleString('vi-VN')}</div>
        </div>
        <div class="item-actions">
          <a href="${escapeHtml(hist.link)}" target="_blank" rel="noopener" class="btn-continue">▶ Đọc/Chơi tiếp</a>
          <button class="btn-delete" data-action="delete-hist" data-id="${hist.id}">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
}

// ===== CÁC HÀM XỬ LÝ =====
function toggleFavorite(id) {
  const list = getCurrentList();
  const item = list.find(i => i.id === id);
  if (item) {
    item.isFavorite = !item.isFavorite;
    saveData();
    render();
  }
}

function openItemModal(id) {
  const item = getCurrentList().find(i => i.id === id);
  if (!item || !item.link) return;
  currentProgressItem = item;
  const existingHist = historyData.find(h => h.itemId === item.id);
  document.getElementById('modalTitle').textContent = `Mở: ${item.title}`;
  document.getElementById('modalDesc').textContent = currentTab === 'stories' ? 'Bạn đang đọc đến chương nào?' : 'Bạn đang chơi đến level nào?';
  document.getElementById('progressInput').value = existingHist ? existingHist.progress : '';
  document.getElementById('historyModal').style.display = 'flex';
  document.getElementById('progressInput').focus();
}

function saveProgressAndOpen() {
  if (!currentProgressItem) return;
  const progress = document.getElementById('progressInput').value.trim();
  if (progress) {
    const existingIdx = historyData.findIndex(h => h.itemId === currentProgressItem.id);
    const newHist = { id: generateId(), itemId: currentProgressItem.id, title: currentProgressItem.title, image: currentProgressItem.image, link: currentProgressItem.link, type: currentTab === 'stories' ? 'story' : 'game', progress: progress, lastReadAt: Date.now() };
    if (existingIdx !== -1) historyData[existingIdx] = { ...historyData[existingIdx], ...newHist, id: historyData[existingIdx].id };
    else historyData.push(newHist);
    saveData();
  }
  window.open(currentProgressItem.link, '_blank');
  closeModal();
  renderHistory();
}

function closeModal() {
  document.getElementById('historyModal').style.display = 'none';
  document.getElementById('progressInput').value = '';
  currentProgressItem = null;
}

function updateTitles() {
  const isStory = currentTab === 'stories';
  document.getElementById('formTitle').textContent = editingId ? `✏️ Sửa ${isStory ? 'truyện' : 'game'}` : `➕ Thêm ${isStory ? 'truyện' : 'game'} mới`;
  document.getElementById('listTitle').textContent = isStory ? '📖 Danh sách truyện' : '🎮 Danh sách game';
}

function resetForm() {
  document.getElementById('addForm').reset();
  document.getElementById('editId').value = '';
  editingId = null;
  uploadedImageBase64 = '';
  document.getElementById('submitBtn').textContent = 'Thêm mới';
  document.getElementById('cancelBtn').style.display = 'none';
  updateTitles();
}

function handleSubmit(e) {
  e.preventDefault();
  const title = document.getElementById('title').value.trim();
  if (!title) { alert('Vui lòng nhập tiêu đề!'); return; }

  const imageUrl = document.getElementById('image').value.trim();
  const finalImage = uploadedImageBase64 || imageUrl;

  const item = {
    id: editingId || generateId(),
    title: title,
    author: document.getElementById('author').value.trim(),
    description: document.getElementById('description').value.trim(),
    link: document.getElementById('link').value.trim(),
    image: finalImage,
    tags: document.getElementById('tags').value.split(',').map(t => t.trim()).filter(Boolean),
    isFavorite: editingId ? (getCurrentList().find(i => i.id === editingId)?.isFavorite || false) : false,
    createdAt: editingId ? (getCurrentList().find(i => i.id === editingId)?.createdAt || Date.now()) : Date.now(),
    updatedAt: Date.now()
  };

  const list = getCurrentList();
  if (editingId) {
    const idx = list.findIndex(i => i.id === editingId);
    if (idx !== -1) list[idx] = item;
  } else {
    list.unshift(item);
  }
  saveData();
  resetForm();
  render();
}

function editItem(id) {
  const item = getCurrentList().find(i => i.id === id);
  if (!item) return;
  editingId = id;
  document.getElementById('title').value = item.title || '';
  document.getElementById('author').value = item.author || '';
  document.getElementById('description').value = item.description || '';
  document.getElementById('link').value = item.link || '';
  document.getElementById('image').value = (item.image && !item.image.startsWith('data:')) ? item.image : '';
  document.getElementById('tags').value = (item.tags || []).join(', ');
  uploadedImageBase64 = (item.image && item.image.startsWith('data:')) ? item.image : '';

  document.getElementById('submitBtn').textContent = '💾 Lưu thay đổi';
  document.getElementById('cancelBtn').style.display = 'inline-block';
  updateTitles();
  document.getElementById('addForm').scrollIntoView({ behavior: 'smooth' });
}

function deleteItem(id) {
  const item = getCurrentList().find(i => i.id === id);
  if (!item || !confirm(`Bạn có chắc muốn xóa "${item.title}"?`)) return;
  const list = getCurrentList();
  const idx = list.findIndex(i => i.id === id);
  if (idx !== -1) list.splice(idx, 1);
  historyData = historyData.filter(h => h.itemId !== id);
  saveData();
  render();
  renderHistory();
}

function switchTab(tab) {
  currentTab = tab;
  const isHistory = tab === 'history';
  document.getElementById('historySection').style.display = isHistory ? 'block' : 'none';
  document.querySelector('.add-section').style.display = isHistory ? 'none' : 'block';
  document.querySelector('.list-section:not(#historySection)').style.display = isHistory ? 'none' : 'block';
  
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  if (isHistory) { renderHistory(); return; }
  
  resetForm();
  searchQuery = '';
  document.getElementById('searchInput').value = '';
  clearFilters();
  updateTitles();
  render();
}

function handleFilterChange(e) {
  if (e.target.type !== 'checkbox') return;
  const cat = e.target.dataset.category, val = e.target.value;
  if (!activeFilters[cat]) activeFilters[cat] = [];
  if (e.target.checked) activeFilters[cat].push(val);
  else {
    activeFilters[cat] = activeFilters[cat].filter(v => v !== val);
    if (activeFilters[cat].length === 0) delete activeFilters[cat];
  }
  render();
}

function clearFilters() {
  activeFilters = {};
  document.querySelectorAll('#advancedFilter input[type="checkbox"]').forEach(cb => cb.checked = false);
  render();
}

// ===== HIỆU ỨNG GỢN SÓNG (RIPPLE) =====
function initRippleEffect() {
  // Lắng nghe sự kiện click trên toàn bộ trang web (áp dụng cho cả nút mới tạo)
  document.addEventListener('click', function(e) {
    // Tìm xem người dùng có click vào nút (button) hoặc thẻ link (a) nào không
    const target = e.target.closest('button, .btn-open, .btn-continue');
    if (!target) return;

    // Tính toán vị trí click chuột so với nút
    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Tạo thẻ span cho hiệu ứng sóng
    const ripple = document.createElement('span');
    ripple.classList.add('ripple');
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;

    // Tính kích thước lớn nhất của nút để làm kích thước sóng
    const size = Math.max(rect.width, rect.height);
    ripple.style.width = ripple.style.height = `${size}px`;
    
    // Căn giữa vị trí sóng
    ripple.style.transform = `translate(-50%, -50%) scale(0)`;

    // Gắn sóng vào nút
    target.appendChild(ripple);

    // Xóa thẻ span sau khi hiệu ứng chạy xong
    setTimeout(() => {
      ripple.remove();
    }, 600);
  });
}

// ===== KHỞI TẠO =====
function init() {
  loadData();
  updateTitles();
  render();
  renderHistory();
  initRippleEffect(); // Kích hoạt hiệu ứng gợn sóng

  // Form & Backup
  document.getElementById('addForm').addEventListener('submit', handleSubmit);
  document.getElementById('cancelBtn').addEventListener('click', resetForm);
  document.getElementById('exportBtn').addEventListener('click', exportData);
  document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', importData);

  // Xử lý Upload Ảnh
  document.getElementById('imageFile').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 800 * 1024) { 
      alert('Ảnh quá lớn (Vui lòng chọn ảnh dưới 800KB)!');
      this.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = function(evt) {
      uploadedImageBase64 = evt.target.result;
      alert('Đã tải ảnh lên thành công!');
    };
    reader.readAsDataURL(file);
  });

  // Tabs & Tìm kiếm & Sắp xếp
  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
  document.getElementById('searchInput').addEventListener('input', (e) => { searchQuery = e.target.value.trim(); render(); });
  document.getElementById('sortSelect').addEventListener('change', (e) => { sortBy = e.target.value; render(); });
  document.getElementById('filterFavorites').addEventListener('change', (e) => { filterFavorites = e.target.checked; render(); });

  // Bộ lọc nâng cao
  document.getElementById('toggleFilterBtn').addEventListener('click', () => {
    const f = document.getElementById('advancedFilter');
    f.style.display = f.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('advancedFilter').addEventListener('change', handleFilterChange);
  document.getElementById('clearFilterBtn').addEventListener('click', clearFilters);

  // Danh sách (Event Delegation)
  document.getElementById('itemsList').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'edit') editItem(id);
    if (btn.dataset.action === 'delete') deleteItem(id);
    if (btn.dataset.action === 'open') openItemModal(id);
    if (btn.dataset.action === 'fav') toggleFavorite(id);
  });

  // Modal
  document.getElementById('cancelProgressBtn').addEventListener('click', closeModal);
  document.getElementById('saveProgressBtn').addEventListener('click', saveProgressAndOpen);
  document.getElementById('progressInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') saveProgressAndOpen(); });

  // Lịch sử
  document.getElementById('clearHistoryBtn').addEventListener('click', () => {
    if (confirm('Xóa TOÀN BỘ lịch sử?')) { historyData = []; saveData(); renderHistory(); }
  });
  document.getElementById('historyList').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action="delete-hist"]');
    if (btn && confirm('Xóa lịch sử của bộ này?')) {
      historyData = historyData.filter(h => h.id !== btn.dataset.id);
      saveData();
      renderHistory();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);