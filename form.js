/* ============================================
   FORM LOGIC - GIA PHẢ NAM VIỆT (v3.4.3)
   - 2 tầng: Xem + Sửa
   - Nút "Đến Phả đồ"
   - B3: Upload avatar lên Supabase Storage
   - v3.1: Nút XOÁ xoá sạch
   - v3.2: Chặn trùng khi thêm mới
   - v3.3: Phase A — viết hoa + đậm gạch chân
   - v3.4.3: Fix refresh sau xoá/lưu (dùng loadAllData)
   ============================================ */

let currentEditingPersonId = null;
let currentViewMode = 'view';
let tempChildrenList = [];
let tempAvatarData = null;
let currentEditingAvatarPath = null;
let cropper = null;
let tempLinkedNoteIds = [];
let allNotesCache = [];
let tempOriginalPerson = null;

/* ============================================
   PHASE A — Chuẩn hoá tên: viết hoa chữ cái đầu
   ============================================ */
function capitalizeVietnameseName(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(w => w)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/* ============================================
   B3 — HELPER: Public URL → Storage path
   ============================================ */
function urlToStoragePath(publicUrl) {
  if (!publicUrl || typeof publicUrl !== 'string') return null;
  const marker = '/storage/v1/object/public/avatars/';
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return publicUrl.substring(idx + marker.length);
}

/* ============================================
   v3.4.3 — HELPER: Refresh danh sách
   Gọi loadAllData() trong app.js
   ============================================ */
async function refreshPersonList() {
  try {
    if (typeof window.loadAllData === 'function') {
      await window.loadAllData();
    } else if (typeof loadAllData === 'function') {
      await loadAllData();
    } else {
      console.warn('⚠️ Không tìm thấy loadAllData() để refresh danh sách');
    }
  } catch (err) {
    console.error('Lỗi refresh list:', err);
  }
}

/* ============================================
   HÀM HIỆN / ẨN FORM
   ============================================ */
function showModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('is-visible');
}

function hideModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('is-visible');
}

function hideAllModals() {
  document.querySelectorAll('.form-modal').forEach(m => m.classList.remove('is-visible'));
  document.body.style.overflow = '';
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' || e.keyCode === 27) hideAllModals();
});

/* ============================================
   1. MỞ / ĐÓNG FORM — 2 TẦNG
   ============================================ */
function openPersonForm(personId) {
  currentEditingPersonId = personId || null;
  tempChildrenList = [];
  tempAvatarData = null;
  currentEditingAvatarPath = null;
  tempLinkedNoteIds = [];
  tempOriginalPerson = null;

  const title = document.getElementById('formTitle');

  if (personId) {
    title.textContent = 'THÔNG TIN CÁ NHÂN';
    currentViewMode = 'view';
    showViewMode(personId);
  } else {
    title.textContent = 'THÊM CÁ NHÂN MỚI';
    currentViewMode = 'edit';
    resetForm();
    showEditMode();
    autoFillCreatedByName();
  }

  populateRelationDropdowns();
  renderSpouseRows();
  renderTempChildren();
  renderLinkedNotes();

  showModal('personFormModal');
  document.body.style.overflow = 'hidden';
}

function closePersonForm() {
  const msg = currentViewMode === 'edit'
    ? 'Bạn có chắc muốn hủy? Mọi thay đổi chưa lưu sẽ mất.'
    : 'Đóng hồ sơ này?';
  if (!confirm(msg)) return;

  hideModal('personFormModal');
  document.body.style.overflow = '';
  currentEditingPersonId = null;
  tempChildrenList = [];
  tempAvatarData = null;
  currentEditingAvatarPath = null;
  tempLinkedNoteIds = [];
  tempOriginalPerson = null;
  currentViewMode = 'view';
}

/* ============================================
   2. TẦNG 1: XEM THÔNG TIN
   ============================================ */
async function showViewMode(personId) {
  currentViewMode = 'view';

  document.getElementById('personViewBody').style.display = 'block';
  document.getElementById('personEditBody').style.display = 'none';
  document.getElementById('formTitle').textContent = 'THÔNG TIN CÁ NHÂN';

  renderViewFooter();

  if (!window.sbClient) {
    document.getElementById('personViewContent').innerHTML =
      '<p class="person-view__empty">Chưa kết nối được database.</p>';
    return;
  }

  try {
    const { data: person, error } = await window.sbClient
      .from('persons').select('*').eq('id', personId).maybeSingle();

    if (error) throw error;
    if (!person) {
      // v3.4.3 — Người này không còn tồn tại (đã bị xoá)
      document.getElementById('personViewContent').innerHTML =
        '<p class="person-view__empty">⚠️ Người này không còn tồn tại.<br>Có thể đã bị xoá. Danh sách sẽ được làm mới.</p>';
      // Đóng form sau 1.5s + refresh list
      setTimeout(async () => {
        hideModal('personFormModal');
        document.body.style.overflow = '';
        currentEditingPersonId = null;
        currentViewMode = 'view';
        await refreshPersonList();
      }, 1500);
      return;
    }

    tempOriginalPerson = person;

    const { data: marriages } = await window.sbClient
      .from('marriages').select('*')
      .or('husband_id.eq.' + personId + ',wife_id.eq.' + personId);

    const spouseNames = [];
    if (marriages && marriages.length > 0) {
      for (const m of marriages) {
        const sId = m.husband_id === personId ? m.wife_id : m.husband_id;
        const { data: spouse } = await window.sbClient
          .from('persons').select('full_name, generation').eq('id', sId).maybeSingle();
        if (spouse) spouseNames.push(spouse.full_name + ' (Đời ' + spouse.generation + ')');
      }
    }

    const { data: parents } = await window.sbClient
      .from('parent_child').select('parent_id, parent_role').eq('child_id', personId);

    let fatherName = '', motherName = '';
    if (parents && parents.length > 0) {
      for (const p of parents) {
        const { data: par } = await window.sbClient
          .from('persons').select('full_name, generation').eq('id', p.parent_id).maybeSingle();
        if (par) {
          if (p.parent_role === 'Bố') fatherName = par.full_name + ' (Đời ' + par.generation + ')';
          else if (p.parent_role === 'Mẹ') motherName = par.full_name + ' (Đời ' + par.generation + ')';
        }
      }
    }

    renderPersonView(person, spouseNames, fatherName, motherName);

  } catch (err) {
    console.error('Lỗi load view:', err);
    document.getElementById('personViewContent').innerHTML =
      '<p class="person-view__empty">❌ Không tải được thông tin: ' + err.message + '</p>';
  }
}

