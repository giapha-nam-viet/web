/* ============================================
   GIA PHẢ NAM VIỆT - APP.JS (v1.2)
   Render danh sách theo đời + chia cột
   ============================================ */

const SUPABASE_URL = 'https://bqojzghxgdkrfyhnvpku.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxb2p6Z2h4Z2RrcmZ5aG52cGt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MzQ0NjYsImV4cCI6MjEwNjQxMDQ2Nn0.OKtcR_Uu9ST68yfoDZT87InkmIWSQglt8eYB5WsnBxc';

let sbClient = null;
try {
  if (window.supabase && window.supabase.createClient) {
    sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('✅ Đã kết nối Supabase');
  }
} catch (err) {
  console.error('❌ Lỗi khởi tạo Supabase:', err);
}

let allPersons = [];
let filteredPersons = [];
let currentUser = null;
let currentFilter = { generation: null, branch: null };

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Gia Phả Nam Việt đang khởi động...');
  setupTabs();
  setupAuth();
  setupSearch();
  setupSubTabs();
  setupAddPerson();
  await checkAuthSession();
  await loadSettings();
  await loadPersons();
});

/* TABS CHÍNH */
function setupTabs() {
  const tabs = document.querySelectorAll('.tab');
  const contents = document.querySelectorAll('.tab-content');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      tabs.forEach(t => t.classList.remove('tab--active'));
      tab.classList.add('tab--active');
      contents.forEach(c => c.style.display = 'none');
      const content = document.getElementById('tab-' + target);
      if (content) content.style.display = 'block';
      window.location.hash = target;
    });
  });
  const hash = window.location.hash.replace('#', '');
  if (hash) {
    const tab = document.querySelector(`.tab[data-tab="${hash}"]`);
    if (tab) tab.click();
  }
}

/* SUB TABS (Đời / Chi) */
function setupSubTabs() {
  document.querySelectorAll('.sub-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.filterType;
      const value = btn.dataset.filterValue;
      document.querySelectorAll(`.sub-tab[data-filter-type="${type}"]`).forEach(b => 
        b.classList.remove('sub-tab--active')
      );
      btn.classList.add('sub-tab--active');
      if (type === 'generation') {
        currentFilter.generation = value ? parseInt(value) : null;
      } else if (type === 'branch') {
        currentFilter.branch = value || null;
      }
      applyFilters();
    });
  });
}

/* AUTH */
function setupAuth() {
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const loginModal = document.getElementById('loginModal');
  const closeLogin = document.getElementById('closeLogin');
  const sendMagicLink = document.getElementById('sendMagicLink');
  if (!loginBtn) return;
  
  loginBtn.addEventListener('click', () => {
    loginModal.style.display = 'flex';
  });
  closeLogin.addEventListener('click', () => {
    loginModal.style.display = 'none';
    document.getElementById('loginMessage').textContent = '';
  });
  sendMagicLink.addEventListener('click', async () => {
    const email = document.getElementById('loginEmail').value.trim();
    const msg = document.getElementById('loginMessage');
    if (!email) {
      msg.textContent = '⚠️ Vui lòng nhập email';
      msg.className = 'modal__note modal__note--error';
      return;
    }
    if (!sbClient) {
      msg.textContent = '⚠️ Chưa kết nối được Supabase';
      msg.className = 'modal__note modal__note--error';
      return;
    }
    sendMagicLink.disabled = true;
    sendMagicLink.textContent = 'Đang gửi...';
    try {
      const { error } = await sbClient.auth.signInWithOtp({
        email: email,
        options: { emailRedirectTo: window.location.origin + window.location.pathname }
      });
      if (error) throw error;
      msg.textContent = '✅ Đã gửi link đăng nhập! Kiểm tra email: ' + email;
      msg.className = 'modal__note modal__note--success';
      document.getElementById('loginEmail').value = '';
    } catch (err) {
      msg.textContent = '❌ Lỗi: ' + err.message;
      msg.className = 'modal__note modal__note--error';
    } finally {
      sendMagicLink.disabled = false;
      sendMagicLink.textContent = 'Gửi link đăng nhập';
    }
  });
  logoutBtn.addEventListener('click', async () => {
    if (!confirm('Bạn chắc chắn muốn đăng xuất?')) return;
    if (sbClient) await sbClient.auth.signOut();
    updateAuthUI(null);
    alert('Đã đăng xuất');
  });
}

