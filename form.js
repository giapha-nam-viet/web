/* ============================================
   FORM LOGIC - GIA PHẢ NAM VIỆT (v1.2)
   - Crop ảnh tỷ lệ 3:4 với Cropper.js
   - Gán nhanh tên con (chỉ họ tên)
   - Nhiều vợ/chồng (Dynamic List)
   - Fix persons_role_check
   ============================================ */

let currentEditingPersonId = null;
let tempChildrenList = [];
let tempAvatarData = null;
let cropper = null;

/* ============================================
   1. MỞ / ĐÓNG FORM
   ============================================ */
function openPersonForm(personId) {
  console.log('📝 Mở form cho person:', personId || 'THÊM MỚI');
  
  currentEditingPersonId = personId || null;
  tempChildrenList = [];
  tempAvatarData = null;
  
  const modal = document.getElementById('personFormModal');
  const title = document.getElementById('formTitle');
  
  if (personId) {
    title.textContent = 'SỬA THÔNG TIN CÁ NHÂN';
    loadPersonForEdit(personId);
  } else {
    title.textContent = 'THÊM CÁ NHÂN MỚI';
    resetForm();
  }
  
  populateRelationDropdowns();
  renderSpouseRows();  // Khởi tạo 1 dòng vợ/chồng
  renderTempChildren();
  
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closePersonForm() {
  if (!confirm('Bạn có chắc muốn hủy? Mọi thay đổi chưa lưu sẽ mất.')) return;
  closePersonFormNoConfirm();
}

function closePersonFormNoConfirm() {
  document.getElementById('personFormModal').style.display = 'none';
  document.body.style.overflow = '';
  currentEditingPersonId = null;
  tempChildrenList = [];
  tempAvatarData = null;
}

function resetForm() {
  const inputs = ['fullName', 'gender', 'branch', 'siblingOrder', 'birthYear', 
                  'deathYear', 'birthPlace', 'specialStatus', 'occupation', 
                  'conflictNote', 'bio', 'fatherId', 'motherId', 
                  'roleType', 'generation'];
  
  inputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (el.tagName === 'SELECT') el.selectedIndex = 0;
      else el.value = '';
    }
  });
  
  document.getElementById('avatarPreview').innerHTML = '<span class="avatar-preview__placeholder">📷</span>';
  document.getElementById('contactList').innerHTML = '';
  document.getElementById('spouseRows').innerHTML = '';
  renderTempChildren();
}

/* ============================================
   2. CROP ẢNH (Cropper.js)
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
    cropImage.src = e.target.result;
    
    document.getElementById('cropModal').style.display = 'flex';
    
    // Khởi tạo Cropper sau khi ảnh load xong
    cropImage.onload = () => {
      if (cropper) cropper.destroy();
      cropper = new Cropper(cropImage, {
        aspectRatio: 3 / 4,
        viewMode: 1,
        autoCropArea: 0.85,
        responsive: true,
        background: false,
        modal: true,
        guides: true,
        highlight: false,
        dragMode: 'move',
        cropBoxMovable: true,
        cropBoxResizable: true,
        toggleDragModeOnDblclick: false
      });
    };
  };
  reader.readAsDataURL(file);
}

function closeCropModal() {
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }
  document.getElementById('cropModal').style.display = 'none';
  document.getElementById('cropImage').src = '';
  document.getElementById('avatarInput').value = '';
}

function rotateCropImage(degree) {
  if (cropper) cropper.rotate(degree);
}

function flipCropImage(direction) {
  if (!cropper) return;
  if (direction === 'h') {
    const scaleX = cropper.getData().scaleX || 1;
    cropper.scaleX(-scaleX);
  } else {
    const scaleY = cropper.getData().scaleY || 1;
    cropper.scaleY(-scaleY);
  }
}

function resetCropImage() {
  if (cropper) cropper.reset();
}

function confirmCrop() {
  if (!cropper) return;
  
  const canvas = cropper.getCroppedCanvas({
    width: 600,
    height: 800,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high'
  });
  
  // Tự động nén WebP
  canvas.toBlob((blob) => {
    // Nếu > 300KB, nén lại với chất lượng 0.6
    if (blob.size > 300 * 1024) {
      canvas.toBlob((smallerBlob) => {
        convertBlobToBase64(smallerBlob);
      }, 'image/webp', 0.6);
    } else {
      convertBlobToBase64(blob);
    }
  }, 'image/webp', 0.85);
}

function convertBlobToBase64(blob) {
  const reader = new FileReader();
  reader.onloadend = () => {
    tempAvatarData = reader.result;
    document.getElementById('avatarPreview').innerHTML = 
      '<img src="' + tempAvatarData + '" alt="Avatar">';
    
    closeCropModal();
    console.log('✅ Đã cắt và nén ảnh:', (blob.size / 1024).toFixed(1), 'KB');
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
  
  const males = persons.filter(p => p.gender === 'Nam' && p.id !== currentEditingPersonId);
  fatherSelect.innerHTML = '<option value="">-- Chọn bố --</option>' +
    males.map(p => '<option value="' + p.id + '">' + p.full_name + ' (Đời ' + p.generation + ')</option>').join('');
  
  const females = persons.filter(p => p.gender === 'Nữ' && p.id !== currentEditingPersonId);
  motherSelect.innerHTML = '<option value="">-- Chọn mẹ --</option>' +
    females.map(p => '<option value="' + p.id + '">' + p.full_name + ' (Đời ' + p.generation + ')</option>').join('');
}

/* ============================================
   4. VỢ/CHỒNG - DYNAMIC LIST
   ============================================ */
