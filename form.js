/* ============================================================
   form.js v6.0 — Bản nâng cấp (Thêm nút sắp xếp Vợ/Chồng & Xoá con)
   ============================================================ */
(function () {
  'use strict';
  const LOG = '[Form]';
  console.log(LOG, '⭐ v6.0 loaded');

  // ============ STATE ============
  let sb;
  let currentEditingPersonId = null;
  let currentViewMode = 'view';
  let tempAvatarData = null;
  let currentEditingAvatarPath = null;
  let tempOriginalPerson = null;
  let allPersonsCache = [];
  let cropperInstance = null;
  let tempLinkedNoteIds = [];
  let tempContactInfo = {};

  // ============ UTILS ============
  function $(id) { return document.getElementById(id); }

  function escHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function normalize(s) {
    return (s || '').toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D');
  }

  function normName(s) {
    return normalize(s).trim().replace(/\s+/g, ' ');
  }

  function getSupabase() { return window.appSupabase || window.sbClient; }

  function capitalizeName(name) {
    if (!name) return '';
    return name.toLowerCase().split(' ')
      .filter(w => w.length > 0)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  // ============ CHECK TRÙNG TÊN ============
  async function checkDuplicateName(name, excludeId) {
    excludeId = excludeId || null;
    const target = normName(name);
    if (!target) return [];
    const s = getSupabase();
    if (!s) return [];
    try {
      const { data, error } = await s
        .from('persons')
        .select('id, full_name, gender, generation, branch, role_type')
        .eq('is_deleted', false);
      if (error) throw error;
      return (data || []).filter(p => {
        if (excludeId && p.id === excludeId) return false;
        return normName(p.full_name) === target;
      });
    } catch (e) {
      console.error(LOG, 'checkDuplicateName error:', e);
      return [];
    }
  }

  function showDuplicateWarning(name, matches) {
    const list = matches.map(m =>
      '• ' + m.full_name +
      ' (Đời ' + (m.generation || '?') +
      (m.branch ? ' - ' + m.branch : '') +
      (m.role_type ? ' - ' + m.role_type : '') + ')'
    ).join('\n');
    const msg =
      '⚠️ Đã có ' + matches.length + ' người trùng tên (không dấu, không phân biệt hoa thường):\n\n' +
      list + '\n\n' +
      'OK = Dùng người cũ (không tạo mới)\n' +
      'Cancel = Quay lại sửa tên';
    return window.confirm(msg) ? 'use-old' : 'cancel';
  }

  // ============ MODAL HELPERS ============
  function showModal(el) {
    if (!el) return;
    el.classList.add('is-visible');
    el.style.display = 'flex';
  }
  function hideModal(el) {
    if (!el) return;
    el.classList.remove('is-visible');
    el.style.display = 'none';
  }

  // ============ OPEN / CLOSE PERSON FORM ============
  window.openPersonForm = function (personId) {
    console.log(LOG, 'openPersonForm', personId || '(new)');
    sb = getSupabase();
    currentEditingPersonId = personId || null;
    tempAvatarData = null;
    currentEditingAvatarPath = null;
    tempOriginalPerson = null;
    tempLinkedNoteIds = [];
    tempContactInfo = {};

    const title = $('formTitle');
    if (personId) {
      if (title) title.textContent = 'THÔNG TIN CÁ NHÂN';
      currentViewMode = 'view';
      showViewMode(personId);
    } else {
      if (title) title.textContent = 'THÊM CÁ NHÂN MỚI';
      currentViewMode = 'edit';
      resetForm();
      showEditMode();
      autofillCreatedByName();
    }
    showModal($('personFormModal'));
  };

  window.closePersonForm = function () {
    hideModal($('personFormModal'));
    currentEditingPersonId = null;
    tempAvatarData = null;
  };

  // ============ RESET FORM ============
  function resetForm() {
    const fieldIds = ['fullName', 'gender', 'generation', 'branch', 'siblingOrder',
      'birthPlace', 'birthYear', 'deathYear', 'specialStatus', 'occupation',
      'bio', 'conflictNote', 'createdByName'];
    fieldIds.forEach(id => { const el = $(id); if (el) el.value = ''; });

    ['fatherSearch', 'motherSearch', 'fatherId', 'motherId'].forEach(id => {
      const el = $(id); if (el) el.value = '';
    });

    const roleType = $('roleType'); if (roleType) roleType.value = 'Huyết thống';
    const spouseRows = $('spouseRows'); if (spouseRows) spouseRows.innerHTML = '';
    const childrenList = $('childrenList');
    if (childrenList) childrenList.innerHTML = '<p class="empty-hint">Chưa có con nào.</p>';
    const contactList = $('contactList'); if (contactList) contactList.innerHTML = '';
    const linkedNotes = $('linkedNotesList');
    if (linkedNotes) linkedNotes.innerHTML = '<p class="empty-hint">Chưa có bài viết liên kết.</p>';

    renderAvatarPreview();
  }

  function autofillCreatedByName() {
    const el = $('createdByName');
    if (!el) return;
    try {
      const session = JSON.parse(localStorage.getItem('sb-session') || '{}');
      el.value = (session && session.user && session.user.email) || 'hsnampham@gmail.com';
    } catch (e) {
      el.value = 'hsnampham@gmail.com';
    }
  }

  // ============ VIEW MODE ============
  async function showViewMode(personId) {
    try {
      sb = getSupabase();
      const viewBody = $('personViewBody');
      const editBody = $('personEditBody');
      if (viewBody) viewBody.style.display = 'block';
      if (editBody) editBody.style.display = 'none';

      const { data: person, error } = await sb.from('persons').select('*').eq('id', personId).single();
      if (error) throw error;
      tempOriginalPerson = person;
      currentEditingAvatarPath = person.avatar_url || null;

      const { data: marr } = await sb.from('marriages')
        .select('*')
        .or('husband_id.eq.' + personId + ',wife_id.eq.' + personId);
      const spouseIds = (marr || []).map(m => m.husband_id === personId ? m.wife_id : m.husband_id);
      let spouseNames = [];
      if (spouseIds.length) {
        const { data: sps } = await sb.from('persons').select('id, full_name').in('id', spouseIds);
        spouseNames = (sps || []).map(s => s.full_name);
      }

      const { data: pc } = await sb.from('parent_child').select('*').eq('child_id', personId);
      let fatherName = '', motherName = '';
      if (pc && pc.length) {
        const parentIds = pc.map(p => p.parent_id);
        const { data: parents } = await sb.from('persons').select('id, full_name, generation').in('id', parentIds);
        pc.forEach(p => {
          const par = (parents || []).find(x => x.id === p.parent_id);
          if (!par) return;
          if (p.parent_role === 'Bố') fatherName = par.full_name + ' (Đời ' + par.generation + ')';
          else if (p.parent_role === 'Mẹ') motherName = par.full_name + ' (Đời ' + par.generation + ')';
        });
      }

      const { data: myKids } = await sb.from('parent_child').select('*').eq('parent_id', personId);
      let kidsList = [];
      if (myKids && myKids.length) {
        const kidIds = myKids.map(k => k.child_id);
        const { data: kids } = await sb.from('persons')
          .select('id, full_name, generation, gender, birth_order, sibling_order')
          .in('id', kidIds);
        kidsList = (kids || []).sort((a, b) => {
          const ao = a.birth_order != null ? a.birth_order : (a.sibling_order != null ? a.sibling_order : 9999);
          const bo = b.birth_order != null ? b.birth_order : (b.sibling_order != null ? b.sibling_order : 9999);
          return ao - bo;
        });
      }

      renderPersonView(person, spouseNames, fatherName, motherName, kidsList);
      renderFooter('view');
    } catch (err) {
      console.error(LOG, 'showViewMode error', err);
      const viewBody = $('personViewBody');
      if (viewBody) viewBody.innerHTML = '<p class="person-view__empty">Lỗi: ' + escHtml(err.message) + '</p>';
    }
  }

  function renderPersonView(person, spouseNames, fatherName, motherName, kidsList) {
    const container = $('personViewContent');
    if (!container) return;

    const yearsParts = [];
    if (person.birth_year) yearsParts.push(person.birth_year);
    if (person.death_year) yearsParts.push(person.death_year);
    const years = yearsParts.join(' – ');

    const avatarHtml = person.avatar_url
      ? '<img src="' + escHtml(person.avatar_url) + '" class="person-view__avatar" alt="avatar">'
      : '<div class="person-view__avatar person-view__avatar--empty">' + escHtml((person.full_name || '?').charAt(0)) + '</div>';

    const nameClass = (person.birth_year && person.death_year)
      ? 'person-view__name person-view__name--full-dates'
      : 'person-view__name';

    let kidsHtml = '';
    if (kidsList.length) {
      kidsHtml = '<div class="person-view__row"><b>Con:</b>' +
        '<div class="person-view__children-list">' +
        kidsList.map(k =>
          '<span class="person-view__child-item">' +
          '<a href="#" class="person-view__child-link" onclick="event.preventDefault(); if(window.openPersonForm) window.openPersonForm(\'' + escHtml(k.id) + '\');">' + escHtml(k.full_name) + '</a>' +
          '<button type="button" class="person-view__child-remove" title="Xoá con khỏi danh sách" onclick="event.preventDefault(); window.removeChildLink(\'' + escHtml(k.id) + '\', \'' + escHtml(person.id) + '\')">🗑️</button>' +
          '</span>'
        ).join('') +
        '</div></div>';
    }

    container.innerHTML =
      '<div class="person-view">' +
        avatarHtml +
        '<h2 class="' + nameClass + '">' + escHtml(person.full_name || '') + '</h2>' +
        '<p class="person-view__meta">' +
          (years ? '📅 ' + escHtml(years) + ' • ' : '') +
          'Đời ' + (person.generation || '?') +
          (person.gender ? ' • ' + escHtml(person.gender) : '') +
          (person.branch ? ' • ' + escHtml(person.branch) : '') +
        '</p>' +
        (fatherName ? '<p class="person-view__row"><b>Bố:</b> ' + escHtml(fatherName) + '</p>' : '') +
        (motherName ? '<p class="person-view__row"><b>Mẹ:</b> ' + escHtml(motherName) + '</p>' : '') +
        (spouseNames.length ? '<p class="person-view__row"><b>' + (person.gender === 'Nam' ? 'Vợ' : 'Chồng') + ':</b> ' + escHtml(spouseNames.join(', ')) + '</p>' : '') +
        kidsHtml +
        (person.hometown ? '<p class="person-view__row"><b>Quê:</b> ' + escHtml(person.hometown) + '</p>' : '') +
        (person.occupation ? '<p class="person-view__row"><b>Nghề:</b> ' + escHtml(person.occupation) + '</p>' : '') +
        (person.bio ? '<p class="person-view__row"><b>Tiểu sử:</b> ' + escHtml(person.bio) + '</p>' : '') +
      '</div>';
  }

  // ============ EDIT MODE ============
  function showEditMode() {
    const viewBody = $('personViewBody');
    const editBody = $('personEditBody');
    if (viewBody) viewBody.style.display = 'none';
    if (editBody) editBody.style.display = 'block';
    loadPersonEditFields();
    initParentAutocomplete();
    renderFooter('edit');
  }

  window.switchToEditMode = function () {
    if (!currentEditingPersonId) return;
    currentViewMode = 'edit';
    showEditMode();
  };

  async function loadPersonEditFields() {
    if (!currentEditingPersonId) return;
    try {
      sb = getSupabase();
      const { data: person } = await sb.from('persons').select('*').eq('id', currentEditingPersonId).single();
      if (!person) return;
      tempOriginalPerson = person;

      const set = (id, val) => { const el = $(id); if (el) el.value = val != null ? val : ''; };
      set('fullName', person.full_name);
      set('gender', person.gender);
      set('generation', person.generation);
      set('branch', person.branch);
      set('birthYear', person.birth_year);
      set('deathYear', person.death_year);
      set('birthPlace', person.birth_place);
      set('occupation', person.occupation);
      set('bio', person.bio);
      set('specialStatus', person.special_status || 'Bình thường');
      set('roleType', person.role_type || 'Huyết thống');
      set('siblingOrder', person.sibling_order);
      set('conflictNote', person.conflict_note);
      currentEditingAvatarPath = person.avatar_url || null;
      renderAvatarPreview();

      // Bố / Mẹ
      const { data: pc } = await sb.from('parent_child').select('*').eq('child_id', currentEditingPersonId);
      if (pc && pc.length) {
        const parentIds = pc.map(p => p.parent_id);
        const { data: parents } = await sb.from('persons').select('id, full_name, generation').in('id', parentIds);
        pc.forEach(p => {
          const par = (parents || []).find(x => x.id === p.parent_id);
          if (!par) return;
          if (p.parent_role === 'Bố') {
            const inp = $('fatherSearch'); const hid = $('fatherId');
            if (inp) inp.value = par.full_name + ' (Đời ' + par.generation + ')';
            if (hid) hid.value = par.id;
          } else if (p.parent_role === 'Mẹ') {
            const inp = $('motherSearch'); const hid = $('motherId');
            if (inp) inp.value = par.full_name + ' (Đời ' + par.generation + ')';
            if (hid) hid.value = par.id;
          }
        });
      }

      // Contact
      tempContactInfo = person.contact_info || {};
      renderContactRows();

      // Notes
      tempLinkedNoteIds = person.linked_note_ids || [];
      renderLinkedNotes();

      // Spouse
      const { data: marr } = await sb.from('marriages')
        .select('*')
        .or('husband_id.eq.' + currentEditingPersonId + ',wife_id.eq.' + currentEditingPersonId)
        .order('marriage_order');
      const spouseRows = $('spouseRows');
      if (spouseRows) spouseRows.innerHTML = '';
      (marr || []).forEach(m => {
        const spId = m.husband_id === currentEditingPersonId ? m.wife_id : m.husband_id;
        addSpouseRow(spId);
      });

      // Children
      await loadChildrenList();
    } catch (e) {
      console.error(LOG, 'loadPersonEditFields', e);
    }
  }

  // ============ FOOTER ============
  function renderFooter(mode) {
    const footer = $('personFormFooter');
    if (!footer) return;

    if (mode === 'view') {
      footer.innerHTML =
        '<div class="form-modal__footer-left">' +
          '<button type="button" class="btn btn--ghost" onclick="closePersonForm()">Đóng</button>' +
        '</div>' +
        '<div class="form-modal__footer-right">' +
          '<button type="button" class="btn btn--danger btn--small" onclick="deletePerson()">🗑️ Xoá</button>' +
          '<button type="button" class="btn btn--primary btn--small" onclick="switchToEditMode()">✏️ Sửa</button>' +
        '</div>';
    } else {
      footer.innerHTML =
        '<div class="form-modal__footer-left">' +
          '<button type="button" class="btn btn--ghost" onclick="closePersonForm()">Hủy</button>' +
        '</div>' +
        '<div class="form-modal__footer-right">' +
          '<button type="button" class="btn btn--primary" onclick="savePerson()">💾 Lưu</button>' +
        '</div>';
    }
  }

  // ============ AVATAR + CROP ============
  function renderAvatarPreview() {
    const preview = $('avatarPreview');
    if (!preview) return;
    if (tempAvatarData) {
      preview.innerHTML = '<img src="' + tempAvatarData + '" alt="preview">';
    } else if (currentEditingAvatarPath) {
      preview.innerHTML = '<img src="' + escHtml(currentEditingAvatarPath) + '" alt="avatar">';
    } else {
      preview.innerHTML = '<span class="avatar-preview__placeholder">📷</span>';
    }
  }

  window.openCropModal = function (event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('Ảnh quá lớn, tối đa 5MB'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const modal = $('cropModal'); const img = $('cropImage');
      if (!modal || !img) return;
      img.src = e.target.result;
      showModal(modal);
      if (cropperInstance) { cropperInstance.destroy(); cropperInstance = null; }
      setTimeout(() => {
        cropperInstance = new Cropper(img, {
          aspectRatio: 3 / 4, viewMode: 1, autoCropArea: 0.9, background: false
        });
      }, 100);
    };
    reader.readAsDataURL(file);
  };

  window.closeCropModal = function () {
    hideModal($('cropModal'));
    if (cropperInstance) { cropperInstance.destroy(); cropperInstance = null; }
    const input = $('avatarInput'); if (input) input.value = '';
  };

  window.rotateCropImage = function (deg) { if (cropperInstance) cropperInstance.rotate(deg); };
  window.flipCropImage = function (dir) {
    if (!cropperInstance) return;
    const data = cropperInstance.getData();
    if (dir === 'h') cropperInstance.scaleX(-(data.scaleX || 1));
    else cropperInstance.scaleY(-(data.scaleY || 1));
  };
  window.resetCropImage = function () { if (cropperInstance) cropperInstance.reset(); };

  window.confirmCrop = function () {
    if (!cropperInstance) return;
    const canvas = cropperInstance.getCroppedCanvas({ width: 300, height: 400, imageSmoothingQuality: 'high' });
    canvas.toBlob(blob => {
      if (!blob) return;
      const reader = new FileReader();
      reader.onload = e => {
        tempAvatarData = e.target.result;
        renderAvatarPreview();
        closeCropModal();
      };
      reader.readAsDataURL(blob);
      window.__tempAvatarBlob = blob;
    }, 'image/webp', 0.9);
  };

  // ============ SPOUSE (NÂNG CẤP: CÓ NÚT LÊN/XUỐNG) ============
  window.addSpouseRow = function () { addSpouseRow(null); };

  function addSpouseRow(preselectId) {
    const container = $('spouseRows');
    if (!container) return;
    const rowId = 'spouse-row-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const row = document.createElement('div');
    row.className = 'spouse-row';
    row.id = rowId;
    row.style.position = 'relative';
    row.style.display = 'grid';
    row.style.gridTemplateColumns = '100px 1fr auto auto'; // 4 cột: Nhãn - Ô nhập - 2 nút mũi tên - Nút xoá
    row.style.gap = '8px';
    row.style.alignItems = 'center';

    // Thêm nút Lên/Xuống
    row.innerHTML =
      '<span class="spouse-row__label">Vợ/Chồng ' + (container.children.length + 1) + ':</span>' +
      '<div style="position:relative;">' +
        '<input type="text" class="form-input spouse-search" placeholder="Gõ tên vợ/chồng để tìm..." autocomplete="off">' +
        '<input type="hidden" class="spouse-id">' +
        '<div class="spouse-dropdown autocomplete-dropdown" style="display:none;"></div>' +
      '</div>' +
      '<div style="display:flex; gap:2px;">' +
         '<button type="button" class="btn btn--small" style="padding: 4px 6px; background:#B8CCE8; color:#01285E;" onclick="moveSpouseRow(\'' + rowId + '\', -1)">⬆️</button>' +
         '<button type="button" class="btn btn--small" style="padding: 4px 6px; background:#B8CCE8; color:#01285E;" onclick="moveSpouseRow(\'' + rowId + '\', 1)">⬇️</button>' +
      '</div>' +
      '<button type="button" class="spouse-row__remove" onclick="removeSpouseRow(\'' + rowId + '\')">×</button>';

    container.appendChild(row);

    const searchInput = row.querySelector('.spouse-search');
    const hiddenInput = row.querySelector('.spouse-id');
    const dropdown = row.querySelector('.spouse-dropdown');

    const afterCache = () => {
      attachSpouseAutocomplete(searchInput, hiddenInput, dropdown);
      if (preselectId) {
        const found = allPersonsCache.find(p => p.id === preselectId);
        if (found) {
          searchInput.value = found.full_name;
          hiddenInput.value = found.id;
        }
      }
    };

    if (!allPersonsCache.length) {
      loadAllPersonsCache().then(afterCache);
    } else {
      afterCache();
    }
  }

  // Hàm di chuyển dòng Lên/Xuống
  window.moveSpouseRow = function (rowId, direction) {
    const row = $(rowId);
    const container = $('spouseRows');
    if (!row || !container) return;

    if (direction === -1 && row.previousElementSibling) {
      container.insertBefore(row, row.previousElementSibling);
    } else if (direction === 1 && row.nextElementSibling) {
      container.insertBefore(row.nextElementSibling, row);
    }
    // Cập nhật lại nhãn
    Array.from(container.querySelectorAll('.spouse-row')).forEach((r, idx) => {
      const lbl = r.querySelector('.spouse-row__label');
      if (lbl) lbl.textContent = 'Vợ/Chồng ' + (idx + 1) + ':';
    });
  };

  function attachSpouseAutocomplete(searchInput, hiddenInput, dropdown) {
    if (!searchInput || !hiddenInput || !dropdown) return;
    if (searchInput.dataset.acBound === '1') return;
    searchInput.dataset.acBound = '1';

    searchInput.addEventListener('input', function () {
      hiddenInput.value = '';
      const q = normalize(searchInput.value.trim());
      if (q.length < 1) { dropdown.style.display = 'none'; return; }
      const matches = allPersonsCache.filter(p => normalize(p.full_name).includes(q)).slice(0, 8);
      renderSpouseDropdown(dropdown, matches, searchInput, hiddenInput);
    });

    searchInput.addEventListener('focus', function () {
      const q = normalize(searchInput.value.trim());
      if (q.length >= 1) {
        const matches = allPersonsCache.filter(p => normalize(p.full_name).includes(q)).slice(0, 8);
        renderSpouseDropdown(dropdown, matches, searchInput, hiddenInput);
      }
    });

    searchInput.addEventListener('blur', function () {
      setTimeout(() => { dropdown.style.display = 'none'; }, 250);
    });
  }

  function renderSpouseDropdown(dropdown, matches, searchInput, hiddenInput) {
    const q = searchInput.value.trim();
    let html = matches.map(p =>
      '<div class="ac-item" data-id="' + escHtml(p.id) + '" data-name="' + escHtml(p.full_name) + '" data-gen="' + p.generation + '">' +
        '<b>' + escHtml(p.full_name) + '</b>' +
        '<span class="ac-gen">Đời ' + (p.generation || '?') + ' • ' + escHtml(p.gender || '') + '</span>' +
      '</div>'
    ).join('');

    if (q) {
      html += '<div class="ac-item ac-item--create" data-create="1">+ Tạo mới "' + escHtml(q) + '"</div>';
    }
    if (!html) html = '<div class="ac-item ac-empty">Không tìm thấy</div>';
    dropdown.innerHTML = html;
    dropdown.style.display = 'block';

    dropdown.querySelectorAll('.ac-item').forEach(item => {
      item.onmousedown = function (evt) {
        evt.preventDefault();
        if (item.dataset.create) {
          const newName = searchInput.value.trim();
          if (!newName) return;
          const personGen = parseInt($('generation') && $('generation').value || '1', 10) || 1;
          createSpouseQuick(newName, personGen).then(newId => {
            if (newId) {
              searchInput.value = capitalizeName(newName);
              hiddenInput.value = newId;
              dropdown.style.display = 'none';
            }
          });
        } else if (item.dataset.id) {
          searchInput.value = item.dataset.name;
          hiddenInput.value = item.dataset.id;
          dropdown.style.display = 'none';
        }
      };
    });
  }

  async function createSpouseQuick(fullName, generation) {
    try {
      sb = getSupabase();
      const gen = generation > 0 ? generation : 1;
      const capitalizedName = capitalizeName(fullName);

      const dups = await checkDuplicateName(capitalizedName);
      if (dups.length > 0) {
        const choice = showDuplicateWarning(capitalizedName, dups);
        if (choice === 'use-old') {
          if (!allPersonsCache.find(p => p.id === dups[0].id)) {
            allPersonsCache.push({ id: dups[0].id, full_name: dups[0].full_name, generation: dups[0].generation, gender: dups[0].gender });
          }
          return dups[0].id;
        }
        return null;
      }

      const isFemale = /thị|nữ|hoa|lan|hương|mai|thu|đào|yến/i.test(capitalizedName);
      const gender = isFemale ? 'Nữ' : 'Nam';
      const payload = { full_name: capitalizedName, gender: gender, generation: gen, role_type: 'Dâu/Rể', special_status: 'Bình thường', is_deleted: false };

      const { data, error } = await sb.from('persons').insert([payload]).select().single();
      if (error) throw error;

      allPersonsCache.push({ id: data.id, full_name: capitalizedName, generation: gen, gender: gender });
      if (typeof window.refreshAll === 'function') await window.refreshAll();
      return data.id;
    } catch (e) {
      console.error(LOG, 'createSpouseQuick error', e);
      alert('Không tạo được vợ/chồng: ' + e.message);
      return null;
    }
  }

  window.removeSpouseRow = function (rowId) {
    const row = $(rowId);
    if (row) row.remove();
    const container = $('spouseRows');
    if (!container) return;
    Array.from(container.querySelectorAll('.spouse-row')).forEach((r, idx) => {
      const lbl = r.querySelector('.spouse-row__label');
      if (lbl) lbl.textContent = 'Vợ/Chồng ' + (idx + 1) + ':';
    });
  };

  // ============ CHILDREN (NÂNG CẤP: XOÁ NGAY TRONG MÀN HÌNH SỬA) ============
  async function loadChildrenList() {
    const container = $('childrenList');
    if (!container) return;
    try {
      const { data: links } = await sb.from('parent_child').select('*').eq('parent_id', currentEditingPersonId);
      if (!links || !links.length) {
        container.innerHTML = '<p class="empty-hint">Chưa có con nào.</p>';
        return;
      }
      const kidIds = links.map(l => l.child_id);
      const { data: kids } = await sb.from('persons')
        .select('id, full_name, birth_year, gender')
        .in('id', kidIds);

      container.innerHTML = (kids || []).map(k =>
        '<div class="child-item" data-id="' + escHtml(k.id) + '" style="display:flex; justify-content:space-between; align-items:center;">' +
          '<span>' + escHtml(k.full_name) + (k.birth_year ? ' (' + k.birth_year + ')' : '') + '</span>' +
          '<button type="button" class="btn btn--danger btn--small" onclick="removeChildLink(\'' + escHtml(k.id) + '\', \'' + currentEditingPersonId + '\')">🗑️ Xoá</button>' +
        '</div>'
      ).join('');
    } catch (e) {
      console.error(LOG, 'loadChildrenList', e);
    }
  }

  window.openAddChildModal = function () {
    showModal($('addChildModal'));
    ['childName', 'childBirthYear', 'childOrder'].forEach(id => {
      const el = $(id); if (el) el.value = '';
    });
  };

  window.closeAddChildModal = function () { hideModal($('addChildModal')); };

  window.confirmAddChild = async function () {
    const childNameEl = $('childName');
    const childName = childNameEl ? childNameEl.value.trim() : '';
    if (!childName) { alert('Nhập tên con'); return; }

    const childDups = await checkDuplicateName(capitalizeName(childName));
    if (childDups.length > 0) {
      const list = childDups.map(m => '• ' + m.full_name + ' (Đời ' + (m.generation || '?') + ')').join('\n');
      const ok = window.confirm('⚠️ Đã có người trùng tên:\n\n' + list + '\n\nVẫn thêm con mới với tên này?');
      if (!ok) return;
    }

    try {
      sb = getSupabase();
      const childBirthYearEl = $('childBirthYear');
      const childGenderEl = $('childGender');
      const generationEl = $('generation');
      const childPayload = {
        full_name: capitalizeName(childName),
        gender: (childGenderEl && childGenderEl.value) || 'Nam',
        birth_year: parseInt((childBirthYearEl && childBirthYearEl.value) || '0', 10) || null,
        generation: (parseInt((generationEl && generationEl.value) || '1', 10) || 1) + 1,
        role_type: 'Huyết thống',
        special_status: 'Bình thường',
        is_deleted: false
      };

      const { data: child, error } = await sb.from('persons').insert([childPayload]).select().single();
      if (error) throw error;

      const genderEl = $('gender');
      const parentGender = (tempOriginalPerson && tempOriginalPerson.gender) || (genderEl && genderEl.value);
      const parentRole = parentGender === 'Nữ' ? 'Mẹ' : 'Bố';

      const childTypeEl = $('childType');
      const childType = (childTypeEl && childTypeEl.value) || 'Con chung';

      const { error: e2 } = await sb.from('parent_child').insert([{
        parent_id: currentEditingPersonId,
        child_id: child.id,
        parent_role: parentRole,
        relation: childType,
        child_type: childType,
        is_family_member: true
      }]);
      if (e2) throw e2;

      closeAddChildModal();
      await loadChildrenList();
      alert('Đã thêm con!');

      if (typeof window.refreshAll === 'function') await window.refreshAll();
    } catch (e) {
      console.error(LOG, 'confirmAddChild', e);
      alert('Lỗi: ' + e.message);
    }
  };

  window.openQuickAddModal = function () {
    showModal($('quickAddModal'));
    const txt = $('quickAddText'); if (txt) txt.value = '';
  };
  window.closeQuickAddModal = function () { hideModal($('quickAddModal')); };

  window.confirmQuickAdd = async function () {
    const rawEl = $('quickAddText');
    const raw = (rawEl && rawEl.value) || '';
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) { alert('Chưa có tên nào'); return; }

    try {
      sb = getSupabase();
      const genderEl = $('gender');
      const parentGender = (tempOriginalPerson && tempOriginalPerson.gender) || (genderEl && genderEl.value);
      const parentRole = parentGender === 'Nữ' ? 'Mẹ' : 'Bố';
      const generationEl = $('generation');
      const gen = (parseInt((generationEl && generationEl.value) || '1', 10) || 1) + 1;

      let added = 0;
      for (let i = 0; i < lines.length; i++) {
        const name = lines[i];
        const gender = /Thị|Nữ/i.test(name) ? 'Nữ' : 'Nam';
        const { data: c, error } = await sb.from('persons').insert([{
          full_name: name, gender: gender, generation: gen, role_type: 'Huyết thống', special_status: 'Bình thường', birth_order: i + 1, is_deleted: false
        }]).select().single();

        if (error) { console.warn(LOG, 'quickAdd fail', name, error); continue; }

        await sb.from('parent_child').insert([{
          parent_id: currentEditingPersonId, child_id: c.id, parent_role: parentRole, relation: 'Con chung', child_type: 'Con chung', is_family_member: true
        }]);
        added++;
      }

      closeQuickAddModal();
      await loadChildrenList();
      alert('Đã thêm ' + added + ' con!');
      if (typeof window.refreshAll === 'function') await window.refreshAll();
    } catch (e) {
      console.error(LOG, 'confirmQuickAdd', e);
      alert('Lỗi: ' + e.message);
    }
  };

  // ============ CONTACT ROWS ============
  window.addContactRow = function () {
    const list = $('contactList');
    if (!list) return;
    const rowId = 'contact-' + Date.now();
    const row = document.createElement('div');
    row.className = 'contact-row';
    row.id = rowId;
    row.innerHTML =
      '<input type="text" class="form-input" placeholder="Nhãn (VD: Zalo)" style="width:40%">' +
      '<input type="text" class="form-input" placeholder="Giá trị" style="width:50%">' +
      '<button type="button" onclick="document.getElementById(\'' + rowId + '\').remove()">×</button>';
    list.appendChild(row);
  };

  function renderContactRows() {
    const list = $('contactList');
    if (!list) return;
    list.innerHTML = '';
    Object.entries(tempContactInfo || {}).forEach(([k, v]) => {
      const rowId = 'contact-' + Date.now() + Math.random();
      const row = document.createElement('div');
      row.className = 'contact-row';
      row.id = rowId;
      row.innerHTML =
        '<input type="text" class="form-input" value="' + escHtml(k) + '" style="width:40%">' +
        '<input type="text" class="form-input" value="' + escHtml(v) + '" style="width:50%">' +
        '<button type="button" onclick="document.getElementById(\'' + rowId + '\').remove()">×</button>';
      list.appendChild(row);
    });
  }

  window.updateCharCount = function (id, max) {
    const el = $(id);
    const counter = $(id + '-counter');
    if (!el || !counter) return;
    const len = el.value.length;
    counter.textContent = len + '/' + max + ' ký tự';
    counter.classList.toggle('char-counter--warning', len > max * 0.85 && len <= max);
    counter.classList.toggle('char-counter--danger', len >= max);
  };

  // ============ LINKED NOTES ============
  window.openLinkNoteModal = function () {
    showModal($('linkNoteModal'));
    loadAvailableNotes();
  };
  window.closeLinkNoteModal = function () { hideModal($('linkNoteModal')); };

  async function loadAvailableNotes() {
    const list = $('availableNotesList');
    if (!list) return;
    try {
      const { data } = await sb.from('notes').select('id, title').limit(50);
      if (!data || !data.length) {
        list.innerHTML = '<p class="empty-hint">Chưa có bài viết nào.</p>';
        return;
      }
      list.innerHTML = data.map(n =>
        '<label class="note-pick-item">' +
          '<input type="checkbox" value="' + escHtml(n.id) + '" ' + (tempLinkedNoteIds.includes(n.id) ? 'checked' : '') + '>' +
          escHtml(n.title) +
        '</label>'
      ).join('');
    } catch (e) { console.error(LOG, 'loadAvailableNotes', e); }
  }

  window.confirmLinkNote = async function () {
    const checks = document.querySelectorAll('#availableNotesList input[type=checkbox]:checked');
    tempLinkedNoteIds = Array.from(checks).map(c => c.value);
    closeLinkNoteModal();
    renderLinkedNotes();
  };

  function renderLinkedNotes() {
    const list = $('linkedNotesList');
    if (!list) return;
    if (!tempLinkedNoteIds.length) {
      list.innerHTML = '<p class="empty-hint">Chưa có bài viết liên kết.</p>';
      return;
    }
    list.innerHTML = tempLinkedNoteIds.map(id =>
      '<div class="linked-note" data-id="' + escHtml(id) + '">📄 ' + escHtml(id.slice(0, 8)) + '...</div>'
    ).join('');
  }

  // ============ AUTOCOMPLETE BỐ / MẸ ============
  function initParentAutocomplete() {
    loadAllPersonsCache().then(() => {
      setupAutocomplete('fatherSearch', 'fatherId', 'fatherDropdown', 'Bố');
      setupAutocomplete('motherSearch', 'motherId', 'motherDropdown', 'Mẹ');
    });
  }

  async function loadAllPersonsCache() {
    try {
      sb = getSupabase();
      const { data } = await sb.from('persons').select('id, full_name, generation, gender').eq('is_deleted', false).order('generation').order('birth_order');
      allPersonsCache = data || [];
    } catch (e) { console.error(LOG, 'loadAllPersonsCache', e); }
  }

  function setupAutocomplete(inputId, hiddenId, dropdownId, role) {
    const input = $(inputId); const hidden = $(hiddenId); const dropdown = $(dropdownId);
    if (!input || !hidden || !dropdown) return;
    if (input.dataset.acBound === '1') return;
    input.dataset.acBound = '1';

    input.addEventListener('input', function () {
      hidden.value = '';
      const q = normalize(input.value.trim());
      if (q.length < 1) { dropdown.style.display = 'none'; return; }
      const matches = allPersonsCache.filter(p => normalize(p.full_name).includes(q)).slice(0, 8);
      renderDropdown(dropdown, matches, input, hidden, role);
    });

    input.addEventListener('focus', function () {
      const q = normalize(input.value.trim());
      if (q.length >= 1) {
        const matches = allPersonsCache.filter(p => normalize(p.full_name).includes(q)).slice(0, 8);
        renderDropdown(dropdown, matches, input, hidden, role);
      }
    });

    input.addEventListener('blur', function () { setTimeout(() => { dropdown.style.display = 'none'; }, 250); });
  }

  function renderDropdown(dropdown, matches, input, hidden, role) {
    const q = input.value.trim();
    let html = matches.map(p =>
      '<div class="ac-item" data-id="' + escHtml(p.id) + '" data-name="' + escHtml(p.full_name) + '" data-gen="' + p.generation + '">' +
        '<b>' + escHtml(p.full_name) + '</b>' +
        '<span class="ac-gen">Đời ' + (p.generation || '?') + ' • ' + escHtml(p.gender || '') + '</span>' +
      '</div>'
    ).join('');

    if (q) html += '<div class="ac-item ac-item--create" data-create="1">+ Tạo mới "' + escHtml(q) + '"</div>';
    if (!html) html = '<div class="ac-item ac-empty">Không tìm thấy</div>';
    dropdown.innerHTML = html;
    dropdown.style.display = 'block';

    dropdown.querySelectorAll('.ac-item').forEach(item => {
      item.onmousedown = function (evt) {
        evt.preventDefault();
        if (item.dataset.create) {
          const newName = input.value.trim();
          if (!newName) return;
          const genEl = $('generation');
          const gen = parseInt((genEl && genEl.value) || '0', 10) - 1;
          createPersonQuick(newName, role, gen).then(newId => {
            if (newId) {
              input.value = newName + ' (Đời ' + gen + ')';
              hidden.value = newId;
              allPersonsCache.push({ id: newId, full_name: newName, generation: gen, gender: role === 'Bố' ? 'Nam' : 'Nữ' });
              dropdown.style.display = 'none';
            }
          });
        } else if (item.dataset.id) {
          input.value = item.dataset.name + ' (Đời ' + item.dataset.gen + ')';
          hidden.value = item.dataset.id;
          dropdown.style.display = 'none';
        }
      };
    });
  }

  async function createPersonQuick(fullName, role, generation) {
    try {
      sb = getSupabase();
      const gen = generation > 0 ? generation : 1;
      const capitalizedName = capitalizeName(fullName);

      const dups = await checkDuplicateName(capitalizedName);
      if (dups.length > 0) {
        const choice = showDuplicateWarning(capitalizedName, dups);
        if (choice === 'use-old') {
          if (!allPersonsCache.find(p => p.id === dups[0].id)) {
            allPersonsCache.push({ id: dups[0].id, full_name: dups[0].full_name, generation: dups[0].generation, gender: dups[0].gender });
          }
          return dups[0].id;
        }
        return null;
      }

      const payload = { full_name: capitalizedName, gender: role === 'Bố' ? 'Nam' : 'Nữ', generation: gen, role_type: 'Huyết thống', special_status: 'Bình thường', is_deleted: false };
      const { data, error } = await sb.from('persons').insert([payload]).select().single();
      if (error) throw error;

      if (typeof window.refreshAll === 'function') await window.refreshAll();
      return data.id;
    } catch (e) { console.error(LOG, 'createPersonQuick', e); alert('Không tạo được: ' + e.message); return null; }
  }

  // ============ SAVE PERSON ============
  window.savePerson = async function () {
    console.log(LOG, 'savePerson');
    try {
      sb = getSupabase();

      const fullNameEl = $('fullName');
      const payload = {
        full_name: capitalizeName(fullNameEl ? fullNameEl.value.trim() : ''),
        gender: ($('gender') && $('gender').value) || null,
        generation: parseInt(($('generation') && $('generation').value) || '0', 10) || null,
        branch: ($('branch') && $('branch').value.trim()) || null,
        sibling_order: parseInt(($('siblingOrder') && $('siblingOrder').value) || '0', 10) || null,
        birth_place: ($('birthPlace') && $('birthPlace').value.trim()) || null,
        birth_year: parseInt(($('birthYear') && $('birthYear').value) || '0', 10) || null,
        death_year: parseInt(($('deathYear') && $('deathYear').value) || '0', 10) || null,
        special_status: ($('specialStatus') && $('specialStatus').value) || 'Bình thường',
        role_type: ($('roleType') && $('roleType').value) || 'Huyết thống',
        occupation: ($('occupation') && $('occupation').value.trim()) || null,
        bio: ($('bio') && $('bio').value.trim()) || null,
        conflict_note: ($('conflictNote') && $('conflictNote').value.trim()) || null,
        is_deleted: false
      };

      if (!payload.full_name) { alert('Vui lòng nhập họ tên'); return; }

      const fatherInput = $('fatherSearch'); const motherInput = $('motherSearch');
      const fatherName = fatherInput ? fatherInput.value.replace(/\s*\(Đời.*\)$/, '').trim() : '';
      const motherName = motherInput ? motherInput.value.replace(/\s*\(Đời.*\)$/, '').trim() : '';
      const selfNorm = normName(payload.full_name);

      if (fatherName && normName(fatherName) === selfNorm) { alert('❌ Bố không được trùng tên với bản thân!'); return; }
      if (motherName && normName(motherName) === selfNorm) { alert('❌ Mẹ không được trùng tên với bản thân!'); return; }
      if (fatherName && motherName && normName(fatherName) === normName(motherName)) { alert('❌ Bố và Mẹ không được trùng tên!'); return; }

      const dups = await checkDuplicateName(payload.full_name, currentEditingPersonId);
      if (dups.length > 0) {
        const list = dups.map(m => '• ' + m.full_name + ' (Đời ' + (m.generation || '?') + ')').join('\n');
        const ok = window.confirm('⚠️ Đã có người trùng tên (không dấu, không phân biệt hoa thường):\n\n' + list + '\n\nVẫn lưu với tên này?');
        if (!ok) return;
      }

      if (window.__tempAvatarBlob) {
        try {
          const fname = 'avatar-' + Date.now() + '.webp';
          const { data: up, error: upErr } = await sb.storage.from('avatars').upload(fname, window.__tempAvatarBlob, { contentType: 'image/webp', upsert: true });
          if (!upErr && up) {
            const { data: pub } = sb.storage.from('avatars').getPublicUrl(fname);
            payload.avatar_url = pub.publicUrl;
          }
          window.__tempAvatarBlob = null;
        } catch (e) { console.warn(LOG, 'upload avatar fail', e); }
      }

      let personId = currentEditingPersonId;
      if (personId) {
        const { error } = await sb.from('persons').update(payload).eq('id', personId);
        if (error) throw error;
      } else {
        const { data, error } = await sb.from('persons').insert([payload]).select().single();
        if (error) throw error;
        personId = data.id;
      }

      await saveParentLinks(personId);
      await saveSpouseLinks(personId); // Lưu thứ tự Vợ/Chồng theo nút Lên/Xuống
      await saveLinkedNotes(personId);
      await saveContactInfo(personId);

      alert('Đã lưu!');
      closePersonForm();
      if (typeof window.refreshAll === 'function') await window.refreshAll();
      else location.reload();
    } catch (e) {
      console.error(LOG, 'savePerson', e);
      alert('Lỗi lưu: ' + e.message);
    }
  };

  async function saveParentLinks(personId) {
    const fatherId = ($('fatherId') && $('fatherId').value) || '';
    const motherId = ($('motherId') && $('motherId').value) || '';

    // Xoá hết link cũ của person này trước khi lưu mới
    const { error: delErr } = await sb.from('parent_child').delete().eq('child_id', personId);
    if (delErr) throw delErr;

    const inserts = [];
    if (fatherId) inserts.push({ parent_id: fatherId, child_id: personId, parent_role: 'Bố', relation: 'Con chung', child_type: 'Con chung', is_family_member: true });
    if (motherId) inserts.push({ parent_id: motherId, child_id: personId, parent_role: 'Mẹ', relation: 'Con chung', child_type: 'Con chung', is_family_member: true });

    if (inserts.length) {
      const { error } = await sb.from('parent_child').insert(inserts);
      if (error) throw error;
    }
  }

  // Lưu thứ tự vợ/chồng theo thứ tự từ trên xuống dưới (đã được sắp xếp bởi nút lên/xuống)
  async function saveSpouseLinks(personId) {
    const rows = document.querySelectorAll('#spouseRows .spouse-row');
    const spouseIds = [];
    rows.forEach(row => {
       const idInput = row.querySelector('.spouse-id');
       if (idInput && idInput.value) spouseIds.push(idInput.value);
    });

    const genderEl = $('gender');
    const gender = (tempOriginalPerson && tempOriginalPerson.gender) || (genderEl && genderEl.value);

    await sb.from('marriages').delete().or('husband_id.eq.' + personId + ',wife_id.eq.' + personId);

    let order = 1;
    for (const spId of spouseIds) {
      const isHusband = gender === 'Nam';
      await sb.from('marriages').insert([{
        husband_id: isHusband ? personId : spId,
        wife_id: isHusband ? spId : personId,
        marriage_order: order++, // Lưu thứ tự 1, 2, 3...
        status: 'Chính thất'
      }]);
    }
  }

  async function saveLinkedNotes(personId) {
    try { await sb.from('persons').update({ linked_note_ids: tempLinkedNoteIds }).eq('id', personId); } catch (e) { console.warn(LOG, 'saveLinkedNotes', e); }
  }

  async function saveContactInfo(personId) {
    try {
      const rows = document.querySelectorAll('#contactList .contact-row');
      const info = {};
      rows.forEach(r => {
        const inputs = r.querySelectorAll('input');
        if (inputs.length >= 2 && inputs[0].value.trim() && inputs[1].value.trim()) info[inputs[0].value.trim()] = inputs[1].value.trim();
      });
      await sb.from('persons').update({ contact_info: info }).eq('id', personId);
    } catch (e) { console.warn(LOG, 'saveContactInfo', e); }
  }

  window.deletePerson = async function () {
    if (!currentEditingPersonId) { alert('Không có người để xoá'); return; }
    const person = tempOriginalPerson;
    const name = (person && person.full_name) || 'người này';

    if (!confirm('⚠️ Bạn chắc chắn muốn XOÁ VĨNH VIỄN "' + name + '"?\n\nHành động này KHÔNG THỂ khôi phục!')) return;
    if (!confirm('⚠️ XÁC NHẬN LẦN CUỐI:\n\nXoá "' + name + '" và TẤT CẢ quan hệ (bố/mẹ, vợ/chồng, con cái)?')) return;

    try {
      sb = getSupabase();
      const pid = currentEditingPersonId;
      await sb.from('parent_child').delete().or('parent_id.eq.' + pid + ',child_id.eq.' + pid);
      await sb.from('marriages').delete().or('husband_id.eq.' + pid + ',wife_id.eq.' + pid);
      const { error } = await sb.from('persons').delete().eq('id', pid);
      if (error) throw error;

      alert('✅ Đã xoá "' + name + '"');
      closePersonForm();
      if (typeof window.refreshAll === 'function') await window.refreshAll();
      else location.reload();
    } catch (e) { console.error(LOG, 'deletePerson error', e); alert('❌ Lỗi xoá: ' + e.message); }
  };

  window.removeChildLink = async function (childId, parentId) {
    if (!childId || !parentId) return;
    const child = allPersonsCache.find(p => p.id === childId) || {};
    const childName = child.full_name || 'người này';

    if (!confirm('🗑️ Xoá "' + childName + '" khỏi danh sách con của người này?\n\n(Lưu ý: chỉ xoá quan hệ bố/mẹ-con, KHÔNG xoá person khỏi hệ thống)')) return;

    try {
      sb = getSupabase();
      const { error } = await sb.from('parent_child').delete().eq('child_id', childId).eq('parent_id', parentId);
      if (error) throw error;

      alert('✅ Đã xoá "' + childName + '" khỏi danh sách con');
      if (currentEditingPersonId) {
        // Nếu đang ở chế độ Edit, load lại danh sách con
        if (currentViewMode === 'edit') await loadChildrenList();
        else showViewMode(currentEditingPersonId);
      }
      if (typeof window.refreshAll === 'function') await window.refreshAll();
    } catch (e) { console.error(LOG, 'removeChildLink error', e); alert('❌ Lỗi: ' + e.message); }
  };

  // ============ EXPOSE ============
  window.resetForm = resetForm;
  window.showViewMode = showViewMode;
  window.showEditMode = showEditMode;

  console.log(LOG, '✓ v6.0 Exports loaded');
})();