async function checkAuthSession() {
  if (!sbClient) return;
  try {
    const { data: { session } } = await sbClient.auth.getSession();
    updateAuthUI(session?.user || null);
    sbClient.auth.onAuthStateChange((_event, session) => {
      updateAuthUI(session?.user || null);
    });
  } catch (err) { console.error(err); }
}

function updateAuthUI(user) {
  currentUser = user;
  const status = document.getElementById('authStatus');
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  if (!status || !loginBtn || !logoutBtn) return;
  if (user) {
    status.textContent = '👤 ' + (user.email || 'Đã đăng nhập');
    loginBtn.style.display = 'none';
    logoutBtn.style.display = 'inline-flex';
    document.getElementById('loginModal').style.display = 'none';
  } else {
    status.textContent = 'Chưa đăng nhập';
    loginBtn.style.display = 'inline-flex';
    logoutBtn.style.display = 'none';
  }
}

/* LOAD SETTINGS */
async function loadSettings() {
  if (!sbClient) return;
  try {
    const { data, error } = await sbClient.from('settings').select('key, value');
    if (error) throw error;
    const settings = {};
    (data || []).forEach(item => { settings[item.key] = item.value; });
    
    const loiTua = document.getElementById('loiTua');
    if (loiTua && settings.loi_tua) loiTua.innerHTML = formatText(settings.loi_tua);
    
    const huongDan = document.getElementById('huongDan');
    if (huongDan && settings.huong_dan_su_dung) huongDan.innerHTML = formatText(settings.huong_dan_su_dung);
  } catch (err) { console.error(err); }
}

/* LOAD PERSONS */
async function loadPersons() {
  const grid = document.getElementById('personGrid');
  if (!grid) return;
  if (!sbClient) {
    grid.innerHTML = '<p class="empty-state">⚠️ Chưa kết nối được database.</p>';
    return;
  }
  grid.innerHTML = '<p class="empty-state">Đang tải dữ liệu...</p>';
  try {
    const { data, error } = await sbClient
      .from('persons')
      .select('*')
      .order('generation', { ascending: true })
      .order('birth_order', { ascending: true, nullsFirst: false });
    if (error) throw error;
    allPersons = data || [];
    filteredPersons = [...allPersons];
    renderPersons();
    console.log(`✅ Đã load ${allPersons.length} người`);
  } catch (err) {
    console.error(err);
    grid.innerHTML = '<p class="empty-state">❌ Không tải được dữ liệu.</p>';
  }
}

/* RENDER PERSONS - CHIA ĐỜI + CỘT */
function renderPersons() {
  const grid = document.getElementById('personGrid');
  if (!grid) return;
  
  if (!filteredPersons || filteredPersons.length === 0) {
    grid.innerHTML = '<p class="empty-state">Không tìm thấy ai phù hợp.</p>';
    return;
  }
  
  // Nhóm theo đời
  const byGeneration = {};
  filteredPersons.forEach(p => {
    const gen = p.generation || 0;
    if (!byGeneration[gen]) byGeneration[gen] = [];
    byGeneration[gen].push(p);
  });
  
  grid.innerHTML = '';
  
  // Render từng đời
  const sortedGens = Object.keys(byGeneration).sort((a, b) => a - b);
  sortedGens.forEach(gen => {
    const people = byGeneration[gen];
    
    const genBlock = document.createElement('div');
    genBlock.className = 'generation-group';
    
    // Tiêu đề đời
    let genTitle = `Đời thứ ${gen}`;
    if (gen === 1) genTitle = `Đời thứ 1 — Thủy tổ`;
    genBlock.innerHTML = `<h2 class="generation-group__title">${genTitle}</h2>`;
    
    // Chia 2 cột
    const columns = document.createElement('div');
    columns.className = 'generation-group__columns';
    
    const huyetThong = people.filter(p => p.role === 'Huyết thống' || !p.role);
    const phoiNguu = people.filter(p => p.role === 'Phối ngẫu');
    
    // Cột trái: Huyết thống
    const colLeft = document.createElement('div');
    colLeft.className = 'column';
    colLeft.innerHTML = '<div class="column__title">Huyết thống</div>';
    if (huyetThong.length > 0) {
      // Nhóm theo nhánh
      const byBranch = {};
      huyetThong.forEach(p => {
        const branch = p.branch || 'Chưa phân nhánh';
        if (!byBranch[branch]) byBranch[branch] = [];
        byBranch[branch].push(p);
      });
      Object.keys(byBranch).forEach(branchName => {
        const branchDiv = document.createElement('div');
        branchDiv.className = 'branch-group';
        branchDiv.innerHTML = `<div class="branch-group__title">${branchName}</div>`;
        const peopleDiv = document.createElement('div');
        peopleDiv.className = 'branch-group__people';
        byBranch[branchName].forEach(p => peopleDiv.appendChild(createPersonCard(p)));
        branchDiv.appendChild(peopleDiv);
        colLeft.appendChild(branchDiv);
      });
    } else {
      colLeft.innerHTML += '<p class="empty-state">Chưa có dữ liệu</p>';
    }
    
    // Cột phải: Phối ngẫu
    const colRight = document.createElement('div');
    colRight.className = 'column';
    colRight.innerHTML = '<div class="column__title">Phối ngẫu</div>';
    if (phoiNguu.length > 0) {
      const peopleDiv = document.createElement('div');
      peopleDiv.className = 'branch-group__people';
      phoiNguu.forEach(p => peopleDiv.appendChild(createPersonCard(p)));
      colRight.appendChild(peopleDiv);
    } else {
      colRight.innerHTML += '<p class="empty-state">Chưa có dữ liệu</p>';
    }
    
    columns.appendChild(colLeft);
    columns.appendChild(colRight);
    genBlock.appendChild(columns);
    grid.appendChild(genBlock);
  });
}

