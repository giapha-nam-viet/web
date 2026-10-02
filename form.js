/* ============================================
   FORM LOGIC - GIA PHẢ NAM VIỆT
   File: form.js
   ============================================ */

let currentEditingPersonId = null;
let tempChildrenList = [];
let tempAvatarData = null;

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
    // TODO: Load dữ liệu người cần sửa
    loadPersonForEdit(personId);
  } else {
    title.textContent = 'THÊM CÁ NHÂN MỚI';
    resetForm();
  }
  
  // Populate dropdown Bố/Mẹ/Vợ-chồng
  populateRelationDropdowns();
  
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closePersonForm() {
  if (!confirm('Bạn có chắc muốn hủy? Mọi thay đổi chưa lưu sẽ mất.')) return;
  
  document.getElementById('personFormModal').style.display = 'none';
  document.body.style.overflow = '';
  currentEditingPersonId = null;
  tempChildrenList = [];
  tempAvatarData = null;
}

function resetForm() {
  // Clear tất cả input
  const inputs = ['fullName', 'gender', 'branch', 'siblingOrder', 'birthYear', 
                  'deathYear', 'birthPlace', 'specialStatus', 'occupation', 
                  'conflictNote', 'bio', 'fatherId', 'motherId', 'spouseId', 
                  'spouseOrder', 'roleType', 'generation'];
  
  inputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (el.tagName === 'SELECT') el.selectedIndex = 0;
      else el.value = '';
    }
  });
  
  // Reset avatar
  document.getElementById('avatarPreview').innerHTML = '<span class="avatar-preview__placeholder">📷</span>';
  
  // Reset children
  renderTempChildren();
  
  // Reset contacts
  document.getElementById('contactList').innerHTML = '';
}

/* ============================================
   2. AVATAR UPLOAD
   ============================================ */

function handleAvatarUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  // Validate
  if (!file.type.startsWith('image/')) {
    alert('⚠️ Vui lòng chọn file ảnh (JPG, PNG...)');
    return;
  }
  
  if (file.size > 5 * 1024 * 1024) {
    alert('⚠️ File quá lớn (max 5MB)');
    return;
  }
  
  const reader = new FileReader();
  reader.onload = (e) => {
    tempAvatarData = e.target.result;
    document.getElementById('avatarPreview').innerHTML = 
      '<img src="' + tempAvatarData + '" alt="Avatar">';
    console.log('✅ Đã chọn ảnh');
  };
  reader.readAsDataURL(file);
}

/* ============================================
   3. POPULATE RELATION DROPDOWNS
   ============================================ */

function populateRelationDropdowns() {
  // Lấy danh sách người từ allPersons (đã load trong app.js)
  const persons = window.allPersons || [];
  
  const fatherSelect = document.getElementById('fatherId');
  const motherSelect = document.getElementById('motherId');
  const spouseSelect = document.getElementById('spouseId');
  
  // Bố - chỉ Nam
  const males = persons.filter(p => p.gender === 'Nam' && p.id !== currentEditingPersonId);
  fatherSelect.innerHTML = '<option value="">-- Chọn bố --</option>' +
    males.map(p => '<option value="' + p.id + '">' + p.full_name + ' (Đời ' + p.generation + ')</option>').join('');
  
  // Mẹ - chỉ Nữ
  const females = persons.filter(p => p.gender === 'Nữ' && p.id !== currentEditingPersonId);
  motherSelect.innerHTML = '<option value="">-- Chọn mẹ --</option>' +
    females.map(p => '<option value="' + p.id + '">' + p.full_name + ' (Đời ' + p.generation + ')</option>').join('');
  
  // Vợ/chồng - cả Nam và Nữ
  spouseSelect.innerHTML = '<option value="">-- Chọn vợ/chồng --</option>' +
    persons.filter(p => p.id !== currentEditingPersonId)
      .map(p => '<option value="' + p.id + '">' + p.full_name + ' (Đời ' + p.generation + ')</option>').join('');
}