function renderPersonView(person, spouseNames, fatherName, motherName) {
  const container = document.getElementById('personViewContent');

  const yearsParts = [];
  if (person.birth_year) yearsParts.push(person.birth_year);
  if (person.death_year) yearsParts.push(person.death_year);
  const yearsStr = yearsParts.length === 2
    ? yearsParts[0] + ' - ' + yearsParts[1]
    : (yearsParts[0] ? yearsParts[0] : '');

  let avatarHtml;
  if (person.avatar_url) {
    avatarHtml = '<img src="' + person.avatar_url + '" alt="Avatar">';
  } else {
    avatarHtml = '<span class="person-view__avatar-placeholder">📷</span>';
  }

  const hasFullDates = person.birth_year && person.death_year;
  const nameClass = hasFullDates
    ? 'person-view__name person-view__name--full-dates'
    : 'person-view__name';

  function field(label, value) {
    const val = value ? String(value) : '';
    const isEmpty = !val || val === 'null' || val === 'undefined';
    return '<div class="person-view__field">' +
      '<div class="person-view__field-label">' + label + '</div>' +
      '<div class="person-view__field-value' + (isEmpty ? ' person-view__field-value--empty' : '') + '">' +
        (isEmpty ? '(chưa có thông tin)' : val) +
      '</div>' +
    '</div>';
  }

  const html =
    '<div class="person-view__avatar">' + avatarHtml + '</div>' +
    '<div class="' + nameClass + '">' + (person.full_name || '(chưa có tên)') + '</div>' +
    (yearsStr ? '<div class="person-view__years">' + yearsStr + '</div>' : '') +

    '<div class="person-view__section">' +
      '<div class="person-view__section-title">THÔNG TIN CƠ BẢN</div>' +
      field('Vai trò', person.role_type || person.role) +
      field('Giới tính', person.gender) +
      field('Đời thứ', person.generation ? 'Đời ' + person.generation : '') +
      field('Chi nhánh', person.branch) +
      field('Thứ tự sinh', person.sibling_order) +
      field('Nơi sinh', person.birth_place) +
      field('Hoàn cảnh đặc biệt', person.special_status && person.special_status !== 'Bình thường' ? person.special_status : '') +
    '</div>' +

    '<div class="person-view__section">' +
      '<div class="person-view__section-title">QUAN HỆ GIA ĐÌNH</div>' +
      field('Bố', fatherName) +
      field('Mẹ', motherName) +
      field('Vợ/Chồng', spouseNames.length > 0 ? spouseNames.join(', ') : '') +
    '</div>' +

    '<div class="person-view__section">' +
      '<div class="person-view__section-title">CON CÁI</div>' +
      '<div class="person-view__children-note">' +
        'danh sách tên con cái tự động cập khi có khai báo nhận cha mẹ ở đời sau' +
      '</div>' +
    '</div>' +

    (person.occupation ?
      '<div class="person-view__section">' +
        '<div class="person-view__section-title">THÔNG TIN CÁ NHÂN</div>' +
        field('Nghề nghiệp / Chuyên môn', person.occupation) +
      '</div>' : '') +

    (person.bio ?
      '<div class="person-view__section">' +
        '<div class="person-view__section-title">TIỂU SỬ</div>' +
        '<div class="person-view__field">' +
          '<div class="person-view__field-value" style="font-style: italic;">' + person.bio + '</div>' +
        '</div>' +
      '</div>' : '') +

    '<div class="person-view__section">' +
      '<div class="person-view__section-title">BÀI VIẾT LIÊN QUAN Ở NGOẠI PHẢ</div>' +
      '<div class="person-view__children-note">Bấm nút "Sửa" để thêm liên kết bài viết.</div>' +
    '</div>' +

    (person.created_by_name ?
      '<div class="person-view__section">' +
        '<div class="person-view__section-title">NGƯỜI ĐĂNG THÔNG TIN</div>' +
        field('Tên người đăng', person.created_by_name) +
      '</div>' : '');

  container.innerHTML = html;
}

function renderViewFooter() {
  const footer = document.getElementById('personFormFooter');
  const deleteBtn = currentEditingPersonId
    ? '<button type="button" class="btn btn--danger" onclick="deletePerson()">🗑️ XOÁ</button>'
    : '';

  footer.innerHTML =
    '<div class="form-modal__footer-left">' +
      '<button type="button" class="btn btn--ghost" onclick="closePersonForm()">TRỞ VỀ</button>' +
      deleteBtn +
    '</div>' +
    '<div class="form-modal__footer-right">' +
      '<button type="button" class="btn btn--ghost" onclick="goToPhaDo()">ĐẾN PHẢ ĐỒ</button>' +
      '<button type="button" class="btn btn--primary" onclick="switchToEditMode()">✏️ SỬA</button>' +
    '</div>';
}