function createPersonCard(person) {
  const card = document.createElement('div');
  card.className = 'person-card';
  card.dataset.id = person.id;
  
  let nameClass = 'person-card__name';
  if (person.is_unknown) nameClass += ' person-card__name--unknown';
  else if (person.is_deceased || person.death_year) nameClass += ' person-card__name--bold';
  
  const metaParts = [];
  if (person.birth_year) {
    const yearStr = person.death_year 
      ? `(${person.birth_year} - ${person.death_year})`
      : `(${person.birth_year})`;
    metaParts.push(yearStr);
  }
  if (person.special_status && person.special_status !== 'Bình thường') {
    metaParts.push(person.special_status);
  }
  
  card.innerHTML = `
    ${person.birth_order ? `<div class="person-card__order">${person.birth_order}</div>` : ''}
    <div class="${nameClass}">${person.full_name || '(chưa có tên)'}</div>
    <div class="person-card__meta">${metaParts.join(' • ') || ''}</div>
  `;
  
  return card;
}

/* SEARCH & FILTER */
function setupSearch() {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.addEventListener('input', applyFilters);
}

function applyFilters() {
  const keyword = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
  
  filteredPersons = allPersons.filter(p => {
    if (currentFilter.generation && p.generation !== currentFilter.generation) return false;
    if (currentFilter.branch && p.branch !== currentFilter.branch) return false;
    if (keyword) {
      const name = (p.full_name || '').toLowerCase();
      const nameNoDau = removeVietnameseTones(name);
      const keywordNoDau = removeVietnameseTones(keyword);
      if (!name.includes(keyword) && !nameNoDau.includes(keywordNoDau)) return false;
    }
    return true;
  });
  
  renderPersons();
}

function removeVietnameseTones(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

/* ADD PERSON */
function setupAddPerson() {
  const btn = document.getElementById('addPersonBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (!currentUser) {
      alert('⚠️ Bạn cần đăng nhập trước khi thêm người.');
      document.getElementById('loginModal').style.display = 'flex';
      return;
    }
    alert('📝 Form thêm cá nhân sẽ có trong phiên bản tiếp theo!');
  });
}

function formatText(text) {
  if (!text) return '';
  let content = text;
  try {
    if (typeof text === 'string' && (text.startsWith('"') || text.startsWith('['))) {
      content = JSON.parse(text);
    }
  } catch (e) {}
  return String(content).split('\n').map(line => `<p>${line}</p>`).join('');
}

console.log('%c🏛️ GIA PHẢ HỌ PHẠM - NAM VIỆT', 'font-size: 20px; color: #01285E; font-weight: bold;');