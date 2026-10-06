/* ============================================
   GIA PHẢ NAM VIỆT - APP.JS (v3.4.4)
   - v3.0: Đăng nhập bằng mật khẩu
   - v3.3: Phase A — viết hoa + đậm gạch chân
   - v3.4: Tự động nhận diện huyết thống vs phối ngẫu
   - v3.4.4: role_type = Dâu/Rể → LUÔN ở cột phải
     (kể cả khi chưa có marriage) — có badge cảnh báo
   - Phase B1: expose sbClient ra window.appSupabase
     để pedigree.js dùng chung
   ============================================ */

const SUPABASE_URL = 'https://bqojzghxgdkrfyhnvpku.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxb2p6Z2h4Z2RrcmZ5aG52cGt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MzQ0NjYsImV4cCI6MjEwNjQxMDQ2Nn0.OKtcR_Uu9ST68yfoDZT87InkmIWSQglt8eYB5WsnBxc';

let sbClient = null;
try {
  if (window.supabase && window.supabase.createClient) {
    sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    window.sbClient = sbClient;
    window.appSupabase = sbClient;   // 👈 THÊM MỚI: expose cho pedigree.js
    console.log('✅ Đã kết nối Supabase');
  }
} catch (err) {
  console.error('❌ Lỗi khởi tạo Supabase:', err);
}

let allPersons = [];
let allMarriages = [];
let allParentChild = [];
let allNotes = [];
let filteredPersons = [];
let currentUser = null;
let currentFilter = { generation: null, branch: null };
let currentTopic = 'all';
let isReorderMode = false;

window.allPersons = allPersons;
window.allNotes = allNotes;
window.currentUser = currentUser;

/* ============================================
   KHỞI ĐỘNG
   ============================================ */
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Gia Phả Nam Việt đang khởi động...');
  setupTabs();
  setupNavigation();
  setupAuth();
  setupSearch();
  setupSubTabs();
  setupAddPerson();
  setupTopicFilters();
  setupReorderMode();
  await checkAuthSession();
  await loadSettings();
  await loadAllData();
  await loadNotes();
});

/* ============================================
   TAB CHÍNH
   ============================================ */
function switchTab(tabId, push = true) {
  const tabs = document.querySelectorAll('.tab');
  const contents = document.querySelectorAll('.tab-content');
  tabs.forEach(t => {
    t.classList.toggle('tab--active', t.dataset.tab === tabId);
  });
  contents.forEach(c => {
    c.style.display = c.id === 'tab-' + tabId ? 'block' : 'none';
  });
  if (push) {
    history.pushState({ tab: tabId }, '', '#' + tabId);
  }
  updateNavButtons();
}

function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      switchTab(tab.dataset.tab, true);
    });
  });
  const hash = window.location.hash.replace('#', '');
  if (hash) {
    const tab = document.querySelector('.tab[data-tab="' + hash + '"]');
    if (tab) {
      history.replaceState({ tab: hash }, '', '#' + hash);
      switchTab(hash, false);
      return;
    }
  }
  history.replaceState({ tab: 'trang-chu' }, '', '#trang-chu');
  switchTab('trang-chu', false);
}

/* ============================================
   3 NÚT ĐIỀU HƯỚNG
   ============================================ */
function setupNavigation() {
  window.addEventListener('popstate', (e) => {
    const tabId = (e.state && e.state.tab) || 'trang-chu';
    switchTab(tabId, false);
  });
  const btnBack = document.getElementById('btnNavBack');
  if (btnBack) btnBack.addEventListener('click', () => history.back());
  const btnForward = document.getElementById('btnNavForward');
  if (btnForward) btnForward.addEventListener('click', () => history.forward());
  const btnHome = document.getElementById('btnNavHome');
  if (btnHome) btnHome.addEventListener('click', () => switchTab('trang-chu', true));
}

function updateNavButtons() {
  const btnBack = document.getElementById('btnNavBack');
  if (btnBack) btnBack.disabled = (history.length <= 1);
}

/* ============================================
   TABS PHỤ
   ============================================ */
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

/* ============================================
   AUTH
   ============================================ */
