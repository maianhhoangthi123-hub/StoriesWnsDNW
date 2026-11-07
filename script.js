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

// State Quản lý View, Chương & Đọc truyện
let currentView = 'home'; // 'home' | 'detail' | 'reader'
let activeStoryId = null;
let activeChapterIndex = 0;
let chapterEditingIndex = -1;

// ===== CHUYỂN ĐỔI VIEW (PAGES) =====
function showView(viewName) {
  currentView = viewName;
  document.getElementById('viewHome').style.display = viewName === 'home' ? 'block' : 'none';
  document.getElementById('viewDetail').style.display = viewName === 'detail' ? 'block' : 'none';
  document.getElementById('viewReader').style.display = viewName === 'reader' ? 'block' : 'none';

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== LOAD / SAVE / BACKUP =====
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      data.stories = (parsed.stories || []).map(s => ({ ...s, chapters: s.chapters || [] }));
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
  } catch (e) { alert('Bộ nhớ đầy! Không thể lưu thêm dữ liệu hoặc ảnh/nội dung quá lớn.'); }
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
        data.stories = (parsed.stories || []).map(s => ({ ...s, chapters: s.chapters || [] }));
        data.games = parsed.games;
        if (parsed.history) historyData = parsed.history;
        saveData();
        render();
        renderHistory();
        showView('home');
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