/* ============================================
   4. QUẢN LÝ CON (TẠM)
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
  console.log('✅ Đã thêm con:', name);
}

function renderTempChildren() {
  const list = document.getElementById('childrenList');
  
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
   5. GÁN NHANH TÊN CÁC CON
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
    alert('⚠️ Vui lòng paste danh sách con');
    return;
  }
  
  const lines = text.split('\n').filter(line => line.trim());
  let successCount = 0;
  let errorCount = 0;
  
  lines.forEach(line => {
    const parts = line.split('|').map(p => p.trim());
    if (parts.length < 2) {
      errorCount++;
      return;
    }
    
    const name = parts[0];
    const birthYear = parts[1] ? parseInt(parts[1]) : null;
    const gender = parts[2] || 'Nam';
    const childType = parts[3] || 'Con chung';
    
    if (!name) {
      errorCount++;
      return;
    }
    
    tempChildrenList.push({
      temp_id: 'temp_' + Date.now() + '_' + Math.random(),
      full_name: name,
      gender: gender,
      birth_year: birthYear,
      sibling_order: tempChildrenList.length + 1,
      child_type: childType
    });
    successCount++;
  });
  
  renderTempChildren();
  closeQuickAddModal();
  
  alert('✅ Đã thêm ' + successCount + ' con' + (errorCount > 0 ? '\n⚠️ ' + errorCount + ' dòng bị lỗi' : ''));
}

/* ============================================
   6. THÔNG TIN LIÊN HỆ (Dynamic)
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
   7. LƯU THÔNG TIN
   ============================================ */

async function savePerson() {
  console.log('💾 Bắt đầu lưu...');
  
  // Validate
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
  
  // Check đăng nhập
  if (!window.sbClient) {
    alert('⚠️ Chưa kết nối Supabase');
    return;
  }
  
  const user = await window.sbClient.auth.getUser();
  if (!user.data.user) {
    alert('⚠️ Bạn cần đăng nhập trước khi lưu');
    return;
  }
  
  // Chuẩn bị dữ liệu
  const personData = {
    full_name: fullName,
    gender: gender,
    role: document.getElementById('roleType').value,
    role_type: document.getElementById('roleType').value,
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
    avatar_url: tempAvatarData,  // TODO: Upload lên Storage sau
    updated_by: user.data.user.id,
    updated_at: new Date().toISOString()
  };
  
  // Nếu là người mất
  if (personData.death_year) {
    personData.is_deceased = true;
  }
  
  // Nếu không rõ thông tin
  if (personData.special_status === 'Không rõ') {
    personData.is_unknown = true;
  }
  
  console.log('📤 Dữ liệu gửi lên:', personData);
  
  try {
    let personId = currentEditingPersonId;
    
    // INSERT hoặc UPDATE
    if (currentEditingPersonId) {
      // Update
      const { error } = await window.sbClient
        .from('persons')
        .update(personData)
        .eq('id', currentEditingPersonId);
      
      if (error) throw error;
      console.log('✅ Đã update person:', currentEditingPersonId);
      
    } else {
      // Insert
      const { data, error } = await window.sbClient
        .from('persons')
        .insert(personData)
        .select()
        .single();
      
      if (error) throw error;
      personId = data.id;
      console.log('✅ Đã insert person:', personId);
    }
    
    // Xử lý BỐ
    const fatherId = document.getElementById('fatherId').value;
    if (fatherId) {
      await createParentChildLink(fatherId, personId, 'Bố');
    }
    
    // Xử lý MẸ
    const motherId = document.getElementById('motherId').value;
    if (motherId) {
      await createParentChildLink(motherId, personId, 'Mẹ');
    }
    
    // Xử lý VỢ/CHỒNG
    const spouseId = document.getElementById('spouseId').value;
    const spouseOrder = document.getElementById('spouseOrder').value;
    if (spouseId) {
      await createMarriageLink(personId, spouseId, personData.gender, spouseOrder);
    }
    
    // Xử lý CON
    if (tempChildrenList.length > 0) {
      console.log('👶 Đang xử lý', tempChildrenList.length, 'con...');
      for (const child of tempChildrenList) {
        await createChildWithAutoCreate(personId, personData.generation, child, spouseId);
      }
    }
    
    alert('✅ Đã lưu thành công!');
    closePersonFormNoConfirm();
    
    // Reload dữ liệu
    if (typeof loadAllData === 'function') {
      await loadAllData();
    }
    
  } catch (err) {
    console.error('❌ Lỗi lưu:', err);
    alert('❌ Lỗi: ' + err.message);
  }
}