function setupAuth() {
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const loginModal = document.getElementById('loginModal');
  const closeLogin = document.getElementById('closeLogin');
  const emailInput = document.getElementById('loginEmail');
  const submitBtn = document.getElementById('sendMagicLink');
  const msg = document.getElementById('loginMessage');

  if (!loginBtn || !submitBtn || !emailInput) {
    console.warn('⚠️ Không tìm thấy element auth');
    return;
  }

  let passwordInput = document.getElementById('loginPassword');
  if (!passwordInput) {
    passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.id = 'loginPassword';
    passwordInput.placeholder = 'Mật khẩu';
    passwordInput.className = emailInput.className || '';
    passwordInput.style.cssText = emailInput.style.cssText || '';
    passwordInput.style.marginTop = '8px';
    emailInput.insertAdjacentElement('afterend', passwordInput);
  }

  submitBtn.textContent = 'Đăng nhập';

  let magicBtn = document.getElementById('magicLinkBtn');
  if (!magicBtn) {
    magicBtn = document.createElement('button');
    magicBtn.type = 'button';
    magicBtn.id = 'magicLinkBtn';
    magicBtn.className = submitBtn.className || 'btn btn--small btn--ghost';
    magicBtn.textContent = 'Gửi link qua email';
    magicBtn.style.cssText = 'margin-left:8px;';
    submitBtn.insertAdjacentElement('afterend', magicBtn);
  }

  loginBtn.addEventListener('click', () => {
    loginModal.style.display = 'flex';
    msg.textContent = '';
    msg.className = 'modal__note';
    setTimeout(() => emailInput.focus(), 100);
  });

  if (closeLogin) {
    closeLogin.addEventListener('click', () => {
      loginModal.style.display = 'none';
      msg.textContent = '';
      passwordInput.value = '';
    });
  }

  const handleEnter = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitBtn.click();
    }
  };
  emailInput.addEventListener('keydown', handleEnter);
  passwordInput.addEventListener('keydown', handleEnter);

  submitBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    msg.className = 'modal__note';

    if (!email) {
      msg.textContent = '⚠️ Vui lòng nhập email';
      msg.className = 'modal__note modal__note--error';
      return;
    }
    if (!password) {
      msg.textContent = '⚠️ Vui lòng nhập mật khẩu';
      msg.className = 'modal__note modal__note--error';
      passwordInput.focus();
      return;
    }
    if (!sbClient) {
      msg.textContent = '⚠️ Chưa kết nối được Supabase';
      msg.className = 'modal__note modal__note--error';
      return;
    }

    submitBtn.disabled = true;
    const oldText = submitBtn.textContent;
    submitBtn.textContent = 'Đang đăng nhập...';

    try {
      const { data, error } = await sbClient.auth.signInWithPassword({
        email: email,
        password: password
      });
      if (error) throw error;

      console.log('✅ Đăng nhập thành công:', data.user?.email);
      msg.textContent = '✅ Đăng nhập thành công!';
      msg.className = 'modal__note modal__note--success';
      passwordInput.value = '';

      setTimeout(() => {
        loginModal.style.display = 'none';
        msg.textContent = '';
      }, 700);

    } catch (err) {
      console.error('Login error:', err);
      let errMsg = err.message || 'Lỗi không xác định';
      if (errMsg.includes('Invalid login credentials')) {
        errMsg = 'Email hoặc mật khẩu không đúng';
      } else if (errMsg.includes('Email not confirmed')) {
        errMsg = 'Email chưa xác nhận. Vào Supabase → Authentication → Users → Confirm email';
      }
      msg.textContent = '❌ ' + errMsg;
      msg.className = 'modal__note modal__note--error';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = oldText;
    }
  });

  magicBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    msg.className = 'modal__note';

    if (!email) {
      msg.textContent = '⚠️ Vui lòng nhập email để nhận link';
      msg.className = 'modal__note modal__note--error';
      return;
    }
    if (!sbClient) return;

    magicBtn.disabled = true;
    magicBtn.textContent = 'Đang gửi...';

    try {
      const { error } = await sbClient.auth.signInWithOtp({
        email: email,
        options: {
          emailRedirectTo: window.location.origin + window.location.pathname
        }
      });
      if (error) throw error;

      msg.textContent = '✅ Đã gửi link! Kiểm tra email: ' + email;
      msg.className = 'modal__note modal__note--success';
    } catch (err) {
      msg.textContent = '❌ ' + (err.message || 'Lỗi gửi link');
      msg.className = 'modal__note modal__note--error';
    } finally {
      magicBtn.disabled = false;
      magicBtn.textContent = 'Gửi link qua email';
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
  } catch (err) { console.error('Lỗi session:', err); }
}

