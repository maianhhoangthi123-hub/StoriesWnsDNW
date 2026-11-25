// ===== CẤU HÌNH =====
const STORAGE_KEY = 'archive_data';
const HISTORY_KEY = 'archive_history';
const FILTERS = {
  'Tình trạng': ['Hoàn thành', 'Còn tiếp', 'Tạm ngưng'],
  'Tính chất': ['Nguyên sang', 'Diễn sinh'],
  'Giới tính': ['Ngôn tình', 'Nam sinh', 'Đam mỹ', 'Bách hợp', 'Nữ tôn', 'Không CP', 'Đa nguyên'],
  'Thời đại': ['Cổ đại', 'Cận đại', 'Hiện đại', 'Tương lai', 'Giả tưởng lịch sử'],
  'Kết thúc': ['HE', 'SE', 'OE'],
  'Loại hình': ['Tình cảm', 'Làm sự nghiệp', 'Tiên hiệp', 'Huyền huyễn', 'Khoa học viễn tưởng', 'Mạt thế', 'Sinh tồn', 'Tranh bá', 'Võ hiệp', 'Trinh thám', 'Kinh dị', 'Quan trường', 'Kinh thương', 'Quân sự', 'Xây dựng', 'Làm ruộng', 'Huyền học', 'Phim ảnh', 'Manga anime']
};

// ===== STATE =====
const $ = id => document.getElementById(id);
let data = { stories: [], games: [] };
let historyData = [];
let currentTab = 'stories';
let editingId = null;
let searchQuery = '';
let activeFilters = {};
let sortBy = 'newest';
let filterFavorites = false;
let uploadedImage = '';
let progressItem = null;
let activeStoryId = null;
let activeChapterIndex = 0;
let chapterEditingIndex = -1;
let editingCharId = null;
let charImage = '';

// ===== HELPERS =====
function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const same = (a, b) => String(a) === String(b);
const getList = () => (currentTab === 'games' ? data.games : data.stories);
const getStory = id => data.stories.find(s => same(s.id, id !== undefined ? id : activeStoryId));
const normalizeStories = arr => (arr || []).map(s => ({ ...s, chapters: s.chapters || [], characters: s.characters || [] }));

function showView(name) {
  ['Home', 'Detail', 'Reader'].forEach(v => { $('view' + v).style.display = name === v.toLowerCase() ? 'block' : 'none'; });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Ảnh lỗi -> thay bằng khung biểu tượng
document.addEventListener('error', e => {
  const t = e.target;
  if (t.tagName === 'IMG' && t.dataset.ph) {
    const d = document.createElement('div');
    d.className = 'item-image-placeholder';
    d.textContent = t.dataset.ph;
    if (t.dataset.action) { d.dataset.action = t.dataset.action; d.dataset.id = t.dataset.id; }
    t.replaceWith(d);
  }
}, true);

// ===== LƯU / TẢI / SAO LƯU =====
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      data.stories = normalizeStories(p.stories);
      data.games = p.games || [];
    }
    const h = localStorage.getItem(HISTORY_KEY);
    if (h) historyData = JSON.parse(h);
  } catch (e) { console.error('Lỗi đọc dữ liệu:', e); }
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    localStorage.setItem(HISTORY_KEY, JSON.stringify(historyData));
  } catch (e) { alert('Bộ nhớ đầy! Không thể lưu thêm dữ liệu hoặc ảnh/nội dung quá lớn.'); }
}

