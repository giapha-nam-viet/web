/* ============================================
   GIA PHẢ NAM VIỆT - APP.JS (v1.4)
   Bỏ số thứ bậc + Đầy đủ logic
   ============================================ */

const SUPABASE_URL = 'https://bqojzghxgdkrfyhnvpku.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxb2p6Z2h4Z2RrcmZ5aG52cGt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MzQ0NjYsImV4cCI6MjEwNjQxMDQ2Nn0.OKtcR_Uu9ST68yfoDZT87InkmIWSQglt8eYB5WsnBxc';

let sbClient = null;
try {
  if (window.supabase && window.supabase.createClient) {
    sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('✅ Đã kết nối Supabase');
  }
} catch (err) { console.error('❌ Lỗi khởi tạo Supabase:', err); }

let allPersons = [];
let allMarriages = [];
let allParentChild = [];
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
  await loadAllData();
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

/* SUB TABS */
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

  loginBtn.addEventListener('click', () => { loginModal.style.display = 'flex'; });
  closeLogin.addEventListener('click', () => {
    loginModal.style.display = 'none';
    document.getElementById('loginMessage').textContent = '';
  });

  sendMagicLink.addEventListener('click', async () => {
    const email = document.getElementById('loginEmail').value.trim();
    const msg = document.getElementById('loginMessage');
    if (!email) { msg.textContent = '⚠️ Vui lòng nhập email'; msg.className = 'modal__note modal__note--error'; return; }
    if (!sbClient) { msg.textContent = '⚠️ Chưa kết nối được Supabase'; msg.className = 'modal__note modal__note--error'; return; }
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

/* LOAD TẤT CẢ DỮ LIỆU */
async function loadAllData() {
  const grid = document.getElementById('personGrid');
  if (!grid) return;
  if (!sbClient) {
    grid.innerHTML = '<p class="empty-state">⚠️ Chưa kết nối được database.</p>';
    return;
  }
  grid.innerHTML = '<p class="empty-state">Đang tải dữ liệu...</p>';

  try {
    const [personsRes, marriagesRes, pcRes] = await Promise.all([
      sbClient.from('persons').select('*').order('generation', { ascending: true }).order('birth_order', { ascending: true, nullsFirst: false }),
      sbClient.from('marriages').select('*'),
      sbClient.from('parent_child').select('*')
    ]);
    if (personsRes.error) throw personsRes.error;
    if (marriagesRes.error) throw marriagesRes.error;
    if (pcRes.error) throw pcRes.error;

    allPersons = personsRes.data || [];
    allMarriages = marriagesRes.data || [];
    allParentChild = pcRes.data || [];
    filteredPersons = [...allPersons];
    renderPersons();
    console.log(`✅ Đã load ${allPersons.length} người, ${allMarriages.length} hôn nhân`);
  } catch (err) {
    console.error(err);
    grid.innerHTML = '<p class="empty-state">❌ Không tải được dữ liệu.</p>';
  }
}

/* LẤY VỢ/CHỒNG CỦA 1 NGƯỜI */
function getSpouses(personId) {
  const spouseIds = [];
  allMarriages.forEach(m => {
    if (m.husband_id === personId && m.wife_id) spouseIds.push(m.wife_id);
    if (m.wife_id === personId && m.husband_id) spouseIds.push(m.husband_id);
  });
  return spouseIds.map(id => allPersons.find(p => p.id === id)).filter(Boolean);
}

/* RENDER PERSONS */
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
  const sortedGens = Object.keys(byGeneration).sort((a, b) => a - b);

  sortedGens.forEach(gen => {
    const people = byGeneration[gen];
    const huyetThong = people.filter(p => p.role === 'Huyết thống' || !p.role);
    const phoiNguu = people.filter(p => p.role === 'Phối ngẫu');
