/* ============================================================
   pedigree.js — Phase B1 (MVP)
   Focus: Phạm Văn Mỹ — hiển thị 3 đời (cha mẹ / Mỹ + vợ / con)
   ============================================================ */
(function () {
  'use strict';

  const FOCUS_ID = '4a918514-5402-470d-8aa0-52b41edb23f6'; // Phạm Văn Mỹ
  const NODE_W = 170, NODE_H = 70;
  const GAP_X  = 50;
  const ROW_Y  = 200;

  let svg, gRoot, gLinks, gNodes, zoomBehavior;
  let tooltipEl, loadingEl;
  let initialized = false;
  let currentNodes = [];

  // ---------- Tìm Supabase client ----------
  function getSupabase() {
    if (typeof window.appSupabase !== 'undefined') return window.appSupabase;
    if (typeof window.supabaseClient !== 'undefined') return window.supabaseClient;
    if (typeof window._supabase !== 'undefined') return window._supabase;
    if (typeof window.supabase !== 'undefined' && typeof window.supabase.from === 'function') {
      return window.supabase;
    }
    try { if (typeof supabase !== 'undefined' && typeof supabase.from === 'function') return supabase; } catch (e) {}
    return null;
  }

  // ---------- Tiện ích ----------
  function yearText(p) {
    const b = p.birth_year ? String(p.birth_year) : '?';
    const d = p.death_year ? String(p.death_year) : '';
    return d ? `(${b} - ${d})` : `(${b})`;
  }
  function shortName(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length <= 2) return name;
    return parts[0] + ' ' + parts[parts.length - 1];
  }

  // ---------- Load dữ liệu ----------
  async function loadData() {
    const sb = getSupabase();
    if (!sb) throw new Error('Không tìm thấy Supabase client. Thêm window.appSupabase = supabase vào cuối app.js.');

    // 1. Thông tin Mỹ
    const { data: focus, error: e1 } = await sb.from('persons').select('*').eq('id', FOCUS_ID).single();
    if (e1) throw e1;

    // 2. Cha mẹ
    const { data: pcParents } = await sb.from('parent_child').select('*').eq('child_id', FOCUS_ID);
    const parentIds = (pcParents || []).map(r => r.parent_id);
    let parents = [];
    if (parentIds.length) {
      const { data: ps } = await sb.from('persons').select('*').in('id', parentIds);
      parents = ps || [];
    }

    // 3. Vợ/chồng (B1: chỉ lấy người đầu tiên)
    const { data: marriages } = await sb.from('marriages')
      .select('*')
      .or(`husband_id.eq.${FOCUS_ID},wife_id.eq.${FOCUS_ID}`);
    let spouse = null;
    if (marriages && marriages.length) {
      const m = marriages[0];
      const spouseId = m.husband_id === FOCUS_ID ? m.wife_id : m.husband_id;
      const { data: sp } = await sb.from('persons').select('*').eq('id', spouseId).single();
      spouse = sp || null;
    }

    // 4. Con
    const { data: pcChildren } = await sb.from('parent_child').select('*').eq('parent_id', FOCUS_ID);
    const childIds = (pcChildren || []).map(r => r.child_id);
    let children = [];
    if (childIds.length) {
      const { data: cs } = await sb.from('persons').select('*').in('id', childIds);
      children = (cs || []).sort((a, b) => (a.birth_year || 9999) - (b.birth_year || 9999));
    }

    return { focus, parents, spouse, children };
  }

  // ---------- Render ----------
  function render(data) {
    const { focus, parents, spouse, children } = data;

    gRoot.selectAll('*').remove();

    const nodes = [];
    const links = [];

    // Cha mẹ (căn giữa tại x=0)
    const father = parents.find(p => /nam|male/i.test(p.gender || ''));
    const mother = parents.find(p => /nữ|nu|female/i.test(p.gender || ''));
    const others = parents.filter(p => p !== father && p !== mother);
    const parentList = [father, mother, ...others].filter(Boolean);
    parentList.forEach((p, i) => {
      const total = parentList.length;
      const offset = (i - (total - 1) / 2) * (NODE_W + GAP_X);
      nodes.push({ id: p.id, person: p, x: offset, y: -ROW_Y, kind: 'parent' });
    });

    // Mỹ + Vợ
    if (spouse) {
      nodes.push({ id: focus.id, person: focus, x: -(NODE_W + GAP_X) / 2, y: 0, kind: 'focus' });
      nodes.push({ id: spouse.id, person: spouse, x:  (NODE_W + GAP_X) / 2, y: 0, kind: 'spouse' });
    } else {
      nodes.push({ id: focus.id, person: focus, x: 0, y: 0, kind: 'focus' });
    }

    // Con
    children.forEach((c, i) => {
      const total = children.length;
      const offset = (i - (total - 1) / 2) * (NODE_W + GAP_X);
      nodes.push({ id: c.id, person: c, x: offset, y: ROW_Y, kind: 'child' });
    });

    // Links
    if (parentList.length) links.push({ type: 'blood', from: 'parentsCenter', to: focus.id });
    if (spouse) links.push({ type: 'marriage', from: focus.id, to: spouse.id, direct: true });
    children.forEach(c => links.push({ type: 'blood', from: 'coupleCenter', to: c.id }));

    // Vẽ link trước
    gLinks.selectAll('path')
      .data(links)
      .enter()
      .append('path')
      .attr('class', d => 'ped-link ' + (d.type === 'marriage' ? 'marriage' : ''))
      .attr('d', d => computePath(d, nodes));

    // Vẽ node
    const nodeSel = gNodes.selectAll('g.ped-node')
      .data(nodes, d => d.id)
      .enter()
      .append('g')
      .attr('class', d => 'ped-node ' + d.kind)
      .attr('transform', d => `translate(${d.x - NODE_W/2}, ${d.y - NODE_H/2})`)
      .attr('data-id', d => d.id)
      .style('cursor', 'pointer');

    nodeSel.append('rect').attr('width', NODE_W).attr('height', NODE_H);

    nodeSel.append('text')
      .attr('class', 'name')
      .attr('x', NODE_W / 2).attr('y', 26)
      .attr('text-anchor', 'middle')
      .text(d => shortName(d.person.full_name));

    nodeSel.append('text')
      .attr('class', 'years')
      .attr('x', NODE_W / 2).attr('y', 46)
      .attr('text-anchor', 'middle')
      .text(d => yearText(d.person));

    // Badge "chưa liên kết" nếu Mỹ không có vợ/chồng
    if (!spouse) {
      nodeSel.filter(d => d.kind === 'focus').append('text')
        .attr('class', 'badge-unlinked')
        .attr('x', NODE_W / 2).attr('y', 62)
        .attr('text-anchor', 'middle')
        .text('⚠ chưa liên kết');
    }

    // Sự kiện
    nodeSel
      .on('click', (event, d) => showTooltip(event, d))
      .on('dblclick', (event, d) => { event.stopPropagation(); openInDanhTinh(d.id); });

    currentNodes = nodes;
    centerView(nodes);
  }

  // ---------- Tính đường nối ----------
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
      return `M ${cx} ${cy} L ${cx} ${midY} L ${child.x} ${midY} L ${child.x} ${childTopY}`;
    }

    if (link.from === 'coupleCenter' && link.to) {
      const child = get(link.to);
      if (!child) return '';
      const couple = nodes.filter(n => n.kind === 'focus' || n.kind === 'spouse');
      const cx = couple.reduce((s, n) => s + n.x, 0) / couple.length;
      const cy = NODE_H / 2;
      const childTopY = child.y - NODE_H / 2;
      const midY = (cy + childTopY) / 2;
      return `M ${cx} ${cy} L ${cx} ${midY} L ${child.x} ${midY} L ${child.x} ${childTopY}`;
    }

    if (link.direct && link.from && link.to) {
      const a = get(link.from), b = get(link.to);
      if (!a || !b) return '';
      const x1 = a.x + (a.x < b.x ? NODE_W / 2 : -NODE_W / 2);
      const x2 = b.x + (b.x > a.x ? -NODE_W / 2 : NODE_W / 2);
      return `M ${x1} ${a.y} L ${x2} ${b.y}`;
    }
    return '';
  }

  // ---------- Căn giữa view ----------
  function centerView(nodes) {
    if (!nodes.length || !svg || !svg.node()) return;
    const xs = nodes.map(n => n.x);
    const ys = nodes.map(n => n.y);
    const minX = Math.min(...xs) - NODE_W;
    const maxX = Math.max(...xs) + NODE_W;
    const minY = Math.min(...ys) - NODE_H;
    const maxY = Math.max(...ys) + NODE_H;
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

  // ---------- Tooltip ----------
  function showTooltip(event, d) {
    const p = d.person;
    tooltipEl.innerHTML = `
      <strong style="color:#C49504">${p.full_name || '?'}</strong><br>
      Đời: ${p.generation || '?'} • Nhánh: ${p.branch || '?'}<br>
      Giới tính: ${p.gender || '?'}<br>
      Sinh: ${p.birth_year || '?'}${p.death_year ? ' • Mất: ' + p.death_year : ''}<br>
      <em style="opacity:.7">Đúp chuột để mở Danh tính</em>
    `;
    tooltipEl.style.display = 'block';
    const rect = svg.node().getBoundingClientRect();
    tooltipEl.style.left = (event.clientX - rect.left + 12) + 'px';
    tooltipEl.style.top  = (event.clientY - rect.top  + 12) + 'px';
    clearTimeout(showTooltip._t);
    showTooltip._t = setTimeout(() => { tooltipEl.style.display = 'none'; }, 3500);
  }

  // ---------- Chuyển sang tab Danh tính ----------
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

  // ---------- Init ----------
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

    document.getElementById('pedZoomIn')?.addEventListener('click', () => svg.transition().call(zoomBehavior.scaleBy, 1.25));
    document.getElementById('pedZoomOut')?.addEventListener('click', () => svg.transition().call(zoomBehavior.scaleBy, 0.8));
    document.getElementById('pedZoomReset')?.addEventListener('click', () => centerView(currentNodes));
    document.getElementById('pedFocusMy')?.addEventListener('click', () => loadAndRender());

    await loadAndRender();
  }

  async function loadAndRender() {
    try {
      if (loadingEl) loadingEl.style.display = 'block';
      const data = await loadData();
      render(data);
      if (loadingEl) loadingEl.style.display = 'none';
    } catch (err) {
      console.error('[Pedigree]', err);
      if (loadingEl) loadingEl.innerHTML = '⚠ Lỗi tải dữ liệu.<br><small>' + err.message + '</small>';
    }
  }

  // Hook tab
  function hookTab() {
    const tabPhaDo = document.querySelector('[data-tab="pha-do"]');
    if (tabPhaDo) tabPhaDo.addEventListener('click', () => setTimeout(init, 100));
    const sec = document.getElementById('tab-pha-do');
    if (sec && sec.style.display !== 'none') init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hookTab);
  } else {
    hookTab();
  }

  window.Pedigree = { init, loadAndRender };
})();
