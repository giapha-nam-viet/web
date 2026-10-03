/* ============================================
   FORM LOGIC - GIA PHẢ NAM VIỆT (v1.4)
   - Fix load dữ liệu khi Sửa
   - Fix form hiện đúng popup
   - Crop ảnh 3:4 (Cropper.js)
   - Gán nhanh tên con (chỉ họ tên)
   - Nhiều vợ/chồng
   - Xóa người (kiểm tra có con)
   - Liên kết bài viết Ngoại phả
   - Tên người đăng
   ============================================ */

let currentEditingPersonId = null;
let tempChildrenList = [];
let tempAvatarData = null;
let cropper = null;
let tempLinkedNoteIds = [];
let allNotesCache = [];

/* ============================================
   1. MỞ / ĐÓNG FORM
   ============================================ */
function openPersonForm(personId) {
  console.log('📝 Mở form cho person:', personId || 'THÊM MỚI');
  
  currentEditingPersonId = personId || null;
  tempChildrenList = [];
  tempAvatarData = null;
  tempLinkedNoteIds = [];
  
  const modal = document.getElementById('personFormModal');
  const title = document.getElementById('formTitle');
  const deleteBtn = document.getElementById('deletePersonBtn');
  
  if (!modal) {
    console.error('❌ Không tìm thấy personFormModal!');
    alert('⚠️ Lỗi: Không tìm thấy form. Vui lòng tải lại trang.');
    return;
  }
  
  // Reset form trước
  resetForm();
  
  if (personId) {
    title.textContent = 'SỬA THÔNG TIN CÁ NHÂN';
    if (deleteBtn) deleteBtn.style.display = 'inline-flex';
    // Load dữ liệu sau khi form hiện
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
  
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  
  console.log('✅ Form đã mở');
}

function closePersonForm() {
  if (!confirm('Bạn có chắc muốn hủy? Mọi thay đổi chưa lưu sẽ mất.')) return;
  closePersonFormNoConfirm();
}

function closePersonFormNoConfirm() {
  const modal = document.getElementById('personFormModal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
  currentEditingPersonId = null;
  tempChildrenList = [];
  tempAvatarData = null;
  tempLinkedNoteIds = [];
}

function resetForm() {
  const inputs = ['fullName', 'gender', 'branch', 'siblingOrder', 'birthYear', 
                  'deathYear', 'birthPlace', 'specialStatus', 'occupation', 
                  'conflictNote', 'bio', 'fatherId', 'motherId', 
                  'roleType', 'generation', 'createdByName'];
  
  inputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (el.tagName === 'SELECT') el.selectedIndex = 0;
      else el.value = '';
    }
  });
  
  const avatarPreview = document.getElementById('avatarPreview');
  if (avatarPreview) avatarPreview.innerHTML = '<span class="avatar-preview__placeholder">📷</span>';
  
  const contactList = document.getElementById('contactList');
  if (contactList) contactList.innerHTML = '';
  
  const spouseRows = document.getElementById('spouseRows');
  if (spouseRows) spouseRows.innerHTML = '';
  
  renderTempChildren();
  renderLinkedNotes();
}

async function autoFillCreatedByName() {
  if (!window.currentUser || !window.sbClient) return;
  try {
    const { data: profile } = await window.sbClient
      .from('profiles')
      .select('display_name')
      .eq('id', window.currentUser.id)
      .maybeSingle();
    
    const nameInput = document.getElementById('createdByName');
    if (nameInput && profile && profile.display_name) {
      nameInput.value = profile.display_name;
    } else if (nameInput && window.currentUser.email) {
      nameInput.value = window.currentUser.email;
    }
  } catch (err) { console.error('Lỗi autoFill name:', err); }
}

/* ============================================
   2. CROP ẢNH
   ============================================ */
