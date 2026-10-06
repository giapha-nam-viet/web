/* ============================================================
   pedigree.js — Phase B1 (MVP)
   Focus: Phạm Văn Mỹ — hiển thị 3 đời (cha mẹ / Mỹ + vợ / con)
   ============================================================ */
(function () {
  'use strict';

  const FOCUS_ID = '4a918514-5402-470d-8aa0-52b41edb23f6'; // Phạm Văn Mỹ
  const NODE_W = 170, NODE_H = 70;
  const GAP_X  = 50;   // khoảng cách giữa 2 node cùng hàng
  const ROW_Y  = 200;  // khoảng cách giữa 2 đời

  let svg, gRoot, gLinks, gNodes, zoomBehavior;
  let tooltipEl, loadingEl;
  let initialized = false;

  // ---------- Tìm Supabase client (dò đa tầng) ----------
  function getSupabase() {
    if (typeof window.appSupabase !== 'undefined') return window.appSupabase;
    if (typeof window.supabaseClient !== 'undefined') return window.supabaseClient;
    if (typeof window._supabase !== 'undefined') return window._supabase;
    // window.supabase có thể là THƯ VIỆN (có createClient) chứ không phải CLIENT (có from)
    if (typeof window.supabase !== 'undefined' && typeof window.supabase.from === 'function') {
      return window.supabase;
    }
    // Thử biến local trong scope global
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
    if (!sb) {
      throw new Error('Không tìm thấy Supabase client. Xem hướng dẫn fix ở cuối file pedigree.js.');
    }

    // 1. Thông tin Mỹ
    const { data: focus, error: e1 } = await sb.from('persons').select('*').eq('id', FOCUS_ID).single();
    if (e1) throw e1;

    // 2. Cha mẹ của Mỹ
    const { data: pcParents } = await sb.from('parent_child').select('*').eq('child_id', FOCUS_ID);
    const parentIds = (pcParents || []).map(r => r.parent_id);
    let parents = [];
    if (parentIds.length) {
      const { data: ps } = await sb.from('persons').select('*').in('id', parentIds);
      parents = ps || [];
    }

    // 3. Vợ/chồng (B1: lấy người đầu tiên)
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

    // 4. Con của Mỹ
    const { data: pcChildren } = await sb.from('parent_child').select('*').eq('parent_id', FOCUS_ID);
    const childIds = (pcChildren || []).map(r => r.child_id);
    let children = [];
    if (childIds.length) {
      const { data: cs } = await sb.from('persons').select('*').in('id', childIds);
      // Sắp xếp theo năm sinh
      children = (cs || []).sort((a, b) => (a.birth_year || 9999) - (b.birth_year || 9999));
    }

    return { focus, parents, spouse, children };
  }

  // ---------- Vẽ ----------
  function render(data) {
    const { focus, parents, spouse, children } = data;

    // Xoá toàn bộ
    gRoot.selectAll('*').remove();

    const nodes = [];
    const links = [];

    // ==== TÍNH TOẠ ĐỘ ====
    // Tâm group giữa = x = 0
    // Row 1 (cha mẹ):      y = -ROW_Y
    // Row 2 (Mỹ + vợ):     y = 0
    // Row 3 (con):         y = ROW_Y

    // -- Cha mẹ --
    let chaX = null, meX = null;
    const father = parents.find(p => p.gender === 'Nam' || p.gender === 'nam' || p.gender === 'male');
    const mother = parents.find(p => p.gender === 'Nữ'  || p.gender === 'nữ'  || p.gender === 'female');
    const otherParents = parents.filter(p => p !== father && p !== mother);

    // Xếp cha mẹ cạnh nhau, căn giữa tại x=0
    const parentList = [father, mother, ...otherParents].filter(Boolean);
    parentList.forEach((p, i) => {
      const total = parentList.length;
      const offset = (i - (total - 1) / 2) * (NODE_W + GAP_X);
      nodes.push({ id: p.id, person: p, x: offset, y: -ROW_Y, kind: 'parent' });
    });

    // -- Mỹ + Vợ --
    if (spouse) {
      // 2 người, căn giữa: Mỹ bên trái, vợ bên phải
      nodes.push({ id: focus.id, person: focus, x: -(NODE_W + GAP_X) / 2, y: 0, kind: 'focus' });
      nodes.push({ id: spouse.id, person: spouse, x:  (NODE_W + GAP_X) / 2, y: 0, kind: 'spouse' });
    } else {
      nodes.push({ id: focus.id, person: focus, x: 0, y: 0, kind: 'focus' });
    }

    // -- Con --
    children.forEach((c, i) => {
      const total = children.length;
      const offset = (i - (total - 1) / 2) * (NODE_W + GAP_X);
      nodes.push({ id: c.id, person: c, x: offset, y: ROW_Y, kind: 'child' });
    });

    // ==== TÍNH LINKS ====
    // Cha—Mẹ
    if (father && mother) {
      links.push({ type: 'marriage', x1: chaX ?? -(NODE_W + GAP_X) / 2, y1: -ROW_Y,
                                    x2: meX ??   (NODE_W + GAP_X) / 2, y2: -ROW_Y, custom: true });
    }
    // Cha/Mẹ → Mỹ (đường dọc từ tâm cha mẹ xuống Mỹ)
    if (parentList.length) {
      links.push({ type: 'blood', from: 'parentsCenter', to: focus.id });
    }
    // Mỹ — Vợ
    if (spouse) {
      links.push({ type: 'marriage', from: focus.id, to: spouse.id, direct: true });
    }
    // Mỹ/Vợ → Con
    children.forEach(c => {
      links.push({ type: 'blood', from: 'coupleCenter', to: c.id });
    });

    // ==== VẼ LINKS TRƯỚC ====
    gLinks.selectAll('path')
      .data(links)
      .enter()
      .append('path')
      .attr('class', d => 'ped-link ' + (d.type === 'marriage' ? 'marriage' : ''))
      .attr('d', d => computePath(d, nodes, spouse ? focus.id : null));

    // ==== VẼ NODES ====
    const nodeSel = gNodes.selectAll('g.ped-node')
      .data(nodes, d => d.id)
      .enter()
      .append('g')
      .attr('class', d => 'ped-node ' + d.kind)
      .attr('transform', d => `translate(${d.x - NODE_W/2}, ${d.y - NODE_H/2})`)
      .attr('data-id', d => d.id)
      .style('cursor', 'pointer');

    nodeSel.append('rect')
      .attr('width', NODE_W)
      .attr('height', NODE_H);

    nodeSel.append('text')
      .attr('class', 'name')
      .attr('x', NODE_W / 2)
      .attr('y', 26)
      .attr('text-anchor', 'middle')
      .text(d => shortName(d.person.full_name));

    nodeSel.append('text')
      .attr('class', 'years')
      .attr('x', NODE_W / 2)
      .attr('y', 46)
      .attr('text-anchor', 'middle')
      .text(d => yearText(d.person));

    if (!spouse && (focus.gender === 'Nam' || focus.gender === 'Nữ')) {
      // badge chưa liên kết nếu không có vợ/chồng
      nodeSel.filter(d => d.kind === 'focus').append('text')
        .attr('class', 'badge-unlinked')
        .attr('x', NODE_W / 2)
        .attr('y', 62)
        .attr('text-anchor', 'middle')
        .text('⚠ chưa liên kết');
    }

    // ==== SỰ KIỆN ====
    nodeSel
      .on('click', (event, d) => showTooltip(event, d))
      .on('dblclick', (event, d) => { event.stopPropagation(); openInDanhTinh(d.id); });

    // Căn giữa view
    centerView(nodes);
  }

  // ---------- Tính đường nối ----------
  function computePath(link, nodes, focusId) {
    const get = (id) => nodes.find(n => n.id === id);
    if (link.from === 'parentsCenter' && link.to) {
      const child = get(link.to);
      const parents = nodes.filter(n => n.kind === 'parent');
      if (!parents.length || !child) return '';
      const cx = parents.reduce((s, n) => s + n.x, 0) / parents.length;
      const cy = -ROW_Y + NODE_H / 2;
      const childTopY = child.y - NODE_H / 2;
      return `M ${cx} ${cy} L ${cx} ${(cy + childTopY) / 2} L ${child.x} ${(cy + childTopY) / 2} L ${child.x} ${childTopY}`;
    }
    if (link.from === 'coupleCenter' && link.to) {
      const child = get(link.to);
      if (!child) return '';
      // Tâm cặp = trung bình x của Mỹ + vợ (nếu có)
      const couple = nodes.filter(n => n.kind === 'focus' || n.kind === 'spouse');
      const cx = couple.reduce((s, n) => s + n.x, 0) / couple.length;
      const cy = NODE_H / 2;
      const childTopY = child.y - NODE_H / 2;
      return `M ${cx} ${cy} L ${cx} ${(cy + childTopY) / 2} L ${child.x} ${(cy + childTopY) / 2} L ${child.x} ${childTopY}`;
    }
    if (link.direct && link.from && link.to) {
      const a = get(link.from), b = get(link.to);
      if (!a || !b) return '';
      const x1 = a.x + (a.x < b.x ? NODE_W/2 : -NODE_W/2);
      const x2 = b.x + (b.x > a.x ? -NODE_W/2 : NODE_W/2);
      return `M ${x1} ${a.y} L ${x2} ${b.y}`;
    }
    return '';
  }

  // ---------- Căn giữa view ----------
  function centerView(nodes) {
    if (!nodes.length || !svg) return;
    const xs = nodes.map(n => n.x);
    const ys = nodes.map(n => n.y);
    const minX = Math.min(...xs) - NODE_W;
    const maxX = Math.max(...xs) + NODE_W;
    const minY = Math.min(...ys) - NODE_H;
    const maxY = Math.max(...ys) + NODE_H;
    const w = maxX - minX, h = maxY - minY;
    const svgW = svg.node().clientWidth;
    const svgH = svg.node().clientHeight;
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
      <strong style="color:#f5c518">${p.full_name || '?'}</strong><br>
      Đời: ${p.generation || '?'} • Nhánh: ${p.branch || '?'}<br>
      Giới tính: ${p.gender || '?'}<br>
      Sinh: ${p.birth_year || '?'} ${p.death_year ? '• Mất: ' + p.death_year : ''}<br>
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
      ['openPersonDetail','showPersonDetail','selectPerson','openPersonModal'].forEach(fn => {
        if (typeof window[fn] === 'function') { try { window[fn](personId); } catch(e){} }
      });
    }, 150);
  }

  // ---------- Khởi tạo ----------
  async function init() {
    if (initialized) return;
    initialized = true;

    svg = d3.select('#pedigree-svg');
    tooltipEl = document.getElementById('pedigree-tooltip');
    loadingEl = document.getElementById('pedigree-loading');

    // Tạo group gốc
    gRoot   = svg.append('g');
    gLinks  = gRoot.append('g').attr('class', 'ped-links');
    gNodes  = gRoot.append('g').attr('class', 'ped-nodes');

    // Zoom + Pan
    zoomBehavior = d3.zoom()
      .scaleExtent([0.2, 2.5])
      .on('zoom', (e) => gRoot.attr('transform', e.transform));
    svg.call(zoomBehavior);

    // Nút điều khiển
    document.getElementById('pedZoomIn')?.addEventListener('click', () => svg.transition().call(zoomBehavior.scaleBy, 1.25));
    document.getElementById('pedZoomOut')?.addEventListener('click', () => svg.transition().call(zoomBehavior.scaleBy, 0.8));
    document.getElementById('pedZoomReset')?.addEventListener('click', () => centerView(currentNodes));
    document.getElementById('pedFocusMy')?.addEventListener('click', () => loadAndRender());

    await loadAndRender();
  }

  let currentNodes = [];
  async function loadAndRender() {
    try {
      loadingEl.style.display = 'block';
      const data = await loadData();
      render(data);
      // Lưu lại nodes để centerView dùng
      currentNodes = gNodes.selectAll('g.ped-node').data().map(d => ({ x: d.x, y: d.y }));
      loadingEl.style.display = 'none';
    } catch (err) {
      console.error('[Pedigree]', err);
      loadingEl.innerHTML = '⚠ Lỗi tải dữ liệu.<br><small>' + err.message + '</small>';
    }
  }

  // ---------- Hook khi tab "Phả đồ" được chọn ----------
  function hookTab() {
    const tabPhaDo = document.querySelector('[data-tab="pha-do"]');
    if (tabPhaDo) tabPhaDo.addEventListener('click', () => init());
    // Nếu đang mở sẵn tab phả đồ
    const sec = document.getElementById('tab-pha-do');
    if (sec && sec.style.display !== 'none') init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hookTab);
  } else {
    hookTab();
  }

  // Expose ra ngoài
  window.Pedigree = { init, loadAndRender };
})();
