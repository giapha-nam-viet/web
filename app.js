/* ============================================
   GIA PHẢ NAM VIỆT - APP.JS (v1.5)
   Bản hoàn chỉnh - Đã fix lỗi bị cắt
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
    const tab = document.querySelector('.tab[data-tab="' + hash + '"]');
    if (tab) tab.click();
  }
}

function setupSubTabs() {
  document.querySelectorAll('.sub-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.filterType;
      const value = btn.dataset.filterValue;
      document.querySelectorAll('.sub-tab[data-filter-type="' + type + '"]').forEach(b =>
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

async function loadSettings() {
  if (!sbClient) return;
  try {
    const { data, error } = await sbClient.from('settings').select('key, value');
    if (error) throw error;
    const settings = {};
    (data || []).forEach(item => {
      settings[item.key] = item.value;
    });

    const loiTua = document.getElementById('loiTua');
    if (loiTua && settings.loi_tua) {
      loiTua.innerHTML = formatText(settings.loi_tua);
    }

    const huongDan = document.getElementById('huongDan');
    if (huongDan && settings.huong_dan_su_dung) {
      huongDan.innerHTML = formatText(settings.huong_dan_su_dung);
    }
  } catch (err) {
    console.error('Lỗi load settings:', err);
  }
}

async function loadAllData() {
  const grid = document.getElementById('personGrid');
  if (!grid) return;
  if (!sbClient) {
    grid.innerHTML = '<p class="empty-state">⚠️ Chưa kết nối được database.</p>';
    return;
  }
  grid.innerHTML = '<p class="empty-state">Đang tải dữ liệu...</p>';

  try {
    const results = await Promise.all([
      sbClient.from('persons').select('*').order('generation', { ascending: true }),
      sbClient.from('marriages').select('*'),
      sbClient.from('parent_child').select('*')
    ]);

    const personsRes = results[0];
    const marriagesRes = results[1];
    const pcRes = results[2];

    if (personsRes.error) throw personsRes.error;
    if (marriagesRes.error) throw marriagesRes.error;
    if (pcRes.error) throw pcRes.error;

    allPersons = personsRes.data || [];
    allMarriages = marriagesRes.data || [];
    allParentChild = pcRes.data || [];
    filteredPersons = allPersons.slice();
    renderPersons();
    console.log('✅ Đã load ' + allPersons.length + ' người, ' + allMarriages.length + ' hôn nhân');
  } catch (err) {
    console.error('Lỗi load data:', err);
    grid.innerHTML = '<p class="empty-state">❌ Không tải được dữ liệu.</p>';
  }
}

function getSpouses(personId) {
  const spouseIds = [];
  allMarriages.forEach(m => {
    if (m.husband_id === personId && m.wife_id) spouseIds.push(m.wife_id);
    if (m.wife_id === personId && m.husband_id) spouseIds.push(m.husband_id);
  });
  return spouseIds.map(id => allPersons.find(p => p.id === id)).filter(Boolean);
}

function renderPersons() {
  const grid = document.getElementById('personGrid');
  if (!grid) return;
  if (!filteredPersons || filteredPersons.length === 0) {
    grid.innerHTML = '<p class="empty-state">Không tìm thấy ai phù hợp.</p>';
    return;
  }

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

    const genSection = document.createElement('div');
    genSection.className = 'generation-section';

    const genTitle = document.createElement('div');
    genTitle.className = 'generation-section__title';
    let titleText = 'Đời thứ ' + gen;
    if (gen === '1' || gen === 1) titleText = 'Đời thứ 1 — Thủy tổ';
    genTitle.textContent = titleText;
    genSection.appendChild(genTitle);

    const columns = document.createElement('div');
    columns.className = 'people-columns';

    const colLeft = document.createElement('div');
    colLeft.innerHTML = '<div class="people-column__header">Huyết thống</div>';

    if (huyetThong.length === 0) {
      colLeft.innerHTML += '<p class="empty-state" style="padding:20px;font-size:14px;">Chưa có dữ liệu</p>';
    } else {
      huyetThong.forEach(p => {
        const coupleRow = document.createElement('div');
        coupleRow.className = 'couple-row';
        coupleRow.appendChild(createPersonMini(p));
        colLeft.appendChild(coupleRow);
      });
    }

    const colRight = document.createElement('div');
    colRight.innerHTML = '<div class="people-column__header">Phối ngẫu</div>';

    if (huyetThong.length === 0) {
      colRight.innerHTML += '<p class="empty-state" style="padding:20px;font-size:14px;">Chưa có dữ liệu</p>';
    } else {
      huyetThong.forEach(p => {
        const spouses = getSpouses(p.id);
        const coupleRow = document.createElement('div');
        coupleRow.className = 'couple-row';
        const spouseContainer = document.createElement('div');
        spouseContainer.className = 'spouse-list';

        if (spouses.length === 0) {
          const emptyBox = document.createElement('div');
          emptyBox.className = 'person-mini';
          emptyBox.style.opacity = '0.4';
          emptyBox.style.textAlign = 'center';
          emptyBox.style.fontStyle = 'italic';
          emptyBox.style.color = '#99AACC';
          emptyBox.style.fontSize = '13px';
          emptyBox.textContent = '(chưa có thông tin)';
          spouseContainer.appendChild(emptyBox);
        } else {
          spouses.forEach(s => spouseContainer.appendChild(createPersonMini(s)));
        }

        coupleRow.appendChild(spouseContainer);
        colRight.appendChild(coupleRow);
      });
    }

    columns.appendChild(colLeft);
    columns.appendChild(colRight);
    genSection.appendChild(columns);
    grid.appendChild(genSection);
  });
}

function createPersonMini(person) {
  const card = document.createElement('div');
  card.className = 'person-mini';
  card.dataset.id = person.id;

  let nameClass = 'person-mini__name';
  if (person.is_unknown) nameClass += ' person-mini__name--unknown';

  const dateParts = [];
  if (person.birth_year) dateParts.push(person.birth_year);
  if (person.death_year) dateParts.push(person.death_year);
  const dateStr = dateParts.length === 2 
    ? dateParts[0] + ' - ' + dateParts[1]
    : (dateParts[0] ? String(dateParts[0]) : '');

  const genStr = person.generation ? 'Đời ' + person.generation : '';

  card.innerHTML = 
    '<div class="' + nameClass + '">' + (person.full_name || '(chưa có tên)') + '</div>' +
    (dateStr ? '<div class="person-mini__dates">' + dateStr + '</div>' : '') +
    (genStr ? '<div class="person-mini__generation">' + genStr + '</div>' : '');

  return card;
}

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
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

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
  return String(content)
    .split('\n')
    .map(line => '<p>' + line + '</p>')
    .join('');
}

console.log('%c🏛️ GIA PHẢ HỌ PHẠM - NAM VIỆT', 'font-size: 20px; color: #01285E; font-weight: bold;');
console.log('%cDự án GiaPhaNamViet © 2026', 'color: #627794;');