function updateAuthUI(user) {
  currentUser = user;
  window.currentUser = user;
  const status = document.getElementById('authStatus');
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  if (!status || !loginBtn || !logoutBtn) return;
  if (user) {
    status.textContent = '👤 ' + (user.email || 'Đã đăng nhập');
    loginBtn.style.display = 'none';
    logoutBtn.style.display = 'inline-flex';
    const modal = document.getElementById('loginModal');
    if (modal) modal.style.display = 'none';
  } else {
    status.textContent = 'Chưa đăng nhập';
    loginBtn.style.display = 'inline-flex';
    logoutBtn.style.display = 'none';
  }
}

/* ============================================
   SETTINGS
   ============================================ */
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
  } catch (err) { console.error('Lỗi load settings:', err); }
}

/* ============================================
   DỮ LIỆU CHÍNH
   ============================================ */
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
      sbClient.from('persons').select('id, full_name, gender, generation, branch, sibling_order, birth_year, death_year, role, role_type, is_unknown, is_deleted, created_at').order('generation', { ascending: true }).order('sibling_order', { ascending: true, nullsFirst: false }),
      sbClient.from('marriages').select('*'),
      sbClient.from('parent_child').select('*')
    ]);
    if (results[0].error) throw results[0].error;
    if (results[1].error) throw results[1].error;
    if (results[2].error) throw results[2].error;

    allPersons = results[0].data || [];
    allMarriages = results[1].data || [];
    allParentChild = results[2].data || [];
    filteredPersons = allPersons.slice();
    window.allPersons = allPersons;

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

/* ============================================
   NHÃN "ĐỜI THỨ ..."
   ============================================ */
function getGenerationLabel(gen) {
  const n = parseInt(gen, 10);
  const map = {
    1: "Đời thứ nhất",
    2: "Đời thứ hai",
    3: "Đời thứ ba",
    4: "Đời thứ tư",
    5: "Đời thứ năm",
    6: "Đời thứ sáu",
    7: "Đời thứ bảy",
    8: "Đời thứ tám",
    9: "Đời thứ chín",
    10: "Đời thứ mười"
  };
  return map[n] || ('Đời thứ ' + n);
}

/* ============================================
   v3.4.4 — XÁC ĐỊNH HUYẾT THỐNG HAY PHỐI NGẪU
   
   QUY TẮC MỚI (đơn giản, rõ ràng):
   1. role_type chứa 'Dâu/Rể/Vợ/Chồng/Phối ngẫu' → PHỐI NGẪU (cột phải) — LUÔN LUÔN
   2. role = 'Huyết thống' → HUYẾT THỐNG (cột trái)
   3. Các trường hợp khác → mặc định HUYẾT THỐNG
   ============================================ */
function isHuyetThong(person) {
  if (!person) return true;

  const roleType = (person.role_type || '').trim().toLowerCase();
  const role = (person.role || '').trim();

  // 1. role_type có từ khoá phối ngẫu → LUÔN phối ngẫu
  const phoiNgauKeywords = ['dâu', 'rể', 'vợ', 'chồng', 'phối ngẫu'];
  if (phoiNgauKeywords.some(kw => roleType.includes(kw))) {
    return false;
  }

  // 2. role = 'Huyết thống' → huyết thống
  if (role === 'Huyết thống') return true;

  // 3. role có giá trị khác → phối ngẫu
  if (role && role !== 'Huyết thống') return false;

  // 4. Mặc định huyết thống
  return true;
}

/* ============================================
   v3.4.4 — KIỂM TRA PHỐI NGẪU CHƯA LIÊN KẾT
   (Dâu/Rể nhưng chưa có marriage)
   ============================================ */
function isUnlinkedSpouse(person) {
  if (!person) return false;
  if (isHuyetThong(person)) return false;
  const hasMarriage = allMarriages.some(m =>
    m.husband_id === person.id || m.wife_id === person.id
  );
  return !hasMarriage;
}