function openCropModal(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  if (!file.type.startsWith('image/')) {
    alert('⚠️ Vui lòng chọn file ảnh (JPG, PNG...)');
    return;
  }
  
  if (file.size > 10 * 1024 * 1024) {
    alert('⚠️ File quá lớn (max 10MB)');
    return;
  }
  
  const reader = new FileReader();
  reader.onload = (e) => {
    const cropImage = document.getElementById('cropImage');
    if (!cropImage) return;
    cropImage.src = e.target.result;
    document.getElementById('cropModal').style.display = 'flex';
    
    cropImage.onload = () => {
      if (cropper) cropper.destroy();
      if (typeof Cropper !== 'undefined') {
        cropper = new Cropper(cropImage, {
          aspectRatio: 3 / 4,
          viewMode: 1,
          autoCropArea: 0.85,
          responsive: true,
          background: false,
          modal: true,
          guides: true,
          highlight: false,
          dragMode: 'move'
        });
      }
    };
  };
  reader.readAsDataURL(file);
}

function closeCropModal() {
  if (cropper) { cropper.destroy(); cropper = null; }
  const modal = document.getElementById('cropModal');
  if (modal) modal.style.display = 'none';
  const cropImage = document.getElementById('cropImage');
  if (cropImage) cropImage.src = '';
  const avatarInput = document.getElementById('avatarInput');
  if (avatarInput) avatarInput.value = '';
}

function rotateCropImage(degree) { if (cropper) cropper.rotate(degree); }
function flipCropImage(direction) {
  if (!cropper) return;
  if (direction === 'h') cropper.scaleX(-1);
  else cropper.scaleY(-1);
}
function resetCropImage() { if (cropper) cropper.reset(); }

function confirmCrop() {
  if (!cropper) return;
  const canvas = cropper.getCroppedCanvas({
    width: 600, height: 800,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high'
  });
  
  canvas.toBlob((blob) => {
    if (blob.size > 300 * 1024) {
      canvas.toBlob((smallerBlob) => convertBlobToBase64(smallerBlob), 'image/webp', 0.6);
    } else {
      convertBlobToBase64(blob);
    }
  }, 'image/webp', 0.85);
}

function convertBlobToBase64(blob) {
  const reader = new FileReader();
  reader.onloadend = () => {
    tempAvatarData = reader.result;
    const avatarPreview = document.getElementById('avatarPreview');
    if (avatarPreview) avatarPreview.innerHTML = '<img src="' + tempAvatarData + '" alt="Avatar">';
    closeCropModal();
  };
  reader.readAsDataURL(blob);
}

/* ============================================
   3. POPULATE DROPDOWNS
   ============================================ */
function populateRelationDropdowns() {
  const persons = window.allPersons || [];
  
  const fatherSelect = document.getElementById('fatherId');
  const motherSelect = document.getElementById('motherId');
  if (!fatherSelect || !motherSelect) return;
  
  const males = persons.filter(p => p.gender === 'Nam' && p.id !== currentEditingPersonId && !p.is_deleted);
  fatherSelect.innerHTML = '<option value="">-- Chọn bố --</option>' +
    males.map(p => '<option value="' + p.id + '">' + p.full_name + ' (Đời ' + p.generation + ')</option>').join('');
  
  const females = persons.filter(p => p.gender === 'Nữ' && p.id !== currentEditingPersonId && !p.is_deleted);
  motherSelect.innerHTML = '<option value="">-- Chọn mẹ --</option>' +
    females.map(p => '<option value="' + p.id + '">' + p.full_name + ' (Đời ' + p.generation + ')</option>').join('');
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
    '<button type="button" class="spouse-row__remove" onclick="removeSpouseRow(\'' + rowId + '\')" title="Xóa">×</button>';
  
  container.appendChild(row);
  populateSpouseSelect(row.querySelector('.spouse-select'));
}