function switchToEditMode() {
  if (!currentEditingPersonId) return;
  currentViewMode = 'edit';

  document.getElementById('personViewBody').style.display = 'none';
  document.getElementById('personEditBody').style.display = 'block';
  document.getElementById('formTitle').textContent = 'SỬA THÔNG TIN CÁ NHÂN';

  renderEditFooter();
  loadPersonForEdit(currentEditingPersonId);
}

/* ============================================
   3. TẦNG 2: SỬA THÔNG TIN
   ============================================ */
function showEditMode() {
  document.getElementById('personViewBody').style.display = 'none';
  document.getElementById('personEditBody').style.display = 'block';
  renderEditFooter();
}

function renderEditFooter() {
  const footer = document.getElementById('personFormFooter');

  footer.innerHTML =
    '<div class="form-modal__footer-left">' +
      '<button type="button" class="btn btn--ghost" onclick="cancelEdit()">❌ HỦY</button>' +
    '</div>' +
    '<div class="form-modal__footer-right">' +
      '<button type="button" class="btn btn--primary" onclick="savePerson()">💾 LƯU</button>' +
    '</div>';
}

/* ============================================
   4. NÚT "ĐẾN PHẢ ĐỒ"
   ============================================ */
function goToPhaDo() {
  const tab = document.querySelector('.tab[data-tab="pha-do"]');
  if (tab) tab.click();

  hideModal('personFormModal');
  document.body.style.overflow = '';
  currentEditingPersonId = null;
  currentViewMode = 'view';

  setTimeout(() => {
    alert('📊 PHẢ ĐỒ ĐANG ĐƯỢC XÂY DỰNG\n\nSẽ hiển thị cây gia phả dạng đồ thị với các đường nối cha-con.\n\nVui lòng quay lại sau!');
  }, 300);
}

/* ============================================
   5. RESET FORM
   ============================================ */
function resetForm() {
  const ids = ['fullName', 'gender', 'branch', 'siblingOrder', 'birthYear',
               'deathYear', 'birthPlace', 'specialStatus', 'occupation',
               'conflictNote', 'bio', 'fatherId', 'motherId',
               'roleType', 'generation', 'createdByName'];

  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (el.tagName === 'SELECT') el.selectedIndex = 0;
      else el.value = '';
    }
  });

  const av = document.getElementById('avatarPreview');
  if (av) av.innerHTML = '<span class="avatar-preview__placeholder">📷</span>';

  const cl = document.getElementById('contactList');
  if (cl) cl.innerHTML = '';

  const sr = document.getElementById('spouseRows');
  if (sr) sr.innerHTML = '';

  renderTempChildren();
  renderLinkedNotes();
}

async function autoFillCreatedByName() {
  if (!window.currentUser || !window.sbClient) return;
  try {
    const { data: profile } = await window.sbClient
      .from('profiles').select('display_name')
      .eq('id', window.currentUser.id).maybeSingle();

    const nameInput = document.getElementById('createdByName');
    if (nameInput && profile && profile.display_name) {
      nameInput.value = profile.display_name;
    } else if (nameInput && window.currentUser.email) {
      nameInput.value = window.currentUser.email;
    }
  } catch (err) { console.error(err); }
}

/* ============================================
   6. CROP ẢNH + B3 UPLOAD LÊN STORAGE
   ============================================ */
function openCropModal(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    alert('⚠️ Vui lòng chọn file ảnh');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = document.getElementById('cropImage');
    if (!img) return;
    img.src = e.target.result;
    showModal('cropModal');

    img.onload = () => {
      if (cropper) cropper.destroy();
      if (typeof Cropper !== 'undefined') {
        cropper = new Cropper(img, {
          aspectRatio: 3/4, viewMode: 1, autoCropArea: 0.85,
          responsive: true, background: false, dragMode: 'move'
        });
      }
    };
  };
  reader.readAsDataURL(file);
}

function closeCropModal() { hideModal('cropModal'); }
function rotateCropImage(d) { if (cropper) cropper.rotate(d); }
function flipCropImage(dir) { if (cropper) dir === 'h' ? cropper.scaleX(-1) : cropper.scaleY(-1); }
function resetCropImage() { if (cropper) cropper.reset(); }

async function confirmCrop() {
  if (!cropper) return;

  const btn = document.querySelector('#cropModal .btn--primary');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang tải lên...'; }

  try {
    const canvas = cropper.getCroppedCanvas({
      width: 600,
      height: 800,
      imageSmoothingQuality: 'high'
    });

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.85)
    );
    if (!blob) throw new Error('Không tạo được file ảnh');

    let userId = window.currentUser ? window.currentUser.id : null;
    if (!userId) {
      const { data: { user } } = await window.sbClient.auth.getUser();
      userId = user ? user.id : null;
    }
    if (!userId) throw new Error('Bạn cần đăng nhập để upload ảnh');

    const timestamp = Date.now();
    const filePath = userId + '/' + timestamp + '.webp';

    const { error: upErr } = await window.sbClient
      .storage
      .from('avatars')
      .upload(filePath, blob, {
        contentType: 'image/webp',
        cacheControl: '31536000',
        upsert: false
      });
    if (upErr) throw upErr;

    const { data: urlData } = window.sbClient
      .storage
      .from('avatars')
      .getPublicUrl(filePath);
    const publicUrl = urlData.publicUrl;

    const oldPath = currentEditingAvatarPath;
    if (oldPath && oldPath !== filePath) {
      window.sbClient.storage.from('avatars').remove([oldPath])
        .then(({ error }) => { if (error) console.warn('Không xoá được ảnh cũ:', error); })
        .catch(err => console.warn('Xoá ảnh cũ lỗi:', err));
    }

    tempAvatarData = publicUrl;
    currentEditingAvatarPath = filePath;

    const av = document.getElementById('avatarPreview');
    if (av) av.innerHTML = '<img src="' + publicUrl + '" alt="Avatar">';

    console.log('✅ Avatar uploaded:', publicUrl);
    closeCropModal();

  } catch (err) {
    console.error('confirmCrop error:', err);
    alert('❌ Upload ảnh thất bại:\n\n' + err.message +
          '\n\nKiểm tra:\n- Đã đăng nhập chưa?\n- Bucket `avatars` đã public & có policy INSERT cho authenticated chưa?');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'CẮT ẢNH'; }
  }
}