/* ============================================
   RENDER DANH SÁCH NGƯỜI
   ============================================ */
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
    const huyetThong = people.filter(p => isHuyetThong(p));

    // SORT ỔN ĐỊNH
    huyetThong.sort((a, b) => {
      const aOrder = a.sibling_order != null ? a.sibling_order : 9999;
      const bOrder = b.sibling_order != null ? b.sibling_order : 9999;
      if (aOrder !== bOrder) return aOrder - bOrder;

      const aCreated = a.created_at || '';
      const bCreated = b.created_at || '';
      if (aCreated !== bCreated) return aCreated.localeCompare(bCreated);

      return (a.full_name || '').localeCompare(b.full_name || '', 'vi');
    });

    const genSection = document.createElement('div');
    genSection.className = 'generation-section';

    const genTitle = document.createElement('div');
    genTitle.className = 'generation-section__title';
    genTitle.textContent = getGenerationLabel(gen);
    genSection.appendChild(genTitle);

    const header = document.createElement('div');
    header.className = 'people-header';
    header.innerHTML =
      '<div class="people-header__col">Huyết thống</div>' +
      '<div class="people-header__col">Phối ngẫu</div>';
    genSection.appendChild(header);

    if (huyetThong.length === 0) {
      const emptyRow = document.createElement('div');
      emptyRow.className = 'couple-row';
      emptyRow.innerHTML =
        '<div><p class="empty-state" style="padding:20px;font-size:14px;">Chưa có dữ liệu</p></div>' +
        '<div></div>';
      genSection.appendChild(emptyRow);
    } else {
      huyetThong.forEach(p => {
        const spouses = getSpouses(p.id);
        const coupleRow = document.createElement('div');
        coupleRow.className = 'couple-row';

        const leftCol = document.createElement('div');
        leftCol.appendChild(createPersonMini(p));

        const rightCol = document.createElement('div');
        if (spouses.length === 0) {
          const emptyBox = document.createElement('div');
          emptyBox.className = 'person-mini';
          emptyBox.style.opacity = '0.4';
          emptyBox.style.textAlign = 'center';
          emptyBox.style.fontStyle = 'italic';
          emptyBox.style.color = '#99AACC';
          emptyBox.style.fontSize = '13px';
          emptyBox.textContent = '(chưa có thông tin)';
          rightCol.appendChild(emptyBox);
        } else {
          spouses.forEach(s => rightCol.appendChild(createPersonMini(s)));
        }

        coupleRow.appendChild(leftCol);
        coupleRow.appendChild(rightCol);
        genSection.appendChild(coupleRow);
      });
    }

    // v3.4.4 — PHỐI NGẪU CHƯA LIÊN KẾT
    // Hiện các Dâu/Rể không có marriage ở cột phải (không có cặp)
    const orphanSpouses = people.filter(p => isUnlinkedSpouse(p));
    orphanSpouses.sort((a, b) => {
      const aCreated = a.created_at || '';
      const bCreated = b.created_at || '';
      if (aCreated !== bCreated) return aCreated.localeCompare(bCreated);
      return (a.full_name || '').localeCompare(b.full_name || '', 'vi');
    });

    orphanSpouses.forEach(p => {
      const coupleRow = document.createElement('div');
      coupleRow.className = 'couple-row';

      // Cột trái trống
      const leftCol = document.createElement('div');
      leftCol.innerHTML = '<div class="person-mini" style="opacity:0;pointer-events:none;min-height:0;padding:0;border:none;"></div>';

      // Cột phải có người
      const rightCol = document.createElement('div');
      rightCol.appendChild(createPersonMini(p));

      coupleRow.appendChild(leftCol);
      coupleRow.appendChild(rightCol);
      genSection.appendChild(coupleRow);
    });

    grid.appendChild(genSection);
  });
}

function createPersonMini(person) {
  const card = document.createElement('div');
  card.className = 'person-mini';
  card.dataset.id = person.id;
  card.style.cursor = 'pointer';
  card.onclick = () => openPersonForm(person.id);

  let nameClass = 'person-mini__name';
  if (person.is_unknown) nameClass += ' person-mini__name--unknown';
  if (person.birth_year && person.death_year) nameClass += ' person-mini__name--full-dates';

  const dateParts = [];
  if (person.birth_year) dateParts.push(person.birth_year);
  if (person.death_year) dateParts.push(person.death_year);
  const dateStr = dateParts.length === 2
    ? dateParts[0] + ' - ' + dateParts[1]
    : (dateParts[0] ? String(dateParts[0]) : '');

  const genStr = person.generation ? getGenerationLabel(person.generation) : '';

  // Badge cho phối ngẫu chưa liên kết
  const badgeHtml = isUnlinkedSpouse(person)
    ? '<span style="display:inline-block;background:#FFF3CD;color:#856404;font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;margin-top:4px;">⚠️ Chưa liên kết vợ/chồng</span>'
    : '';

  let reorderHtml = '';
  if (isReorderMode && person.sibling_order != null) {
    reorderHtml =
      '<div class="person-mini__reorder">' +
        '<button class="reorder-btn" onclick="event.stopPropagation(); movePersonUp(\'' + person.id + '\')" title="Lên">▲</button>' +
        '<button class="reorder-btn" onclick="event.stopPropagation(); movePersonDown(\'' + person.id + '\')" title="Xuống">▼</button>' +
      '</div>';
  }

  card.innerHTML =
    '<div class="' + nameClass + '">' + (person.full_name || '(chưa có tên)') + '</div>' +
    badgeHtml +
    (dateStr ? '<div class="person-mini__dates">' + dateStr + '</div>' : '') +
    (genStr ? '<div class="person-mini__generation">' + genStr + '</div>' : '') +
    reorderHtml;

  return card;
}

