/* ============================================================
   pedigree-panel.js v1.0
   - Panel bên phải khi click node Phả đồ (KHÔNG che modal)
   - Hiện: Tên, Đời, Chi, Giới tính, Năm sinh/mất, Vợ/Chồng
   - Có nút Đóng
   ============================================================ */
(function () {
  'use strict';
  const LOG = '[Panel]';
  console.log(LOG, 'v1.0 loaded');

  let panelEl = null;

  function $(id) { return document.getElementById(id); }
  function escHtml(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Tạo panel HTML nếu chưa có
  function ensurePanel() {
    if (panelEl) return panelEl;
    panelEl = document.createElement('div');
    panelEl.id = 'pedigreePanel';
    panelEl.className = 'pedigree-panel';
    panelEl.style.display = 'none';
    panelEl.innerHTML = `
      <div class="pedigree-panel__header">
        <span class="pedigree-panel__title">THÔNG TIN</span>
        <button type="button" class="pedigree-panel__close" onclick="PedigreePanel.hide()">×</button>
      </div>
      <div class="pedigree-panel__body" id="pedigreePanelBody">
        <p class="pedigree-panel__empty">Chưa có thông tin.</p>
      </div>
    `;
    document.body.appendChild(panelEl);
    return panelEl;
  }

  // Hiện panel với thông tin person
  window.PedigreePanel = {
    show: async function (person) {
      console.log(LOG, 'show', person?.full_name);
      const p = ensurePanel();
      const body = $('pedigreePanelBody');
      if (!body) return;

      if (!person) { body.innerHTML = '<p class="pedigree-panel__empty">Không có dữ liệu.</p>'; p.style.display = 'block'; return; }

      // Load thêm thông tin: vợ/chồng từ DB
      let spouseNames = [];
      try {
        const sb = window.appSupabase || window.sbClient;
        if (sb) {
          const { data: marr } = await sb.from('marriages')
            .select('*')
            .or(`husband_id.eq.${person.id},wife_id.eq.${person.id}`);
          if (marr && marr.length) {
            const spIds = marr.map(m => m.husband_id === person.id ? m.wife_id : m.husband_id);
            const { data: sps } = await sb.from('persons')
              .select('id, full_name').in('id', spIds);
            spouseNames = (sps || []).map(s => s.full_name);
          }
        }
      } catch (e) { console.warn(LOG, 'load spouse fail', e); }

      const years = [person.birth_year, person.death_year].filter(Boolean).join(' – ');

      body.innerHTML = `
        <div class="pedigree-panel__row">
          <span class="pedigree-panel__label">Họ tên:</span>
          <span class="pedigree-panel__value pedigree-panel__value--strong">${escHtml(person.full_name || '?')}</span>
        </div>
        <div class="pedigree-panel__row">
          <span class="pedigree-panel__label">Đời:</span>
          <span class="pedigree-panel__value">${escHtml(String(person.generation || '?'))}</span>
        </div>
        <div class="pedigree-panel__row">
          <span class="pedigree-panel__label">Chi:</span>
          <span class="pedigree-panel__value">${escHtml(person.branch || '—')}</span>
        </div>
        <div class="pedigree-panel__row">
          <span class="pedigree-panel__label">Giới tính:</span>
          <span class="pedigree-panel__value">${escHtml(person.gender || '—')}</span>
        </div>
        <div class="pedigree-panel__row">
          <span class="pedigree-panel__label">Năm sinh/mất:</span>
          <span class="pedigree-panel__value">${escHtml(years || '—')}</span>
        </div>
        <div class="pedigree-panel__row">
          <span class="pedigree-panel__label">Vợ/Chồng:</span>
          <span class="pedigree-panel__value">${escHtml(spouseNames.join(', ') || '—')}</span>
        </div>
        <div class="pedigree-panel__actions">
          <button type="button" class="btn btn--primary btn--small" onclick="PedigreePanel.openForm('${escHtml(person.id)}')">📋 Chi tiết</button>
        </div>
      `;
      p.style.display = 'block';
    },

    hide: function () {
      if (panelEl) panelEl.style.display = 'none';
    },

    openForm: function (personId) {
      if (typeof window.openPersonForm === 'function') {
        window.openPersonForm(personId);
      }
    }
  };

  console.log(LOG, '✓ Exports OK');
})();
