/* ============================================
   FORM LOGIC - GIA PHẢ NAM VIỆT (v2.1)
   Dùng class 'is-visible' để hiện/ẩn form
   ============================================ */

let currentEditingPersonId = null;
let tempChildrenList = [];
let tempAvatarData = null;
let cropper = null;
let tempLinkedNoteIds = [];
let allNotesCache = [];

/* ============================================
   HÀM HIỆN / ẨN FORM — DÙNG CLASS
   ============================================ */
function showModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('is-visible');
    console.log('👁️ Hiện form:', modalId);
  }
}

function hideModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('is-visible');
    console.log('🔒 Ẩn form:', modalId);
  }
}

function hideAllModals() {
  document.querySelectorAll('.form-modal').forEach(m => {
    m.classList.remove('is-visible');
  });
  document.body.style.overflow = '';
  console.log('🔒 Ẩn TẤT CẢ form');
}

/* ESC để đóng tất cả form */
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' || e.keyCode === 27) {
    hideAllModals();
  }
});

/* ============================================
   1. MỞ / ĐÓNG FORM CÁ NHÂN
   ============================================ */
function openPersonForm(personId) {
  console.log('📝 Mở form:', personId || 'THÊM MỚI');
  
  currentEditingPersonId = personId || null;
  tempChildrenList = [];
  tempAvatarData = null;
  tempLinkedNoteIds = [];
  
  const title = document.getElementById('formTitle');
  const deleteBtn = document.getElementById('deletePersonBtn');
  
  if (!document.getElementById('personFormModal')) {
    alert('⚠️ Lỗi: Không tìm thấy form.');
    return;
  }
  
  resetForm();
  
  if (personId) {
    title.textContent = 'SỬA THÔNG TIN CÁ NHÂN';
    if (deleteBtn) deleteBtn.style.display = 'inline-flex';
    setTimeout(() => loadPersonForEdit(personId), 100);
  } else {
    title.textContent = 'THÊM CÁ NHÂN MỚI';
    if (deleteBtn) deleteBtn.style.display = 'none';
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
  if (!confirm('Bạn có chắc muốn hủy? Mọi thay đổi chưa lưu sẽ mất.')) return;
  hideModal('personFormModal');
  document.body.style.overflow = '';
  currentEditingPersonId = null;
  tempChildrenList = [];
  tempAvatarData = null;
  tempLinkedNoteIds = [];
}

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
   2. CROP ẢNH
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

function confirmCrop() {
  if (!cropper) return;
  const canvas = cropper.getCroppedCanvas({ width: 600, height: 800 });
  canvas.toBlob((blob) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      tempAvatarData = reader.result;
      const av = document.getElementById('avatarPreview');
      if (av) av.innerHTML = '<img src="' + tempAvatarData + '" alt="Avatar">';
      closeCropModal();
    };
    reader.readAsDataURL(blob);
  }, 'image/webp', 0.85);
}

/* ============================================
   3. POPULATE DROPDOWNS
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
   4. VỢ/CHỒNG
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
   5. THÊM CON
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
  const name = document.getElementById('childName').value.trim();
  if (!name) { alert('⚠️ Vui lòng nhập họ tên con'); return; }
  
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
   6. GÁN NHANH
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
   7. LIÊN KẾT BÀI VIẾT
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
   8. LIÊN HỆ
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
   9. LƯU
   ============================================ */