/* ============================================
   TÌM KIẾM + LỌC
   ============================================ */
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

/* ============================================
   NÚT THÊM NGƯỜI
   ============================================ */
function setupAddPerson() {
  const btn = document.getElementById('addPersonBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (!currentUser) {
      alert('⚠️ Bạn cần đăng nhập trước khi thêm người.');
      document.getElementById('loginModal').style.display = 'flex';
      return;
    }
    if (typeof openPersonForm === 'function') {
      openPersonForm();
    } else {
      alert('⚠️ Form chưa được tải. Vui lòng thử lại sau.');
    }
  });
}

/* ============================================
   SẮP XẾP THỨ BẬC
   ============================================ */
function setupReorderMode() {
  const toggleBtn = document.getElementById('reorderToggleBtn');
  const doneBtn = document.getElementById('reorderDoneBtn');
  if (toggleBtn) toggleBtn.addEventListener('click', toggleReorderMode);
  if (doneBtn) doneBtn.addEventListener('click', () => {
    toggleReorderMode();
    alert('✅ Đã lưu thứ bậc mới!');
  });
}

function toggleReorderMode() {
  isReorderMode = !isReorderMode;
  const bar = document.getElementById('reorderBar');
  const btn = document.getElementById('reorderToggleBtn');
  if (isReorderMode) {
    if (bar) bar.style.display = 'flex';
    if (btn) { btn.textContent = '🔀 Đang sắp xếp...'; btn.disabled = true; }
    document.body.classList.add('reorder-mode');
  } else {
    if (bar) bar.style.display = 'none';
    if (btn) { btn.textContent = '🔀 Sắp xếp thứ bậc'; btn.disabled = false; }
    document.body.classList.remove('reorder-mode');
  }
  renderPersons();
}

async function swapSiblingOrder(personA, personB) {
  if (!sbClient) return false;
  const orderA = personA.sibling_order;
  const orderB = personB.sibling_order;
  try {
    const tempOrder = -999;
    await sbClient.from('persons').update({ sibling_order: tempOrder }).eq('id', personA.id);
    await sbClient.from('persons').update({ sibling_order: orderA }).eq('id', personB.id);
    await sbClient.from('persons').update({ sibling_order: orderB }).eq('id', personA.id);
    personA.sibling_order = orderB;
    personB.sibling_order = orderA;
    return true;
  } catch (err) {
    console.error('Lỗi swap:', err);
    alert('❌ Lỗi khi sắp xếp: ' + err.message);
    return false;
  }
}

async function movePersonUp(personId) {
  if (!allPersons || allPersons.length === 0) return;
  const person = allPersons.find(p => p.id === personId);
  if (!person) return;
  const sameGroup = allPersons
    .filter(p =>
      p.generation === person.generation &&
      (p.branch || null) === (person.branch || null) &&
      isHuyetThong(p) &&
      p.sibling_order != null
    )
    .sort((a, b) => a.sibling_order - b.sibling_order);
  const idx = sameGroup.findIndex(p => p.id === personId);
  if (idx <= 0) { alert('⚠️ Đây đã là người đầu tiên trong nhóm'); return; }
  const above = sameGroup[idx - 1];
  const ok = await swapSiblingOrder(person, above);
  if (ok) applyFilters();
}