// ===== RENDER TRANG CHỦ =====
function render() {
  let list = getCurrentList();
  
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
    const actionType = isStory ? 'view-detail' : 'open';
    
    const imageHtml = item.image
      ? `<img src="${escapeHtml(item.image)}" class="item-image" data-action="${actionType}" data-id="${item.id}" onerror="this.outerHTML='<div class=\\'item-image-placeholder\\' data-action=\\'${actionType}\\' data-id=\\'${item.id}\\'>${placeholder}</div>'">`
      : `<div class="item-image-placeholder" data-action="${actionType}" data-id="${item.id}">${placeholder}</div>`;

    const openBtn = item.link ? `<button class="btn-open" data-action="open" data-id="${item.id}">🔗 Link web</button>` : '';
    
    const storyActionsHtml = isStory ? `
      <button class="btn-primary" data-action="read" data-id="${item.id}">📖 Đọc ngay</button>
      <button class="btn-secondary" data-action="view-detail" data-id="${item.id}">📜 Chương (${(item.chapters || []).length})</button>
    ` : openBtn;

    const favClass = item.isFavorite ? 'active' : '';

    return `
      <div class="item-card" data-id="${item.id}">
        <button class="btn-fav ${favClass}" data-action="fav" data-id="${item.id}">⭐</button>
        ${imageHtml}
        <div class="item-body">
          <div class="item-title" data-action="${actionType}" data-id="${item.id}" title="Bấm để xem chi tiết">${escapeHtml(item.title)}</div>
          ${item.author ? `<div class="item-author">✍️ ${escapeHtml(item.author)}</div>` : ''}
          ${item.description ? `<div class="item-desc">${escapeHtml(item.description)}</div>` : ''}
          ${tags ? `<div class="item-tags">${tags}</div>` : ''}
        </div>
        <div class="item-actions">
          ${storyActionsHtml}
          ${isStory && item.link ? openBtn : ''}
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

    const actionMarkup = isStory
      ? `<button type="button" class="btn-continue" onclick="openStoryDetail('${hist.itemId}')">▶ Đọc tiếp</button>`
      : `<a href="${escapeHtml(hist.link)}" target="_blank" rel="noopener" class="btn-continue">▶ Chơi tiếp</a>`;

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
          ${actionMarkup}
          <button class="btn-delete" data-action="delete-hist" data-id="${hist.id}">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
}

// ===== TRANG CHI TIẾT TRUYỆN (STORY DETAIL VIEW) =====
function openStoryDetail(id) {
  const story = data.stories.find(s => String(s.id) === String(id));
  if (!story) return;

  activeStoryId = story.id;
  document.getElementById('chapterStoryId').value = story.id;

  const coverBox = document.getElementById('detailCoverContainer');
  coverBox.innerHTML = story.image
    ? `<img src="${escapeHtml(story.image)}" onerror="this.outerHTML='<div class=\\'item-image-placeholder\\'>📖</div>'">`
    : `<div class="item-image-placeholder" style="height:100%;">📖</div>`;

  document.getElementById('detailTitle').textContent = story.title;
  document.getElementById('detailAuthor').textContent = story.author ? `✍️ Tác giả: ${story.author}` : '';
  document.getElementById('detailDesc').textContent = story.description || 'Chưa có mô tả.';
  
  const tagsContainer = document.getElementById('detailTags');
  tagsContainer.innerHTML = (story.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');

  const extLinkBtn = document.getElementById('openExternalLinkBtn');
  if (story.link) {
    extLinkBtn.style.display = 'inline-block';
    extLinkBtn.onclick = () => window.open(story.link, '_blank');
  } else {
    extLinkBtn.style.display = 'none';
  }

  document.getElementById('startReadingBtn').onclick = () => {
    if (story.chapters && story.chapters.length > 0) {
      openReader(story.id, 0);
    } else {
      alert('Truyện này chưa có chương nào! Hãy bấm "➕ Thêm chương mới" để bổ sung.');
      toggleChapterForm(true);
    }
  };

  document.getElementById('editStoryBtn').onclick = () => {
    showView('home');
    editItem(story.id);
  };

  resetChapterForm();
  renderChapterGrid();
  showView('detail');
}

function renderChapterGrid() {
  const story = data.stories.find(s => String(s.id) === String(activeStoryId));
  const container = document.getElementById('detailChapterList');
  const emptyMsg = document.getElementById('emptyChapterMsg');

  if (!story || !story.chapters || story.chapters.length === 0) {
    container.innerHTML = '';
    emptyMsg.style.display = 'block';
    return;
  }

  emptyMsg.style.display = 'none';
  container.innerHTML = story.chapters.map((ch, idx) => `
    <div class="chapter-item-card">
      <button type="button" class="chapter-name-btn" onclick="openReader('${story.id}', ${idx})" title="Bấm để đọc chương này">
        📖 #${idx + 1}. ${escapeHtml(ch.title)}
      </button>
      <div style="display: flex; gap: 4px;">
        <button type="button" class="btn-secondary" onclick="editChapter(${idx})" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;">✏️ Sửa</button>
        <button type="button" class="btn-delete" onclick="deleteChapter(${idx})" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;">🗑️</button>
      </div>
    </div>
  `).join('');
}

function toggleChapterForm(forceShow = false) {
  const form = document.getElementById('chapterForm');
  if (forceShow) form.style.display = 'block';
  else form.style.display = form.style.display === 'none' ? 'block' : 'none';

  if (form.style.display === 'block') {
    document.getElementById('chapterTitleInput').focus();
  }
}

function resetChapterForm() {
  document.getElementById('chapterForm').reset();
  document.getElementById('chapterEditIndex').value = '-1';
  chapterEditingIndex = -1;
  document.getElementById('chapterFormTitle').textContent = '➕ Thêm chương mới';
  document.getElementById('saveChapterBtn').textContent = '💾 Lưu chương';
  document.getElementById('cancelChapterEditBtn').style.display = 'none';
  document.getElementById('chapterForm').style.display = 'none';
}

function handleChapterSubmit(e) {
  e.preventDefault();
  if (!activeStoryId) return;
  const story = data.stories.find(s => String(s.id) === String(activeStoryId));
  if (!story) return;

  const title = document.getElementById('chapterTitleInput').value.trim();
  const link = document.getElementById('chapterLinkInput').value.trim();
  const content = document.getElementById('chapterContentInput').value.trim();

  if (!title) { alert('Vui lòng nhập tên chương!'); return; }
  if (!story.chapters) story.chapters = [];

  const chapterObj = { title, link, content };

  if (chapterEditingIndex >= 0 && chapterEditingIndex < story.chapters.length) {
    story.chapters[chapterEditingIndex] = chapterObj;
  } else {
    story.chapters.push(chapterObj);
  }

  saveData();
  resetChapterForm();
  renderChapterGrid();
  render();
}

function editChapter(index) {
  const story = data.stories.find(s => String(s.id) === String(activeStoryId));
  if (!story || !story.chapters || !story.chapters[index]) return;
  const ch = story.chapters[index];

  chapterEditingIndex = index;
  document.getElementById('chapterEditIndex').value = index;
  document.getElementById('chapterTitleInput').value = ch.title || '';
  document.getElementById('chapterLinkInput').value = ch.link || '';
  document.getElementById('chapterContentInput').value = ch.content || '';

  document.getElementById('chapterFormTitle').textContent = `✏️ Chỉnh sửa: ${ch.title}`;
  document.getElementById('saveChapterBtn').textContent = '💾 Cập nhật';
  document.getElementById('cancelChapterEditBtn').style.display = 'inline-block';
  toggleChapterForm(true);
}

function deleteChapter(index) {
  const story = data.stories.find(s => String(s.id) === String(activeStoryId));
  if (!story || !story.chapters || !story.chapters[index]) return;
  if (!confirm(`Xóa chương "${story.chapters[index].title}"?`)) return;

  story.chapters.splice(index, 1);
  saveData();
  resetChapterForm();
  renderChapterGrid();
  render();
}

window.openStoryDetail = openStoryDetail;
window.openReader = openReader;
window.editChapter = editChapter;
window.deleteChapter = deleteChapter;

// ===== TRANG ĐỌC CHƯƠNG (FULL READER VIEW) =====
function openReader(storyId, chapterIndex = 0) {
  const story = data.stories.find(s => String(s.id) === String(storyId));
  if (!story) return;

  if (!story.chapters || story.chapters.length === 0) {
    alert(`Truyện "${story.title}" chưa có chương nào. Đang mở trang chi tiết để bạn thêm chương...`);
    openStoryDetail(storyId);
    toggleChapterForm(true);
    return;
  }

  activeStoryId = storyId;
  activeChapterIndex = Math.max(0, Math.min(chapterIndex, story.chapters.length - 1));

  renderReaderContent();
  showView('reader');
}

function goToChapter(index) {
  const story = data.stories.find(s => String(s.id) === String(activeStoryId));
  if (!story || !story.chapters) return;
  if (index < 0 || index >= story.chapters.length) return;

  activeChapterIndex = index;
  renderReaderContent();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderReaderContent() {
  const story = data.stories.find(s => String(s.id) === String(activeStoryId));
  if (!story || !story.chapters) return;

  const chapters = story.chapters;
  const ch = chapters[activeChapterIndex];
  if (!ch) return;

  document.getElementById('readerStoryTitle').textContent = story.title;
  document.getElementById('readerChapterTitle').textContent = ch.title;

  const select = document.getElementById('readerChapterSelect');
  select.innerHTML = chapters.map((c, idx) => `
    <option value="${idx}" ${idx === activeChapterIndex ? 'selected' : ''}>
      ${idx + 1}. ${escapeHtml(c.title)}
    </option>
  `).join('');

  const readerBody = document.getElementById('readerBody');
  if (ch.content) {
    readerBody.innerHTML = escapeHtml(ch.content);
  } else if (ch.link) {
    readerBody.innerHTML = `
      <div style="text-align: center; padding: 3rem 1rem;">
        <p style="margin-bottom: 1.2rem; color: #ccc;">Chương này được lưu dưới dạng liên kết web:</p>
        <a href="${escapeHtml(ch.link)}" target="_blank" rel="noopener" class="btn-primary" style="display: inline-block; padding: 0.8rem 1.8rem; font-size: 1.1rem; text-decoration: none;">🔗 Bấm vào đây để mở bài đọc gốc "${escapeHtml(ch.title)}"</a>
      </div>
    `;
  } else {
    readerBody.innerHTML = '<p style="color: #888; font-style: italic; text-align: center; padding: 3rem 0;">Chương này chưa có nội dung văn bản.</p>';
  }

  const hasPrev = activeChapterIndex > 0;
  const hasNext = activeChapterIndex < chapters.length - 1;

  document.getElementById('prevChapterBtn').disabled = !hasPrev;
  document.getElementById('nextChapterBtn').disabled = !hasNext;
  document.getElementById('prevChapterBtnBottom').disabled = !hasPrev;
  document.getElementById('nextChapterBtnBottom').disabled = !hasNext;

  saveReaderHistory(story, ch.title);
}

function saveReaderHistory(story, chapterTitle) {
  const existingIdx = historyData.findIndex(h => String(h.itemId) === String(story.id));
  const newHist = {
    id: generateId(),
    itemId: story.id,
    title: story.title,
    image: story.image,
    link: story.link || '#',
    type: 'story',
    progress: chapterTitle,
    lastReadAt: Date.now()
  };
  if (existingIdx !== -1) {
    historyData[existingIdx] = { ...historyData[existingIdx], ...newHist, id: historyData[existingIdx].id };
  } else {
    historyData.push(newHist);
  }
  saveData();
  renderHistory();
}

// ===== XỬ LÝ FORM & BỘ LỌC =====
function toggleFavorite(id) {
  const list = getCurrentList();
  const item = list.find(i => String(i.id) === String(id));
  if (item) {
    item.isFavorite = !item.isFavorite;
    saveData();
    render();
  }
}

function openItemModal(id) {
  const item = getCurrentList().find(i => String(i.id) === String(id));
  if (!item || !item.link) return;
  currentProgressItem = item;
  const existingHist = historyData.find(h => String(h.itemId) === String(item.id));
  document.getElementById('modalTitle').textContent = `Mở: ${item.title}`;
  document.getElementById('modalDesc').textContent = 'Bạn đang chơi đến level/tiến trình nào?';
  document.getElementById('progressInput').value = existingHist ? existingHist.progress : '';
  document.getElementById('historyModal').style.display = 'flex';
  document.getElementById('progressInput').focus();
}

function saveProgressAndOpen() {
  if (!currentProgressItem) return;
  const progress = document.getElementById('progressInput').value.trim();
  if (progress) {
    const existingIdx = historyData.findIndex(h => String(h.itemId) === String(currentProgressItem.id));
    const newHist = { id: generateId(), itemId: currentProgressItem.id, title: currentProgressItem.title, image: currentProgressItem.image, link: currentProgressItem.link, type: 'game', progress: progress, lastReadAt: Date.now() };
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
  const existingItem = editingId ? getCurrentList().find(i => String(i.id) === String(editingId)) : null;

  const item = {
    id: editingId || generateId(),
    title: title,
    author: document.getElementById('author').value.trim(),
    description: document.getElementById('description').value.trim(),
    link: document.getElementById('link').value.trim(),
    image: finalImage,
    tags: document.getElementById('tags').value.split(',').map(t => t.trim()).filter(Boolean),
    chapters: existingItem ? (existingItem.chapters || []) : [],
    isFavorite: existingItem ? (existingItem.isFavorite || false) : false,
    createdAt: existingItem ? (existingItem.createdAt || Date.now()) : Date.now(),
    updatedAt: Date.now()
  };

  const list = getCurrentList();
  if (editingId) {
    const idx = list.findIndex(i => String(i.id) === String(editingId));
    if (idx !== -1) list[idx] = item;
  } else {
    list.unshift(item);
  }
  saveData();
  resetForm();
  render();
}

function editItem(id) {
  const item = getCurrentList().find(i => String(i.id) === String(id));
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
  const item = getCurrentList().find(i => String(i.id) === String(id));
  if (!item || !confirm(`Bạn có chắc muốn xóa "${item.title}"?`)) return;
  const list = getCurrentList();
  const idx = list.findIndex(i => String(i.id) === String(id));
  if (idx !== -1) list.splice(idx, 1);
  historyData = historyData.filter(h => String(h.itemId) !== String(id));
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
  document.addEventListener('click', function(e) {
    const target = e.target.closest('button, .btn-open, .btn-continue');
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const ripple = document.createElement('span');
    ripple.classList.add('ripple');
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;

    const size = Math.max(rect.width, rect.height);
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.transform = `translate(-50%, -50%) scale(0)`;

    target.appendChild(ripple);

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
  initRippleEffect();

  document.getElementById('siteBrand').addEventListener('click', () => showView('home'));

  document.getElementById('addForm').addEventListener('submit', handleSubmit);
  document.getElementById('cancelBtn').addEventListener('click', resetForm);
  document.getElementById('exportBtn').addEventListener('click', exportData);
  document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', importData);

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

  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
  document.getElementById('searchInput').addEventListener('input', (e) => { searchQuery = e.target.value.trim(); render(); });
  document.getElementById('sortSelect').addEventListener('change', (e) => { sortBy = e.target.value; render(); });
  document.getElementById('filterFavorites').addEventListener('change', (e) => { filterFavorites = e.target.checked; render(); });

  document.getElementById('toggleFilterBtn').addEventListener('click', () => {
    const f = document.getElementById('advancedFilter');
    f.style.display = f.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('advancedFilter').addEventListener('change', handleFilterChange);
  document.getElementById('clearFilterBtn').addEventListener('click', clearFilters);

  // SỰ KIỆN CLICK SẢN PHẨM TRÊN TRANG CHỦ
  document.getElementById('itemsList').addEventListener('click', (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    const id = target.dataset.id;
    const action = target.dataset.action;

    if (action === 'edit') editItem(id);
    if (action === 'delete') deleteItem(id);
    if (action === 'open') openItemModal(id);
    if (action === 'fav') toggleFavorite(id);
    if (action === 'read') openReader(id, 0);
    if (action === 'view-detail' || action === 'chapters') openStoryDetail(id);
  });

  document.getElementById('backToHomeBtn').addEventListener('click', () => showView('home'));
  document.getElementById('toggleAddChapterBtn').addEventListener('click', () => toggleChapterForm());
  document.getElementById('chapterForm').addEventListener('submit', handleChapterSubmit);
  document.getElementById('cancelChapterEditBtn').addEventListener('click', resetChapterForm);

  document.getElementById('readerBackBtn').addEventListener('click', () => showView('detail'));
  document.getElementById('prevChapterBtn').addEventListener('click', () => goToChapter(activeChapterIndex - 1));
  document.getElementById('nextChapterBtn').addEventListener('click', () => goToChapter(activeChapterIndex + 1));
  document.getElementById('prevChapterBtnBottom').addEventListener('click', () => goToChapter(activeChapterIndex - 1));
  document.getElementById('nextChapterBtnBottom').addEventListener('click', () => goToChapter(activeChapterIndex + 1));
  document.getElementById('readerChapterSelect').addEventListener('change', (e) => goToChapter(parseInt(e.target.value, 10)));

  document.getElementById('cancelProgressBtn').addEventListener('click', closeModal);
  document.getElementById('saveProgressBtn').addEventListener('click', saveProgressAndOpen);

  document.getElementById('clearHistoryBtn').addEventListener('click', () => {
    if (confirm('Xóa TOÀN BỘ lịch sử?')) { historyData = []; saveData(); renderHistory(); }
  });
  document.getElementById('historyList').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action="delete-hist"]');
    if (btn && confirm('Xóa lịch sử của bộ này?')) {
      historyData = historyData.filter(h => String(h.id) !== String(btn.dataset.id));
      saveData();
      renderHistory();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
