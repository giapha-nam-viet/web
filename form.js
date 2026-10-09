/* ============================================================
   form.js v4.0 — Form nhập liệu với Autocomplete Bố/Mẹ
   - Autocomplete Bố/Mẹ: gõ tên → gợi ý
   - Tạo mới person nếu chưa có (generation = hiện tại - 1)
   - Giữ nguyên chức năng: view, edit, avatar, spouse
   - Đồng bộ schema: parent_child (parent_role = 'Bố'/'Mẹ')
   ============================================================ */
(function () {
  'use strict';
  const LOG = '[Form]';
  console.log(LOG, 'v4.0 loaded');

  // ---------- STATE ----------
  let sb;
  let currentEditingPersonId = null;
  let currentViewMode = 'view';
  let tempAvatarData = null;
  let currentEditingAvatarPath = null;
  let tempChildLinks = [];    // [{role: 'Bố'|'Mẹ', name: ''}]
  let tempOriginalPerson = null;
  let allPersonsCache = [];   // cache để autocomplete

  // ---------- HELPERS ----------
  function $(id) { return document.getElementById(id); }

  function escHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function normalize(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D');
  }

  function getSupabase() {
    return window.appSupabase || window.sbClient;
  }

  // ---------- OPEN PERSON FORM ----------
  window.openPersonForm = function (personId) {
    console.log(LOG, 'openPersonForm', personId);
    sb = getSupabase();
    currentEditingPersonId = personId || null;
    tempChildLinks = [];
    tempAvatarData = null;
    currentEditingAvatarPath = null;
    tempOriginalPerson = null;

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

    // Hiện modal
    const modal = $('personModal');
    if (modal) modal.style.display = 'flex';
  };

  window.closePersonForm = function () {
    const modal = $('personModal');
    if (modal) modal.style.display = 'none';
    currentEditingPersonId = null;
    tempAvatarData = null;
    tempChildLinks = [];
  };

  // ---------- RESET FORM ----------
  function resetForm() {
    const fields = ['personName', 'personGender', 'personGeneration',
                    'personBirthYear', 'personDeathYear', 'personBranch',
                    'personHometown', 'personOccupation', 'personBio'];
    fields.forEach(id => { const el = $(id); if (el) el.value = ''; });
    tempAvatarData = null;
    tempChildLinks = [];
    renderAvatarPreview();
    renderChildLinks();
  }

  // ---------- AUTOFILL CREATED BY ----------
  function autofillCreatedByName() {
    try {
      const el = $('personCreatedBy');
      if (!el) return;
      const session = JSON.parse(localStorage.getItem('sb-session') || '{}');
      const email = session?.user?.email || 'hsnampham@gmail.com';
      el.value = email;
    } catch (e) { console.warn(LOG, 'autofillCreatedBy fail', e); }
  }

  // ---------- SHOW VIEW MODE ----------
  async function showViewMode(personId) {
    try {
      sb = getSupabase();
      const viewBody = $('personViewBody');
      const editBody = $('personEditBody');
      if (viewBody) viewBody.style.display = 'block';
      if (editBody) editBody.style.display = 'none';

      const { data: person, error } = await sb
        .from('persons').select('*').eq('id', personId).single();
      if (error) throw error;
      tempOriginalPerson = person;

      // Load spouse
      const { data: marr } = await sb.from('marriages')
        .select('*').or(`husband_id.eq.${personId},wife_id.eq.${personId}`);
      const spouseIds = (marr || []).map(m => m.husband_id === personId ? m.wife_id : m.husband_id);
      let spouseNames = [];
      if (spouseIds.length) {
        const { data: sps } = await sb.from('persons').select('id, full_name').in('id', spouseIds);
        spouseNames = (sps || []).map(s => s.full_name);
      }

      // Load parents
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

      // Load children
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
    } catch (err) {
      console.error(LOG, 'showViewMode error', err);
      const viewBody = $('personViewBody');
      if (viewBody) viewBody.innerHTML = '<p class="person-view__empty">Lỗi: ' + escHtml(err.message) + '</p>';
    }
  }

  // ---------- RENDER PERSON VIEW ----------
  function renderPersonView(person, spouseNames, fatherName, motherName, kidsList) {
    const container = $('personViewBody');
    if (!container) return;

    const yearsParts = [];
    if (person.birth_year) yearsParts.push(person.birth_year);
    if (person.death_year) yearsParts.push(person.death_year);
    const years = yearsParts.join(' – ');

    const avatarHtml = person.avatar_url
      ? `<img src="${escHtml(person.avatar_url)}" class="person-view__avatar" alt="avatar">`
      : `<div class="person-view__avatar person-view__avatar--empty">${(person.full_name || '?').charAt(0)}</div>`;

    container.innerHTML = `
      <div class="person-view">
        ${avatarHtml}
        <h2 class="person-view__name">${escHtml(person.full_name || '')}</h2>
        <p class="person-view__meta">
          ${years ? '📅 ' + years + ' • ' : ''}
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

  // ---------- SHOW EDIT MODE ----------
  function showEditMode() {
    const viewBody = $('personViewBody');
    const editBody = $('personEditBody');
    if (viewBody) viewBody.style.display = 'none';
    if (editBody) editBody.style.display = 'block';
    loadPersonEditFields();
    initParentAutocomplete();
  }

  // ---------- LOAD PERSON EDIT FIELDS ----------
  async function loadPersonEditFields() {
    if (!currentEditingPersonId) return;
    try {
      sb = getSupabase();
      const { data: person } = await sb.from('persons').select('*').eq('id', currentEditingPersonId).single();
      if (!person) return;
      tempOriginalPerson = person;
      const set = (id, val) => { const el = $(id); if (el) el.value = val ?? ''; };
      set('personName', person.full_name);
      set('personGender', person.gender);
      set('personGeneration', person.generation);
      set('personBirthYear', person.birth_year);
      set('personDeathYear', person.death_year);
      set('personBranch', person.branch);
      set('personHometown', person.hometown);
      set('personOccupation', person.occupation);
      set('personBio', person.bio);
      renderAvatarPreview();

      // Load parents → điền vào ô autocomplete
      const { data: pc } = await sb.from('parent_child').select('*').eq('child_id', currentEditingPersonId);
      if (pc && pc.length) {
        const parentIds = pc.map(p => p.parent_id);
        const { data: parents } = await sb.from('persons').select('id, full_name, generation').in('id', parentIds);
        pc.forEach(p => {
          const par = (parents || []).find(x => x.id === p.parent_id);
          if (!par) return;
          const inputId = p.parent_role === 'Bố' ? 'personFatherInput' : 'personMotherInput';
          const hiddenId = p.parent_role === 'Bố' ? 'personFatherId' : 'personMotherId';
          const input = $(inputId);
          const hidden = $(hiddenId);
          if (input) input.value = par.full_name + ' (Đời ' + par.generation + ')';
          if (hidden) hidden.value = par.id;
        });
      }
    } catch (e) { console.error(LOG, 'loadPersonEditFields', e); }
  }

  // ---------- SWITCH TO EDIT MODE ----------
  window.switchToEditMode = function () {
    if (!currentEditingPersonId) return;
    currentViewMode = 'edit';
    const viewBody = $('personViewBody');
    const editBody = $('personEditBody');
    if (viewBody) viewBody.style.display = 'none';
    if (editBody) editBody.style.display = 'block';
    const title = $('formTitle');
    if (title) title.textContent = 'SỬA THÔNG TIN CÁ NHÂN';
    loadPersonEditFields();
    initParentAutocomplete();
  };

  // ---------- AVATAR ----------
  function renderAvatarPreview() {
    const preview = $('avatarPreview');
    if (!preview) return;
    if (tempAvatarData) {
      preview.innerHTML = `<img src="${tempAvatarData}" alt="preview">`;
    } else if (currentEditingAvatarPath) {
      preview.innerHTML = `<img src="${currentEditingAvatarPath}" alt="avatar">`;
    } else {
      preview.innerHTML = `<div class="avatar-empty">Chưa có ảnh</div>`;
    }
  }

  window.handleAvatarChange = async function (input) {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('Ảnh quá lớn, tối đa 5MB'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      tempAvatarData = e.target.result;
      renderAvatarPreview();
    };
    reader.readAsDataURL(file);
  };

  // ---------- SPOUSE ROWS ----------
  window.addSpouseRow = function () {
    const container = $('spouseRows');
    if (!container) return;
    const rowId = 'spouse-row-' + Date.now();
    const spouseCounter = container.children.length + 1;
    const row = document.createElement('div');
    row.className = 'spouse-row';
    row.id = rowId;
    row.innerHTML = `
      <span class="spouse-row__label">Vợ/Chồng ${spouseCounter}:</span>
      <select class="spouse-select"><option value="">-- Chọn vợ/chồng --</option></select>
      <button type="button" class="spouse-row__remove" onclick="removeSpouseRow('${rowId}')">×</button>
    `;
    container.appendChild(row);
    populateSpouseSelect(row.querySelector('.spouse-select'));
  };

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

  async function populateSpouseSelect(select) {
    if (!select) return;
    try {
      sb = getSupabase();
      const { data } = await sb.from('persons').select('id, full_name, generation').eq('is_deleted', false);
      select.innerHTML = '<option value="">-- Chọn vợ/chồng --</option>';
      (data || []).forEach(p => {
        const o = document.createElement('option');
        o.value = p.id;
        o.textContent = p.full_name + ' (Đời ' + p.generation + ')';
        select.appendChild(o);
      });
    } catch (e) { console.error(LOG, 'populateSpouseSelect', e); }
  }

  // ============================================================
  // AUTOCOMPLETE BỐ / MẸ
  // ============================================================
  function initParentAutocomplete() {
    // Load cache toàn bộ persons
    loadAllPersonsCache().then(() => {
      setupAutocomplete('personFatherInput', 'personFatherId', 'fatherDropdown', 'Bố');
      setupAutocomplete('personMotherInput', 'personMotherId', 'motherDropdown', 'Mẹ');
    });
  }

  async function loadAllPersonsCache() {
    try {
      sb = getSupabase();
      const { data } = await sb.from('persons')
        .select('id, full_name, generation, gender, is_deleted')
        .eq('is_deleted', false);
      allPersonsCache = data || [];
      console.log(LOG, 'Cache loaded:', allPersonsCache.length, 'persons');
    } catch (e) { console.error(LOG, 'loadAllPersonsCache', e); }
  }

  function setupAutocomplete(inputId, hiddenId, dropdownId, role) {
    const input = $(inputId);
    const hidden = $(hiddenId);
    const dropdown = $(dropdownId);
    if (!input || !hidden || !dropdown) {
      console.warn(LOG, 'Thiếu element autocomplete:', inputId, hiddenId, dropdownId);
      return;
    }

    // Xoá input cũ → xoá hidden
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

    // Blur → ẩn sau 200ms (để click kịp)
    input.addEventListener('blur', function () {
      setTimeout(() => { dropdown.style.display = 'none'; }, 200);
    });
  }

  function renderDropdown(dropdown, matches, input, hidden, role) {
    let html = '';
    if (matches.length === 0) {
      html = `<div class="ac-item ac-item--create" data-create="1">+ Tạo mới "${escHtml(input.value.trim())}"</div>`;
    } else {
      html = matches.map(p => `
        <div class="ac-item" data-id="${escHtml(p.id)}" data-name="${escHtml(p.full_name)}" data-gen="${p.generation}">
          <b>${escHtml(p.full_name)}</b>
          <span class="ac-gen">Đời ${p.generation || '?'} • ${escHtml(p.gender || '')}</span>
        </div>
      `).join('');
      const q = input.value.trim();
      if (q) {
        html += `<div class="ac-item ac-item--create" data-create="1">+ Tạo mới "${escHtml(q)}"</div>`;
      }
    }
    dropdown.innerHTML = html;
    dropdown.style.display = 'block';

    // Bind click
    dropdown.querySelectorAll('.ac-item').forEach(item => {
      item.onmousedown = function (evt) {
        evt.preventDefault();
        if (item.dataset.create) {
          // Tạo mới
          const newName = input.value.trim();
          if (!newName) return;
          // Đời = đời hiện tại - 1
          const gen = parseInt($('personGeneration')?.value || '0') - 1;
          createPersonQuick(newName, role, gen).then(newId => {
            if (newId) {
              input.value = newName + ' (Đời ' + gen + ')';
              hidden.value = newId;
              // Cập nhật cache
              allPersonsCache.push({ id: newId, full_name: newName, generation: gen, gender: role === 'Bố' ? 'Nam' : 'Nữ' });
              dropdown.style.display = 'none';
            }
          });
        } else {
          // Chọn có sẵn
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
      const payload = {
        full_name: fullName,
        gender: role === 'Bố' ? 'Nam' : 'Nữ',
        generation: generation > 0 ? generation : 1,
        role_type: 'Huyết thống',
        special_status: 'Bình thường',
        is_deleted: false
      };
      const { data, error } = await sb.from('persons').insert([payload]).select().single();
      if (error) throw error;
      console.log(LOG, 'Tạo mới person:', data);
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
        full_name: $('personName')?.value.trim(),
        gender: $('personGender')?.value || null,
        generation: parseInt($('personGeneration')?.value || '0') || null,
        birth_year: parseInt($('personBirthYear')?.value || '0') || null,
        death_year: parseInt($('personDeathYear')?.value || '0') || null,
        branch: $('personBranch')?.value.trim() || null,
        hometown: $('personHometown')?.value.trim() || null,
        occupation: $('personOccupation')?.value.trim() || null,
        bio: $('personBio')?.value.trim() || null,
        is_deleted: false
      };
      if (!payload.full_name) { alert('Vui lòng nhập họ tên'); return; }

      let personId = currentEditingPersonId;
      if (personId) {
        // UPDATE
        const { error } = await sb.from('persons').update(payload).eq('id', personId);
        if (error) throw error;
      } else {
        // INSERT
        const { data, error } = await sb.from('persons').insert([payload]).select().single();
        if (error) throw error;
        personId = data.id;
      }

      // Update parent_child (Bố, Mẹ)
      await saveParentLinks(personId);

      // Update spouse links
      await saveSpouseLinks(personId);

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
    try {
      const fatherId = $('personFatherId')?.value;
      const motherId = $('personMotherId')?.value;
      // Xoá links cũ
      await sb.from('parent_child').delete().eq('child_id', personId);
      // Thêm links mới
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
        console.log(LOG, 'Đã lưu parent_child:', inserts.length);
      }
    } catch (e) { console.error(LOG, 'saveParentLinks', e); }
  }

  async function saveSpouseLinks(personId) {
    try {
      const selects = document.querySelectorAll('#spouseRows .spouse-select');
      const spouseIds = Array.from(selects).map(s => s.value).filter(Boolean);
      const person = tempOriginalPerson;
      const gender = person?.gender || $('personGender')?.value;

      // Xoá marriages cũ
      await sb.from('marriages').delete()
        .or(`husband_id.eq.${personId},wife_id.eq.${personId}`);

      // Thêm mới
      let order = 1;
      for (const spId of spouseIds) {
        const isHusband = gender === 'Nam';
        const payload = {
          husband_id: isHusband ? personId : spId,
          wife_id: isHusband ? spId : personId,
          marriage_order: order++,
          status: 'Chính thất'
        };
        const { error } = await sb.from('marriages').insert([payload]);
        if (error) console.error(LOG, 'insert marriage', error);
      }
    } catch (e) { console.error(LOG, 'saveSpouseLinks', e); }
  }

  // ---------- EXPOSE ----------
  window.resetForm = resetForm;
  window.showViewMode = showViewMode;
  window.showEditMode = showEditMode;
})();