/* ============================================
   7. POPULATE DROPDOWNS
   ============================================ */
function populateRelationDropdowns() {
  const persons = window.allPersons || [];
  const f = document.getElementById('fatherId');
  const m = document.getElementById('motherId');
  if (!f || !m) return;

  f.innerHTML = '<option value="">-- Chọn bố --</option>' +
    persons.filter(p => p.gender === 'Nam' && p.id !== currentEditingPersonId && !p.is_deleted)
      .map(p => '<option value="' + p.id + '">' + p.full_name + ' (Đời ' + p.generation + ')</option>').join('');

  m.innerHTML = '<option value="">-- Chọn mẹ --</option>' +
    persons.filter(p => p.gender === 'Nữ' && p.id !== currentEditingPersonId && !p.is_deleted)
      .map(p => '<option value="' + p.id + '">' + p.full_name + ' (Đời ' + p.generation + ')</option>').join('');
}

/* ============================================
   8. VỢ/CHỒNG
   ============================================ */
let spouseRowCounter = 0;

function addSpouseRow() {
  spouseRowCounter++;
  const container = document.getElementById('spouseRows');
  if (!container) return;
  const rowId = 'spouse_row_' + spouseRowCounter;

  const row = document.createElement('div');
  row.className = 'spouse-row';
  row.id = rowId;
  row.innerHTML =
    '<span class="spouse-row__label">Vợ/Chồng ' + spouseRowCounter + ':</span>' +
    '<select class="spouse-select"><option value="">-- Chọn vợ/chồng --</option></select>' +
    '<button type="button" class="spouse-row__remove" onclick="removeSpouseRow(\'' + rowId + '\')">×</button>';

  container.appendChild(row);
  populateSpouseSelect(row.querySelector('.spouse-select'));
}

function removeSpouseRow(rowId) {
  const row = document.getElementById(rowId);
  if (row) row.remove();
  document.querySelectorAll('#spouseRows .spouse-row').forEach((r, idx) => {
    r.querySelector('.spouse-row__label').textContent = 'Vợ/Chồng ' + (idx + 1) + ':';
  });
}

function populateSpouseSelect(select) {
  const persons = window.allPersons || [];
  select.innerHTML = '<option value="">-- Chọn vợ/chồng --</option>' +
    persons.filter(p => p.id !== currentEditingPersonId && !p.is_deleted)
      .map(p => '<option value="' + p.id + '">' + p.full_name + ' (Đời ' + p.generation + ')</option>').join('');
}

function renderSpouseRows() {
  const c = document.getElementById('spouseRows');
  if (!c) return;
  c.innerHTML = '';
  spouseRowCounter = 0;
  addSpouseRow();
}

function getSpouseRowsData() {
  const rows = document.querySelectorAll('#spouseRows .spouse-row');
  const result = [];
  rows.forEach((row, idx) => {
    const sel = row.querySelector('.spouse-select');
    if (sel && sel.value) result.push({ personId: sel.value, order: idx + 1 });
  });
  return result;
}

/* ============================================
   9. THÊM CON
   ============================================ */
