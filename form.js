/* ============================================================
   form.js v5.0 — Khớp 100% ID trong index.html
   - Autocomplete Bố/Mẹ (thay select fatherId/motherId)
   - Form: fullName, gender, generation, branch, birthYear...
   - Avatar crop với cropper.js
   - Spouse rows, Add child modal, Quick add modal
   - Contact rows, Char counter, Linked notes
   - Đồng bộ schema: parent_child (parent_role = 'Bố'/'Mẹ')
   ============================================================ */
(function () {
  'use strict';
  const LOG = '[Form]';
  console.log(LOG, 'v5.0 loaded');

  // ---------- STATE ----------
  let sb;
  let currentEditingPersonId = null;
  let currentViewMode = 'view';
  let tempAvatarData = null;          // base64 ảnh sau crop
  let currentEditingAvatarPath = null;// URL ảnh hiện tại
  let tempOriginalPerson = null;
  let allPersonsCache = [];           // cache autocomplete
  let cropperInstance = null;         // cropper.js
  let tempLinkedNoteIds = [];         // id bài viết liên kết
  let tempContactInfo = {};           // {label: value}

  // ---------- HELPERS ----------
  function $(id) { return document.getElementById(id); }
  function escHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function normalize(s) {
    return (s || '').toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
  }
  function getSupabase() { return window.appSupabase || window.sbClient; }

  // ============================================================
  // OPEN / CLOSE MODAL
  // ============================================================
  window.openPersonForm = function (personId) {
    console.log(LOG, 'openPersonForm', personId);
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

    const modal = $('personFormModal');
    if (modal) modal.style.display = 'flex';
  };

  window.closePersonForm = function () {
    const modal = $('personFormModal');
    if (modal) modal.style.display = 'none';
    currentEditingPersonId = null;
    tempAvatarData = null;
  };

  // ============================================================
  // RESET FORM
  // ============================================================
  function resetForm() {
    const fieldIds = [
      'fullName', 'gender', 'generation', 'branch', 'siblingOrder',
      'birthPlace', 'birthYear', 'deathYear', 'specialStatus',
      'occupation', 'bio', 'conflictNote', 'createdByName'
    ];
    fieldIds.forEach(id => { const el = $(id); if (el) el.value = ''; });
    const fatherSearch = $('fatherSearch'); if (fatherSearch) fatherSearch.value = '';
    const motherSearch = $('motherSearch'); if (motherSearch) motherSearch.value = '';
    const fatherId = $('fatherId'); if (fatherId) fatherId.value = '';
    const motherId = $('motherId'); if (motherId) motherId.value = '';
    const roleType = $('roleType'); if (roleType) roleType.value = 'Huyết thống';

    const spouseRows = $('spouseRows'); if (spouseRows) spouseRows.innerHTML = '';
    const childrenList = $('childrenList'); if (childrenList) childrenList.innerHTML = '<p class="empty-hint">Chưa có con nào.</p>';
    const contactList = $('contactList'); if (contactList) contactList.innerHTML = '';
    const linkedNotes = $('linkedNotesList'); if (linkedNotes) linkedNotes.innerHTML = '<p class="empty-hint">Chưa có bài viết liên kết.</p>';

    renderAvatarPreview();
  }

  function autofillCreatedByName() {
    const el = $('createdByName');
    if (!el) return;
    try {
      const session = JSON.parse(localStorage.getItem('sb-session') || '{}');
      el.value = session?.user?.email || 'hsnampham@gmail.com';
    } catch (e) { el.value = 'hsnampham@gmail.com'; }
  }

  // ============================================================
  // SHOW VIEW MODE
  // ============================================================
  async function showViewMode(personId) {
    try {
      sb = getSupabase();
      const viewBody = $('personViewBody');
      const editBody = $('personEditBody');
      if (viewBody) viewBody.style.display = 'block';
      if (editBody) editBody.style.display = 'none';

      const { data: person, error } = await sb.from('persons')
        .select('*').eq('id', personId).single();
      if (error) throw error;
      tempOriginalPerson = person;
      currentEditingAvatarPath = person.avatar_url || null;

      // Spouses
      const { data: marr } = await sb.from('marriages')
        .select('*').or(`husband_id.eq.${personId},wife_id.eq.${personId}`);
      const spouseIds = (marr || []).map(m => m.husband_id === personId ? m.wife_id : m.husband_id);
      let spouseNames = [];
      if (spouseIds.length) {
        const { data: sps } = await sb.from('persons')
          .select('id, full_name').in('id', spouseIds);
        spouseNames = (sps || []).map(s => s.full_name);
      }

      // Parents
      const { data: pc } = await sb.from('parent_child')
        .select('*').eq('child_id', personId);
      let fatherName = '', motherName = '';
      if (pc && pc.length) {
        const parentIds = pc.map(p => p.parent_id);
        const { data: parents } = await sb.from('persons')
          .select('id, full_name, generation').in('id', parentIds);
        pc.forEach(p => {
          const par = (parents || []).find(x => x.id === p.parent_id);
          if (!par) return;
          if (p.parent_role === 'Bố') fatherName = par.full_name + ' (Đời ' + par.generation + ')';
          else if (p.parent_role === 'Mẹ') motherName = par.full_name + ' (Đời ' + par.generation + ')';
        });
      }

      // Children
      const { data: myKids } = await sb.from('parent_child')
        .select('*').eq('parent_id', personId);
      let kidsList = [];
      if (myKids && myKids.length) {
        const kidIds = myKids.map(k => k.child_id);
        const { data: kids } = await sb.from('persons')
          .select('id, full_name, generation, gender').in('id', kidIds);
        kidsList = kids || [];
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
      ? `<img src="${escHtml(person.avatar_url)}" class="person-view__avatar" alt="avatar">`
      : `<div class="person-view__avatar person-view__avatar--empty">${escHtml((person.full_name || '?').charAt(0))}</div>`;

    const nameClass = (person.birth_year && person.death_year)
      ? 'person-view__name person-view__name--full-dates' : 'person-view__name';

    container.innerHTML = `
      <div class="person-view">
        ${avatarHtml}
        <h2 class="${nameClass}">${escHtml(person.full_name || '')}</h2>
        <p class="person-view__meta">
          ${years ? '📅 ' + escHtml(years) + ' • ' : ''}
          Đời ${person.generation || '?'}
          ${person.gender ? ' • ' + escHtml(person.gender) : ''}
          ${person.branch ? ' • ' + escHtml(person.branch) : ''}
        </p>
        ${fatherName ? `<p class="person-view__row"><b>Bố:</b> ${escHtml(fatherName)}</p>` : ''}
        ${motherName ? `<p class="person-view__row"><b>Mẹ:</b> ${escHtml(motherName)}</p>` : ''}
        ${spouseNames.length ? `<p class="person-view__row"><b>Vợ/Chồng:</b> ${escHtml(spouseNames.join(', '))}</p>` : ''}
        ${kidsList.length ? `<p class="person-view__row"><b>Con:</b> ${escHtml(kidsList.map(k => k.full_name).join(', '))}</p>` : ''}
        ${person.hometown ? `<p class="person-view__row"><b>Quê:</b> ${escHtml(person.hometown)}</p>` : ''}
        ${person.occupation ? `<p class="person-view__row"><b>Nghề:</b> ${escHtml(person.occupation)}</p>` : ''}
        ${person.bio ? `<p class="person-view__row"><b>Tiểu sử:</b> ${escHtml(person.bio)}</p>` : ''}
      </div>
    `;
  }

  // ============================================================
  // EDIT MODE
  // ============================================================
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
      const { data: person } = await sb.from('persons')
        .select('*').eq('id', currentEditingPersonId).single();
      if (!person) return;
      tempOriginalPerson = person;
      const set = (id, val) => { const el = $(id); if (el) el.value = val ?? ''; };
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

      // Load parents → điền vào autocomplete
      const { data: pc } = await sb.from('parent_child')
        .select('*').eq('child_id', currentEditingPersonId);
      if (pc && pc.length) {
        const parentIds = pc.map(p => p.parent_id);
        const { data: parents } = await sb.from('persons')
          .select('id, full_name, generation').in('id', parentIds);
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

      // Contact info
      tempContactInfo = person.contact_info || {};
      renderContactRows();

      // Linked notes
      tempLinkedNoteIds = person.linked_note_ids || [];
      renderLinkedNotes();

      // Spouses (load marriages)
      const { data: marr } = await sb.from('marriages')
        .select('*').or(`husband_id.eq.${currentEditingPersonId},wife_id.eq.${currentEditingPersonId}`)
        .order('marriage_order');
      const spouseRows = $('spouseRows');
      if (spouseRows) spouseRows.innerHTML = '';
      (marr || []).forEach(m => {
        const spId = m.husband_id === currentEditingPersonId ? m.wife_id : m.husband_id;
        addSpouseRowWithId(spId);
      });

      // Children
      await loadChildrenList();
    } catch (e) { console.error(LOG, 'loadPersonEditFields', e); }
  }

  // ============================================================
  // FOOTER (động theo mode)
  // ============================================================
  function renderFooter(mode) {
    const footer = $('personFormFooter');
    if (!footer) return;
    if (mode === 'view') {
      footer.innerHTML = `
        <div class="form-modal__footer-left">
          <button type="button" class="btn btn--ghost" onclick="closePersonForm()">Đóng</button>
        </div>
        <div class="form-modal__footer-right">
          <button type="button" class="btn btn--ghost" onclick="switchToEditMode()">✏️ Sửa</button>
        </div>`;
    } else {
      footer.innerHTML = `
        <div class="form-modal__footer-left">
          <button type="button" class="btn btn--ghost" onclick="closePersonForm()">Hủy</button>
        </div>
        <div class="form-modal__footer-right">
          <button type="button" class="btn btn--primary" onclick="savePerson()">💾 Lưu</button>
        </div>`;
    }
  }

  // ============================================================
  // AVATAR + CROP
  // ============================================================
  function renderAvatarPreview() {
    const preview = $('avatarPreview');
    if (!preview) return;
    if (tempAvatarData) {
      preview.innerHTML = `<img src="${tempAvatarData}" alt="preview">`;
    } else if (currentEditingAvatarPath) {
      preview.innerHTML = `<img src="${escHtml(currentEditingAvatarPath)}" alt="avatar">`;
    } else {
      preview.innerHTML = `<span class="avatar-preview__placeholder">📷</span>`;
    }
  }

  window.openCropModal = function (event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('Ảnh quá lớn, tối đa 5MB'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const modal = $('cropModal');
      const img = $('cropImage');
      if (!modal || !img) return;
      img.src = e.target.result;
      modal.style.display = 'flex';
      // Destroy cũ
      if (cropperInstance) { cropperInstance.destroy(); cropperInstance = null; }
      // Init cropper 3:4
      setTimeout(() => {
        cropperInstance = new Cropper(img, {
          aspectRatio: 3 / 4,
          viewMode: 1,
          autoCropArea: 0.9,
          background: false
        });
      }, 100);
    };
    reader.readAsDataURL(file);
  };

  window.closeCropModal = function () {
    const modal = $('cropModal');
    if (modal) modal.style.display = 'none';
    if (cropperInstance) { cropperInstance.destroy(); cropperInstance = null; }
    const input = $('avatarInput'); if (input) input.value = '';
  };

  window.rotateCropImage = function (deg) {
    if (cropperInstance) cropperInstance.rotate(deg);
  };
  window.flipCropImage = function (dir) {
    if (!cropperInstance) return;
    const scaleX = cropperInstance.getData().scaleX || 1;
    const scaleY = cropperInstance.getData().scaleY || 1;
    if (dir === 'h') cropperInstance.scaleX(-scaleX);
    else cropperInstance.scaleY(-scaleY);
  };
  window.resetCropImage = function () {
    if (cropperInstance) cropperInstance.reset();
  };

  window.confirmCrop = function () {
    if (!cropperInstance) return;
    const canvas = cropperInstance.getCroppedCanvas({
      width: 300, height: 400, imageSmoothingQuality: 'high'
    });
    canvas.toBlob(blob => {
      if (!blob) return;
      // Chuyển sang base64 để hiển thị preview
      const reader = new FileReader();
      reader.onload = e => {
        tempAvatarData = e.target.result;
        renderAvatarPreview();
        closeCropModal();
      };
      reader.readAsDataURL(blob);
      // Lưu blob để upload sau (khi savePerson)
      window.__tempAvatarBlob = blob;
    }, 'image/webp', 0.9);
  };

  // ============================================================
  // SPOUSE ROWS
  // ============================================================
  window.addSpouseRow = function () {
    addSpouseRowWithId(null);
  };

  function addSpouseRowWithId(preselectId) {
    const container = $('spouseRows');
    if (!container) return;
    const rowId = 'spouse-row-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const counter = container.children.length + 1;
    const row = document.createElement('div');
    row.className = 'spouse-row';
    row.id = rowId;
    row.innerHTML = `
      <span class="spouse-row__label">Vợ/Chồng ${counter}:</span>
      <select class="spouse-select form-input"><option value="">-- Chọn vợ/chồng --</option></select>
      <button type="button" class="spouse-row__remove" onclick="removeSpouseRow('${rowId}')">×</button>
    `;
    container.appendChild(row);
    populateSpouseSelect(row.querySelector('.spouse-select'), preselectId);
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

  async function populateSpouseSelect(select, preselectId) {
    if (!select) return;
    try {
      sb = getSupabase();
      const { data } = await sb.from('persons')
        .select('id, full_name, generation').eq('is_deleted', false)
        .order('generation').order('birth_order');
      select.innerHTML = '<option value="">-- Chọn vợ/chồng --</option>';
      (data || []).forEach(p => {
        const o = document.createElement('option');
        o.value = p.id;
        o.textContent = p.full_name + ' (Đời ' + p.generation + ')';
        if (preselectId && p.id === preselectId) o.selected = true;
        select.appendChild(o);
      });
    } catch (e) { console.error(LOG, 'populateSpouseSelect', e); }
  }

  // ============================================================
  // CHILDREN
  // ============================================================
  async function loadChildrenList() {
    const container = $('childrenList');
    if (!container) return;
    try {
      const { data: links } = await sb.from('parent_child')
        .select('*').eq('parent_id', currentEditingPersonId);
      if (!links || !links.length) {
        container.innerHTML = '<p class="empty-hint">Chưa có con nào.</p>';
        return;
      }
      const kidIds = links.map(l => l.child_id);
      const { data: kids } = await sb.from('persons')
        .select('id, full_name, birth_year, gender').in('id', kidIds);
      container.innerHTML = (kids || []).map(k => `
        <div class="child-item" data-id="${escHtml(k.id)}">
          <span>${escHtml(k.full_name)} ${k.birth_year ? '(' + k.birth_year + ')' : ''}</span>
        </div>
      `).join('');
    } catch (e) { console.error(LOG, 'loadChildrenList', e); }
  }

  window.openAddChildModal = function () {
    const m = $('addChildModal'); if (m) m.style.display = 'flex';
    const fields = ['childName', 'childBirthYear', 'childOrder'];
    fields.forEach(id => { const el = $(id); if (el) el.value = ''; });
  };
  window.closeAddChildModal = function () {
    const m = $('addChildModal'); if (m) m.style.display = 'none';
  };

  window.confirmAddChild = async function () {
    const childName = $('childName')?.value.trim();
    if (!childName) { alert('Nhập tên con'); return; }
    try {
      sb = getSupabase();
      const childPayload = {
        full_name: childName,
        gender: $('childGender')?.value || 'Nam',
        birth_year: parseInt($('childBirthYear')?.value || '0') || null,
        generation: (parseInt($('generation')?.value || '1') || 1) + 1,
        role_type: 'Huyết thống',
        special_status: 'Bình thường',
        is_deleted: false
      };
      const { data: child, error } = await sb.from('persons')
        .insert([childPayload]).select().single();
      if (error) throw error;

      // Thêm parent_child với parent_role dựa giới tính người hiện tại
      const parentGender = tempOriginalPerson?.gender || $('gender')?.value;
      const parentRole = parentGender === 'Nữ' ? 'Mẹ' : 'Bố';
      const { error: e2 } = await sb.from('parent_child').insert([{
        parent_id: currentEditingPersonId,
        child_id: child.id,
        parent_role: parentRole,
        relation: $('childType')?.value || 'Con chung',
        child_type: $('childType')?.value || 'Con chung',
        is_family_member: true
      }]);
      if (e2) throw e2;
      closeAddChildModal();
      await loadChildrenList();
      alert('Đã thêm con!');
    } catch (e) { console.error(LOG, 'confirmAddChild', e); alert('Lỗi: ' + e.message); }
  };

  window.openQuickAddModal = function () {
    const m = $('quickAddModal'); if (m) m.style.display = 'flex';
    const txt = $('quickAddText'); if (txt) txt.value = '';
  };
  window.closeQuickAddModal = function () {
    const m = $('quickAddModal'); if (m) m.style.display = 'none';
  };

  window.confirmQuickAdd = async function () {
    const raw = $('quickAddText')?.value || '';
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) { alert('Chưa có tên nào'); return; }
    try {
      sb = getSupabase();
      const parentGender = tempOriginalPerson?.gender || $('gender')?.value;
      const parentRole = parentGender === 'Nữ' ? 'Mẹ' : 'Bố';
      const gen = (parseInt($('generation')?.value || '1') || 1) + 1;
      let added = 0;
      for (let i = 0; i < lines.length; i++) {
        const name = lines[i];
        const gender = /Thị|Nữ/i.test(name) ? 'Nữ' : 'Nam';
        const { data: c, error } = await sb.from('persons')
          .insert([{ full_name: name, gender, generation: gen, role_type: 'Huyết thống', special_status: 'Bình thường', birth_order: i + 1, is_deleted: false }])
          .select().single();
        if (error) { console.warn(LOG, 'quickAdd fail', name, error); continue; }
        await sb.from('parent_child').insert([{
          parent_id: currentEditingPersonId, child_id: c.id,
          parent_role: parentRole, relation: 'Con chung',
          child_type: 'Con chung', is_family_member: true
        }]);
        added++;
      }
      closeQuickAddModal();
      await loadChildrenList();
      alert('Đã thêm ' + added + ' con!');
    } catch (e) { console.error(LOG, 'confirmQuickAdd', e); alert('Lỗi: ' + e.message); }
  };

  // ============================================================
  // CONTACT / LINKED NOTES / CHAR COUNTER
  // ============================================================
  window.addContactRow = function () {
    const list = $('contactList');
    if (!list) return;
    const rowId = 'contact-' + Date.now();
    const row = document.createElement('div');
    row.className = 'contact-row';
    row.id = rowId;
    row.innerHTML = `
      <input type="text" class="form-input" placeholder="Nhãn (VD: Zalo)" style="width:40%">
      <input type="text" class="form-input" placeholder="Giá trị" style="width:50%">
      <button type="button" onclick="document.getElementById('${rowId}').remove()">×</button>
    `;
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
      row.innerHTML = `
        <input type="text" class="form-input" value="${escHtml(k)}" style="width:40%">
        <input type="text" class="form-input" value="${escHtml(v)}" style="width:50%">
        <button type="button" onclick="document.getElementById('${rowId}').remove()">×</button>
      `;
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

  window.openLinkNoteModal = function () {
    const m = $('linkNoteModal'); if (m) m.style.display = 'flex';
    // Load notes
    loadAvailableNotes();
  };
  window.closeLinkNoteModal = function () {
    const m = $('linkNoteModal'); if (m) m.style.display = 'none';
  };

  async function loadAvailableNotes() {
    const list = $('availableNotesList');
    if (!list) return;
    try {
      const { data } = await sb.from('notes').select('id, title').limit(50);
      if (!data || !data.length) {
        list.innerHTML = '<p class="empty-hint">Chưa có bài viết nào.</p>';
        return;
      }
      list.innerHTML = data.map(n => `
        <label class="note-pick-item">
          <input type="checkbox" value="${escHtml(n.id)}" ${tempLinkedNoteIds.includes(n.id) ? 'checked' : ''}>
          ${escHtml(n.title)}
        </label>
      `).join('');
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
      `<div class="linked-note" data-id="${escHtml(id)}">📄 ${escHtml(id.slice(0, 8))}...</div>`
    ).join('');
  }

  // ============================================================
  // AUTOCOMPLETE BỐ / MẸ
  // ============================================================
  function initParentAutocomplete() {
    loadAllPersonsCache().then(() => {
      setupAutocomplete('fatherSearch', 'fatherId', 'fatherDropdown', 'Bố');
      setupAutocomplete('motherSearch', 'motherId', 'motherDropdown', 'Mẹ');
    });
  }

  async function loadAllPersonsCache() {
    try {
      sb = getSupabase();
      const { data } = await sb.from('persons')
        .select('id, full_name, generation, gender')
        .eq('is_deleted', false)
        .order('generation').order('birth_order');
      allPersonsCache = data || [];
      console.log(LOG, 'Cache loaded:', allPersonsCache.length, 'persons');
    } catch (e) { console.error(LOG, 'loadAllPersonsCache', e); }
  }

  function setupAutocomplete(inputId, hiddenId, dropdownId, role) {
    const input = $(inputId);
    const hidden = $(hiddenId);
    const dropdown = $(dropdownId);
    if (!input || !hidden || !dropdown) {
      console.warn(LOG, 'Thiếu element:', inputId, hiddenId, dropdownId);
      return;
    }
    // Chống bind trùng
    if (input.dataset.acBound === '1') return;
    input.dataset.acBound = '1';

    input.addEventListener('input', function () {
      hidden.value = '';
      const q = normalize(input.value.trim());
      if (q.length < 1) { dropdown.style.display = 'none'; return; }
      const matches = allPersonsCache
        .filter(p => normalize(p.full_name).includes(q))
        .slice(0, 8);
      renderDropdown(dropdown, matches, input, hidden, role);
    });

    input.addEventListener('focus', function () {
      const q = normalize(input.value.trim());
      if (q.length >= 1) {
        const matches = allPersonsCache
          .filter(p => normalize(p.full_name).includes(q))
          .slice(0, 8);
        renderDropdown(dropdown, matches, input, hidden, role);
      }
    });

    input.addEventListener('blur', function () {
      setTimeout(() => { dropdown.style.display = 'none'; }, 250);
    });
  }

  function renderDropdown(dropdown, matches, input, hidden, role) {
    const q = input.value.trim();
    let html = matches.map(p => `
      <div class="ac-item" data-id="${escHtml(p.id)}" data-name="${escHtml(p.full_name)}" data-gen="${p.generation}">
        <b>${escHtml(p.full_name)}</b>
        <span class="ac-gen">Đời ${p.generation || '?'} • ${escHtml(p.gender || '')}</span>
      </div>
    `).join('');
    if (q) {
      html += `<div class="ac-item ac-item--create" data-create="1">+ Tạo mới "${escHtml(q)}"</div>`;
    }
    if (!html) html = '<div class="ac-item ac-empty">Không tìm thấy</div>';
    dropdown.innerHTML = html;
    dropdown.style.display = 'block';

    dropdown.querySelectorAll('.ac-item').forEach(item => {
      item.onmousedown = function (evt) {
        evt.preventDefault();
        if (item.dataset.create) {
          const newName = input.value.trim();
          if (!newName) return;
          const gen = parseInt($('generation')?.value || '0') - 1;
          createPersonQuick(newName, role, gen).then(newId => {
            if (newId) {
              input.value = newName + ' (Đời ' + gen + ')';
              hidden.value = newId;
              allPersonsCache.push({
                id: newId, full_name: newName, generation: gen,
                gender: role === 'Bố' ? 'Nam' : 'Nữ'
              });
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
      const payload = {
        full_name: fullName,
        gender: role === 'Bố' ? 'Nam' : 'Nữ',
        generation: gen,
        role_type: 'Huyết thống',
        special_status: 'Bình thường',
        is_deleted: false
      };
      const { data, error } = await sb.from('persons').insert([payload]).select().single();
      if (error) throw error;
      console.log(LOG, 'Tạo mới:', data);
      return data.id;
    } catch (e) {
      console.error(LOG, 'createPersonQuick', e);
      alert('Không tạo được người mới: ' + e.message);
      return null;
    }
  }

  // ============================================================
  // SAVE PERSON
  // ============================================================
  window.savePerson = async function () {
    console.log(LOG, 'savePerson');
    try {
      sb = getSupabase();
      const payload = {
        full_name: $('fullName')?.value.trim(),
        gender: $('gender')?.value || null,
        generation: parseInt($('generation')?.value || '0') || null,
        branch: $('branch')?.value.trim() || null,
        sibling_order: parseInt($('siblingOrder')?.value || '0') || null,
        birth_place: $('birthPlace')?.value.trim() || null,
        birth_year: parseInt($('birthYear')?.value || '0') || null,
        death_year: parseInt($('deathYear')?.value || '0') || null,
        special_status: $('specialStatus')?.value || 'Bình thường',
        role_type: $('roleType')?.value || 'Huyết thống',
        occupation: $('occupation')?.value.trim() || null,
        bio: $('bio')?.value.trim() || null,
        conflict_note: $('conflictNote')?.value.trim() || null,
        is_deleted: false
      };
      if (!payload.full_name) { alert('Vui lòng nhập họ tên'); return; }

      // Upload avatar nếu có blob mới
      if (window.__tempAvatarBlob) {
        try {
          const fname = 'avatar-' + Date.now() + '.webp';
          const { data: up, error: upErr } = await sb.storage.from('avatars')
            .upload(fname, window.__tempAvatarBlob, { contentType: 'image/webp', upsert: true });
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
      await saveSpouseLinks(personId);
      await saveLinkedNotes(personId);
      await saveContactInfo(personId);

      alert('Đã lưu!');
      closePersonForm();
      if (typeof window.refreshAll === 'function') window.refreshAll();
      else location.reload();
    } catch (e) {
      console.error(LOG, 'savePerson', e);
      alert('Lỗi lưu: ' + e.message);
    }
  };

  async function saveParentLinks(personId) {
    const fatherId = $('fatherId')?.value;
    const motherId = $('motherId')?.value;
    await sb.from('parent_child').delete().eq('child_id', personId);
    const inserts = [];
    if (fatherId) inserts.push({
      parent_id: fatherId, child_id: personId,
      parent_role: 'Bố', relation: 'Con chung',
      child_type: 'Con chung', is_family_member: true
    });
    if (motherId) inserts.push({
      parent_id: motherId, child_id: personId,
      parent_role: 'Mẹ', relation: 'Con chung',
      child_type: 'Con chung', is_family_member: true
    });
    if (inserts.length) {
      const { error } = await sb.from('parent_child').insert(inserts);
      if (error) throw error;
    }
  }

  async function saveSpouseLinks(personId) {
    const selects = document.querySelectorAll('#spouseRows .spouse-select');
    const spouseIds = Array.from(selects).map(s => s.value).filter(Boolean);
    const gender = tempOriginalPerson?.gender || $('gender')?.value;
    await sb.from('marriages').delete()
      .or(`husband_id.eq.${personId},wife_id.eq.${personId}`);
    let order = 1;
    for (const spId of spouseIds) {
      const isHusband = gender === 'Nam';
      await sb.from('marriages').insert([{
        husband_id: isHusband ? personId : spId,
        wife_id: isHusband ? spId : personId,
        marriage_order: order++,
        status: 'Chính thất'
      }]);
    }
  }

  async function saveLinkedNotes(personId) {
    try {
      await sb.from('persons').update({ linked_note_ids: tempLinkedNoteIds }).eq('id', personId);
    } catch (e) { console.warn(LOG, 'saveLinkedNotes', e); }
  }

  async function saveContactInfo(personId) {
    try {
      const rows = document.querySelectorAll('#contactList .contact-row');
      const info = {};
      rows.forEach(r => {
        const inputs = r.querySelectorAll('input');
        if (inputs.length >= 2 && inputs[0].value.trim() && inputs[1].value.trim()) {
          info[inputs[0].value.trim()] = inputs[1].value.trim();
        }
      });
      await sb.from('persons').update({ contact_info: info }).eq('id', personId);
    } catch (e) { console.warn(LOG, 'saveContactInfo', e); }
  }

  // ---------- EXPOSE ----------
  window.resetForm = resetForm;
  window.showViewMode = showViewMode;
  window.showEditMode = showEditMode;
})();
