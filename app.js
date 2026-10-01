/* ============================================
   GIA PHẢ NAM VIỆT - APP.JS (v1.2)
   Đã dùng Legacy anon key — fix lỗi 401
   ============================================ */

const SUPABASE_URL = 'https://bqojzghxgdkrfyhnvpku.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxb2p6Z2h4Z2RrcmZ5aG52cGt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MzQ0NjYsImV4cCI6MjEwNjQxMDQ2Nn0.OKtcR_Uu9ST68yfoDZT87InkmIWSQglt8eYB5WsnBxc';

// ⚠️ Đổi tên biến từ 'supabase' → 'sbClient' để tránh trùng với SDK
let sbClient = null;

try {
  if (window.supabase && window.supabase.createClient) {
    sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('✅ Đã kết nối Supabase');
  } else {
    console.warn('⚠️ Supabase SDK chưa load');
  }
} catch (err) {
  console.error('❌ Lỗi khởi tạo Supabase:', err);
}

let allPersons = [];
let filteredPersons = [];
let currentUser = null;

// ===== KHỞI ĐỘNG =====
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Gia Phả Nam Việt đang khởi động...');
  
  setupTabs();
  setupAuth();
  setupSearch();
  setupAddPerson();
  
  await checkAuthSession();
  await loadSettings();
  await loadPersons();
});

/* ============================================
   PHẦN 1: TABS
   ============================================ */
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

/* ============================================
   PHẦN 2: AUTH
   ============================================ */
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
        options: {
          emailRedirectTo: window.location.origin + window.location.pathname
        }
      });
      
      if (error) throw error;
      
      msg.textContent = '✅ Đã gửi link đăng nhập! Kiểm tra email: ' + email;
      msg.className = 'modal__note modal__note--success';
      document.getElementById('loginEmail').value = '';
      
    } catch (err) {
      console.error('Lỗi gửi magic link:', err);
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
    
  } catch (err) {
    console.error('Lỗi kiểm tra session:', err);
  }
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

/* ============================================
   PHẦN 3: LOAD DỮ LIỆU
   ============================================ */
async function loadSettings() {
  if (!sbClient) {
    console.warn('⚠️ Không có Supabase client, dùng dữ liệu mẫu');
    showDefaultSettings();
    return;
  }
  
  try {
    const { data, error } = await sbClient
      .from('settings')
      .select('key, value');
    
    if (error) throw error;
    
    const settings = {};
    (data || []).forEach(item => {
      settings[item.key] = item.value;
    });
    
    const loiTua = document.getElementById('loiTua');
    if (loiTua && settings.loi_tua) {
      loiTua.innerHTML = formatText(settings.loi_tua);
    } else {
      showDefaultLoiTua();
    }
    
    const huongDan = document.getElementById('huongDan');
    if (huongDan && settings.huong_dan_su_dung) {
      huongDan.innerHTML = formatText(settings.huong_dan_su_dung);
    } else {
      showDefaultHuongDan();
    }
    
    console.log('✅ Đã load settings');
    
  } catch (err) {
    console.error('Lỗi load settings:', err);
    showDefaultSettings();
  }
}

function showDefaultSettings() {
  showDefaultLoiTua();
  showDefaultHuongDan();
}

function showDefaultLoiTua() {
  const el = document.getElementById('loiTua');
  if (el) el.innerHTML = '<p>Biên tập toàn bộ phả chí nối tiếp đời nọ đến đời kia của họ Phạm ở Đà Xuyên.</p><p><em>(Nội dung sẽ được cập nhật sau khi kết nối database.)</em></p>';
}

function showDefaultHuongDan() {
  const el = document.getElementById('huongDan');
  if (el) el.innerHTML = '<p><strong>Bước 1:</strong> Đăng nhập bằng Gmail (bấm nút "Đăng nhập" góc phải trên).</p><p><strong>Bước 2:</strong> Chọn tab muốn xem.</p><p><strong>Bước 3:</strong> Bấm nút "+ Thêm cá nhân" để bổ sung dữ liệu.</p><p><em>(Hướng dẫn chi tiết sẽ cập nhật sau.)</em></p>';
}