function openAddChildModal() {
  showModal('addChildModal');
  ['childName', 'childBirthYear', 'childOrder'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

function closeAddChildModal() { hideModal('addChildModal'); }

function confirmAddChild() {
  const nameRaw = document.getElementById('childName').value.trim();
  if (!nameRaw) { alert('⚠️ Vui lòng nhập họ tên con'); return; }
  const name = capitalizeVietnameseName(nameRaw);

  tempChildrenList.push({
    temp_id: 'temp_' + Date.now(),
    full_name: name,
    gender: document.getElementById('childGender').value,
    birth_year: parseInt(document.getElementById('childBirthYear').value) || null,
    sibling_order: parseInt(document.getElementById('childOrder').value) || null,
    child_type: document.getElementById('childType').value
  });

  renderTempChildren();
  closeAddChildModal();
}

function renderTempChildren() {
  const list = document.getElementById('childrenList');
  if (!list) return;

  if (tempChildrenList.length === 0) {
    list.innerHTML = '<p class="empty-hint">Chưa có con nào. Bấm "+ Thêm con" để thêm.</p>';
    return;
  }

  list.innerHTML = tempChildrenList.map((child, idx) =>
    '<div class="child-item">' +
      '<div class="child-item__info">' +
        '<div class="child-item__name">' + (idx + 1) + '. ' + child.full_name + '</div>' +
        '<div class="child-item__meta">' + child.gender + (child.birth_year ? ' • ' + child.birth_year : '') + '</div>' +
      '</div>' +
      '<div class="child-item__type">' + child.child_type + '</div>' +
      '<div class="child-item__actions">' +
        '<button type="button" class="child-item__btn" onclick="removeTempChild(\'' + child.temp_id + '\')">🗑️</button>' +
      '</div>' +
    '</div>'
  ).join('');
}

function removeTempChild(tempId) {
  if (!confirm('Xóa con này?')) return;
  tempChildrenList = tempChildrenList.filter(c => c.temp_id !== tempId);
  renderTempChildren();
}

/* ============================================
   10. GÁN NHANH
   ============================================ */
function openQuickAddModal() {
  showModal('quickAddModal');
  const t = document.getElementById('quickAddText');
  if (t) t.value = '';
}

function closeQuickAddModal() { hideModal('quickAddModal'); }

function confirmQuickAdd() {
  const text = document.getElementById('quickAddText').value.trim();
  if (!text) { alert('⚠️ Vui lòng paste danh sách tên'); return; }

  const lines = text.split('\n').filter(l => l.trim());
  let ok = 0, skip = 0;

  lines.forEach(line => {
    let name = line.trim();
    if (name.includes('|')) name = name.split('|')[0].trim();
    if (!name) { skip++; return; }
    name = capitalizeVietnameseName(name);

    if (tempChildrenList.some(c => c.full_name.toLowerCase() === name.toLowerCase())) {
      skip++; return;
    }

    const gender = (name.includes('Thị') || name.includes('thị')) ? 'Nữ' : 'Nam';
    tempChildrenList.push({
      temp_id: 'temp_' + Date.now() + '_' + Math.random(),
      full_name: name, gender: gender, birth_year: null,
      sibling_order: tempChildrenList.length + 1,
      child_type: 'Con chung'
    });
    ok++;
  });

  renderTempChildren();
  closeQuickAddModal();

  let msg = '✅ Đã thêm ' + ok + ' con';
  if (skip > 0) msg += '\n⚠️ Bỏ qua ' + skip + ' dòng';
  alert(msg);
}

/* ============================================
   11. LIÊN KẾT BÀI VIẾT
   ============================================ */
async function loadNotesCache() {
  if (!window.sbClient) return;
  try {
    const { data, error } = await window.sbClient.from('notes').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    allNotesCache = data || [];
  } catch (err) { allNotesCache = []; }
}

function renderLinkedNotes() {
  const list = document.getElementById('linkedNotesList');
  if (!list) return;

  if (tempLinkedNoteIds.length === 0) {
    list.innerHTML = '<p class="empty-hint">Chưa có bài viết liên kết.</p>';
    return;
  }

  const linked = allNotesCache.filter(n => tempLinkedNoteIds.includes(n.id));
  if (linked.length === 0) {
    list.innerHTML = '<p class="empty-hint">Đang tải...</p>';
    return;
  }

  list.innerHTML = linked.map(n =>
    '<div class="linked-note-item" ondblclick="goToNote(\'' + n.id + '\')">' +
      '<span>📄</span>' +
      '<span style="flex:1;">' + (n.title || n.content.substring(0, 50)) + '</span>' +
      '<button type="button" onclick="event.stopPropagation(); removeLinkedNote(\'' + n.id + '\')">×</button>' +
    '</div>'
  ).join('');
}

function removeLinkedNote(id) {
  tempLinkedNoteIds = tempLinkedNoteIds.filter(x => x !== id);
  renderLinkedNotes();
}

function goToNote(noteId) {
  const tab = document.querySelector('.tab[data-tab="ngoai-pha"]');
  if (tab) tab.click();
  hideModal('personFormModal');
  document.body.style.overflow = '';
}

async function openLinkNoteModal() {
  await loadNotesCache();
  const list = document.getElementById('availableNotesList');
  if (!list) return;

  if (allNotesCache.length === 0) {
    list.innerHTML = '<p class="empty-hint">Chưa có bài viết nào.</p>';
    showModal('linkNoteModal');
    return;
  }

  list.innerHTML = allNotesCache.map(n => {
    const checked = tempLinkedNoteIds.includes(n.id) ? 'checked' : '';
    return '<label class="note-picker-item">' +
      '<input type="checkbox" value="' + n.id + '" ' + checked + '>' +
      '<span>' + (n.title || n.content.substring(0, 50)) + '</span>' +
    '</label>';
  }).join('');

  showModal('linkNoteModal');
}

function closeLinkNoteModal() { hideModal('linkNoteModal'); }

function confirmLinkNote() {
  const cbs = document.querySelectorAll('#availableNotesList input[type="checkbox"]:checked');
  tempLinkedNoteIds = Array.from(cbs).map(c => c.value);
  renderLinkedNotes();
  closeLinkNoteModal();
}

/* ============================================
   12. LIÊN HỆ
   ============================================ */
function addContactRow() {
  const list = document.getElementById('contactList');
  if (!list) return;
  const row = document.createElement('div');
  row.className = 'contact-row';
  row.innerHTML =
    '<input type="text" placeholder="Tên mục" class="contact-name">' +
    '<input type="text" placeholder="Nội dung" class="contact-value">' +
    '<button type="button" class="contact-row__remove" onclick="this.parentElement.remove()">×</button>';
  list.appendChild(row);
}

function getContactInfo() {
  const rows = document.querySelectorAll('#contactList .contact-row');
  const result = [];
  rows.forEach(r => {
    const n = r.querySelector('.contact-name').value.trim();
    const v = r.querySelector('.contact-value').value.trim();
    if (n && v) result.push({ name: n, value: v });
  });
  return result.length > 0 ? result : null;
}

/* ============================================
   13. LOAD PERSON VÀO FORM SỬA (TẦNG 2)
   ============================================ */
async function loadPersonForEdit(personId) {
  if (!window.sbClient) {
    alert('⚠️ Chưa kết nối được database');
    return;
  }

  try {
    const { data: person, error } = await window.sbClient
      .from('persons').select('*').eq('id', personId).maybeSingle();
    if (error) throw error;
    if (!person) throw new Error('Người này không còn tồn tại');

    tempOriginalPerson = person;

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val || '';
    };

    setVal('fullName', person.full_name);
    setVal('gender', person.gender);
    setVal('branch', person.branch);
    setVal('siblingOrder', person.sibling_order);
    setVal('birthYear', person.birth_year);
    setVal('deathYear', person.death_year);
    setVal('birthPlace', person.birth_place);
    setVal('specialStatus', person.special_status);
    setVal('occupation', person.occupation);
    setVal('conflictNote', person.conflict_note);
    setVal('bio', person.bio);
    setVal('roleType', person.role_type || person.role);
    setVal('generation', person.generation);
    setVal('createdByName', person.created_by_name);

    tempAvatarData = person.avatar_url || null;
    currentEditingAvatarPath = urlToStoragePath(person.avatar_url);
    const av = document.getElementById('avatarPreview');
    if (av) {
      if (person.avatar_url) {
        av.innerHTML = '<img src="' + person.avatar_url + '" alt="Avatar">';
      } else {
        av.innerHTML = '<span class="avatar-preview__placeholder">📷</span>';
      }
    }

    const { data: parents } = await window.sbClient
      .from('parent_child').select('parent_id, parent_role')
      .eq('child_id', personId);

    const fatherSel = document.getElementById('fatherId');
    const motherSel = document.getElementById('motherId');
    if (fatherSel) fatherSel.value = '';
    if (motherSel) motherSel.value = '';

    if (parents && parents.length > 0) {
      parents.forEach(p => {
        if (p.parent_role === 'Bố' && fatherSel) fatherSel.value = p.parent_id;
        else if (p.parent_role === 'Mẹ' && motherSel) motherSel.value = p.parent_id;
      });
    }

    const { data: marriages } = await window.sbClient
      .from('marriages').select('*')
      .or('husband_id.eq.' + personId + ',wife_id.eq.' + personId);

    const spouseContainer = document.getElementById('spouseRows');
    if (spouseContainer) {
      spouseContainer.innerHTML = '';
      spouseRowCounter = 0;
    }

    if (marriages && marriages.length > 0) {
      for (const m of marriages) {
        const sId = m.husband_id === personId ? m.wife_id : m.husband_id;
        addSpouseRow();
        const rows = document.querySelectorAll('#spouseRows .spouse-row');
        const lastRow = rows[rows.length - 1];
        if (lastRow) {
          const sel = lastRow.querySelector('.spouse-select');
          if (sel) sel.value = sId;
        }
      }
    } else {
      addSpouseRow();
    }

    const { data: links } = await window.sbClient
      .from('person_notes').select('note_id').eq('person_id', personId);

    tempLinkedNoteIds = links ? links.map(l => l.note_id) : [];
    await loadNotesCache();
    renderLinkedNotes();

    const contactList = document.getElementById('contactList');
    if (contactList) contactList.innerHTML = '';

    if (person.contact_info) {
      let contacts = person.contact_info;
      if (typeof contacts === 'string') {
        try { contacts = JSON.parse(contacts); } catch (e) { contacts = null; }
      }
      if (Array.isArray(contacts)) {
        contacts.forEach(c => {
          addContactRow();
          const rows = document.querySelectorAll('#contactList .contact-row');
          const lastRow = rows[rows.length - 1];
          if (lastRow) {
            lastRow.querySelector('.contact-name').value = c.name || '';
            lastRow.querySelector('.contact-value').value = c.value || '';
          }
        });
      }
    }

    tempChildrenList = [];
    renderTempChildren();

    if (typeof refreshCharCounters === 'function') {
      refreshCharCounters();
    }

  } catch (err) {
    console.error('Lỗi load person for edit:', err);
    alert('❌ Không tải được thông tin: ' + err.message);
  }
}

/* ============================================
   14. LƯU THÔNG TIN (SAVE PERSON) — v3.4.3
   ============================================ */
async function savePerson() {
  if (!window.sbClient) {
    alert('⚠️ Chưa kết nối được database');
    return;
  }

  const fullNameRaw = document.getElementById('fullName').value.trim();
  if (!fullNameRaw) {
    alert('⚠️ Vui lòng nhập họ tên');
    return;
  }
  const fullName = capitalizeVietnameseName(fullNameRaw);

  const confirmMsg = currentEditingPersonId
    ? '💾 Lưu thay đổi cho "' + fullName + '"?'
    : '➕ Thêm cá nhân mới "' + fullName + '"?';
  if (!confirm(confirmMsg)) return;

  const saveBtns = document.querySelectorAll('.btn--primary');
  saveBtns.forEach(b => { b.disabled = true; b.textContent = '⏳ Đang lưu...'; });

  try {
    const personData = {
      full_name: fullName,
      gender: document.getElementById('gender').value || null,
      branch: document.getElementById('branch').value || null,
      sibling_order: parseInt(document.getElementById('siblingOrder').value) || null,
      birth_year: parseInt(document.getElementById('birthYear').value) || null,
      death_year: parseInt(document.getElementById('deathYear').value) || null,
      birth_place: document.getElementById('birthPlace').value.trim() || null,
      special_status: document.getElementById('specialStatus').value || 'Bình thường',
      occupation: document.getElementById('occupation').value.trim() || null,
      conflict_note: document.getElementById('conflictNote').value.trim() || null,
      bio: document.getElementById('bio').value.trim() || null,
      role_type: document.getElementById('roleType').value || null,
      generation: parseInt(document.getElementById('generation').value) || null,
      created_by_name: capitalizeVietnameseName(
        document.getElementById('createdByName').value.trim()
      ) || null,
      contact_info: getContactInfo()
    };

    // Kiểm tra trùng khi thêm mới
    if (!currentEditingPersonId) {
      try {
        let query = window.sbClient
          .from('persons')
          .select('id, full_name, birth_year, generation')
          .eq('full_name', fullName);

        if (personData.birth_year) {
          query = query.eq('birth_year', personData.birth_year);
        }

        const { data: duplicates } = await query;

        if (duplicates && duplicates.length > 0) {
          const dup = duplicates[0];
          const msg =
            '⚠️ ĐÃ CÓ NGƯỜI TRÙNG:\n\n' +
            '• Họ tên: ' + dup.full_name + '\n' +
            '• Năm sinh: ' + (dup.birth_year || '(không rõ)') + '\n' +
            '• Đời: ' + (dup.generation || '?') + '\n\n' +
            'Vẫn muốn thêm "' + fullName + '" làm người MỚI không?';

          if (!confirm(msg)) {
            saveBtns.forEach(b => { b.disabled = false; b.textContent = '💾 LƯU'; });
            return;
          }
        }
      } catch (checkErr) {
        console.warn('Check trùng lỗi (bỏ qua):', checkErr);
      }
    }

    if (tempAvatarData) personData.avatar_url = tempAvatarData;

    let personId = currentEditingPersonId;

    if (currentEditingPersonId) {
      const { error } = await window.sbClient
        .from('persons').update(personData).eq('id', currentEditingPersonId);
      if (error) throw error;
    } else {
      personData.created_by = window.currentUser ? window.currentUser.id : null;
      const { data: inserted, error } = await window.sbClient
        .from('persons').insert(personData).select('id').single();
      if (error) throw error;
      personId = inserted.id;
      currentEditingPersonId = personId;
    }

    const fatherId = document.getElementById('fatherId').value;
    const motherId = document.getElementById('motherId').value;

    await window.sbClient.from('parent_child').delete().eq('child_id', personId);

    if (fatherId) await createParentChildLink(fatherId, personId, 'Bố');
    if (motherId) await createParentChildLink(motherId, personId, 'Mẹ');

    const spouses = getSpouseRowsData();

    await window.sbClient.from('marriages').delete()
      .or('husband_id.eq.' + personId + ',wife_id.eq.' + personId);

    const personGender = document.getElementById('gender').value;
    for (const sp of spouses) {
      await createMarriageLink(personId, sp.personId, personGender, sp.order);
    }

    await window.sbClient.from('person_notes').delete().eq('person_id', personId);
    if (tempLinkedNoteIds.length > 0) {
      const noteLinks = tempLinkedNoteIds.map(nid => ({
        person_id: personId, note_id: nid
      }));
      await window.sbClient.from('person_notes').insert(noteLinks);
    }

    for (const child of tempChildrenList) {
      await createChildWithAutoCreate(child, personId, personGender);
    }

    // v3.4.3 — Refresh danh sách bằng loadAllData()
    await refreshPersonList();

    alert('✅ Đã lưu thành công!\n\n' + fullName);

    if (currentViewMode === 'edit' && currentEditingPersonId) {
      await showViewMode(currentEditingPersonId);
    } else {
      hideModal('personFormModal');
      document.body.style.overflow = '';
      currentEditingPersonId = null;
      currentViewMode = 'view';
    }

  } catch (err) {
    console.error('Lỗi save:', err);
    alert('❌ Lỗi khi lưu:\n\n' + err.message);
  } finally {
    document.querySelectorAll('.btn--primary').forEach(b => {
      b.disabled = false;
    });
    const footer = document.getElementById('personFormFooter');
    if (footer) {
      const saveBtn = footer.querySelector('.btn--primary');
      if (saveBtn && saveBtn.textContent.includes('Đang lưu')) {
        saveBtn.textContent = '💾 LƯU';
      }
    }
  }
}

/* ============================================
   15. XÓA NGƯỜI — v3.4.3
   - Lấy tên thật từ DB nếu cache null
   - Xoá liên kết + person
   - Refresh danh sách bằng loadAllData()
   ============================================ */
async function deletePerson() {
  if (!currentEditingPersonId) {
    alert('⚠️ Chưa chọn người để xóa');
    return;
  }
  if (!window.sbClient) {
    alert('⚠️ Chưa kết nối được database');
    return;
  }

  const personId = currentEditingPersonId;

  // v3.4.3 — Lấy tên thật từ DB nếu tempOriginalPerson null
  let name = tempOriginalPerson ? tempOriginalPerson.full_name : null;
  let avatarUrl = tempOriginalPerson ? tempOriginalPerson.avatar_url : null;

  if (!name) {
    try {
      const { data: p } = await window.sbClient
        .from('persons').select('full_name, avatar_url').eq('id', personId).maybeSingle();
      if (p) {
        name = p.full_name;
        avatarUrl = p.avatar_url;
      }
    } catch (err) {
      console.warn('Không lấy được tên:', err);
    }
  }
  if (!name) name = 'người này';

  const ok = confirm(
    '🗑️ XOÁ VĨNH VIỄN: "' + name + '"\n\n' +
    'Sẽ xoá:\n' +
    '• Hồ sơ cá nhân\n' +
    '• Tất cả liên kết cha-mẹ-con\n' +
    '• Tất cả liên kết vợ-chồng\n' +
    '• Tất cả liên kết bài viết\n' +
    '• Ảnh đại diện\n\n' +
    'Không thể hoàn tác. Tiếp tục?'
  );
  if (!ok) return;

  try {
    const avatarPath = urlToStoragePath(avatarUrl);

    await window.sbClient.from('parent_child').delete()
      .or('parent_id.eq.' + personId + ',child_id.eq.' + personId);

    await window.sbClient.from('marriages').delete()
      .or('husband_id.eq.' + personId + ',wife_id.eq.' + personId);

    await window.sbClient.from('person_notes').delete()
      .eq('person_id', personId);

    const { error } = await window.sbClient
      .from('persons').delete().eq('id', personId);
    if (error) throw error;

    if (avatarPath) {
      window.sbClient.storage.from('avatars').remove([avatarPath])
        .then(({ error }) => { if (error) console.warn('Avatar xoá lỗi:', error); })
        .catch(err => console.warn(err));
    }

    // v3.4.3 — Refresh danh sách ngay lập tức
    await refreshPersonList();

    alert('✅ Đã xoá "' + name + '"');

    hideModal('personFormModal');
    document.body.style.overflow = '';
    currentEditingPersonId = null;
    currentViewMode = 'view';

  } catch (err) {
    console.error('Lỗi xóa:', err);
    alert('❌ Lỗi khi xóa:\n\n' + err.message);
  }
}

/* ============================================
   16. TẠO LIÊN KẾT CHA-MẸ ↔ CON
   ============================================ */
async function createParentChildLink(parentId, childId, role) {
  if (!window.sbClient || !parentId || !childId) return;

  try {
    const { data: existing } = await window.sbClient
      .from('parent_child').select('id')
      .eq('parent_id', parentId).eq('child_id', childId).maybeSingle();

    if (existing) return;

    const { error } = await window.sbClient
      .from('parent_child')
      .insert({ parent_id: parentId, child_id: childId, parent_role: role });

    if (error && error.code !== '23505') throw error;

  } catch (err) {
    console.error('Lỗi createParentChildLink:', err);
  }
}

/* ============================================
   17. TẠO LIÊN KẾT HÔN NHÂN
   ============================================ */
async function createMarriageLink(personId, spouseId, personGender, order) {
  if (!window.sbClient || !personId || !spouseId) return;
  if (personId === spouseId) return;

  try {
    let husbandId, wifeId;
    if (personGender === 'Nam') {
      husbandId = personId; wifeId = spouseId;
    } else if (personGender === 'Nữ') {
      husbandId = spouseId; wifeId = personId;
    } else {
      husbandId = personId; wifeId = spouseId;
    }

    const { data: existing } = await window.sbClient
      .from('marriages').select('id')
      .or('and(husband_id.eq.' + husbandId + ',wife_id.eq.' + wifeId + '),' +
          'and(husband_id.eq.' + wifeId + ',wife_id.eq.' + husbandId + ')')
      .maybeSingle();

    if (existing) return;

    const { error } = await window.sbClient
      .from('marriages')
      .insert({ husband_id: husbandId, wife_id: wifeId, marriage_order: order || 1 });

    if (error && error.code !== '23505') throw error;

  } catch (err) {
    console.error('Lỗi createMarriageLink:', err);
  }
}

/* ============================================
   18. TẠO CON + TỰ ĐỘNG TẠO HỒ SƠ ĐỜI SAU
   ============================================ */
async function createChildWithAutoCreate(child, parentId, parentGender) {
  if (!window.sbClient || !child || !parentId) return;

  try {
    const parent = tempOriginalPerson;
    const parentGen = parent && parent.generation ? parent.generation : null;
    const childGen = parentGen ? parentGen + 1 : null;

    let childBranch = null;
    if (parentGender === 'Nam' && parent) {
      childBranch = parent.branch || null;
    } else if (parent) {
      const { data: marriages } = await window.sbClient
        .from('marriages').select('husband_id')
        .eq('wife_id', parentId).maybeSingle();
      if (marriages) {
        const { data: husband } = await window.sbClient
          .from('persons').select('branch').eq('id', marriages.husband_id).maybeSingle();
        if (husband) childBranch = husband.branch;
      }
    }

    const childData = {
      full_name: capitalizeVietnameseName(child.full_name),
      gender: child.gender,
      birth_year: child.birth_year,
      sibling_order: child.sibling_order,
      generation: childGen,
      branch: childBranch,
      special_status: 'Bình thường',
      created_by: window.currentUser ? window.currentUser.id : null,
      created_by_name: capitalizeVietnameseName(
        document.getElementById('createdByName')
          ? document.getElementById('createdByName').value.trim() : ''
      ) || null
    };

    const { data: inserted, error } = await window.sbClient
      .from('persons').insert(childData).select('id').single();
    if (error) throw error;

    const childId = inserted.id;

    if (parentGender === 'Nam') {
      await createParentChildLink(parentId, childId, 'Bố');
    } else if (parentGender === 'Nữ') {
      await createParentChildLink(parentId, childId, 'Mẹ');
    } else {
      await createParentChildLink(parentId, childId, 'Bố');
    }

    const spouses = getSpouseRowsData();
    if (spouses.length > 0 && child.child_type === 'Con chung') {
      const spouseId = spouses[0].personId;
      const otherRole = parentGender === 'Nam' ? 'Mẹ' : 'Bố';
      await createParentChildLink(spouseId, childId, otherRole);
    }

  } catch (err) {
    console.error('Lỗi createChildWithAutoCreate:', err);
    throw err;
  }
}

/* ============================================
   KẾT THÚC
   ============================================ */

console.log('📝 Form.js v3.4.3 — Fix refresh sau khi xoá/lưu');
