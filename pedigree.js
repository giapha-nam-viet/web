/* ============================================================
   pedigree.js — Phase B1 (v1.5)
   - Query focus theo full_name (KHÔNG hardcode ID)
   - Node to hơn: 200x80
   - Hiện full name (không rút gọn)
   ============================================================ */
(function () {
  'use strict';

  const FOCUS_NAME = 'Phạm Văn Mỹ';
  const NODE_W = 200, NODE_H = 80;   // ⭐ v1.5: to hơn
  const GAP_X  = 50;
  const ROW_Y  = 200;

  let svg, gRoot, gLinks, gNodes, zoomBehavior;
  let tooltipEl, loadingEl;
  let initialized = false;
  let currentNodes = [];
  let FOCUS_ID = null;

  function getSupabase() {
    if (window.sbClient) return window.sbClient;
    if (window.appSupabase) return window.appSupabase;
    if (window.supabaseClient) return window.supabaseClient;
    if (window._supabase) return window._supabase;
    if (window.supabase && typeof window.supabase.from === 'function') return window.supabase;
    try { if (typeof supabase !== 'undefined' && typeof supabase.from === 'function') return supabase; } catch (e) {}
    return null;
  }

  async function waitForSession(sb, maxMs) {
    maxMs = maxMs || 8000;
    const start = Date.now();
    let tries = 0;
    while (Date.now() - start < maxMs) {
      try {
        const { data } = await sb.auth.getSession();
        if (data && data.session && data.session.user) {
          console.log('[Pedigree] ✓ Session OK sau ' + tries + ' lần thử');
          return true;
        }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 250));
      tries++;
    }
    console.warn('[Pedigree] ⚠ Session không có sau ' + maxMs + 'ms');
    return false;
  }

  async function waitForAppData(maxMs) {
    maxMs = maxMs || 8000;
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      if (window.allPersons && window.allPersons.length > 0) {
        console.log('[Pedigree] ✓ window.allPersons đã có ' + window.allPersons.length + ' người');
        return true;
      }
      await new Promise(r => setTimeout(r, 200));
    }
    return false;
  }

  function yearText(p) {
    const b = p.birth_year ? String(p.birth_year) : '?';
    const d = p.death_year ? String(p.death_year) : '';
    return d ? '(' + b + ' - ' + d + ')' : '(' + b + ')';
  }

  async function queryArray(sb, table, buildQuery, retries) {
    retries = retries || 5;
    let lastRes = { data: [], error: null };
    for (let i = 0; i < retries; i++) {
      try {
        const q = buildQuery(sb.from(table).select('*'));
        const res = await q;
        lastRes = res;
        if (!res.error && res.data && res.data.length > 0) return res;
      } catch (e) {
        lastRes = { data: [], error: e };
      }
      await new Promise(r => setTimeout(r, 300));
    }
    return lastRes;
  }

  async function loadData() {
    const sb = getSupabase();
    if (!sb) throw new Error('Không tìm thấy Supabase client.');

    console.log('[Pedigree] Đợi session + app data...');
    await Promise.all([waitForSession(sb, 8000), waitForAppData(8000)]);

    console.log('[Pedigree] Đang tìm "' + FOCUS_NAME + '" theo tên...');
    const focusRes = await queryArray(sb, 'persons',
      q => q.eq('full_name', FOCUS_NAME), 6
    );
    let focus = (focusRes.data || [])[0];

    if (!focus && window.allPersons) {
      focus = window.allPersons.find(p => (p.full_name || '').trim() === FOCUS_NAME);
      if (focus) console.log('[Pedigree] ✓ Fallback window.allPersons');
    }
    if (!focus) throw new Error('Không tìm thấy "' + FOCUS_NAME + '" trong DB');

    FOCUS_ID = focus.id;
    console.log('[Pedigree] ✓ Tìm thấy:', focus.full_name, '| ID thật:', FOCUS_ID, '| độ dài ID:', FOCUS_ID.length);

    // Cha mẹ
    const pcParentsRes = await queryArray(sb, 'parent_child',
      q => q.eq('child_id', FOCUS_ID), 5
    );
    const pcParents = pcParentsRes.data || [];
    const parentIds = pcParents.map(r => r.parent_id);
    let parents = [];
    if (parentIds.length) {
      const psRes = await queryArray(sb, 'persons', q => q.in('id', parentIds), 4);
      parents = psRes.data || [];
    }

    // Vợ/chồng
    const marrRes = await queryArray(sb, 'marriages',
      q => q.or('husband_id.eq.' + FOCUS_ID + ',wife_id.eq.' + FOCUS_ID), 5
    );
    const marriages = marrRes.data || [];
    let spouse = null;
    if (marriages.length) {
      const m = marriages[0];
      const spouseId = m.husband_id === FOCUS_ID ? m.wife_id : m.husband_id;
      const spRes = await queryArray(sb, 'persons', q => q.eq('id', spouseId), 4);
      spouse = (spRes.data || [])[0] || null;
    }

    // Con
    const pcChildRes = await queryArray(sb, 'parent_child',
      q => q.eq('parent_id', FOCUS_ID), 5
    );
    const pcChildren = pcChildRes.data || [];
    const childIds = pcChildren.map(r => r.child_id);
    let children = [];
    if (childIds.length) {
      const csRes = await queryArray(sb, 'persons', q => q.in('id', childIds), 4);
      children = (csRes.data || []).sort((a, b) => (a.birth_year || 9999) - (b.birth_year || 9999));
    }

    console.log('[Pedigree] ✓ Load xong: Mỹ=' + focus.full_name +
                ' | cha mẹ=' + parents.length +
                ' | vợ/chồng=' + (spouse ? 1 : 0) +
                ' | con=' + children.length);

    return { focus, parents, spouse, children };
  }

  function render(data) {
    const { focus, parents, spouse, children } = data;

    gLinks.selectAll('*').remove();
    gNodes.selectAll('*').remove();

    const nodes = [];
    const links = [];

    const father = parents.find(p => /nam|male/i.test(p.gender || ''));
    const mother = parents.find(p => /nữ|nu|female/i.test(p.gender || ''));
    const others = parents.filter(p => p !== father && p !== mother);
    const parentList = [father, mother, ...others].filter(Boolean);
    parentList.forEach((p, i) => {
      const total = parentList.length;
      const offset = (i - (total - 1) / 2) * (NODE_W + GAP_X);
      nodes.push({ id: p.id, person: p, x: offset, y: -ROW_Y, kind: 'parent' });
    });

    if (spouse) {
      nodes.push({ id: focus.id, person: focus, x: -(NODE_W + GAP_X) / 2, y: 0, kind: 'focus' });
      nodes.push({ id: spouse.id, person: spouse, x:  (NODE_W + GAP_X) / 2, y: 0, kind: 'spouse' });
    } else {
      nodes.push({ id: focus.id, person: focus, x: 0, y: 0, kind: 'focus' });
    }

    children.forEach((c, i) => {
      const total = children.length;
      const offset = (i - (total - 1) / 2) * (NODE_W + GAP_X);
      nodes.push({ id: c.id, person: c, x: offset, y: ROW_Y, kind: 'child' });
    });

    if (parentList.length) links.push({ type: 'blood', from: 'parentsCenter', to: focus.id });
    if (spouse) links.push({ type: 'marriage', from: focus.id, to: spouse.id, direct: true });
    children.forEach(c => links.push({ type: 'blood', from: 'coupleCenter', to: c.id }));

    gLinks.selectAll('path').data(links).enter().append('path')
      .attr('class', d => 'ped-link ' + (d.type === 'marriage' ? 'marriage' : ''))
      .attr('d', d => computePath(d, nodes));

    const nodeSel = gNodes.selectAll('g.ped-node')
      .data(nodes, d => d.id).enter().append('g')
      .attr('class', d => 'ped-node ' + d.kind)
      .attr('transform', d => 'translate(' + (d.x - NODE_W/2) + ',' + (d.y - NODE_H/2) + ')')
      .attr('data-id', d => d.id)
      .style('cursor', 'pointer');

    nodeSel.append('rect').attr('width', NODE_W).attr('height', NODE_H);

    // ⭐ v1.5: Hiện FULL NAME, y=30
    nodeSel.append('text').attr('class', 'name')
      .attr('x', NODE_W / 2).attr('y', 30).attr('text-anchor', 'middle')
      .text(d => d.person.full_name || '?');

    // ⭐ v1.5: y=54
    nodeSel.append('text').attr('class', 'years')
      .attr('x', NODE_W / 2).attr('y', 54).attr('text-anchor', 'middle')
      .text(d => yearText(d.person));

    if (!spouse) {
      // ⭐ v1.5: y=74
      nodeSel.filter(d => d.kind === 'focus').append('text')
        .attr('class', 'badge-unlinked')
        .attr('x', NODE_W / 2).attr('y', 74).attr('text-anchor', 'middle')
        .text('⚠ chưa liên kết');
    }

    nodeSel
      .on('click', (event, d) => showTooltip(event, d))
      .on('dblclick', (event, d) => { event.stopPropagation(); openInDanhTinh(d.id); });

    currentNodes = nodes;
    centerView(nodes);
  }

  function computePath(link, nodes) {
    const get = (id) => nodes.find(n => n.id === id);

    if (link.from === 'parentsCenter' && link.to) {
      const child = get(link.to);
      const parents = nodes.filter(n => n.kind === 'parent');
      if (!parents.length || !child) return '';
      const cx = parents.reduce((s, n) => s + n.x, 0) / parents.length;
      const cy = -ROW_Y + NODE_H / 2;
      const childTopY = child.y - NODE_H / 2;
      const midY = (cy + childTopY) / 2;
      return 'M ' + cx + ' ' + cy + ' L ' + cx + ' ' + midY + ' L ' + child.x + ' ' + midY + ' L ' + child.x + ' ' + childTopY;
    }
    if (link.from === 'coupleCenter' && link.to) {
      const child = get(link.to);
      if (!child) return '';
      const couple = nodes.filter(n => n.kind === 'focus' || n.kind === 'spouse');
      const cx = couple.reduce((s, n) => s + n.x, 0) / couple.length;
      const cy = NODE_H / 2;
      const childTopY = child.y - NODE_H / 2;
      const midY = (cy + childTopY) / 2;
      return 'M ' + cx + ' ' + cy + ' L ' + cx + ' ' + midY + ' L ' + child.x + ' ' + midY + ' L ' + child.x + ' ' + childTopY;
    }
    if (link.direct && link.from && link.to) {
      const a = get(link.from), b = get(link.to);
      if (!a || !b) return '';
      const x1 = a.x + (a.x < b.x ? NODE_W / 2 : -NODE_W / 2);
      const x2 = b.x + (b.x > a.x ? -NODE_W / 2 : NODE_W / 2);
      return 'M ' + x1 + ' ' + a.y + ' L ' + x2 + ' ' + b.y;
    }
    return '';
  }

  function centerView(nodes) {
    if (!nodes.length || !svg || !svg.node()) return;
    const xs = nodes.map(n => n.x);
    const ys = nodes.map(n => n.y);
    const minX = Math.min.apply(null, xs) - NODE_W;
    const maxX = Math.max.apply(null, xs) + NODE_W;
    const minY = Math.min.apply(null, ys) - NODE_H;
    const maxY = Math.max.apply(null, ys) + NODE_H;
    const w = maxX - minX, h = maxY - minY;
    const svgW = svg.node().clientWidth;
    const svgH = svg.node().clientHeight;
    if (!svgW || !svgH) return;
    const scale = Math.min(svgW / w, svgH / h) * 0.85;
    const tx = svgW / 2 - ((minX + maxX) / 2) * scale;
    const ty = svgH / 2 - ((minY + maxY) / 2) * scale;
    svg.transition().duration(400).call(
      zoomBehavior.transform,
      d3.zoomIdentity.translate(tx, ty).scale(scale)
    );
  }

  function showTooltip(event, d) {
    const p = d.person;
    tooltipEl.innerHTML =
      '<strong style="color:#C49504">' + (p.full_name || '?') + '</strong><br>' +
      'Đời: ' + (p.generation || '?') + ' • Nhánh: ' + (p.branch || '?') + '<br>' +
      'Giới tính: ' + (p.gender || '?') + '<br>' +
      'Sinh: ' + (p.birth_year || '?') + (p.death_year ? ' • Mất: ' + p.death_year : '') + '<br>' +
      '<em style="opacity:.7">Đúp chuột để mở Danh tính</em>';
    tooltipEl.style.display = 'block';
    const rect = svg.node().getBoundingClientRect();
    tooltipEl.style.left = (event.clientX - rect.left + 12) + 'px';
    tooltipEl.style.top  = (event.clientY - rect.top  + 12) + 'px';
    clearTimeout(showTooltip._t);
    showTooltip._t = setTimeout(() => { tooltipEl.style.display = 'none'; }, 3500);
  }

  function openInDanhTinh(personId) {
    const tabDanhTinh = document.querySelector('[data-tab="danh-tinh"]');
    if (tabDanhTinh) tabDanhTinh.click();
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('pedigree:open-person', { detail: { personId } }));
      ['openPersonDetail','showPersonDetail','selectPerson','openPersonModal','openPersonForm'].forEach(fn => {
        if (typeof window[fn] === 'function') {
          try { window[fn](personId); } catch (e) {}
        }
      });
    }, 200);
  }

  async function init() {
    if (initialized) return;
    initialized = true;

    svg = d3.select('#pedigree-svg');
    tooltipEl = document.getElementById('pedigree-tooltip');
    loadingEl = document.getElementById('pedigree-loading');

    gRoot  = svg.append('g');
    gLinks = gRoot.append('g').attr('class', 'ped-links');
    gNodes = gRoot.append('g').attr('class', 'ped-nodes');

    zoomBehavior = d3.zoom()
      .scaleExtent([0.2, 2.5])
      .on('zoom', (e) => gRoot.attr('transform', e.transform));
    svg.call(zoomBehavior);

    const zIn = document.getElementById('pedZoomIn');
    const zOut = document.getElementById('pedZoomOut');
    const zReset = document.getElementById('pedZoomReset');
    const zFocus = document.getElementById('pedFocusMy');
    if (zIn) zIn.addEventListener('click', () => svg.transition().call(zoomBehavior.scaleBy, 1.25));
    if (zOut) zOut.addEventListener('click', () => svg.transition().call(zoomBehavior.scaleBy, 0.8));
    if (zReset) zReset.addEventListener('click', () => centerView(currentNodes));
    if (zFocus) zFocus.addEventListener('click', () => loadAndRender());

    await loadAndRender();
  }

  async function loadAndRender() {
    try {
      if (loadingEl) {
        loadingEl.style.display = 'block';
        loadingEl.innerHTML = 'Đang tải phả đồ...';
      }
      const data = await loadData();
      render(data);
      if (loadingEl) loadingEl.style.display = 'none';
    } catch (err) {
      console.error('[Pedigree]', err);
      if (loadingEl) loadingEl.innerHTML = '⚠ Lỗi tải dữ liệu.<br><small>' + (err.message || err) + '</small>';
    }
  }

  function hookTab() {
    const tabPhaDo = document.querySelector('[data-tab="pha-do"]');
    if (tabPhaDo) tabPhaDo.addEventListener('click', () => setTimeout(init, 200));
    const sec = document.getElementById('tab-pha-do');
    if (sec && sec.style.display !== 'none') init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hookTab);
  } else {
    hookTab();
  }

  window.Pedigree = { init, loadAndRender, reload: loadAndRender };
})();