function exportData() {
  const blob = new Blob([JSON.stringify({ stories: data.stories, games: data.games, history: historyData }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup_archive_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!confirm('CẢNH BÁO: Phục hồi sẽ GHI ĐÈ toàn bộ dữ liệu hiện tại. Bạn có chắc chắn?')) { e.target.value = ''; return; }
  const reader = new FileReader();
  reader.onload = evt => {
    try {
      const p = JSON.parse(evt.target.result);
      if (p.stories && p.games) {
        data.stories = normalizeStories(p.stories);
        data.games = p.games;
        if (p.history) historyData = p.history;
        saveData();
        render();
        renderHistory();
        showView('home');
        alert('Phục hồi dữ liệu thành công!');
      } else alert('File không đúng định dạng!');
    } catch (err) { alert('Lỗi đọc file JSON!'); }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ===== TRANG CHỦ: DANH SÁCH =====
function render() {
  const filtered = getList().filter(item => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const ok = (item.title || '').toLowerCase().includes(q) || (item.author || '').toLowerCase().includes(q)
        || (item.description || '').toLowerCase().includes(q) || (item.tags || []).some(t => t.toLowerCase().includes(q));
      if (!ok) return false;
    }
    if (filterFavorites && !item.isFavorite) return false;
    const tags = (item.tags || []).map(t => t.toLowerCase());
    for (const cat in activeFilters) {
      if (activeFilters[cat].length && !activeFilters[cat].some(v => tags.includes(v.toLowerCase()))) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
    if (sortBy === 'name') return a.title.localeCompare(b.title, 'vi');
    if (sortBy === 'updated') return (b.updatedAt || 0) - (a.updatedAt || 0);
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  const container = $('itemsList'), emptyMsg = $('emptyMessage');
  if (!filtered.length) {
    container.innerHTML = '';
    emptyMsg.style.display = 'block';
    emptyMsg.textContent = getList().length ? 'Không tìm thấy kết quả phù hợp.' : 'Chưa có mục nào. Hãy thêm mới ở trên!';
    return;
  }
  emptyMsg.style.display = 'none';

  const isStory = currentTab === 'stories';
  const ph = isStory ? '📖' : '🎮';
  const act = isStory ? 'view-detail' : 'open';

  container.innerHTML = filtered.map(item => {
    const tags = (item.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
    const img = item.image
      ? `<img src="${escapeHtml(item.image)}" class="item-image" data-ph="${ph}" data-action="${act}" data-id="${item.id}">`
      : `<div class="item-image-placeholder" data-action="${act}" data-id="${item.id}">${ph}</div>`;
    const openBtn = item.link ? `<button class="btn-open" data-action="open" data-id="${item.id}">🔗 Link web</button>` : '';
    const main = isStory
      ? `<button class="btn-primary" data-action="read" data-id="${item.id}">📖 Đọc ngay</button>
         <button class="btn-secondary" data-action="view-detail" data-id="${item.id}">📜 Chương (${(item.chapters || []).length})</button>`
      : openBtn;
    return `
      <div class="item-card">
        <button class="btn-fav ${item.isFavorite ? 'active' : ''}" data-action="fav" data-id="${item.id}">⭐</button>
        ${img}
        <div class="item-body">
          <div class="item-title" data-action="${act}" data-id="${item.id}" title="Bấm để xem chi tiết">${escapeHtml(item.title)}</div>
          ${item.author ? `<div class="item-author">✍️ ${escapeHtml(item.author)}</div>` : ''}
          ${item.description ? `<div class="item-desc">${escapeHtml(item.description)}</div>` : ''}
          ${tags ? `<div class="item-tags">${tags}</div>` : ''}
        </div>
        <div class="item-actions">
          ${main}
          ${isStory ? openBtn : ''}
          <button class="btn-edit" data-action="edit" data-id="${item.id}">✏️ Sửa</button>
          <button class="btn-delete" data-action="delete" data-id="${item.id}">🗑️ Xóa</button>
        </div>
      </div>`;
  }).join('');
}

// ===== LỊCH SỬ (chỉ lưu tiến trình, ảnh/tiêu đề lấy từ mục gốc) =====
const findItem = h => (h.type === 'story' ? data.stories : data.games).find(i => same(i.id, h.itemId));

function renderHistory() {
  const container = $('historyList'), emptyMsg = $('emptyHistoryMsg');
  if (!historyData.length) { container.innerHTML = ''; emptyMsg.style.display = 'block'; return; }
  emptyMsg.style.display = 'none';

  container.innerHTML = [...historyData].sort((a, b) => b.lastReadAt - a.lastReadAt).map(h => {
    const isStory = h.type === 'story';
    const item = findItem(h) || h;
    const ph = isStory ? '📖' : '🎮';
    const img = item.image
      ? `<img src="${escapeHtml(item.image)}" class="item-image" data-ph="${ph}">`
      : `<div class="item-image-placeholder">${ph}</div>`;
    const link = item.link || h.link;
    const action = isStory
      ? `<button type="button" class="btn-continue" data-action="continue-story" data-id="${h.itemId}" data-chapter="${h.chapterIndex || 0}">▶ Đọc tiếp</button>`
      : (link ? `<a href="${escapeHtml(link)}" target="_blank" rel="noopener" class="btn-continue">▶ Chơi tiếp</a>` : '');
    return `
      <div class="item-card">
        ${img}
        <div class="item-body">
          <div class="item-title">${escapeHtml(item.title)}</div>
          <div class="item-author">${isStory ? '📖 Truyện' : '🎮 Game'}</div>
          <div class="progress-badge">Đang ở: ${escapeHtml(h.progress)}</div>
          <div class="history-time">Lưu lúc: ${new Date(h.lastReadAt).toLocaleString('vi-VN')}</div>
        </div>
        <div class="item-actions">
          ${action}
          <button class="btn-delete" data-action="delete-hist" data-id="${h.id}">🗑️</button>
        </div>
      </div>`;
  }).join('');
}

function upsertHistory(entry) {
  const idx = historyData.findIndex(h => same(h.itemId, entry.itemId));
  if (idx !== -1) historyData[idx] = { ...historyData[idx], ...entry, id: historyData[idx].id };
  else historyData.push({ id: generateId(), ...entry });
  saveData();
  renderHistory();
}

// ===== CHI TIẾT TRUYỆN =====
function openStoryDetail(id) {
  const story = getStory(id);
  if (!story) return;
  activeStoryId = story.id;

  $('detailCoverContainer').innerHTML = story.image
    ? `<img src="${escapeHtml(story.image)}" data-ph="📖">`
    : '<div class="item-image-placeholder">📖</div>';
  $('detailTitle').textContent = story.title;
  $('detailAuthor').textContent = story.author ? `✍️ Tác giả: ${story.author}` : '';
  $('detailDesc').textContent = story.description || 'Chưa có mô tả.';
  $('detailTags').innerHTML = (story.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');

  const ext = $('openExternalLinkBtn');
  ext.style.display = story.link ? 'inline-block' : 'none';
  ext.onclick = () => window.open(story.link, '_blank');

  $('startReadingBtn').onclick = () => {
    if (story.chapters.length) openReader(story.id, 0);
    else { alert('Truyện này chưa có chương nào! Hãy bấm "➕ Thêm chương mới" để bổ sung.'); toggleChapterForm(true); }
  };
  $('editStoryBtn').onclick = () => {
    if (currentTab !== 'stories') switchTab('stories');
    showView('home');
    editItem(story.id);
  };

  resetChapterForm();
  renderChapterGrid();
  closeCharModal();
  showView('detail');
}

// ===== CHƯƠNG =====
function renderChapterGrid() {
  const story = getStory();
  const container = $('detailChapterList'), emptyMsg = $('emptyChapterMsg');
  if (!story || !story.chapters.length) { container.innerHTML = ''; emptyMsg.style.display = 'block'; return; }
  emptyMsg.style.display = 'none';
  container.innerHTML = story.chapters.map((ch, i) => `
    <div class="chapter-item-card">
      <button type="button" class="chapter-name-btn" data-act="read" data-i="${i}" title="Bấm để đọc chương này">📖 #${i + 1}. ${escapeHtml(ch.title)}</button>
      <div class="chapter-actions">
        <button type="button" class="btn-secondary" data-act="edit" data-i="${i}">✏️ Sửa</button>
        <button type="button" class="btn-delete" data-act="del" data-i="${i}">🗑️</button>
      </div>
    </div>`).join('');
}

function toggleChapterForm(forceShow = false) {
  const f = $('chapterForm');
  f.style.display = (forceShow || f.style.display === 'none') ? 'block' : 'none';
  if (f.style.display === 'block') $('chapterTitleInput').focus();
}

function resetChapterForm() {
  $('chapterForm').reset();
  chapterEditingIndex = -1;
  $('chapterFormTitle').textContent = '➕ Thêm chương mới';
  $('saveChapterBtn').textContent = '💾 Lưu chương';
  $('chapterForm').style.display = 'none';
}

function handleChapterSubmit(e) {
  e.preventDefault();
  const story = getStory();
  if (!story) return;
  const title = $('chapterTitleInput').value.trim();
  if (!title) { alert('Vui lòng nhập tên chương!'); return; }
  const ch = { title, link: $('chapterLinkInput').value.trim(), content: $('chapterContentInput').value.trim() };
  if (chapterEditingIndex >= 0 && story.chapters[chapterEditingIndex]) story.chapters[chapterEditingIndex] = ch;
  else story.chapters.push(ch);
  saveData();
  resetChapterForm();
  renderChapterGrid();
  render();
}

function editChapter(i) {
  const ch = (getStory() || { chapters: [] }).chapters[i];
  if (!ch) return;
  chapterEditingIndex = i;
  $('chapterTitleInput').value = ch.title || '';
  $('chapterLinkInput').value = ch.link || '';
  $('chapterContentInput').value = ch.content || '';
  $('chapterFormTitle').textContent = `✏️ Chỉnh sửa: ${ch.title}`;
  $('saveChapterBtn').textContent = '💾 Cập nhật';
  toggleChapterForm(true);
}

function deleteChapter(i) {
  const story = getStory();
  if (!story || !story.chapters[i] || !confirm(`Xóa chương "${story.chapters[i].title}"?`)) return;
  story.chapters.splice(i, 1);
  saveData();
  resetChapterForm();
  renderChapterGrid();
  render();
}

// ===== NHÂN VẬT & ẢNH =====
function resizeImage(file, max = 300) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = reject;
    r.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        if (!img.width || !img.height) return resolve(r.result);
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * k);
        cv.height = Math.round(img.height * k);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        resolve(cv.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.85));
      };
      img.src = r.result;
    };
    r.readAsDataURL(file);
  });
}

