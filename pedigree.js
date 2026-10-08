/* ============================================================
   pedigree.js v5.0 — Lớp 1: Phả đồ phổ quát (layout DỌC)
   Nguyên tắc: DATA DRIVES THE VIEW — không hardcode gì
   ============================================================ */
(function () {
  'use strict';

  const LOG = '[Pedigree]';
  console.log(LOG, 'v5.0 loaded');

  // ---------- CONFIG ----------
  const CFG = {
    node:   { w: 180, h: 56 },
    gapX:   60,          // khoảng cách giữa các cột chi
    gapY:   90,          // khoảng cách giữa các đời
    padding: 80,         // padding quanh SVG
    colors: {
      blood:      { stroke: '#88a9ad', fill: '#F5FAFA' },
      spouse:     { stroke: '#b4c8ca', fill: '#F8FBFB' },
      focus:      { stroke: '#88a9ad', fill: '#FFF9E6', glow: '#F2C94C' },
      faded:      { opacity: 0.5 },
      linkBlood:  '#bd9733',
      linkMarry:  '#C97A7A'
    },
    zoom: { step: 0.15, min: 0.3, max: 2.5 },
    focusName: 'Phạm Văn Mỹ'   // sẽ match theo full_name (chuẩn hoá)
  };

  // ---------- STATE ----------
  let sb, svg, gRoot, zoomBehavior;
  let persons = [], parentChild = [], marriages = [];
  let tree = null;       // { roots, byId, generations, branches }
  let currentScale = 1;

  // ---------- ENTRY ----------
  function init() {
    console.log(LOG, 'init()');
    try {
      sb = window.appSupabase || window.sbClient;
      if (!sb) { console.error(LOG, 'Supabase client chưa sẵn sàng'); return; }

      const container = document.getElementById('pha-do-svg');
      if (!container) { console.warn(LOG, 'Không tìm thấy #pha-do-svg'); return; }

      setupToolbar();
      loadAll().then(() => {
        tree = buildTree(persons, parentChild, marriages);
        if (!tree || !tree.roots.length) {
          console.warn(LOG, 'Không có dữ liệu để vẽ');
          return;
        }
        render(container);
        autoFocus();
      }).catch(err => console.error(LOG, 'loadAll error', err));
    } catch (e) {
      console.error(LOG, 'init crash', e);
    }
  }

  // ---------- 1) LOAD DATA ----------
  async function loadAll() {
    console.log(LOG, 'loadAll...');
    try {
      const [p, pc, m] = await Promise.all([
        sb.from('persons').select('*'),
        sb.from('parent_child').select('*'),
        sb.from('marriages').select('*')
      ]);
      if (p.error)  throw p.error;
      if (pc.error) throw pc.error;
      if (m.error)  throw m.error;
      persons     = p.data  || [];
      parentChild = pc.data || [];
      marriages   = m.data  || [];
      console.log(LOG, `loaded: ${persons.length} persons, ${parentChild.length} links, ${marriages.length} marriages`);
    } catch (e) {
      console.error(LOG, 'loadAll failed', e);
      throw e;
    }
  }

  // ---------- 2) BUILD TREE ----------
  // Tìm cụ tổ = generation nhỏ nhất & không có cha mẹ
  // Nhóm theo branch (Chi). Chi nào không có branch → "Khác"
  function buildTree(persons, pcLinks, marriages) {
    console.log(LOG, 'buildTree...');
    const byId = new Map(persons.map(p => [String(p.id), p]));
    const childrenOf = new Map();   // parentId -> [childId]
    const parentsOf  = new Map();   // childId  -> [parentId]
    pcLinks.forEach(l => {
      const pid = String(l.parent_id), cid = String(l.child_id);
      if (!childrenOf.has(pid)) childrenOf.set(pid, []);
      if (!parentsOf.has(cid))  parentsOf.set(cid, []);
      childrenOf.get(pid).push(cid);
      parentsOf.get(cid).push(pid);
    });

    const spousesOf = new Map();    // personId -> [{spouseId, order}]
    marriages.forEach(m => {
      const h = String(m.husband_id), w = String(m.wife_id);
      const ord = m.marriage_order || 0;
      if (!spousesOf.has(h)) spousesOf.set(h, []);
      if (!spousesOf.has(w)) spousesOf.set(w, []);
      spousesOf.get(h).push({ spouseId: w, order: ord });
      spousesOf.get(w).push({ spouseId: h, order: ord });
    });

    // Cụ tổ: generation nhỏ nhất & không có parents
    const roots = persons
      .filter(p => !parentsOf.has(String(p.id)))
      .sort((a, b) => (a.generation || 0) - (b.generation || 0));
    if (!roots.length) return null;

    const minGen = roots[0].generation || 1;
    const rootPersons = roots.filter(p => (p.generation || 0) === minGen);

    // Gom chi (branch) — chỉ lấy từ data
    const branchSet = new Set();
    persons.forEach(p => { if (p.branch) branchSet.add(p.branch); });
    const branches = Array.from(branchSet).sort();

    return { byId, childrenOf, parentsOf, spousesOf, roots: rootPersons, branches, minGen };
  }

  // ---------- 3) COMPUTE LAYOUT (DỌC) ----------
  // Trả về: { nodes: [{id, x, y, w, h, type, person, spouse?}], links: [...] }
  function computeLayout(tree) {
    console.log(LOG, 'computeLayout...');
    const { byId, childrenOf, parentsOf, spousesOf, roots, branches, minGen } = tree;
    const { w: NW, h: NH } = CFG.node;
    const stepY = NH + CFG.gapY;
    const stepX = NW + CFG.gapX;

    // Bước 1: xác định mỗi người thuộc cột chi nào
    // - Người Đời 1 (cụ tổ + vợ) → cột 0 (cột "Tổ")
    // - Người Đời ≥2 có branch → cột theo branch
    // - Người không có branch (Bông/Thụ) → cột "Khác" cuối
    const colOfBranch = new Map();
    colOfBranch.set('__TO__', 0);
    branches.forEach((b, i) => colOfBranch.set(b, i + 1));
    colOfBranch.set('__KHAC__', branches.length + 1);

    function colOf(p) {
      if (!p) return 0;
      if ((p.generation || 0) <= minGen) return 0;
      if (p.branch && colOfBranch.has(p.branch)) return colOfBranch.get(p.branch);
      return colOfBranch.get('__KHAC__');
    }

    // Bước 2: đệ quy tính y theo generation
    // Mỗi khối hôn nhân = [chồng, vợ1, vợ2, ...] xếp dọc
    // Con nối từ đáy khối hôn nhân
    const nodes = [];
    const links = [];
    const placed = new Set();

    function blockHeight(p) {
      const spouses = spousesOf.get(String(p.id)) || [];
      return (1 + spouses.length) * NH + (spouses.length > 0 ? spouses.length * 4 : 0);
    }

    // Đặt đệ quy 1 người (huyết thống) + vợ/chồng
    function placePerson(p, x, yTop) {
      if (placed.has(String(p.id))) return;
      const spouses = (spousesOf.get(String(p.id)) || [])
        .sort((a, b) => (a.order || 0) - (b.order || 0));

      // Node chồng
      nodes.push({
        id: String(p.id), person: p, spouse: null,
        x, y: yTop, w: NW, h: NH, type: 'blood'
      });
      placed.add(String(p.id));

      // Các node vợ/chồng xếp dọc bên dưới
      let yCur = yTop + NH + 4;
      spouses.forEach((s, idx) => {
        const sp = byId.get(s.spouseId);
        if (!sp || placed.has(String(sp.id))) return;
        nodes.push({
          id: String(sp.id), person: sp, spouse: p,
          x, y: yCur, w: NW, h: NH, type: 'spouse'
        });
        placed.add(String(sp.id));
        yCur += NH + 4;
      });

      // Đáy khối hôn nhân
      const blockBottom = yCur;

      // Con: gom tất cả con của p (từ parent_child) — KHÔNG phân biệt vợ nào
      const childIds = childrenOf.get(String(p.id)) || [];
      if (!childIds.length) return;

      // Tính vị trí con theo cột chi
      const childGap = 12;
      let xCursor = x;
      // Nhóm con theo cột để xếp hàng ngang
      const childrenByCol = new Map();
      childIds.forEach(cid => {
        const c = byId.get(String(cid));
        if (!c) return;
        const col = colOf(c);
        if (!childrenByCol.has(col)) childrenByCol.set(col, []);
        childrenByCol.get(col).push(c);
      });

      // Sắp xếp cột tăng dần, mỗi cột 1 con → x = col * stepX + padding
      const sortedCols = Array.from(childrenByCol.keys()).sort((a, b) => a - b);
      sortedCols.forEach(col => {
        const kids = childrenByCol.get(col);
        kids.forEach((c, i) => {
          const cx = col * stepX + CFG.padding;
          const cy = blockBottom + CFG.gapY;
          // Link từ đáy khối hôn nhân → node con
          links.push({
            from: { x: x + NW / 2, y: blockBottom },
            to:   { x: cx + NW / 2, y: cy },
            type: 'blood'
          });
          placePerson(c, cx, cy);
        });
      });
    }

    // Đặt từng cụ tổ (Đời 1) — thường chỉ 1 người
    roots.forEach((r, i) => {
      const x = i * stepX + CFG.padding;
      placePerson(r, x, CFG.padding);
    });

    // Link hôn nhân giữa các cặp (đường dọc nối giữa các node trong cùng khối)
    nodes.forEach(n => {
      if (n.type !== 'spouse') return;
      // Tìm node chồng tương ứng
      const husband = nodes.find(m => m.id === String(n.spouse && n.spouse.id));
      if (!husband) return;
      // Vẽ đường dọc nối tâm 2 node (nét đứt)
      links.push({
        from: { x: husband.x + NW / 2, y: husband.y + NH },
        to:   { x: n.x + NW / 2, y: n.y },
        type: 'marry'
      });
    });

    // Tính bounding box
    const maxX = Math.max(...nodes.map(n => n.x + n.w)) + CFG.padding;
    const maxY = Math.max(...nodes.map(n => n.y + n.h)) + CFG.padding;

    return { nodes, links, width: maxX, height: maxY };
  }

  // ---------- 4) RENDER SVG ----------
  function render(container) {
    console.log(LOG, 'render...');
    try {
      // Xoá cũ
      container.innerHTML = '';

      const layout = computeLayout(tree);
      const { nodes, links, width, height } = layout;
      console.log(LOG, `layout: ${nodes.length} nodes, ${links.length} links, ${width}×${height}`);

      svg = d3.select(container)
        .append('svg')
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('preserveAspectRatio', 'xMidYMid meet');

      // Định nghĩa filter glow cho node focus
      const defs = svg.append('defs');
      const glow = defs.append('filter').attr('id', 'focus-glow');
      glow.append('feGaussianBlur').attr('stdDeviation', '4').attr('result', 'coloredBlur');
      const merge = glow.append('feMerge');
      merge.append('feMergeNode').attr('in', 'coloredBlur');
      merge.append('feMergeNode').attr('in', 'SourceGraphic');

      gRoot = svg.append('g').attr('class', 'pedigree-root');

      // Vẽ links trước
      const linkG = gRoot.append('g').attr('class', 'links');
      linkG.selectAll('path')
        .data(links)
        .enter().append('path')
        .attr('d', d => {
          // Link hôn nhân: đường dọc thẳng
          if (d.type === 'marry') {
            return `M${d.from.x},${d.from.y} L${d.to.x},${d.to.y}`;
          }
          // Link huyết thống: elbow (vuông góc)
          const midY = (d.from.y + d.to.y) / 2;
          return `M${d.from.x},${d.from.y} V${midY} H${d.to.x} V${d.to.y}`;
        })
        .attr('fill', 'none')
        .attr('stroke', d => d.type === 'marry' ? CFG.colors.linkMarry : CFG.colors.linkBlood)
        .attr('stroke-width', d => d.type === 'marry' ? 1.5 : 2)
        .attr('stroke-dasharray', d => d.type === 'marry' ? '5,4' : null);

      // Vẽ nodes
      const nodeG = gRoot.append('g').attr('class', 'nodes');
      const node = nodeG.selectAll('g.node')
        .data(nodes, d => d.id)
        .enter().append('g')
        .attr('class', d => `node node-${d.type}`)
        .attr('transform', d => `translate(${d.x},${d.y})`)
        .style('cursor', 'pointer')
        .on('click', (evt, d) => {
          evt.stopPropagation();
          if (window.PedigreePanel) window.PedigreePanel.show(d.person);
        })
        .on('dblclick', (evt, d) => {
          evt.stopPropagation();
          if (window.PedigreeLayer2) window.PedigreeLayer2.focus(d.person);
        });

      // Rect
      node.append('rect')
        .attr('width', d => d.w)
        .attr('height', d => d.h)
        .attr('rx', 10)
        .attr('ry', 10)
        .attr('fill', d => d.type === 'spouse' ? CFG.colors.spouse.fill : CFG.colors.blood.fill)
        .attr('stroke', d => d.type === 'spouse' ? CFG.colors.spouse.stroke : CFG.colors.blood.stroke)
        .attr('stroke-width', 2);

      // Text tên
      node.append('text')
        .attr('x', d => d.w / 2)
        .attr('y', 22)
        .attr('text-anchor', 'middle')
        .attr('font-size', 13)
        .attr('font-weight', 600)
        .attr('fill', '#2c3e3f')
        .text(d => d.person.full_name || '?');

      // Text năm sinh/mất
      node.append('text')
        .attr('x', d => d.w / 2)
        .attr('y', 40)
        .attr('text-anchor', 'middle')
        .attr('font-size', 11)
        .attr('fill', '#6b7c7d')
        .text(d => {
          const b = d.person.birth_year || '?';
          const m = d.person.death_year;
          return m ? `${b} – ${m}` : (b !== '?' ? `${b} –` : '');
        });

      // Mờ node thất lạc / mất sớm
      node.filter(d => d.person.status === 'lost' || d.person.status === 'died_young')
        .style('opacity', CFG.colors.faded.opacity)
        .append('text')
        .attr('x', d => d.w / 2)
        .attr('y', d => d.h - 4)
        .attr('text-anchor', 'middle')
        .attr('font-size', 9)
        .attr('font-style', 'italic')
        .attr('fill', '#999')
        .text(d => d.person.status === 'lost' ? 'thất lạc' : 'mất sớm');

      // Zoom behavior
      zoomBehavior = d3.zoom()
        .scaleExtent([CFG.zoom.min, CFG.zoom.max])
        .on('zoom', evt => {
          gRoot.attr('transform', evt.transform);
          currentScale = evt.transform.k;
        });
      svg.call(zoomBehavior);

      // Lưu lại để toolbar dùng
      window.__pedigreeSvg = svg;
      window.__pedigreeZoom = zoomBehavior;
    } catch (e) {
      console.error(LOG, 'render crash', e);
    }
  }

  // ---------- 5) TOOLBAR ----------
  function setupToolbar() {
    console.log(LOG, 'setupToolbar...');
    const btnIn  = document.getElementById('pd-zoom-in');
    const btnOut = document.getElementById('pd-zoom-out');
    const btnRst = document.getElementById('pd-reset');
    const selChi = document.getElementById('pd-branch-filter');
    if (btnIn)  btnIn.onclick  = () => zoomBy(CFG.zoom.step);
    if (btnOut) btnOut.onclick = () => zoomBy(-CFG.zoom.step);
    if (btnRst) btnRst.onclick = () => resetZoom();
    if (selChi) selChi.onchange = () => filterBranch(selChi.value);
  }

  function zoomBy(delta) {
    if (!svg || !zoomBehavior) return;
    const newK = Math.max(CFG.zoom.min, Math.min(CFG.zoom.max, currentScale + delta));
    svg.transition().duration(200).call(zoomBehavior.scaleTo, newK);
  }
  function resetZoom() {
    if (!svg || !zoomBehavior) return;
    svg.transition().duration(300).call(zoomBehavior.transform, d3.zoomIdentity);
    autoFocus();
  }
  function filterBranch(branch) {
    console.log(LOG, 'filterBranch', branch);
    if (!gRoot) return;
    if (!branch || branch === '__all__') {
      gRoot.selectAll('g.node').style('display', null);
      return;
    }
    gRoot.selectAll('g.node').style('display', d => {
      if (d.type === 'spouse') return null; // vợ/chồng luôn hiện theo chồng
      if (d.person.branch === branch) return null;
      if ((d.person.generation || 0) === tree.minGen) return null; // cụ tổ luôn hiện
      return 'none';
    });
  }

  // ---------- 6) AUTO FOCUS ----------
  function autoFocus() {
    console.log(LOG, 'autoFocus', CFG.focusName);
    if (!gRoot) return;
    const target = gRoot.selectAll('g.node')
      .filter(d => (d.person.full_name || '').trim() === CFG.focusName);
    if (target.empty()) {
      console.warn(LOG, 'Không tìm thấy', CFG.focusName);
      return;
    }
    target.select('rect')
      .attr('fill', CFG.colors.focus.fill)
      .attr('stroke', CFG.colors.focus.stroke)
      .attr('filter', 'url(#focus-glow)');
  }

  // ---------- 7) FILL DROPDOWN CHI ----------
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

  // ---------- AUTO INIT ----------
  // Bug đã gặp: IIFE không chạy → dùng setTimeout wrapper
  function boot() {
    setTimeout(function () { init(); fillBranchDropdown(); }, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Expose ra ngoài
  window.Pedigree = { init, loadAll, buildTree, computeLayout, render, CFG };
})();