let spouseRowCounter = 0;

function addSpouseRow() {
  spouseRowCounter++;
  const container = document.getElementById('spouseRows');
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
  // Đánh số lại
  const rows = document.querySelectorAll('#spouseRows .spouse-row');
  rows.forEach((r, idx) => {
    r.querySelector('.spouse-row__label').textContent = 'Vợ/Chồng ' + (idx + 1) + ':';
  });
}

function populateSpouseSelect(select) {
  const persons = window.allPersons || [];
  select.innerHTML = '<option value="">-- Chọn vợ/chồng --</option>' +
    persons.filter(p => p.id !== currentEditingPersonId)
      .map(p => '<option value="' + p.id + '">' + p.full_name + ' (Đời ' + p.generation + ')</option>').join('');
}

function renderSpouseRows() {
  // Khởi tạo với 1 dòng trống
  document.getElementById('spouseRows').innerHTML = '';
  spouseRowCounter = 0;
  addSpouseRow();
}

function getSpouseRowsData() {
  const rows = document.querySelectorAll('#spouseRows .spouse-row');
  const spouses = [];
  rows.forEach((row, idx) => {
    const select = row.querySelector('.spouse-select');
    if (select && select.value) {
      spouses.push({
        personId: select.value,
        order: idx + 1
      });
    }
  });
  return spouses;
}

/* ============================================
   5. QUẢN LÝ CON
   ============================================ */
function openAddChildModal() {
  document.getElementById('addChildModal').style.display = 'flex';
  document.getElementById('childName').value = '';
  document.getElementById('childBirthYear').value = '';
  document.getElementById('childOrder').value = '';
}

function closeAddChildModal() {
  document.getElementById('addChildModal').style.display = 'none';
}

