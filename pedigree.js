/* ============================================================
   pedigree.js — Phase B2 (v2.3) — FINAL
   ============================================================ */
(function () {
  'use strict';

  const FOCUS_NAME = 'Phạm Văn Mỹ';
  const NODE_W = 200, NODE_H = 80;
  const GAP_X  = 50;
  const ROW_Y  = 200;

  let svg, gRoot, gLinks, gNodes, zoomBehavior;
  let tooltipEl, loadingEl;
  let initialized = false;
  let isRendering = false;
  let currentNodes = [];

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
    maxMs = maxMs || 6000;
    const start = Date.now();
    let tries = 0;
    while (Date.now() - start < maxMs) {
      try {
        const { data } = await sb.auth.getSession();
        if (data && data.session && data.session.user) {
          console.log('[Pedigree] ✓ Session OK sau ' + tries + ' lần');
          return true;
        }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 250));
      tries++;
    }
    return false;
  }

  async function waitForAppData(maxMs) {
    maxMs = maxMs || 6000;
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      if (window.allPersons && window.allPersons.length > 0) {
        console.log('[Pedigree] ✓ allPersons ' + window.allPersons.length + ' người');
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
        const res = await buildQuery(sb.from(table).select('*'));
        lastRes = res;
        if (!res.error && res.data && res.data.length > 0) return res;
      } catch (e) { lastRes = { data: [], error: e }; }
      await new Promise(r => setTimeout(r, 300));
    }
    return lastRes;
  }

  async function loadData() {
    const sb = getSupabase();
    if (!sb) throw new Error('Không tìm thấy Supabase client.');

    console.log('[Pedigree] Bắt đầu loadData...');
    await Promise.all([waitForSession(sb, 6000), waitForAppData(6000)]);

    const focusRes = await queryArray(sb, 'persons', q => q.eq('full_name', FOCUS_NAME), 6);
    let focus = (focusRes.data || [])[0];
    if (!focus && window.allPersons) {
      focus = window.allPersons.find(p => (p.full_name || '').trim() === FOCUS_NAME);
    }
    if (!focus) throw new Error('Không tìm thấy "' + FOCUS_NAME + '"');
    console.log('[Pedigree] ✓ Focus:', focus.full_name);

    // Cha mẹ
    const pcP = await queryArray(sb, 'parent_child', q => q.eq('child_id', focus.id), 5);
    const pIds = (pcP.data || []).map(r => r.parent_id);
    let parents = [];
    if (pIds.length) {
      const pRes = await queryArray(sb, 'persons', q => q.in('id', pIds), 4);
      parents = pRes.data || [];
    }

    // Vợ/chồng
    const mRes = await queryArray(sb, 'marriages', q => q.or('husband_id.eq.' + focus.id + ',wife_id.eq.' + focus.id), 5);
    const marriages = mRes.data || [];
    let spouse = null;
    if (marriages.length) {
      const m = marriages[0];
      const sid = m.husband_id === focus.id ? m.wife_id : m.husband_id;
      const sRes = await queryArray(sb, 'persons', q => q.eq('id', sid), 4);
      spouse = (sRes.data || [])[0] || null;
    }

    // Con
    const pcC = await queryArray(sb, 'parent_child', q => q.eq('parent_id', focus.id), 5);
    const pcChildren = pcC.data || [];
    const relMap = {};
    pcChildren.forEach(r => { relMap[r.child_id] = { relation: r.relation || 'Con chung', parent_role: r.parent_role || 'Bố' }; });
    const cIds = pcChildren.map(r => r.child_id);
    let children = [];
    if (cIds.length) {
      const cRes = await queryArray(sb, 'persons', q => q.in('id', cIds), 4);
      children = (cRes.data || []).map(c => Object.assign({}, c, relMap[c.id] || {}))
        .sort((a, b) => {
          const ao = a.sibling_order != null ? a.sibling_order : 9999;
          const bo = b.sibling_order != null ? b.sibling_order : 9999;
          if (ao !== bo) return ao - bo;
          const ay = a.birth_year || 9999, by = b.birth_year || 9999;
          if (ay !== by) return ay - by;
          return (a.full_name || '').localeCompare(b.full_name || '', 'vi');
        });
    }

    console.log('[Pedigree] ✓ Load xong: cha mẹ=' + parents.length + ' | vợ=' + (spouse ? 1 : 0) + ' | con=' + children.length);
    return { focus, parents, spouse, children };
  }

  function render(data) {
    const { focus, parents, spouse, children } = data;

    gLinks.selectAll('*').remove();
    gNodes.selectAll('*').remove();

    const nodes = [], links = [];

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

    children.forEach(c => {
      const rel = (c.relation || 'Con chung').toLowerCase();
      let linkType = 'child-chung';
      let fromAnchor = 'coupleCenter';
      if (rel.includes('riêng ngoài') || rel.includes('ngoài huyết thống')) {
        linkType = 'child-ngoai-huyet-thong';
        fromAnchor = (c.parent_role === 'Bố') ? 'focus' : 'spouse';
      } else if (rel.includes('nuôi')) {
        linkType = 'child-nuoi';
        fromAnchor = (c.parent_role === 'Bố') ? 'focus' : 'spouse';
      } else if (rel.includes('giá thú')) {
        linkType = 'child-ngoai-gia-thu';
        fromAnchor = (c.parent_role === 'Bố') ? 'focus' : 'spouse';
      } else if (rel.includes('riêng')) {
        linkType = 'child-rieng';
        fromAnchor = (c.parent_role === 'Bố') ? 'focus' : 'spouse';
      }
      links.push({ type: 'blood', linkType: linkType, from: fromAnchor, to: c.id });
    });

    gLinks.selectAll('path').data(links).enter().append('path')
      .attr('class', d => 'ped-link' + (d.type === 'marriage' ? ' marriage' : '') + (d.linkType ? ' ' + d.linkType : ''))
      .attr('d', d => computePath(d, nodes));

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
      .text(d => yearText(d.person));

    if (!spouse) {
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
      const ps = nodes.filter(n => n.kind === 'parent');
      if (!ps.length || !child) return '';
      const cx = ps.reduce((s, n) => s + n.x, 0) / ps.length;
      const cy = -ROW_Y + NODE_H / 2;
      const cty = child.y - NODE_H / 2;
      const my = (cy + cty) / 2;
      return 'M ' + cx + ' ' + cy + ' L ' + cx + ' ' + my + ' L ' + child.x + ' ' + my + ' L ' + child.x + ' ' + cty;
    }

    if (link.from === 'coupleCenter' && link.to) {
      const child = get(link.to);
      if (!child) return '';
      const cp = nodes.filter(n => n.kind === 'focus' || n.kind === 'spouse');
      const cx = cp.reduce((s, n) => s + n.x, 0) / cp.length;
      const cy = NODE_H / 2;
      const cty = child.y - NODE_H / 2;
      const my = (cy + cty) / 2;
      return 'M ' + cx + ' ' + cy + ' L ' + cx + ' ' + my + ' L ' + child.x + ' ' + my + ' L ' + child.x + ' ' + cty;
    }

    if ((link.from === 'focus' || link.from === 'spouse') && link.to) {
      const child = get(link.to);
      if (!child) return '';
      const anchor = nodes.find(n => link.from === 'focus' ? n.kind === 'focus' : n.kind === 'spouse');
      if (!anchor) return '';
      const py = anchor.y + NODE_H / 2;
      const cty = child.y - NODE_H / 2;
      const my = (py + cty) / 2;
      return 'M ' + anchor.x + ' ' + py + ' L ' + anchor.x + ' ' + my + ' L ' + child.x + ' ' + my + ' L ' + child.x + ' ' + cty;
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
    svg.transition().duration(400).call(zoomBehavior.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }

  function showTooltip(event, d) {
    const p = d.person;
    const rel = p.relation ? '<br>Quan hệ: <strong>' + p.relation + '</strong>' : '';
    tooltipEl.innerHTML = '<strong style="color:#C49504">' + (p.full_name || '?') + '</strong>' + rel + '<br>' +
      'Đời: ' + (p.generation || '?') + ' • Nhánh: ' + (p.branch || '?') + '<br>' +
      'Giới tính: ' + (p.gender || '?') + '<br>' +
      'Sinh: ' + (p.birth_year || '?') + (p.death_year ? ' • Mất: ' + p.death_year : '') + '<br>' +
      '<em style="opacity:.7">Đúp chuột để mở Danh tính</em>';
    tooltipEl.style.display = 'block';
    const r = svg.node().getBoundingClientRect();
    tooltipEl.style.left = (event.clientX - r.left + 12) + 'px';
    tooltipEl.style.top  = (event.clientY - r.top  + 12) + 'px';
    clearTimeout(showTooltip._t);
    showTooltip._t = setTimeout(() => { tooltipEl.style.display = 'none'; }, 4000);
  }

  function openInDanhTinh(id) {
    const tab = document.querySelector('[data-tab="danh-tinh"]');
    if (tab) tab.click();
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('pedigree:open-person', { detail: { personId: id } }));
      ['openPersonDetail','showPersonDetail','selectPerson','openPersonModal','openPersonForm'].forEach(fn => {
        if (typeof window[fn] === 'function') try { window[fn](id); } catch (e) {}
      });
    }, 200);
  }

  function drawLegend() {
    svg.selectAll('.ped-legend').remove();
    const legend = svg.append('g').attr('class', 'ped-legend').attr('transform', 'translate(20, 20)');
    const items = [
      { c: '#bd9733', d: null,  l: 'Con chung / Con riêng' },
      { c: '#bd9733', d: '6 4', l: 'Con ngoài giá thú' },
      { c: '#01285E', d: '4 3', l: 'Con nuôi' },
      { c: '#999999', d: '2 4', l: '🔒 Con riêng ngoài huyết thống' }
    ];
    legend.append('rect')
      .attr('x', -8).attr('y', -8)
      .attr('width', 260).attr('height', items.length * 22 + 20)
      .attr('fill', 'rgba(255,255,255,0.92)')
      .attr('stroke', '#88a9ad').attr('stroke-width', 1.5)
      .attr('rx', 8).attr('ry', 8);
    items.forEach((item, i) => {
      const y = i * 22 + 8;
      const line = legend.append('line')
        .attr('x1', 0).attr('y1', y).attr('x2', 32).attr('y2', y)
        .attr('stroke', item.c).attr('stroke-width', 2.5);
      if (item.d) line.attr('stroke-dasharray', item.d);
      legend.append('text').attr('x', 40).attr('y', y + 4)
        .attr('font-size', '12px').attr('fill', '#01285E').attr('font-weight', '500')
        .text(item.l);
    });
  }

  async function init() {
    if (initialized) return;
    initialized = true;
    console.log('[Pedigree] === INIT ===');

    svg = d3.select('#pedigree-svg');
    svg.selectAll('*').remove();
    tooltipEl = document.getElementById('pedigree-tooltip');
    loadingEl = document.getElementById('pedigree-loading');

    gRoot  = svg.append('g');
    gLinks = gRoot.append('g').attr('class', 'ped-links');
    gNodes = gRoot.append('g').attr('class', 'ped-nodes');

    zoomBehavior = d3.zoom().scaleExtent([0.2, 2.5])
      .on('zoom', (e) => {
        gRoot.attr('transform', e.transform);
        const lg = svg.select('.ped-legend');
        if (!lg.empty()) {
          const k = e.transform.k;
          lg.attr('transform', 'translate(' + (20/k) + ',' + (20/k) + ') scale(' + (1/k) + ')');
        }
      });
    svg.call(zoomBehavior);
    drawLegend();

    const zIn = document.getElementById('pedZoomIn');
    const zOut = document.getElementById('pedZoomOut');
    const zReset = document.getElementById('pedZoomReset');
    const zFocus = document.getElementById('pedFocusMy');
    if (zIn) zIn.addEventListener('click', () => svg.transition().call(zoomBehavior.scaleBy, 1.25));
    if (zOut) zOut.addEventListener('click', () => svg.transition().call(zoomBehavior.scaleBy, 0.8));
    if (zReset) zReset.addEventListener('click', () => centerView(currentNodes));
    if (zFocus) zFocus.addEventListener('click', loadAndRender);

    await loadAndRender();
  }

  async function loadAndRender() {
    if (isRendering) return;
    isRendering = true;
    try {
      if (loadingEl) { loadingEl.style.display = 'block'; loadingEl.innerHTML = 'Đang tải phả đồ...'; }
      console.log('[Pedigree] loadData...');
      const data = await loadData();
      console.log('[Pedigree] render...');
      render(data);
      if (loadingEl) loadingEl.style.display = 'none';
      console.log('[Pedigree] ✓ DONE');
    } catch (err) {
      console.error('[Pedigree] ❌', err);
      if (loadingEl) loadingEl.innerHTML = '⚠ ' + (err.message || err);
    } finally { isRendering = false; }
  }

  function onTabClick() {
    console.log('[Pedigree] Tab clicked');
    setTimeout(() => { if (!initialized) init(); else loadAndRender(); }, 200);
  }

  function setup() {
    const tab = document.querySelector('[data-tab="pha-do"]');
    if (tab) tab.addEventListener('click', onTabClick);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else { setup(); }

  window.Pedigree = { init, loadAndRender, reload: loadAndRender };
})();