function setCharPreview(src) {
  const p = $('characterPreview');
  p.src = src || '';
  p.style.display = src ? 'block' : 'none';
}

function toggleCharForm(show = false) {
  const f = $('characterForm');
  f.style.display = (show || f.style.display === 'none') ? 'block' : 'none';
  if (f.style.display === 'block') $('characterNameInput').focus();
}

function resetCharForm() {
  $('characterForm').reset();
  editingCharId = null;
  charImage = '';
  setCharPreview('');
  $('characterFormTitle').textContent = '➕ Thêm nhân vật mới';
  $('characterForm').style.display = 'none';
}

function openCharModal() {
  renderCharGrid();
  $('characterModal').style.display = 'flex';
}

function closeCharModal() {
  resetCharForm();
  $('characterModal').style.display = 'none';
}

function renderCharGrid() {
  const chars = (getStory() || {}).characters || [];
  $('emptyCharacterMsg').style.display = chars.length ? 'none' : 'block';
  $('characterList').innerHTML = chars.map(c => `
    <div class="character-card">
      <img src="${escapeHtml(c.image)}" class="character-thumb" alt="" data-ph="🧑" loading="lazy">
      <div class="character-card-name">${escapeHtml(c.name)}</div>
      <div class="character-actions">
        <button type="button" class="btn-secondary" data-act="edit" data-id="${escapeHtml(c.id)}">✏️</button>
        <button type="button" class="btn-delete" data-act="del" data-id="${escapeHtml(c.id)}">🗑️</button>
      </div>
    </div>`).join('');
}