async function movePersonDown(personId) {
  if (!allPersons || allPersons.length === 0) return;
  const person = allPersons.find(p => p.id === personId);
  if (!person) return;
  const sameGroup = allPersons
    .filter(p =>
      p.generation === person.generation &&
      (p.branch || null) === (person.branch || null) &&
      isHuyetThong(p) &&
      p.sibling_order != null
    )
    .sort((a, b) => a.sibling_order - b.sibling_order);
  const idx = sameGroup.findIndex(p => p.id === personId);
  if (idx < 0 || idx >= sameGroup.length - 1) { alert('⚠️ Đây đã là người cuối cùng trong nhóm'); return; }
  const below = sameGroup[idx + 1];
  const ok = await swapSiblingOrder(person, below);
  if (ok) applyFilters();
}

/* ============================================
   NGOẠI PHẢ
   ============================================ */
const TOPICS = {
  all: 'Tất cả',
  'Lịch sử dòng họ': 'Lịch sử dòng họ',
  'Văn hoá Xã hội': 'Văn hoá Xã hội',
  'Phong tục Tập quán': 'Phong tục Tập quán',
  'Hành trạng cá nhân': 'Hành trạng cá nhân',
  'Tư liệu hình ảnh': 'Tư liệu hình ảnh'
};

function setupTopicFilters() {
  document.querySelectorAll('.topic-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.topic-chip').forEach(b => b.classList.remove('topic-chip--active'));
      btn.classList.add('topic-chip--active');
      currentTopic = btn.dataset.topic;
      renderNotes();
    });
  });
}

async function loadNotes() {
  if (!sbClient) return;
  try {
    const { data, error } = await sbClient
      .from('notes')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    allNotes = data || [];
    window.allNotes = allNotes;
    console.log('✅ Đã load ' + allNotes.length + ' bài viết');
    renderNotes();
  } catch (err) {
    console.error('Lỗi load notes:', err);
    const list = document.getElementById('notesList');
    if (list) list.innerHTML = '<p class="empty-state">❌ Không tải được bài viết.</p>';
  }
}

function renderNotes() {
  const list = document.getElementById('notesList');
  if (!list) return;

  let notes = allNotes;
  if (currentTopic !== 'all') {
    notes = notes.filter(n => n.category === currentTopic);
  }

  if (!notes || notes.length === 0) {
    list.innerHTML = '<p class="empty-state">Chưa có bài viết nào trong chủ đề này.</p>';
    return;
  }

  list.innerHTML = '';
  notes.forEach(note => {
    const card = document.createElement('article');
    card.className = 'note-card';
    card.dataset.id = note.id;

    const catLabel = note.category
      ? '<span class="note-card__category">' + note.category + '</span>'
      : '';

    card.innerHTML =
      catLabel +
      '<h3 class="note-card__title">' + (note.title || '(chưa có tiêu đề)') + '</h3>' +
      '<p class="note-card__meta">' +
        (note.author_name ? '✍️ ' + note.author_name + ' · ' : '') +
        (note.created_at ? new Date(note.created_at).toLocaleDateString('vi-VN') : '') +
      '</p>' +
      '<div class="note-card__excerpt">' +
        (note.content ? note.content.substring(0, 200) + (note.content.length > 200 ? '...' : '') : '') +
      '</div>';

    list.appendChild(card);
  });
}

/* ============================================
   HELPER
   ============================================ */
function formatText(text) {
  if (!text) return '';
  let content = text;
  try {
    if (typeof text === 'string' && (text.startsWith('"') || text.startsWith('['))) {
      content = JSON.parse(text);
    }
  } catch (e) {}
  return String(content).split('\n').map(line => '<p>' + line + '</p>').join('');
}

console.log('%c🏛️ GIA PHẢ HỌ PHẠM - NAM VIỆT (v3.4.4)', 'font-size: 20px; color: #01285E; font-weight: bold;');

/* ============================================
   BỘ ĐẾM KÝ TỰ
   ============================================ */
function updateCharCount(fieldId, maxChars) {
  const field = document.getElementById(fieldId);
  const counter = document.getElementById(fieldId + '-counter');
  if (!field || !counter) return;

  const currentLen = field.value.length;
  counter.textContent = currentLen + '/' + maxChars + ' ký tự';

  counter.classList.remove('char-counter--warning', 'char-counter--danger');

  const percent = (currentLen / maxChars) * 100;
  if (percent >= 100) {
    counter.classList.add('char-counter--danger');
  } else if (percent >= 90) {
    counter.classList.add('char-counter--warning');
  }
}

function refreshCharCounters() {
  const bioField = document.getElementById('bio');
  const conflictField = document.getElementById('conflictNote');
  if (bioField) updateCharCount('bio', 2000);
  if (conflictField) updateCharCount('conflictNote', 1000);
}