function removeSpouseRow(rowId) {
  const row = document.getElementById(rowId);
  if (row) row.remove();
  const rows = document.querySelectorAll('#spouseRows .spouse-row');
  rows.forEach((r, idx) => {
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
  const container = document.getElementById('spouseRows');
  if (!container) return;
  container.innerHTML = '';
  spouseRowCounter = 0;
  addSpouseRow();
}

function getSpouseRowsData() {
  const rows = document.querySelectorAll('#spouseRows .spouse-row');
  const spouses = [];
  rows.forEach((row, idx) => {
    const select = row.querySelector('.spouse-select');
    if (select && select.value) {
      spouses.push({ personId: select.value, order: idx + 1 });
    }
  });
  return spouses;
}

/* ============================================
   5. QUẢN LÝ CON
   ============================================ */
function openAddChildModal() {
  const modal = document.getElementById('addChildModal');
  if (modal) modal.style.display = 'flex';
  const nameEl = document.getElementById('childName');
  if (nameEl) nameEl.value = '';
  const yearEl = document.getElementById('childBirthYear');
  if (yearEl) yearEl.value = '';
  const orderEl = document.getElementById('childOrder');
  if (orderEl) orderEl.value = '';
}

function closeAddChildModal() {
  const modal = document.getElementById('addChildModal');
  if (modal) modal.style.display = 'none';
}

function confirmAddChild() {
  const name = document.getElementById('childName').value.trim();
  const gender = document.getElementById('childGender').value;
  const birthYear = document.getElementById('childBirthYear').value;
  const order = document.getElementById('childOrder').value;
  const type = document.getElementById('childType').value;
  
  if (!name) { alert('⚠️ Vui lòng nhập họ tên con'); return; }
  
  tempChildrenList.push({
    temp_id: 'temp_' + Date.now(),
    full_name: name, gender: gender,
    birth_year: birthYear ? parseInt(birthYear) : null,
    sibling_order: order ? parseInt(order) : null,
    child_type: type
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
  
  list.innerHTML = tempChildrenList.map((child, idx) => {
    const yearStr = child.birth_year ? ' • ' + child.birth_year : '';
    return '<div class="child-item">' +
      '<div class="child-item__info">' +
        '<div class="child-item__name">' + (idx + 1) + '. ' + child.full_name + '</div>' +
        '<div class="child-item__meta">' + child.gender + yearStr + '</div>' +
      '</div>' +
      '<div class="child-item__type">' + child.child_type + '</div>' +
      '<div class="child-item__actions">' +
        '<button class="child-item__btn" onclick="removeTempChild(\'' + child.temp_id + '\')" title="Xóa">🗑️</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function removeTempChild(tempId) {
  if (!confirm('Xóa con này khỏi danh sách?')) return;
  tempChildrenList = tempChildrenList.filter(c => c.temp_id !== tempId);
  renderTempChildren();
}

/* ============================================
   6. GÁN NHANH TÊN CON
   ============================================ */
function openQuickAddModal() {
  const modal = document.getElementById('quickAddModal');
  if (modal) modal.style.display = 'flex';
  const textEl = document.getElementById('quickAddText');
  if (textEl) textEl.value = '';
}

function closeQuickAddModal() {
  const modal = document.getElementById('quickAddModal');
  if (modal) modal.style.display = 'none';
}

function confirmQuickAdd() {
  const text = document.getElementById('quickAddText').value.trim();
  if (!text) { alert('⚠️ Vui lòng paste danh sách tên con'); return; }
  
  const lines = text.split('\n').filter(line => line.trim());
  let successCount = 0, skipCount = 0;
  
  lines.forEach(line => {
    let name = line.trim();
    if (!name) { skipCount++; return; }
    if (name.includes('|')) name = name.split('|')[0].trim();
    if (!name) { skipCount++; return; }
    
    const isDuplicate = tempChildrenList.some(c => 
      c.full_name.toLowerCase() === name.toLowerCase()
    );
    if (isDuplicate) { skipCount++; return; }
    
    let gender = 'Nam';
    if (name.includes('Thị') || name.includes('thị')) gender = 'Nữ';
    
    tempChildrenList.push({
      temp_id: 'temp_' + Date.now() + '_' + Math.random(),
      full_name: name, gender: gender,
      birth_year: null,
      sibling_order: tempChildrenList.length + 1,
      child_type: 'Con chung'
    });
    successCount++;
  });
  
  renderTempChildren();
  closeQuickAddModal();
  
  let msg = '✅ Đã thêm ' + successCount + ' con vào danh sách';
  if (skipCount > 0) msg += '\n⚠️ Bỏ qua ' + skipCount + ' dòng (trùng hoặc trống)';
  alert(msg);
}

/* ============================================
   7. LIÊN KẾT BÀI VIẾT
   ============================================ */
async function loadNotesCache() {
  if (!window.sbClient) return;
  try {
    const { data, error } = await window.sbClient
      .from('notes')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    allNotesCache = data || [];
  } catch (err) {
    console.error('Lỗi load notes:', err);
    allNotesCache = [];
  }
}

function renderLinkedNotes() {
  const list = document.getElementById('linkedNotesList');
  if (!list) return;
  
  if (tempLinkedNoteIds.length === 0) {
    list.innerHTML = '<p class="empty-hint">Chưa có bài viết liên kết.</p>';
    return;
  }
  
  const linkedNotes = allNotesCache.filter(n => tempLinkedNoteIds.includes(n.id));
  
  if (linkedNotes.length === 0) {
    list.innerHTML = '<p class="empty-hint">Đang tải bài viết...</p>';
    return;
  }
  
  list.innerHTML = linkedNotes.map(note => 
    '<div class="linked-note-item" ondblclick="goToNote(\'' + note.id + '\')" title="Bấm đúp để chuyển tới bài viết">' +
      '<span class="linked-note-item__icon">📄</span>' +
      '<span class="linked-note-item__title">' + (note.title || note.content.substring(0, 50) || '(Không có tiêu đề)') + '</span>' +
      '<button class="linked-note-item__remove" onclick="event.stopPropagation(); removeLinkedNote(\'' + note.id + '\')" title="Bỏ liên kết">×</button>' +
    '</div>'
  ).join('');
}

function removeLinkedNote(noteId) {
  tempLinkedNoteIds = tempLinkedNoteIds.filter(id => id !== noteId);
  renderLinkedNotes();
}

function goToNote(noteId) {
  const tab = document.querySelector('.tab[data-tab="ngoai-pha"]');
  if (tab) tab.click();
  closePersonFormNoConfirm();
  setTimeout(() => {
    const el = document.getElementById('note-' + noteId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.background = '#FFF9E5';
      setTimeout(() => { el.style.background = ''; }, 2000);
    }
  }, 300);
}

async function openLinkNoteModal() {
  await loadNotesCache();
  const list = document.getElementById('availableNotesList');
  if (!list) return;
  
  if (allNotesCache.length === 0) {
    list.innerHTML = '<p class="empty-hint">Chưa có bài viết nào ở Ngoại phả.</p>';
    document.getElementById('linkNoteModal').style.display = 'flex';
    return;
  }
  
  list.innerHTML = allNotesCache.map(note => {
    const checked = tempLinkedNoteIds.includes(note.id) ? 'checked' : '';
    return '<label class="note-picker-item">' +
      '<input type="checkbox" value="' + note.id + '" ' + checked + '>' +
      '<span>' + (note.title || note.content.substring(0, 50) || '(Không có tiêu đề)') + '</span>' +
    '</label>';
  }).join('');
  
  document.getElementById('linkNoteModal').style.display = 'flex';
}

function closeLinkNoteModal() {
  const modal = document.getElementById('linkNoteModal');
  if (modal) modal.style.display = 'none';
}

function confirmLinkNote() {
  const checkboxes = document.querySelectorAll('#availableNotesList input[type="checkbox"]:checked');
  tempLinkedNoteIds = Array.from(checkboxes).map(cb => cb.value);
  renderLinkedNotes();
  closeLinkNoteModal();
}

/* ============================================
   8. THÔNG TIN LIÊN HỆ
   ============================================ */
function addContactRow() {
  const list = document.getElementById('contactList');
  if (!list) return;
  const row = document.createElement('div');
  row.className = 'contact-row';
  row.innerHTML = 
    '<input type="text" placeholder="Tên mục (VD: Điện thoại)" class="contact-name">' +
    '<input type="text" placeholder="Nội dung" class="contact-value">' +
    '<button type="button" class="contact-row__remove" onclick="this.parentElement.remove()">×</button>';
  list.appendChild(row);
}

function getContactInfo() {
  const rows = document.querySelectorAll('#contactList .contact-row');
  const contacts = [];
  rows.forEach(row => {
    const name = row.querySelector('.contact-name').value.trim();
    const value = row.querySelector('.contact-value').value.trim();
    if (name && value) contacts.push({ name, value });
  });
  return contacts.length > 0 ? contacts : null;
}

/* ============================================
   9. LƯU THÔNG TIN
   ============================================ */
async function savePerson() {
  console.log('💾 Bắt đầu lưu...');
  
  const fullName = document.getElementById('fullName').value.trim();
  const gender = document.getElementById('gender').value;
  
  if (!fullName) { alert('⚠️ Vui lòng nhập Họ và tên'); document.getElementById('fullName').focus(); return; }
  if (!gender) { alert('⚠️ Vui lòng chọn Giới tính'); document.getElementById('gender').focus(); return; }
  if (!window.sbClient) { alert('⚠️ Chưa kết nối Supabase'); return; }
  
  const user = await window.sbClient.auth.getUser();
  if (!user.data.user) { alert('⚠️ Bạn cần đăng nhập trước khi lưu'); return; }
  
  const roleType = document.getElementById('roleType').value;
  let role = 'Huyết thống';
  if (roleType === 'Dâu/Rể') role = 'Phối ngẫu';
  
  const personData = {
    full_name: fullName,
    gender: gender,
    role: role,
    role_type: roleType,
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
  
  if (personData.death_year) personData.is_deceased = true;
  if (personData.special_status === 'Không rõ') personData.is_unknown = true;
  
  console.log('📤 Dữ liệu gửi lên:', personData);
  
  try {
    let personId = currentEditingPersonId;
    
    if (currentEditingPersonId) {
      const { error } = await window.sbClient
        .from('persons')
        .update(personData)
        .eq('id', currentEditingPersonId);
      if (error) throw error;
      console.log('✅ Đã update person:', currentEditingPersonId);
    } else {
      const { data, error } = await window.sbClient
        .from('persons')
        .insert(personData)
        .select()
        .single();
      if (error) throw error;
      personId = data.id;
      console.log('✅ Đã insert person:', personId);
    }
    
    const fatherId = document.getElementById('fatherId').value;
    if (fatherId) await createParentChildLink(fatherId, personId, 'Bố');
    
    const motherId = document.getElementById('motherId').value;
    if (motherId) await createParentChildLink(motherId, personId, 'Mẹ');
    
    const spouseRows = getSpouseRowsData();
    for (const sp of spouseRows) {
      await createMarriageLink(personId, sp.personId, personData.gender, sp.order);
    }
    
    if (tempChildrenList.length > 0) {
      const primarySpouseId = spouseRows.length > 0 ? spouseRows[0].personId : null;
      for (const child of tempChildrenList) {
        await createChildWithAutoCreate(personId, personData.generation, child, primarySpouseId);
      }
    }
    
    alert('✅ Đã lưu thành công!');
    closePersonFormNoConfirm();
    
    if (typeof loadAllData === 'function') await loadAllData();
    
  } catch (err) {
    console.error('❌ Lỗi lưu:', err);
    alert('❌ Lỗi: ' + err.message);
  }
}

/* ============================================
   10. XÓA NGƯỜI
   ============================================ */
async function deletePerson() {
  if (!currentEditingPersonId) return;
  if (!window.sbClient) return;
  
  const { data: children, error: checkError } = await window.sbClient
    .from('parent_child')
    .select('id')
    .eq('parent_id', currentEditingPersonId);
  
  if (checkError) {
    alert('❌ Lỗi kiểm tra: ' + checkError.message);
    return;
  }
  
  if (children && children.length > 0) {
    alert('⚠️ KHÔNG THỂ XÓA!\n\nNgười này đang có ' + children.length + ' người con liên kết.\n\nVui lòng xóa con trước, hoặc bỏ liên kết cha-con.');
    return;
  }
  
  const fullName = document.getElementById('fullName').value.trim() || 'người này';
  if (!confirm('⚠️ Bạn có chắc muốn XÓA "' + fullName + '"?\n\nHành động này KHÔNG THỂ HOÀN TÁC!')) return;
  if (!confirm('⚠️ XÁC NHẬN LẦN CUỐI:\n\nXóa "' + fullName + '" khỏi gia phả?')) return;
  
  try {
    await window.sbClient.from('marriages')
      .delete()
      .or('husband_id.eq.' + currentEditingPersonId + ',wife_id.eq.' + currentEditingPersonId);
    
    await window.sbClient.from('parent_child')
      .delete()
      .or('parent_id.eq.' + currentEditingPersonId + ',child_id.eq.' + currentEditingPersonId);
    
    const { error } = await window.sbClient
      .from('persons')
      .delete()
      .eq('id', currentEditingPersonId);
    
    if (error) throw error;
    
    alert('✅ Đã xóa thành công!');
    closePersonFormNoConfirm();
    
    if (typeof loadAllData === 'function') await loadAllData();
    
  } catch (err) {
    console.error('❌ Lỗi xóa:', err);
    alert('❌ Lỗi xóa: ' + err.message);
  }
}

/* ============================================
   11. TẠO LIÊN KẾT QUAN HỆ
   ============================================ */
async function createParentChildLink(parentId, childId, parentRole) {
  const { data: existing } = await window.sbClient
    .from('parent_child').select('id')
    .eq('parent_id', parentId).eq('child_id', childId).maybeSingle();
  if (existing) return;
  
  const { error } = await window.sbClient.from('parent_child').insert({
    parent_id: parentId, child_id: childId, parent_role: parentRole,
    relation: 'Con chung', child_type: 'Con chung', is_family_member: true
  });
  if (error) throw error;
}

async function createMarriageLink(personId, spouseId, gender, order) {
  const husbandId = gender === 'Nam' ? personId : spouseId;
  const wifeId = gender === 'Nam' ? spouseId : personId;
  
  const { data: existing } = await window.sbClient
    .from('marriages').select('id')
    .eq('husband_id', husbandId).eq('wife_id', wifeId).maybeSingle();
  if (existing) return;
  
  let status = 'Chính thất';
  if (order === 2) status = 'Kế thất';
  else if (order >= 3) status = 'Thứ thất';
  
  const { error } = await window.sbClient.from('marriages').insert({
    husband_id: husbandId, wife_id: wifeId, status: status
  });
  if (error) throw error;
}

async function createChildWithAutoCreate(parentId, parentGeneration, childData, spouseId) {
  try {
    const childRecord = {
      full_name: childData.full_name,
      gender: childData.gender,
      generation: parentGeneration + 1,
      birth_year: childData.birth_year,
      sibling_order: childData.sibling_order,
      role: 'Huyết thống',
      role_type: 'Huyết thống',
      special_status: 'Bình thường',
      created_by_name: document.getElementById('createdByName').value.trim() || null
    };
    
    const { data: newChild, error: childError } = await window.sbClient
      .from('persons').insert(childRecord).select().single();
    if (childError) throw childError;
    
    const { data: parent } = await window.sbClient
      .from('persons').select('gender').eq('id', parentId).single();
    
    const parentRole = parent.gender === 'Nam' ? 'Bố' : 'Mẹ';
    const isFamilyMember = ['Con chung', 'Con riêng', 'Con ngoài giá thú', 'Con nuôi'].includes(childData.child_type);
    
    await window.sbClient.from('parent_child').insert({
      parent_id: parentId, child_id: newChild.id, parent_role: parentRole,
      relation: childData.child_type, child_type: childData.child_type,
      is_family_member: isFamilyMember
    });
    
    if (childData.child_type === 'Con chung' && spouseId) {
      const { data: spouse } = await window.sbClient
        .from('persons').select('gender').eq('id', spouseId).single();
      
      if (spouse) {
        const spouseRole = spouse.gender === 'Nam' ? 'Bố' : 'Mẹ';
        await window.sbClient.from('parent_child').insert({
          parent_id: spouseId, child_id: newChild.id, parent_role: spouseRole,
          relation: 'Con chung', child_type: 'Con chung', is_family_member: true
        });
      }
    }
  } catch (err) {
    console.error('Lỗi tạo con:', err);
    throw err;
  }
}

/* ============================================
   12. LOAD DỮ LIỆU ĐỂ SỬA (ĐÃ FIX)
   ============================================ */
async function loadPersonForEdit(personId) {
  console.log('📥 Đang load person:', personId);
  
  if (!window.sbClient) {
    alert('⚠️ Chưa kết nối Supabase');
    return;
  }
  
  try {
    const { data: person, error } = await window.sbClient
      .from('persons')
      .select('*')
      .eq('id', personId)
      .single();
    
    if (error) throw error;
    if (!person) throw new Error('Không tìm thấy người này');
    
    console.log('✅ Đã load person:', person.full_name);
    
    // Điền dữ liệu vào form
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
    
    // Avatar
    if (person.avatar_url) {
      tempAvatarData = person.avatar_url;
      document.getElementById('avatarPreview').innerHTML = '<img src="' + person.avatar_url + '" alt="Avatar">';
    }
    
    // Contact info
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
    
    // Load vợ/chồng
    const spouseContainer = document.getElementById('spouseRows');
    spouseContainer.innerHTML = '';
    spouseRowCounter = 0;
    
    const { data: marriages } = await window.sbClient
      .from('marriages').select('*')
      .or('husband_id.eq.' + personId + ',wife_id.eq.' + personId);
    
    if (marriages && marriages.length > 0) {
      marriages.forEach(m => {
        const spouseId = m.husband_id === personId ? m.wife_id : m.husband_id;
        spouseRowCounter++;
        const rowId = 'spouse_row_' + spouseRowCounter;
        const row = document.createElement('div');
        row.className = 'spouse-row';
        row.id = rowId;
        row.innerHTML = 
          '<span class="spouse-row__label">Vợ/Chồng ' + spouseRowCounter + ':</span>' +
          '<select class="spouse-select"><option value="">-- Chọn vợ/chồng --</option></select>' +
          '<button type="button" class="spouse-row__remove" onclick="removeSpouseRow(\'' + rowId + '\')" title="Xóa">×</button>';
        spouseContainer.appendChild(row);
        populateSpouseSelect(row.querySelector('.spouse-select'));
        row.querySelector('.spouse-select').value = spouseId;
      });
    } else {
      addSpouseRow();
    }
    
    // Load bố mẹ
    const { data: parentLinks } = await window.sbClient
      .from('parent_child')
      .select('parent_id, parent_role')
      .eq('child_id', personId);
    
    if (parentLinks && parentLinks.length > 0) {
      parentLinks.forEach(link => {
        if (link.parent_role === 'Bố') {
          document.getElementById('fatherId').value = link.parent_id;
        } else if (link.parent_role === 'Mẹ') {
          document.getElementById('motherId').value = link.parent_id;
        }
      });
    }
    
    // Load bài viết liên kết
    tempLinkedNoteIds = person.linked_note_ids || [];
    if (tempLinkedNoteIds.length > 0) {
      await loadNotesCache();
    }
    renderLinkedNotes();
    
    console.log('✅ Đã load xong toàn bộ thông tin');
    
  } catch (err) {
    console.error('❌ Lỗi load person:', err);
    alert('❌ Không load được dữ liệu: ' + err.message);
  }
}

console.log('📝 Form.js v1.4 loaded - Đã fix load dữ liệu + popup + Xóa');