async function loadPersons() {
  const grid = document.getElementById('personGrid');
  if (!grid) return;
  
  if (!sbClient) {
    grid.innerHTML = '<p class="empty-state">⚠️ Chưa kết nối được database.<br>Vui lòng thử lại sau.</p>';
    return;
  }
  
  grid.innerHTML = '<p class="empty-state">Đang tải dữ liệu...</p>';
  
  try {
    const { data, error } = await sbClient
      .from('persons')
      .select('*')
      .order('generation', { ascending: true })
      .order('birth_order', { ascending: true });
    
    if (error) throw error;
    
    allPersons = data || [];
    filteredPersons = [...allPersons];
    
    renderPersons();
    console.log(`✅ Đã load ${allPersons.length} người`);
    
  } catch (err) {
    console.error('Lỗi load persons:', err);
    grid.innerHTML = '<p class="empty-state">❌ Không tải được dữ liệu.<br>Vui lòng thử lại.</p>';
  }
}

/* ============================================
   PHẦN 4: RENDER
   ============================================ */
function renderPersons() {
  const grid = document.getElementById('personGrid');
  if (!grid) return;
  
  if (!filteredPersons || filteredPersons.length === 0) {
    grid.innerHTML = '<p class="empty-state">Chưa có dữ liệu.<br>Bấm "+ Thêm cá nhân" để bắt đầu.</p>';
    return;
  }
  
  grid.innerHTML = '';
  
  filteredPersons.forEach(person => {
    const card = document.createElement('div');
    card.className = 'person-card';
    card.dataset.id = person.id;
    
    let nameClass = 'person-card__name';
    if (person.is_unknown) {
      nameClass += ' person-card__name--unknown';
    } else if (person.is_deceased || person.death_year) {
      nameClass += ' person-card__name--bold';
    }
    
    const metaParts = [];
    if (person.generation) metaParts.push(`Đời ${person.generation}`);
    if (person.birth_year) {
      const yearStr = person.death_year 
        ? `(${person.birth_year} - ${person.death_year})`
        : `(${person.birth_year})`;
      metaParts.push(yearStr);
    }
    if (person.branch) metaParts.push(person.branch);
    
    card.innerHTML = `
      <div class="${nameClass}">${person.full_name || '(chưa có tên)'}</div>
      <div class="person-card__meta">${metaParts.join(' • ')}</div>
    `;
    
    grid.appendChild(card);
  });
}

/* ============================================
   PHẦN 5: TÌM KIẾM
   ============================================ */
function setupSearch() {
  const searchInput = document.getElementById('searchInput');
  const filterGen = document.getElementById('filterGeneration');
  
  if (searchInput) searchInput.addEventListener('input', applyFilters);
  if (filterGen) filterGen.addEventListener('change', applyFilters);
}

function applyFilters() {
  const keyword = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
  const gen = document.getElementById('filterGeneration')?.value || '';
  
  filteredPersons = allPersons.filter(p => {
    if (gen && String(p.generation) !== String(gen)) return false;
    
    if (keyword) {
      const name = (p.full_name || '').toLowerCase();
      const nameNoDau = removeVietnameseTones(name);
      const keywordNoDau = removeVietnameseTones(keyword);
      
      if (!name.includes(keyword) && !nameNoDau.includes(keywordNoDau)) {
        return false;
      }
    }
    
    return true;
  });
  
  renderPersons();
}

function removeVietnameseTones(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/* ============================================
   PHẦN 6: THÊM CÁ NHÂN
   ============================================ */
function setupAddPerson() {
  const btn = document.getElementById('addPersonBtn');
  if (!btn) return;
  
  btn.addEventListener('click', () => {
    if (!currentUser) {
      alert('⚠️ Bạn cần đăng nhập trước khi thêm người.\n\nBấm "Đăng nhập" ở góc phải trên.');
      document.getElementById('loginModal').style.display = 'flex';
      return;
    }
    
    alert('📝 Form thêm cá nhân sẽ có trong phiên bản tiếp theo!');
  });
}

/* ============================================
   PHẦN 7: TIỆN ÍCH
   ============================================ */
function formatText(text) {
  if (!text) return '';
  
  let content = text;
  try {
    if (typeof text === 'string' && (text.startsWith('"') || text.startsWith('['))) {
      content = JSON.parse(text);
    }
  } catch (e) {}
  
  return String(content)
    .split('\n')
    .map(line => `<p>${line}</p>`)
    .join('');
}

console.log('%c🏛️ GIA PHẢ HỌ PHẠM - NAM VIỆT', 'font-size: 20px; color: #01285E; font-weight: bold;');
console.log('%cDự án GiaPhaNamViet © 2026', 'color: #627794;');