async function savePerson() {
  const fullName = document.getElementById('fullName').value.trim();
  const gender = document.getElementById('gender').value;
  
  if (!fullName) { alert('⚠️ Vui lòng nhập Họ và tên'); return; }
  if (!gender) { alert('⚠️ Vui lòng chọn Giới tính'); return; }
  if (!window.sbClient) { alert('⚠️ Chưa kết nối Supabase'); return; }
  
  const user = await window.sbClient.auth.getUser();
  if (!user.data.user) { alert('⚠️ Bạn cần đăng nhập'); return; }
  
  const roleType = document.getElementById('roleType').value;
  const role = roleType === 'Dâu/Rể' ? 'Phối ngẫu' : 'Huyết thống';
  
  const data = {
    full_name: fullName, gender: gender, role: role, role_type: roleType,
    branch: document.getElementById('branch').value.trim() || null,
    generation: parseInt(document.getElementById('generation').value),
    sibling_order: parseInt(document.getElementById('siblingOrder').value) || null,
    birth_year: parseInt(document.getElementById('birthYear').value) || null,
    death_year: parseInt(document.getElementById('deathYear').value) || null,
    birth_place: document.getElementById('birthPlace').value.trim() || null,
    special_status: document.getElementById('specialStatus').value,
    occupation: document.getElementById('occupation').value.trim() || null,
    conflict_note: document.getElementById('conflictNote').value.trim() || null,
    bio: document.getElementById('bio').value.trim() || null,
    contact_info: getContactInfo(),
    avatar_url: tempAvatarData,
    linked_note_ids: tempLinkedNoteIds.length > 0 ? tempLinkedNoteIds : null,
    created_by_name: document.getElementById('createdByName').value.trim() || null,
    updated_by: user.data.user.id
  };
  
  if (data.death_year) data.is_deceased = true;
  if (data.special_status === 'Không rõ') data.is_unknown = true;
  
  try {
    let personId = currentEditingPersonId;
    
    if (currentEditingPersonId) {
      const { error } = await window.sbClient.from('persons').update(data).eq('id', currentEditingPersonId);
      if (error) throw error;
    } else {
      const { data: result, error } = await window.sbClient.from('persons').insert(data).select().single();
      if (error) throw error;
      personId = result.id;
    }
    
    const f = document.getElementById('fatherId').value;
    if (f) await createParentChildLink(f, personId, 'Bố');
    
    const m = document.getElementById('motherId').value;
    if (m) await createParentChildLink(m, personId, 'Mẹ');
    
    const spouses = getSpouseRowsData();
    for (const s of spouses) {
      await createMarriageLink(personId, s.personId, gender, s.order);
    }
    
    if (tempChildrenList.length > 0) {
      const mainSpouse = spouses.length > 0 ? spouses[0].personId : null;
      for (const c of tempChildrenList) {
        await createChildWithAutoCreate(personId, data.generation, c, mainSpouse);
      }
    }
    
    alert('✅ Đã lưu thành công!');
    hideModal('personFormModal');
    document.body.style.overflow = '';
    currentEditingPersonId = null;
    tempChildrenList = [];
    tempAvatarData = null;
    tempLinkedNoteIds = [];
    
    if (typeof loadAllData === 'function') await loadAllData();
  } catch (err) {
    alert('❌ Lỗi: ' + err.message);
  }
}

/* ============================================
   10. XÓA
   ============================================ */
async function deletePerson() {
  if (!currentEditingPersonId || !window.sbClient) return;
  
  const { data: children } = await window.sbClient
    .from('parent_child').select('id').eq('parent_id', currentEditingPersonId);
  
  if (children && children.length > 0) {
    alert('⚠️ KHÔNG THỂ XÓA!\n\nNgười này đang có ' + children.length + ' người con liên kết.');
    return;
  }
  
  const name = document.getElementById('fullName').value.trim();
  if (!confirm('⚠️ XÓA "' + name + '"?\n\nKhông thể hoàn tác!')) return;
  
  try {
    await window.sbClient.from('marriages').delete()
      .or('husband_id.eq.' + currentEditingPersonId + ',wife_id.eq.' + currentEditingPersonId);
    await window.sbClient.from('parent_child').delete()
      .or('parent_id.eq.' + currentEditingPersonId + ',child_id.eq.' + currentEditingPersonId);
    await window.sbClient.from('persons').delete().eq('id', currentEditingPersonId);
    
    alert('✅ Đã xóa!');
    hideModal('personFormModal');
    document.body.style.overflow = '';
    currentEditingPersonId = null;
    
    if (typeof loadAllData === 'function') await loadAllData();
  } catch (err) {
    alert('❌ Lỗi: ' + err.message);
  }
}

/* ============================================
   11. LIÊN KẾT QUAN HỆ
   ============================================ */
async function createParentChildLink(parentId, childId, parentRole) {
  const { data: existing } = await window.sbClient
    .from('parent_child').select('id')
    .eq('parent_id', parentId).eq('child_id', childId).maybeSingle();
  if (existing) return;
  
  await window.sbClient.from('parent_child').insert({
    parent_id: parentId, child_id: childId, parent_role: parentRole,
    relation: 'Con chung', child_type: 'Con chung', is_family_member: true
  });
}

async function createMarriageLink(personId, spouseId, gender, order) {
  const hId = gender === 'Nam' ? personId : spouseId;
  const wId = gender === 'Nam' ? spouseId : personId;
  
  const { data: existing } = await window.sbClient
    .from('marriages').select('id')
    .eq('husband_id', hId).eq('wife_id', wId).maybeSingle();
  if (existing) return;
  
  let status = 'Chính thất';
  if (order === 2) status = 'Kế thất';
  else if (order >= 3) status = 'Thứ thất';
  
  await window.sbClient.from('marriages').insert({
    husband_id: hId, wife_id: wId, status: status
  });
}