/* ============================================
   8. TẠO LIÊN KẾT QUAN HỆ
   ============================================ */

async function createParentChildLink(parentId, childId, parentRole) {
  // Kiểm tra đã tồn tại chưa
  const { data: existing } = await window.sbClient
    .from('parent_child')
    .select('id')
    .eq('parent_id', parentId)
    .eq('child_id', childId)
    .maybeSingle();
  
  if (existing) {
    console.log('ℹ️ Liên kết đã tồn tại');
    return;
  }
  
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
  
  if (error) {
    console.error('Lỗi tạo liên kết parent_child:', error);
    throw error;
  }
  
  console.log('✅ Đã tạo liên kết:', parentRole, '→', childId);
}

async function createMarriageLink(personId, spouseId, gender, spouseOrder) {
  const husbandId = gender === 'Nam' ? personId : spouseId;
  const wifeId = gender === 'Nam' ? spouseId : personId;
  
  // Kiểm tra đã tồn tại chưa
  const { data: existing } = await window.sbClient
    .from('marriages')
    .select('id')
    .eq('husband_id', husbandId)
    .eq('wife_id', wifeId)
    .maybeSingle();
  
  if (existing) {
    console.log('ℹ️ Hôn nhân đã tồn tại');
    return;
  }
  
  let status = 'Chính thất';
  if (spouseOrder === '2') status = 'Kế thất';
  else if (spouseOrder === '3') status = 'Thứ thất';
  
  const { error } = await window.sbClient
    .from('marriages')
    .insert({
      husband_id: husbandId,
      wife_id: wifeId,
      status: status
    });
  
  if (error) {
    console.error('Lỗi tạo hôn nhân:', error);
    throw error;
  }
  
  console.log('✅ Đã tạo hôn nhân:', status);
}

async function createChildWithAutoCreate(parentId, parentGeneration, childData, spouseId) {
  try {
    // 1. Tạo record con
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
    
    // 2. Lấy thông tin người hiện tại (bố hoặc mẹ)
    const { data: parent } = await window.sbClient
      .from('persons')
      .select('gender')
      .eq('id', parentId)
      .single();
    
    const parentRole = parent.gender === 'Nam' ? 'Bố' : 'Mẹ';
    
    // 3. Tạo liên kết parent → child
    const isFamilyMember = ['Con chung', 'Con riêng', 'Con ngoài giá thú', 'Con nuôi'].includes(childData.child_type);
    
    await window.sbClient.from('parent_child').insert({
      parent_id: parentId,
      child_id: newChild.id,
      parent_role: parentRole,
      relation: childData.child_type,
      child_type: childData.child_type,
      is_family_member: isFamilyMember
    });
    
    // 4. Nếu là Con chung → tạo luôn liên kết với vợ/chồng
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
        console.log('✅ Đã tạo liên kết với vợ/chồng');
      }
    }
    
  } catch (err) {
    console.error('Lỗi tạo con:', err);
    throw err;
  }
}

/* ============================================
   9. LOAD DỮ LIỆU ĐỂ SỬA
   ============================================ */

async function loadPersonForEdit(personId) {
  console.log('📥 Đang load person:', personId);
  
  try {
    const { data: person, error } = await window.sbClient
      .from('persons')
      .select('*')
      .eq('id', personId)
      .single();
    
    if (error) throw error;
    
    // Fill dữ liệu
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
    
    // Avatar
    if (person.avatar_url) {
      tempAvatarData = person.avatar_url;
      document.getElementById('avatarPreview').innerHTML = 
        '<img src="' + person.avatar_url + '" alt="Avatar">';
    }
    
    // Contact info
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
    
    console.log('✅ Đã load person');
    
  } catch (err) {
    console.error('Lỗi load person:', err);
    alert('❌ Không load được dữ liệu: ' + err.message);
  }
}

/* ============================================
   10. HELPER
   ============================================ */

function closePersonFormNoConfirm() {
  document.getElementById('personFormModal').style.display = 'none';
  document.body.style.overflow = '';
  currentEditingPersonId = null;
  tempChildrenList = [];
  tempAvatarData = null;
}

console.log('📝 Form.js loaded');