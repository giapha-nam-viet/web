/* ============================================================
   pedigree.js — v3.0 SIMPLE
   Viết lại từ đầu, tối giản, dễ debug
   ============================================================ */
console.log('[Pedigree] ★ File loaded v3.0');

(function () {
  'use strict';

  const FOCUS_NAME = 'Phạm Văn Mỹ';
  const NODE_W = 200, NODE_H = 80;
  const GAP_X  = 60;
  const ROW_Y  = 200;

  let svg, gRoot, gLinks, gNodes, zoomBehavior;
  let tooltipEl, loadingEl;
  let initialized = false;
  let currentNodes = [];

  // ============ KHỞI TẠO KHI CLICK TAB ============
  function setupTabListener() {
    const tab = document.querySelector('[data-tab="pha-do"]');
    if (!tab) {
      console.error('[Pedigree] ❌ Không tìm thấy tab pha-do');
      return;
    }
    console.log('[Pedigree] ✓ Đã gắn listener cho tab Phả đồ');
    tab.addEventListener('click', () => {
      console.log('[Pedigree] Tab Phả đồ được click');
           setTimeout(function() { init(); }, 300);
    });
  }

  // ============ INIT ============
  async function init() {
    console.log('[Pedigree] === INIT ===');
    if (initialized) {
      console.log('[Pedigree] Đã init rồi, chỉ reload');
      await loadAndRender();
      return;
    }
    initialized = true;

    // Lấy element
    svg = d3.select('#pedigree-svg');
    if (svg.empty()) {
      console.error('[Pedigree] ❌ Không tìm thấy #pedigree-svg');
      return;
    }
    tooltipEl = document.getElementById('pedigree-tooltip');
    loadingEl = document.getElementById('pedigree-loading');
    console.log('[Pedigree] ✓ Đã lấy element svg/tooltip/loading');

    // Tạo group
    gRoot = svg.append('g');
    gLinks = gRoot.append('g').attr('class', 'ped-links');
    gNodes = gRoot.append('g').attr('class', 'ped-nodes');

    // Zoom
    zoomBehavior = d3.zoom()
      .scaleExtent([0.2, 2.5])
      .on('zoom', (e) => gRoot.attr('transform', e.transform));
    svg.call(zoomBehavior);

    // Nút
    const zIn = document.getElementById('pedZoomIn');
    const zOut = document.getElementById('pedZoomOut');
    const zReset = document.getElementById('pedZoomReset');
    const zFocus = document.getElementById('pedFocusMy');
    if (zIn) zIn.onclick = () => svg.transition().call(zoomBehavior.scaleBy, 1.25);
    if (zOut) zOut.onclick = () => svg.transition().call(zoomBehavior.scaleBy, 0.8);
    if (zReset) zReset.onclick = () => centerView(currentNodes);
    if (zFocus) zFocus.onclick = loadAndRender;

    await loadAndRender();
  }

  // ============ LOAD DATA ============
  async function loadAndRender() {
    console.log('[Pedigree] Bắt đầu loadAndRender');
    if (loadingEl) loadingEl.style.display = 'block';

    try {
      const sb = window.sbClient || window.appSupabase || window.supabase;
      if (!sb || !sb.from) throw new Error('Không có Supabase client');

      // Đợi session
      let tries = 0;
      while (tries < 20) {
        const { data } = await sb.auth.getSession();
        if (data && data.session) break;
        await new Promise(r => setTimeout(r, 300));
        tries++;
      }
      console.log('[Pedigree] ✓ Session OK sau ' + tries + ' lần thử');

      // 1. Tìm Mỹ
      const { data: focuses } = await sb.from('persons')
        .select('*').eq('full_name', FOCUS_NAME);
      if (!focuses || !focuses.length) throw new Error('Không tìm thấy ' + FOCUS_NAME);
      const focus = focuses[0];
      console.log('[Pedigree] ✓ Focus:', focus.full_name, '| id:', focus.id);

      // 2. Cha mẹ
      const { data: pcP } = await sb.from('parent_child')
        .select('*').eq('child_id', focus.id);
      let parents = [];
      if (pcP && pcP.length) {
        const pIds = pcP.map(r => r.parent_id);
        const { data: ps } = await sb.from('persons').select('*').in('id', pIds);
        parents = ps || [];
      }
      console.log('[Pedigree] ✓ Cha mẹ:', parents.length);

      // 3. Vợ/chồng
      const { data: marr } = await sb.from('marriages')
        .select('*').or('husband_id.eq.' + focus.id + ',wife_id.eq.' + focus.id);
      let spouse = null;
      if (marr && marr.length) {
        const m = marr[0];
        const sid = m.husband_id === focus.id ? m.wife_id : m.husband_id;
        const { data: sp } = await sb.from('persons').select('*').eq('id', sid);
        spouse = (sp && sp[0]) || null;
      }
      console.log('[Pedigree] ✓ Vợ/chồng:', spouse ? spouse.full_name : 'không có');

      // 4. Con
      const { data: pcC } = await sb.from('parent_child')
        .select('*').eq('parent_id', focus.id);
      let children = [];
      if (pcC && pcC.length) {
        const relMap = {};
        pcC.forEach(r => relMap[r.child_id] = { relation: r.relation || 'Con chung', parent_role: r.parent_role || 'Bố' });
        const cIds = pcC.map(r => r.child_id);
        const { data: cs } = await sb.from('persons').select('*').in('id', cIds);
        children = (cs || []).map(c => Object.assign({}, c, relMap[c.id] || {}))
          .sort((a, b) => (a.sibling_order || 999) - (b.sibling_order || 999));
      }
      console.log('[Pedigree] ✓ Con:', children.length);

      // Vẽ
      render({ focus, parents, spouse, children });
      if (loadingEl) loadingEl.style.display = 'none';
      console.log('[Pedigree] ✓ DONE');

    } catch (err) {
      console.error('[Pedigree] ❌ LỖI:', err);
      if (loadingEl) loadingEl.innerHTML = '⚠ ' + (err.message || err);
    }
  }

  // ============ VẼ ============
  function render(data) {
    const { focus, parents, spouse, children } = data;
    gLinks.selectAll('*').remove();
    gNodes.selectAll('*').remove();

    const nodes = [], links = [];

    // Cha mẹ
    parents.forEach((p, i) => {
      const total = parents.length;
      const offset = (i - (total - 1) / 2) * (NODE_W + GAP_X);
      nodes.push({ id: p.id, person: p, x: offset, y: -ROW_Y, kind: 'parent' });
    });

    // Mỹ + vợ
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
    if (parents.length) links.push({ from: 'parentsCenter', to: focus.id });
    if (spouse) links.push({ from: 'focus', to: spouse.id, direct: true });
    children.forEach(c => {
      const rel = (c.relation || '').toLowerCase();
      let anchor = 'coupleCenter';
      if (rel.includes('nuôi')) anchor = (c.parent_role === 'Mẹ') ? 'spouse' : 'focus';
      else if (rel.includes('giá thú') || rel.includes('riêng')) anchor = (c.parent_role === 'Mẹ') ? 'spouse' : 'focus';
      links.push({ from: anchor, to: c.id });
    });

    // Vẽ links
    gLinks.selectAll('path').data(links).enter().append('path')
      .attr('class', 'ped-link')
      .attr('d', d => computePath(d, nodes));

    // Vẽ nodes
    const nodeSel = gNodes.selectAll('g.ped-node')
      .data(nodes, d => d.id).enter().append('g')
      .attr('class', d => 'ped-node ' + d.kind)
      .attr('transform', d => 'translate(' + (d.x - NODE_W/2) + ',' + (d.y - NODE_H/2) + ')')
      .style('cursor', 'pointer');

    nodeSel.append('rect').attr('width', NODE_W).attr('height', NODE_H);

    nodeSel.append('text').attr('class', 'name')
      .attr('x', NODE_W / 2).attr('y', 30).attr('text-anchor', 'middle')
      .text(d => d.person.full_name || '?');

    nodeSel.append('text').attr('class', 'years')
      .attr('x', NODE_W / 2).attr('y', 54).attr('text-anchor', 'middle')
      .text(d => {
        const b = d.person.birth_year ? String(d.person.birth_year) : '?';
        const dd = d.person.death_year ? String(d.person.death_year) : '';
        return dd ? '(' + b + ' - ' + dd + ')' : '(' + b + ')';
      });

    nodeSel.on('click', showTooltip);
    nodeSel.on('dblclick', (e, d) => {
      e.stopPropagation();
      const tab = document.querySelector('[data-tab="danh-tinh"]');
      if (tab) tab.click();
      setTimeout(() => {
        ['openPersonDetail','showPersonDetail','selectPerson','openPersonForm'].forEach(fn => {
          if (typeof window[fn] === 'function') try { window[fn](d.id); } catch(e){}
        });
      }, 300);
    });

    currentNodes = nodes;
    centerView(nodes);
    console.log('[Pedigree] ✓ Đã vẽ', nodes.length, 'node,', links.length, 'link');
  }

  // ============ PATH ============
  function computePath(link, nodes) {
    const get = (id) => nodes.find(n => n.id === id);

    if (link.from === 'parentsCenter' && link.to) {
      const child = get(link.to);
      const ps = nodes.filter(n => n.kind === 'parent');
      if (!ps.length || !child) return '';
      const cx = ps.reduce((s, n) => s + n.x, 0) / ps.length;
      const cy = -ROW_Y + NODE_H / 2;
      const cty = child.y - NODE_H / 2;
      const my = (cy + cty) / 2;
      return `M ${cx} ${cy} L ${cx} ${my} L ${child.x} ${my} L ${child.x} ${cty}`;
    }

    if (link.from === 'coupleCenter' && link.to) {
      const child = get(link.to);
      if (!child) return '';
      const cp = nodes.filter(n => n.kind === 'focus' || n.kind === 'spouse');
      const cx = cp.reduce((s, n) => s + n.x, 0) / cp.length;
      const cy = NODE_H / 2;
      const cty = child.y - NODE_H / 2;
      const my = (cy + cty) / 2;
      return `M ${cx} ${cy} L ${cx} ${my} L ${child.x} ${my} L ${child.x} ${cty}`;
    }

    if ((link.from === 'focus' || link.from === 'spouse') && link.to) {
      const child = get(link.to);
      if (!child) return '';
      const a = nodes.find(n => link.from === 'focus' ? n.kind === 'focus' : n.kind === 'spouse');
      if (!a) return '';
      const py = a.y + NODE_H / 2;
      const cty = child.y - NODE_H / 2;
      const my = (py + cty) / 2;
      return `M ${a.x} ${py} L ${a.x} ${my} L ${child.x} ${my} L ${child.x} ${cty}`;
    }

    if (link.direct) {
      const a = get(link.from), b = get(link.to);
      if (!a || !b) return '';
      const x1 = a.x + (a.x < b.x ? NODE_W / 2 : -NODE_W / 2);
      const x2 = b.x + (b.x > a.x ? -NODE_W / 2 : NODE_W / 2);
      return `M ${x1} ${a.y} L ${x2} ${b.y}`;
    }
    return '';
  }

  // ============ CENTER VIEW ============
  function centerView(nodes) {
    if (!nodes.length || !svg || !svg.node()) return;
    const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
    const minX = Math.min.apply(null, xs) - NODE_W;
    const maxX = Math.max.apply(null, xs) + NODE_W;
    const minY = Math.min.apply(null, ys) - NODE_H;
    const maxY = Math.max.apply(null, ys) + NODE_H;
    const w = maxX - minX, h = maxY - minY;
    const svgW = svg.node().clientWidth, svgH = svg.node().clientHeight;
    if (!svgW || !svgH) return;
    const scale = Math.min(svgW / w, svgH / h) * 0.85;
    const tx = svgW / 2 - ((minX + maxX) / 2) * scale;
    const ty = svgH / 2 - ((minY + maxY) / 2) * scale;
    svg.transition().duration(400).call(
      zoomBehavior.transform,
      d3.zoomIdentity.translate(tx, ty).scale(scale)
    );
  }

  // ============ TOOLTIP ============
  function showTooltip(event, d) {
    const p = d.person;
    const rel = p.relation ? '<br>Quan hệ: <b>' + p.relation + '</b>' : '';
    tooltipEl.innerHTML =
      '<b style="color:#C49504">' + (p.full_name || '?') + '</b>' + rel +
      '<br>Đời: ' + (p.generation || '?') +
      '<br>Giới tính: ' + (p.gender || '?') +
      '<br>Sinh: ' + (p.birth_year || '?') + (p.death_year ? ' • Mất: ' + p.death_year : '');
    tooltipEl.style.display = 'block';
    const r = svg.node().getBoundingClientRect();
    tooltipEl.style.left = (event.clientX - r.left + 12) + 'px';
    tooltipEl.style.top  = (event.clientY - r.top + 12) + 'px';
    clearTimeout(showTooltip._t);
    showTooltip._t = setTimeout(() => tooltipEl.style.display = 'none', 4000);
  }

  // ============ BOOT ============
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupTabListener);
  } else {
    setupTabListener();
  }

  window.Pedigree = { init, loadAndRender };
})();