async function createChildWithAutoCreate(parentId, parentGen, childData, spouseId) {
  const childRecord = {
    full_name: childData.full_name,
    gender: childData.gender,
    generation: parentGen + 1,
    birth_year: childData.birth_year,
    sibling_order: childData.sibling_order,
    role: 'Huyết thống', role_type: 'Huyết thống',
    special_status: 'Bình thường',
    created_by_name: document.getElementById('createdByName').value.trim() || null
  };
  
  const { data: newChild, error } = await window.sbClient
    .from('persons').insert(childRecord).select().single();
  if (error) throw error;
  
  const { data: parent } = await window.sbClient
    .from('persons').select('gender').eq('id', parentId).single();
  
  const parentRole = parent.gender === 'Nam' ? 'Bố' : 'Mẹ';
  const isFam = ['Con chung', 'Con riêng', 'Con ngoài giá thú', 'Con nuôi'].includes(childData.child_type);
  
  await window.sbClient.from('parent_child').insert({
    parent_id: parentId, child_id: newChild.id, parent_role: parentRole,
    relation: childData.child_type, child_type: childData.child_type,
    is_family_member: isFam
  });
  
  if (childData.child_type === 'Con chung' && spouseId) {
    const { data: spouse } = await window.sbClient
      .from('persons').select('gender').eq('id', spouseId).single();
    
    if (spouse) {
      const sRole = spouse.gender === 'Nam' ? 'Bố' : 'Mẹ';
      await window.sbClient.from('parent_child').insert({
        parent_id: spouseId, child_id: newChild.id, parent_role: sRole,
        relation: 'Con chung', child_type: 'Con chung', is_family_member: true
      });
    }
  }
}

/* ============================================
   12. LOAD PERSON FOR EDIT
   ============================================ */
async function loadPersonForEdit(personId) {
  if (!window.sbClient) return;
  
  try {
    const { data: person, error } = await window.sbClient
      .from('persons').select('*').eq('id', personId).single();
    if (error) throw error;
    
    document.getElementById('fullName').value = person.full_name || '';
    document.getElementById('gender').value = person.gender || '';
    document.getElementById('roleType').value = person.role_type || 'Huyết thống';
    document.getElementById('branch').value = person.branch || '';
    document.getElementById('generation').value = person.generation || 1;
    document.getElementById('siblingOrder').value = person.sibling_order || '';
    document.getElementById('birthYear').value = person.birth_year || '';
    document.getElementById('deathYear').value = person.death_year || '';
    document.getElementById('birthPlace').value = person.birth_place || '';
    document.getElementById('specialStatus').value = person.special_status || 'Bình thường';
    document.getElementById('occupation').value = person.occupation || '';
    document.getElementById('conflictNote').value = person.conflict_note || '';
    document.getElementById('bio').value = person.bio || '';
    document.getElementById('createdByName').value = person.created_by_name || '';
    
    if (person.avatar_url) {
      tempAvatarData = person.avatar_url;
      document.getElementById('avatarPreview').innerHTML = '<img src="' + person.avatar_url + '" alt="Avatar">';
    }
    
    if (person.contact_info && Array.isArray(person.contact_info)) {
      const list = document.getElementById('contactList');
      list.innerHTML = '';
      person.contact_info.forEach(c => {
        const row = document.createElement('div');
        row.className = 'contact-row';
        row.innerHTML = 
          '<input type="text" value="' + (c.name || '') + '" class="contact-name">' +
          '<input type="text" value="' + (c.value || '') + '" class="contact-value">' +
          '<button type="button" class="contact-row__remove" onclick="this.parentElement.remove()">×</button>';
        list.appendChild(row);
      });
    }
    
    document.getElementById('spouseRows').innerHTML = '';
    spouseRowCounter = 0;
    
    const { data: marriages } = await window.sbClient
      .from('marriages').select('*')
      .or('husband_id.eq.' + personId + ',wife_id.eq.' + personId);
    
    if (marriages && marriages.length > 0) {
      marriages.forEach(m => {
        const sId = m.husband_id === personId ? m.wife_id : m.husband_id;
        spouseRowCounter++;
        const rowId = 'spouse_row_' + spouseRowCounter;
        const row = document.createElement('div');
        row.className = 'spouse-row';
        row.id = rowId;
        row.innerHTML = 
          '<span class="spouse-row__label">Vợ/Chồng ' + spouseRowCounter + ':</span>' +
          '<select class="spouse-select"><option value="">-- Chọn --</option></select>' +
          '<button type="button" class="spouse-row__remove" onclick="removeSpouseRow(\'' + rowId + '\')">×</button>';
        document.getElementById('spouseRows').appendChild(row);
        populateSpouseSelect(row.querySelector('.spouse-select'));
        row.querySelector('.spouse-select').value = sId;
      });
    } else {
      addSpouseRow();
    }
    
    const { data: parents } = await window.sbClient
      .from('parent_child').select('parent_id, parent_role').eq('child_id', personId);
    
    if (parents) {
      parents.forEach(p => {
        if (p.parent_role === 'Bố') document.getElementById('fatherId').value = p.parent_id;
        else if (p.parent_role === 'Mẹ') document.getElementById('motherId').value = p.parent_id;
      });
    }
    
    tempLinkedNoteIds = person.linked_note_ids || [];
    if (tempLinkedNoteIds.length > 0) await loadNotesCache();
    renderLinkedNotes();
    
  } catch (err) {
    alert('❌ Lỗi load: ' + err.message);
  }
}

console.log('📝 Form.js v2.1 loaded - Dùng class is-visible');