function confirmAddChild() {
  const name = document.getElementById('childName').value.trim();
  const gender = document.getElementById('childGender').value;
  const birthYear = document.getElementById('childBirthYear').value;
  const order = document.getElementById('childOrder').value;
  const type = document.getElementById('childType').value;
  
  if (!name) {
    alert('⚠️ Vui lòng nhập họ tên con');
    return;
  }
  
  tempChildrenList.push({
    temp_id: 'temp_' + Date.now(),
    full_name: name,
    gender: gender,
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
   6. GÁN NHANH TÊN CON (CHỈ HỌ TÊN)
   ============================================ */
function openQuickAddModal() {
  document.getElementById('quickAddModal').style.display = 'flex';
  document.getElementById('quickAddText').value = '';
}

function closeQuickAddModal() {
  document.getElementById('quickAddModal').style.display = 'none';
}

function confirmQuickAdd() {
  const text = document.getElementById('quickAddText').value.trim();
  
  if (!text) {
    alert('⚠️ Vui lòng paste danh sách tên con');
    return;
  }
  
  const lines = text.split('\n').filter(line => line.trim());
  let successCount = 0;
  let skipCount = 0;
  
  lines.forEach(line => {
    let name = line.trim();
    if (!name) { skipCount++; return; }
    
    // Nếu có dấu "|" → lấy phần đầu
    if (name.includes('|')) {
      name = name.split('|')[0].trim();
    }
    
    if (!name) { skipCount++; return; }
    
    // Kiểm tra trùng
    const isDuplicate = tempChildrenList.some(c => 
      c.full_name.toLowerCase() === name.toLowerCase()
    );
    if (isDuplicate) { skipCount++; return; }
    
    // Tự đoán giới tính từ tên
    let gender = 'Nam';
    if (name.includes('Thị') || name.includes('thị')) gender = 'Nữ';
    
    tempChildrenList.push({
      temp_id: 'temp_' + Date.now() + '_' + Math.random(),
      full_name: name,
      gender: gender,
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
   7. THÔNG TIN LIÊN HỆ
   ============================================ */
function addContactRow() {
  const list = document.getElementById('contactList');
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
    if (name && value) {
      contacts.push({ name: name, value: value });
    }
  });
  return contacts.length > 0 ? contacts : null;
}

/* ============================================
   8. LƯU THÔNG TIN
   ============================================ */
async function savePerson() {
  console.log('💾 Bắt đầu lưu...');
  
  const fullName = document.getElementById('fullName').value.trim();
  const gender = document.getElementById('gender').value;
  
  if (!fullName) {
    alert('⚠️ Vui lòng nhập Họ và tên');
    document.getElementById('fullName').focus();
    return;
  }
  
  if (!gender) {
    alert('⚠️ Vui lòng chọn Giới tính');
    document.getElementById('gender').focus();
    return;
  }
  
  if (!window.sbClient) {
    alert('⚠️ Chưa kết nối Supabase');
    return;
  }
  
  const user = await window.sbClient.auth.getUser();
  if (!user.data.user) {
    alert('⚠️ Bạn cần đăng nhập trước khi lưu');
    return;
  }
  
  // ✅ FIX: role chỉ có 2 giá trị hợp lệ
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
    
    // Bố
    const fatherId = document.getElementById('fatherId').value;
    if (fatherId) await createParentChildLink(fatherId, personId, 'Bố');
    
    // Mẹ
    const motherId = document.getElementById('motherId').value;
    if (motherId) await createParentChildLink(motherId, personId, 'Mẹ');
    
    // Vợ/chồng (có thể nhiều)
    const spouseRows = getSpouseRowsData();
    for (const sp of spouseRows) {
      await createMarriageLink(personId, sp.personId, personData.gender, sp.order);
    }
    
    // Con
    if (tempChildrenList.length > 0) {
      const primarySpouseId = spouseRows.length > 0 ? spouseRows[0].personId : null;
      for (const child of tempChildrenList) {
        await createChildWithAutoCreate(personId, personData.generation, child, primarySpouseId);
      }
    }
    
    alert('✅ Đã lưu thành công!');
    closePersonFormNoConfirm();
    
    if (typeof loadAllData === 'function') {
      await loadAllData();
    }
    
  } catch (err) {
    console.error('❌ Lỗi lưu:', err);
    alert('❌ Lỗi: ' + err.message);
  }
}

/* ============================================
   9. TẠO LIÊN KẾT QUAN HỆ
   ============================================ */
async function createParentChildLink(parentId, childId, parentRole) {
  const { data: existing } = await window.sbClient
    .from('parent_child')
    .select('id')
    .eq('parent_id', parentId)
    .eq('child_id', childId)
    .maybeSingle();
  
  if (existing) return;
  
  const { error } = await window.sbClient
    .from('parent_child')
    .insert({
      parent_id: parentId,
      child_id: childId,
      parent_role: parentRole,
      relation: 'Con chung',
      child_type: 'Con chung',
      is_family_member: true
    });
  
  if (error) throw error;
}

async function createMarriageLink(personId, spouseId, gender, order) {
  const husbandId = gender === 'Nam' ? personId : spouseId;
  const wifeId = gender === 'Nam' ? spouseId : personId;
  
  const { data: existing } = await window.sbClient
    .from('marriages')
    .select('id')
    .eq('husband_id', husbandId)
    .eq('wife_id', wifeId)
    .maybeSingle();
  
  if (existing) return;
  
  let status = 'Chính thất';
  if (order === 2) status = 'Kế thất';
  else if (order >= 3) status = 'Thứ thất';
  
  const { error } = await window.sbClient
    .from('marriages')
    .insert({
      husband_id: husbandId,
      wife_id: wifeId,
      status: status
    });
  
  if (error) throw error;
}

async function createChildWithAutoCreate(parentId, parentGeneration, childData, spouseId) {
  try {
    // ✅ FIX: role = 'Huyết thống'
    const childRecord = {
      full_name: childData.full_name,
      gender: childData.gender,
      generation: parentGeneration + 1,
      birth_year: childData.birth_year,
      sibling_order: childData.sibling_order,
      role: 'Huyết thống',
      role_type: 'Huyết thống',
      special_status: 'Bình thường'
    };
    
    const { data: newChild, error: childError } = await window.sbClient
      .from('persons')
      .insert(childRecord)
      .select()
      .single();
    
    if (childError) throw childError;
    console.log('✅ Đã tạo con:', newChild.full_name);
    
    const { data: parent } = await window.sbClient
      .from('persons')
      .select('gender')
      .eq('id', parentId)
      .single();
    
    const parentRole = parent.gender === 'Nam' ? 'Bố' : 'Mẹ';
    const isFamilyMember = ['Con chung', 'Con riêng', 'Con ngoài giá thú', 'Con nuôi'].includes(childData.child_type);
    
    await window.sbClient.from('parent_child').insert({
      parent_id: parentId,
      child_id: newChild.id,
      parent_role: parentRole,
      relation: childData.child_type,
      child_type: childData.child_type,
      is_family_member: isFamilyMember
    });
    
    // Nếu là Con chung → tạo luôn liên kết với vợ/chồng
    if (childData.child_type === 'Con chung' && spouseId) {
      const { data: spouse } = await window.sbClient
        .from('persons')
        .select('gender')
        .eq('id', spouseId)
        .single();
      
      if (spouse) {
        const spouseRole = spouse.gender === 'Nam' ? 'Bố' : 'Mẹ';
        await window.sbClient.from('parent_child').insert({
          parent_id: spouseId,
          child_id: newChild.id,
          parent_role: spouseRole,
          relation: 'Con chung',
          child_type: 'Con chung',
          is_family_member: true
        });
      }
    }
    
  } catch (err) {
    console.error('Lỗi tạo con:', err);
    throw err;
  }
}

/* ============================================
   10. LOAD DỮ LIỆU ĐỂ SỬA
   ============================================ */
async function loadPersonForEdit(personId) {
  try {
    const { data: person, error } = await window.sbClient
      .from('persons')
      .select('*')
      .eq('id', personId)
      .single();
    
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
    
    if (person.avatar_url) {
      tempAvatarData = person.avatar_url;
      document.getElementById('avatarPreview').innerHTML = 
        '<img src="' + person.avatar_url + '" alt="Avatar">';
    }
    
    if (person.contact_info && Array.isArray(person.contact_info)) {
      const list = document.getElementById('contactList');
      list.innerHTML = '';
      person.contact_info.forEach(c => {
        const row = document.createElement('div');
        row.className = 'contact-row';
        row.innerHTML = 
          '<input type="text" value="' + c.name + '" class="contact-name">' +
          '<input type="text" value="' + c.value + '" class="contact-value">' +
          '<button type="button" class="contact-row__remove" onclick="this.parentElement.remove()">×</button>';
        list.appendChild(row);
      });
    }
    
    // Load vợ/chồng hiện có
    document.getElementById('spouseRows').innerHTML = '';
    spouseRowCounter = 0;
    const { data: marriages } = await window.sbClient
      .from('marriages')
      .select('*')
      .or('husband_id.eq.' + personId + ',wife_id.eq.' + personId);
    
    if (marriages && marriages.length > 0) {
      marriages.forEach(m => {
        const spouseId = m.husband_id === personId ? m.wife_id : m.husband_id;
        spouseRowCounter++;
        const container = document.getElementById('spouseRows');
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
        row.querySelector('.spouse-select').value = spouseId;
      });
    } else {
      addSpouseRow();
    }
    
  } catch (err) {
    console.error('Lỗi load person:', err);
    alert('❌ Không load được dữ liệu: ' + err.message);
  }
}

console.log('📝 Form.js v1.2 loaded - Crop + Spouse + QuickAdd');