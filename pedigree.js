/* ============================================================
   pedigree.js v6.0 — Layout kiểu A (con nằm dưới cha)
   - Sửa lỗi cấu trúc v5.2/v5.3 hỏng (compute is not defined)
   - Đệ quy post-order: mỗi cây con có không gian riêng
   - Cha đặt ở tâm các con
   - Cháu nằm dưới con (đệ quy tự nhiên)
   - Vợ/chồng vẫn xếp dọc dưới cha
   - Giữ nguyên: load, buildTree, render, toolbar, autofocus
   ============================================================ */
(function () {
  'use strict';
  const LOG = '[Pedigree]';
  console.log(LOG, 'v6.0 loaded');

  // ---------- CONFIG ----------
  const CFG = {
    node:      { w: 180, h: 56 },
    gapX:      30,
    gapY:      90,
    padding:   60,
    spouseGap: 8,
    colors: {
      blood:  { stroke: '#88a9ad', fill: '#F5FAFA' },
      spouse: { stroke: '#b4c8ca', fill: '#F8FBFB' },
      focus:  { stroke: '#88a9ad', fill: '#FFF9E6' },
      linkBlood: '#bd9733',
      linkMarry: '#C97A7A'
    },
    zoom: { step: 0.15, min: 0.3, max: 2.5 },
    focusName: 'Phạm Văn Mỹ'
  };

  // ---------- STATE ----------
  let sb, svg, gRoot, zoomBehavior;
  let persons = [], parentChild = [], marriages = [];
  let tree = null;
  let currentScale = 1;
  let layoutData = null;

  // ---------- HELPERS ----------
  function isBlood(p) { return p && p.role_type === 'Huyết thống'; }
  function isFaded(p) {
    return p && (p.special_status === 'Mất sớm' || p.special_status === 'Không rõ');
  }
  function fadedLabel(p) {
    if (!p) return '';
    if (p.special_status === 'Mất sớm') return 'mất sớm';
    if (p.special_status === 'Không rõ') return 'thất lạc';
    return '';
  }
  function sortKey(p) {
    return p?.birth_order ?? p?.sibling_order ?? 9999;
  }

  // ---------- ENTRY ----------
  function init() {
    console.log(LOG, 'init()');
    try {
      sb = window.appSupabase || window.sbClient;
      if (!sb) { console.error(LOG, 'Supabase chưa sẵn sàng'); return; }
      const container = document.getElementById('pha-do-svg');
      if (!container) { console.warn(LOG, 'Không tìm thấy #pha-do-svg'); return; }

      setupToolbar();
      loadAll()
        .then(() => {
          tree = buildTree(persons, parentChild, marriages);
          if (!tree || !tree.roots.length) { console.warn(LOG, 'Không có data'); return; }
          render(container);
          fillBranchDropdown();
          autoFocus();
        })
        .catch(err => console.error(LOG, 'loadAll error', err));
    } catch (e) { console.error(LOG, 'init crash', e); }
  }

  // ---------- 1) LOAD ----------
  async function loadAll() {
    console.log(LOG, 'loadAll...');
    const [p, pc, m] = await Promise.all([
      sb.from('persons').select('*').eq('is_deleted', false),
      sb.from('parent_child').select('*'),
      sb.from('marriages').select('*')
    ]);
    if (p.error) throw p.error;
    if (pc.error) throw pc.error;
    if (m.error) throw m.error;
    persons = p.data || [];
    parentChild = pc.data || [];
    marriages = m.data || [];
    console.log(LOG, `loaded: ${persons.length} persons, ${parentChild.length} links, ${marriages.length} marriages`);
  }

  // ---------- 2) BUILD TREE ----------
  function buildTree(persons, pcLinks, marriages) {
    console.log(LOG, 'buildTree...');
    const byId = new Map(persons.map(p => [String(p.id), p]));

    // childrenOf: parentId → [childId]
    const childrenOf = new Map();
    const parentsOf = new Map();
    const childToFather = new Map();
    const childToMother = new Map();

    pcLinks.forEach(l => {
      const pid = String(l.parent_id), cid = String(l.child_id);
      if (!byId.has(pid) || !byId.has(cid)) return;
      if (l.parent_role === 'Bố') childToFather.set(cid, pid);
      else if (l.parent_role === 'Mẹ') childToMother.set(cid, pid);
    });

    const allChildren = new Set([...childToFather.keys(), ...childToMother.keys()]);
    allChildren.forEach(cid => {
      const pid = childToFather.get(cid) || childToMother.get(cid);
      if (!pid) return;
      if (!childrenOf.has(pid)) childrenOf.set(pid, []);
      childrenOf.get(pid).push(cid);
      const arr = [];
      if (childToFather.has(cid)) arr.push(childToFather.get(cid));
      if (childToMother.has(cid)) arr.push(childToMother.get(cid));
      parentsOf.set(cid, arr);
    });

    // spousesOf
    const spousesOf = new Map();
    marriages.forEach(m => {
      const h = String(m.husband_id), w = String(m.wife_id);
      const ord = m.marriage_order || 0;
      if (!byId.has(h) || !byId.has(w)) return;
      if (!spousesOf.has(h)) spousesOf.set(h, []);
      if (!spousesOf.has(w)) spousesOf.set(w, []);
      spousesOf.get(h).push({ spouseId: w, order: ord });
      spousesOf.get(w).push({ spouseId: h, order: ord });
    });

    // Cụ tổ
    const rootsAll = persons.filter(p => !parentsOf.has(String(p.id)));
    rootsAll.sort((a, b) => (a.generation || 0) - (b.generation || 0));
    if (!rootsAll.length) return null;
    const minGen = rootsAll[0].generation || 1;
    const rootPersons = rootsAll.filter(p => (p.generation || 0) === minGen && isBlood(p));
    if (!rootPersons.length) rootPersons.push(rootsAll[0]);

    // Chi (chỉ để filter dropdown)
    const branchSet = new Set();
    persons.forEach(p => { if (p.branch && p.branch.trim()) branchSet.add(p.branch.trim()); });
    const branches = Array.from(branchSet).sort();

    console.log(LOG, `tree: ${rootPersons.length} roots, ${branches.length} branches`);
    return { byId, childrenOf, parentsOf, spousesOf, roots: rootPersons, branches, minGen };
  }

  // ---------- 3) COMPUTE LAYOUT (kiểu A: con nằm dưới cha) ----------
  function computeLayout(tree) {
    console.log(LOG, 'computeLayout v6.0...');
    const { byId, childrenOf, spousesOf, roots } = tree;
    const NW = CFG.node.w, NH = CFG.node.h;
    const spouseGap = CFG.spouseGap;

    const nodes = [];
    const links = [];

    // Bước 1: Xây cây con (đệ quy) — mỗi subtree có width/height riêng
    const treeCache = new Map();

    function buildSubtree(person, depth) {
      if (!person || depth > 50) return null;
      const pid = String(person.id);
      if (treeCache.has(pid)) return treeCache.get(pid);

      // Vợ/chồng (đã loại người đã dùng ở nhánh khác — dùng placed set toàn cục)
      const spouses = (spousesOf.get(pid) || [])
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map(s => byId.get(s.spouseId))
        .filter(Boolean);

      // Khối hôn nhân: cha + n vợ
      const blockH = NH + spouses.length * (NH + spouseGap);

      // Con (đệ quy)
      const childIds = (childrenOf.get(pid) || [])
        .map(cid => byId.get(cid))
        .filter(Boolean)
        .sort((a, b) => sortKey(a) - sortKey(b));

      const childSubtrees = [];
      for (const c of childIds) {
        const sub = buildSubtree(c, depth + 1);
        if (sub) childSubtrees.push(sub);
      }

      // Tính width cây con
      let totalChildWidth = 0;
      childSubtrees.forEach(sub => { totalChildWidth += sub.width + CFG.gapX; });
      const ownWidth = Math.max(NW, totalChildWidth - CFG.gapX);

      // Tính offset cho từng con (so với tâm cha)
      let cursorX = 0;
      childSubtrees.forEach(sub => {
        sub.offsetX = cursorX + sub.width / 2 - ownWidth / 2;
        cursorX += sub.width + CFG.gapX;
      });

      const height = blockH + (childSubtrees.length
        ? CFG.gapY + Math.max(...childSubtrees.map(s => s.height))
        : 0);

      const info = {
        person, pid,
        spouses,
        width: ownWidth,
        blockH,
        height,
        children: childSubtrees,
        childY: blockH + CFG.gapY
      };
      treeCache.set(pid, info);
      return info;
    }

    // Bước 2: Ghi nodes + links với offset tuyệt đối
    const placed = new Set();

    function emit(subtree, absX, absY) {
      if (!subtree) return;
      const { person, pid, spouses, blockH, children, childY } = subtree;
      if (placed.has(pid)) return;
      placed.add(pid);

      const nodeX = absX - NW / 2;
      const nodeY = absY;

      nodes.push({
        id: pid, person, spouse: null,
        x: nodeX, y: nodeY, w: NW, h: NH,
        type: isBlood(person) ? 'blood' : 'spouse'
      });

      // Vợ/chồng xếp dọc dưới cha
      let spY = nodeY + NH + spouseGap;
      spouses.forEach(sp => {
        const spId = String(sp.id);
        if (placed.has(spId)) return;
        placed.add(spId);
        nodes.push({
          id: spId, person: sp, spouse: person,
          x: nodeX, y: spY, w: NW, h: NH, type: 'spouse'
        });
        // Link hôn nhân (dọc)
        links.push({
          from: { x: nodeX + NW / 2, y: spY - spouseGap },
          to:   { x: nodeX + NW / 2, y: spY },
          type: 'marry'
        });
        spY += NH + spouseGap;
      });

      // Con
      children.forEach(sub => {
        const childX = absX + sub.offsetX;
        const childYAbs = absY + childY;
        links.push({
          from: { x: absX, y: absY + blockH },
          to:   { x: childX, y: childYAbs },
          type: 'blood'
        });
        emit(sub, childX, childYAbs);
      });
    }

    // Đặt từng cụ tổ, căn giữa
    const rootSubtrees = [];
    let totalRootWidth = 0;
    roots.forEach(r => {
      const sub = buildSubtree(r, 0);
      if (sub) {
        rootSubtrees.push(sub);
        totalRootWidth += sub.width + CFG.gapX;
      }
    });
    totalRootWidth = Math.max(0, totalRootWidth - CFG.gapX);

    let cursorX = CFG.padding + totalRootWidth / 2;
    rootSubtrees.forEach(sub => {
      emit(sub, cursorX, CFG.padding);
      cursorX += sub.width + CFG.gapX;
    });

    const maxX = Math.max(...nodes.map(n => n.x + n.w), 200) + CFG.padding;
    const maxY = Math.max(...nodes.map(n => n.y + n.h), 200) + CFG.padding;

    console.log(LOG, `layout v6.0: ${nodes.length} nodes, ${links.length} links, ${Math.round(maxX)}×${Math.round(maxY)}`);
    return { nodes, links, width: maxX, height: maxY };
  }

  // ---------- 4) RENDER ----------
  function render(container) {
    console.log(LOG, 'render...');
    try {
      container.innerHTML = '';
      layoutData = computeLayout(tree);
      const { nodes, links, width, height } = layoutData;
      console.log(LOG, `layout: ${nodes.length} nodes, ${links.length} links, ${width}×${height}`);

      svg = d3.select(container).append('svg')
        .attr('width', '100%').attr('height', '100%')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('preserveAspectRatio', 'xMidYMid meet');

      const defs = svg.append('defs');
      const glow = defs.append('filter').attr('id', 'focus-glow');
      glow.append('feGaussianBlur').attr('stdDeviation', '5').attr('result', 'blur');
      const merge = glow.append('feMerge');
      merge.append('feMergeNode').attr('in', 'blur');
      merge.append('feMergeNode').attr('in', 'SourceGraphic');

      gRoot = svg.append('g').attr('class', 'pedigree-root');

      // Links
      const linkG = gRoot.append('g').attr('class', 'links');
      linkG.selectAll('path').data(links).enter().append('path')
        .attr('d', d => {
          if (d.type === 'marry') return `M${d.from.x},${d.from.y} L${d.to.x},${d.to.y}`;
          const midY = (d.from.y + d.to.y) / 2;
          return `M${d.from.x},${d.from.y} V${midY} H${d.to.x} V${d.to.y}`;
        })
        .attr('fill', 'none')
        .attr('stroke', d => d.type === 'marry' ? CFG.colors.linkMarry : CFG.colors.linkBlood)
        .attr('stroke-width', d => d.type === 'marry' ? 1.5 : 2)
        .attr('stroke-dasharray', d => d.type === 'marry' ? '5,4' : null)
        .attr('opacity', 0.7);

      // Nodes
      const nodeG = gRoot.append('g').attr('class', 'nodes');
      const node = nodeG.selectAll('g.node').data(nodes, d => d.id).enter().append('g')
        .attr('class', d => `node node-${d.type}`)
        .attr('transform', d => `translate(${d.x},${d.y})`)
        .attr('data-name', d => (d.person.full_name || '').trim())
        .style('cursor', 'pointer')
        .style('opacity', d => isFaded(d.person) ? 0.55 : 1)
        .on('click', (evt, d) => {
          evt.stopPropagation();
          if (window.PedigreePanel) window.PedigreePanel.show(d.person);
        })
        .on('dblclick', (evt, d) => {
          evt.stopPropagation();
          if (window.PedigreeLayer2) window.PedigreeLayer2.focus(d.person);
        });

      node.append('rect')
        .attr('width', d => d.w).attr('height', d => d.h)
        .attr('rx', 10).attr('ry', 10)
        .attr('fill', d => d.type === 'spouse' ? CFG.colors.spouse.fill : CFG.colors.blood.fill)
        .attr('stroke', d => d.type === 'spouse' ? CFG.colors.spouse.stroke : CFG.colors.blood.stroke)
        .attr('stroke-width', d => d.type === 'spouse' ? 1.5 : 2.5);

      node.append('text')
        .attr('x', d => d.w / 2).attr('y', 22)
        .attr('text-anchor', 'middle')
        .attr('font-size', 13).attr('font-weight', 600)
        .attr('fill', '#2c3e3f')
        .text(d => d.person.full_name || '?');

      node.append('text')
        .attr('x', d => d.w / 2).attr('y', 40)
        .attr('text-anchor', 'middle')
        .attr('font-size', 11).attr('fill', '#6b7c7d')
        .text(d => {
          const b = d.person.birth_year, m = d.person.death_year;
          if (b && m) return `${b} – ${m}`;
          if (b) return `${b} –`;
          return '';
        });

      node.filter(d => isFaded(d.person)).append('text')
        .attr('x', d => d.w / 2).attr('y', d => d.h - 4)
        .attr('text-anchor', 'middle')
        .attr('font-size', 9).attr('font-style', 'italic')
        .attr('fill', '#999')
        .text(d => fadedLabel(d.person));

      // Zoom
      zoomBehavior = d3.zoom()
        .scaleExtent([CFG.zoom.min, CFG.zoom.max])
        .on('zoom', evt => {
          gRoot.attr('transform', evt.transform);
          currentScale = evt.transform.k;
        });
      svg.call(zoomBehavior);

      window.__pedigreeSvg = svg;
      window.__pedigreeZoom = zoomBehavior;
    } catch (e) {
      console.error(LOG, 'render crash', e);
    }
  }

  // ---------- 5) TOOLBAR ----------
  function setupToolbar() {
    console.log(LOG, 'setupToolbar...');
    const bIn = document.getElementById('pd-zoom-in');
    const bOut = document.getElementById('pd-zoom-out');
    const bRst = document.getElementById('pd-reset');
    const sel = document.getElementById('pd-branch-filter');
    if (bIn) bIn.onclick = () => zoomBy(CFG.zoom.step);
    if (bOut) bOut.onclick = () => zoomBy(-CFG.zoom.step);
    if (bRst) bRst.onclick = () => resetZoom();
    if (sel) sel.onchange = () => filterBranch(sel.value);
  }
  function zoomBy(d) {
    if (!svg || !zoomBehavior) return;
    const k = Math.max(CFG.zoom.min, Math.min(CFG.zoom.max, currentScale + d));
    svg.transition().duration(200).call(zoomBehavior.scaleTo, k);
  }
  function resetZoom() {
    if (!svg || !zoomBehavior) return;
    svg.transition().duration(300).call(zoomBehavior.transform, d3.zoomIdentity);
  }
  function filterBranch(branch) {
    if (!gRoot) return;
    if (!branch || branch === '__all__') {
      gRoot.selectAll('g.node').style('display', null);
      return;
    }
    gRoot.selectAll('g.node').style('display', d => {
      if (d.type === 'spouse') return null;
      if ((d.person.generation || 0) <= tree.minGen) return null;
      return d.person.branch === branch ? null : 'none';
    });
  }

  // ---------- 6) AUTO FOCUS ----------
  function autoFocus() {
    if (!gRoot) return;
    const target = gRoot.selectAll('g.node')
      .filter(d => (d.person.full_name || '').trim() === CFG.focusName);
    if (target.empty()) { console.warn(LOG, 'Không tìm thấy', CFG.focusName); return; }
    target.select('rect')
      .attr('fill', CFG.colors.focus.fill)
      .attr('filter', 'url(#focus-glow)');
    console.log(LOG, 'autoFocus', CFG.focusName, 'OK');
  }

  // ---------- 7) DROPDOWN ----------
  function fillBranchDropdown() {
    const sel = document.getElementById('pd-branch-filter');
    if (!sel || !tree) return;
    sel.innerHTML = '<option value="__all__">Tất cả các chi</option>';
    tree.branches.forEach(b => {
      const o = document.createElement('option');
      o.value = b; o.textContent = b;
      sel.appendChild(o);
    });
  }

  // ---------- BOOT ----------
  function boot() {
    console.log(LOG, 'boot...');
    setTimeout(function () { init(); }, 500);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.Pedigree = { init, loadAll, buildTree, computeLayout, render, CFG, getLayout: () => layoutData };
})();