function handleCharSubmit(e) {
  e.preventDefault();
  const story = getStory();
  if (!story) return;
  const name = $('characterNameInput').value.trim();
  const image = charImage || $('characterImageUrl').value.trim();
  if (!name) { alert('Vui lòng nhập tên nhân vật!'); return; }
  if (!image) { alert('Vui lòng thêm ảnh (dán URL hoặc chọn file)!'); return; }
  const idx = editingCharId ? story.characters.findIndex(c => c.id === editingCharId) : -1;
  if (idx !== -1) story.characters[idx] = { ...story.characters[idx], name, image };
  else story.characters.push({ id: generateId(), name, image });
  saveData();
  resetCharForm();
  renderCharGrid();
}

// Bọc tên nhân vật trong nội dung chương (khớp đúng chữ hoa/thường, nguyên từ)
function withChars(text, chars) {
  const map = new Map();
  (chars || []).forEach(c => {
    if (!c.image) return;
    (c.name || '').split(',').map(n => n.trim()).filter(Boolean).forEach(n => { if (!map.has(n)) map.set(n, c); });
  });
  if (!map.size) return escapeHtml(text);
  const alts = [...map.keys()].sort((a, b) => b.length - a.length)
    .map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  let re;
  try { re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts})(?![\\p{L}\\p{N}])`, 'gu'); }
  catch (err) { re = new RegExp(`(?:${alts})`, 'g'); }
  let html = '', last = 0, m;
  while ((m = re.exec(text)) !== null) {
    html += escapeHtml(text.slice(last, m.index));
    html += `<span class="char-name" data-char-id="${escapeHtml(map.get(m[0]).id)}">${escapeHtml(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  return html + escapeHtml(text.slice(last));
}

function toggleCharPopup(el) {
  const old = el.querySelector('.char-pop');
  if (old) { old.remove(); return; }
  const c = ((getStory() || {}).characters || []).find(x => same(x.id, el.dataset.charId));
  if (!c) return;
  const img = document.createElement('img');
  img.className = 'char-pop';
  img.alt = c.name;
  img.onerror = () => img.remove();
  img.src = c.image;
  el.appendChild(img);
  if (img.getBoundingClientRect().right > window.innerWidth - 8) { img.style.left = 'auto'; img.style.right = '0'; }
}

// ===== TRANG ĐỌC =====
function openReader(storyId, chapterIndex = 0) {
  const story = getStory(storyId);
  if (!story) return;
  if (!story.chapters.length) {
    alert(`Truyện "${story.title}" chưa có chương nào. Đang mở trang chi tiết để bạn thêm chương...`);
    openStoryDetail(storyId);
    toggleChapterForm(true);
    return;
  }
  activeStoryId = story.id;
  activeChapterIndex = Math.max(0, Math.min(chapterIndex, story.chapters.length - 1));
  renderReaderContent();
  showView('reader');
}

function goToChapter(i) {
  const story = getStory();
  if (!story || i < 0 || i >= story.chapters.length) return;
  activeChapterIndex = i;
  renderReaderContent();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderReaderContent() {
  const story = getStory();
  const ch = story && story.chapters[activeChapterIndex];
  if (!ch) return;
  const chapters = story.chapters;

  $('readerStoryTitle').textContent = story.title;
  $('readerChapterTitle').textContent = ch.title;
  $('readerChapterSelect').innerHTML = chapters.map((c, i) =>
    `<option value="${i}" ${i === activeChapterIndex ? 'selected' : ''}>${i + 1}. ${escapeHtml(c.title)}</option>`).join('');

  const body = $('readerBody');
  if (ch.content) body.innerHTML = withChars(ch.content, story.characters);
  else if (ch.link) body.innerHTML = `<div class="reader-note">Chương này được lưu dưới dạng liên kết web:<br><a href="${escapeHtml(ch.link)}" target="_blank" rel="noopener" class="btn-primary">🔗 Mở bài đọc gốc "${escapeHtml(ch.title)}"</a></div>`;
  else body.innerHTML = '<div class="reader-note">Chương này chưa có nội dung văn bản.</div>';

  const hasPrev = activeChapterIndex > 0, hasNext = activeChapterIndex < chapters.length - 1;
  $('prevChapterBtn').disabled = $('prevChapterBtnBottom').disabled = !hasPrev;
  $('nextChapterBtn').disabled = $('nextChapterBtnBottom').disabled = !hasNext;

  upsertHistory({ itemId: story.id, type: 'story', progress: ch.title, chapterIndex: activeChapterIndex, lastReadAt: Date.now() });
}

// ===== YÊU THÍCH, MODAL GAME =====
function toggleFavorite(id) {
  const item = getList().find(i => same(i.id, id));
  if (item) { item.isFavorite = !item.isFavorite; saveData(); render(); }
}

function openItemModal(id) {
  const item = getList().find(i => same(i.id, id));
  if (!item || !item.link) return;
  progressItem = item;
  const hist = historyData.find(h => same(h.itemId, item.id));
  $('modalTitle').textContent = `Mở: ${item.title}`;
  $('modalDesc').textContent = 'Bạn đang chơi đến level/tiến trình nào?';
  $('progressInput').value = hist ? hist.progress : '';
  $('historyModal').style.display = 'flex';
  $('progressInput').focus();
}

function saveProgressAndOpen() {
  if (!progressItem) return;
  const progress = $('progressInput').value.trim();
  if (progress) upsertHistory({ itemId: progressItem.id, type: 'game', progress, link: progressItem.link, lastReadAt: Date.now() });
  window.open(progressItem.link, '_blank');
  closeModal();
}

function closeModal() {
  $('historyModal').style.display = 'none';
  $('progressInput').value = '';
  progressItem = null;
}

// ===== FORM THÊM / SỬA =====
function updateTitles() {
  const isStory = currentTab !== 'games';
  $('formTitle').textContent = editingId ? `✏️ Sửa ${isStory ? 'truyện' : 'game'}` : `➕ Thêm ${isStory ? 'truyện' : 'game'} mới`;
  $('listTitle').textContent = isStory ? '📖 Danh sách truyện' : '🎮 Danh sách game';
}

function resetForm() {
  $('addForm').reset();
  editingId = null;
  uploadedImage = '';
  $('submitBtn').textContent = 'Thêm mới';
  $('cancelBtn').style.display = 'none';
  updateTitles();
}

function handleSubmit(e) {
  e.preventDefault();
  const title = $('title').value.trim();
  if (!title) { alert('Vui lòng nhập tiêu đề!'); return; }
  const list = getList();
  const old = editingId ? list.find(i => same(i.id, editingId)) : null;

  const item = {
    ...(old || {}),
    id: editingId || generateId(),
    title,
    author: $('author').value.trim(),
    description: $('description').value.trim(),
    link: $('link').value.trim(),
    image: uploadedImage || $('image').value.trim(),
    tags: $('tags').value.split(',').map(t => t.trim()).filter(Boolean),
    chapters: old ? (old.chapters || []) : [],
    characters: old ? (old.characters || []) : [],
    isFavorite: old ? !!old.isFavorite : false,
    createdAt: old ? (old.createdAt || Date.now()) : Date.now(),
    updatedAt: Date.now()
  };

  if (old) list[list.findIndex(i => same(i.id, editingId))] = item;
  else list.unshift(item);
  saveData();
  resetForm();
  render();
}

function editItem(id) {
  const item = getList().find(i => same(i.id, id));
  if (!item) return;
  editingId = id;
  $('title').value = item.title || '';
  $('author').value = item.author || '';
  $('description').value = item.description || '';
  $('link').value = item.link || '';
  const isData = (item.image || '').startsWith('data:');
  $('image').value = isData ? '' : (item.image || '');
  uploadedImage = isData ? item.image : '';
  $('tags').value = (item.tags || []).join(', ');
  $('submitBtn').textContent = '💾 Lưu thay đổi';
  $('cancelBtn').style.display = 'inline-block';
  updateTitles();
  $('addForm').scrollIntoView({ behavior: 'smooth' });
}

function deleteItem(id) {
  const list = getList();
  const idx = list.findIndex(i => same(i.id, id));
  if (idx === -1 || !confirm(`Bạn có chắc muốn xóa "${list[idx].title}"?`)) return;
  list.splice(idx, 1);
  historyData = historyData.filter(h => !same(h.itemId, id));
  saveData();
  render();
  renderHistory();
}

// ===== TAB & BỘ LỌC =====
function switchTab(tab) {
  currentTab = tab;
  const isHistory = tab === 'history';
  $('historySection').style.display = isHistory ? 'block' : 'none';
  $('addSection').style.display = isHistory ? 'none' : 'block';
  $('listSection').style.display = isHistory ? 'none' : 'block';
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  if (isHistory) { renderHistory(); return; }
  resetForm();
  searchQuery = '';
  $('searchInput').value = '';
  clearFilters();
}

function renderFilterRows() {
  $('filterRows').innerHTML = Object.entries(FILTERS).map(([cat, vals]) => `
    <div class="filter-row">
      <div class="filter-label">${cat}:</div>
      <div class="filter-options ${vals.length > 8 ? 'grid-options' : ''}">
        ${vals.map(v => `<label><input type="checkbox" data-category="${cat}" value="${v}"> ${v}</label>`).join('')}
      </div>
    </div>`).join('');
}

function handleFilterChange(e) {
  if (e.target.type !== 'checkbox') return;
  const cat = e.target.dataset.category, val = e.target.value;
  const arr = activeFilters[cat] || (activeFilters[cat] = []);
  if (e.target.checked) arr.push(val);
  else {
    activeFilters[cat] = arr.filter(v => v !== val);
    if (!activeFilters[cat].length) delete activeFilters[cat];
  }
  render();
}

function clearFilters() {
  activeFilters = {};
  document.querySelectorAll('#advancedFilter input[type="checkbox"]').forEach(cb => { cb.checked = false; });
  updateTitles();
  render();
}

// ===== RIPPLE =====
function initRipple() {
  document.addEventListener('click', e => {
    const t = e.target.closest('button, .btn-open, .btn-continue');
    if (!t) return;
    const r = t.getBoundingClientRect();
    const rp = document.createElement('span');
    rp.className = 'ripple';
    rp.style.left = `${e.clientX - r.left}px`;
    rp.style.top = `${e.clientY - r.top}px`;
    rp.style.width = rp.style.height = `${Math.max(r.width, r.height)}px`;
    t.appendChild(rp);
    setTimeout(() => rp.remove(), 600);
  });
}

// ===== KHỞI TẠO =====
function init() {
  loadData();
  renderFilterRows();
  updateTitles();
  render();
  renderHistory();
  initRipple();

  $('siteBrand').addEventListener('click', () => showView('home'));
  $('addForm').addEventListener('submit', handleSubmit);
  $('cancelBtn').addEventListener('click', resetForm);
  $('exportBtn').addEventListener('click', exportData);
  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', importData);

  $('imageFile').addEventListener('change', function () {
    const file = this.files[0];
    if (!file) return;
    if (file.size > 800 * 1024) { alert('Ảnh quá lớn (Vui lòng chọn ảnh dưới 800KB)!'); this.value = ''; return; }
    const r = new FileReader();
    r.onload = evt => { uploadedImage = evt.target.result; alert('Đã tải ảnh lên thành công!'); };
    r.readAsDataURL(file);
  });
  $('image').addEventListener('input', () => { uploadedImage = ''; });

  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));
  $('searchInput').addEventListener('input', e => { searchQuery = e.target.value.trim(); render(); });
  $('sortSelect').addEventListener('change', e => { sortBy = e.target.value; render(); });
  $('filterFavorites').addEventListener('change', e => { filterFavorites = e.target.checked; render(); });
  $('toggleFilterBtn').addEventListener('click', () => {
    const f = $('advancedFilter');
    f.style.display = f.style.display === 'none' ? 'block' : 'none';
  });
  $('advancedFilter').addEventListener('change', handleFilterChange);
  $('clearFilterBtn').addEventListener('click', clearFilters);

  $('itemsList').addEventListener('click', e => {
    const t = e.target.closest('[data-action]');
    if (!t) return;
    const { action, id } = t.dataset;
    if (action === 'edit') editItem(id);
    else if (action === 'delete') deleteItem(id);
    else if (action === 'open') openItemModal(id);
    else if (action === 'fav') toggleFavorite(id);
    else if (action === 'read') openReader(id, 0);
    else if (action === 'view-detail') openStoryDetail(id);
  });

  // Chi tiết truyện
  $('backToHomeBtn').addEventListener('click', () => showView('home'));
  $('toggleAddChapterBtn').addEventListener('click', () => toggleChapterForm());
  $('chapterForm').addEventListener('submit', handleChapterSubmit);
  $('cancelChapterEditBtn').addEventListener('click', resetChapterForm);
  $('detailChapterList').addEventListener('click', e => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const i = parseInt(b.dataset.i, 10);
    if (b.dataset.act === 'read') openReader(activeStoryId, i);
    else if (b.dataset.act === 'edit') editChapter(i);
    else if (b.dataset.act === 'del') deleteChapter(i);
  });

  // Nhân vật
  $('openCharacterBtn').addEventListener('click', openCharModal);
  $('closeCharacterBtn').addEventListener('click', closeCharModal);
  $('characterModal').addEventListener('click', e => { if (e.target === $('characterModal')) closeCharModal(); });
  $('toggleAddCharacterBtn').addEventListener('click', () => toggleCharForm());
  $('characterForm').addEventListener('submit', handleCharSubmit);
  $('cancelCharacterBtn').addEventListener('click', resetCharForm);
  $('characterImageUrl').addEventListener('input', e => { charImage = ''; setCharPreview(e.target.value.trim()); });
  $('characterImageFile').addEventListener('change', async function () {
    const file = this.files[0];
    if (!file) return;
    try {
      charImage = await resizeImage(file);
      $('characterImageUrl').value = '';
      setCharPreview(charImage);
    } catch (err) { alert('Không đọc được ảnh này, hãy thử ảnh khác.'); this.value = ''; }
  });
  $('characterList').addEventListener('click', e => {
    const b = e.target.closest('button[data-act]');
    const story = getStory();
    const c = b && story && story.characters.find(x => x.id === b.dataset.id);
    if (!c) return;
    if (b.dataset.act === 'edit') {
      const isData = c.image.startsWith('data:');
      editingCharId = c.id;
      charImage = isData ? c.image : '';
      $('characterNameInput').value = c.name;
      $('characterImageUrl').value = isData ? '' : c.image;
      setCharPreview(c.image);
      $('characterFormTitle').textContent = `✏️ Sửa nhân vật: ${c.name}`;
      toggleCharForm(true);
    } else if (confirm(`Xóa nhân vật "${c.name}"?`)) {
      story.characters = story.characters.filter(x => x.id !== c.id);
      saveData();
      resetCharForm();
      renderCharGrid();
    }
  });

  // Trang đọc
  $('readerBackBtn').addEventListener('click', () => openStoryDetail(activeStoryId));
  $('prevChapterBtn').addEventListener('click', () => goToChapter(activeChapterIndex - 1));
  $('nextChapterBtn').addEventListener('click', () => goToChapter(activeChapterIndex + 1));
  $('prevChapterBtnBottom').addEventListener('click', () => goToChapter(activeChapterIndex - 1));
  $('nextChapterBtnBottom').addEventListener('click', () => goToChapter(activeChapterIndex + 1));
  $('readerChapterSelect').addEventListener('change', e => goToChapter(parseInt(e.target.value, 10)));
  $('readerBody').addEventListener('click', e => {
    const el = e.target.closest('.char-name');
    if (el) toggleCharPopup(el);
  });

  // Modal & lịch sử
  $('cancelProgressBtn').addEventListener('click', closeModal);
  $('saveProgressBtn').addEventListener('click', saveProgressAndOpen);
  $('clearHistoryBtn').addEventListener('click', () => {
    if (confirm('Xóa TOÀN BỘ lịch sử?')) { historyData = []; saveData(); renderHistory(); }
  });
  $('historyList').addEventListener('click', e => {
    const b = e.target.closest('button[data-action]');
    if (!b) return;
    if (b.dataset.action === 'continue-story') openReader(b.dataset.id, parseInt(b.dataset.chapter, 10) || 0);
    else if (b.dataset.action === 'delete-hist' && confirm('Xóa lịch sử của bộ này?')) {
      historyData = historyData.filter(h => !same(h.id, b.dataset.id));
      saveData();
      renderHistory();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
