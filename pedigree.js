/* ============================================================
   pedigree.js v11.0 — Bản thu gọn Layout & Sửa lỗi Auto-Zoom
   - Giảm khoảng cách ngang (gapX) để cây gọn hơn.
   - Bỏ viewBox, dùng zoomBehavior để phóng to đúng người.
   ============================================================ */
(function () {
  'use strict';
  const LOG = '[Pedigree]';
  console.log(LOG, '⭐ v11.0 loaded — Bản thu gọn Layout');

  const CFG = {
    node:      { w: 180, h: 60 }, // Khung 180x60 để vừa chữ 14px
    gapX:      20,                // Thu hẹp khoảng cách ngang (cũ là 40)
    gapY:      80,                // Thu hẹp khoảng cách dọc (cũ là 100)
    padding:   60,
    spouseGap: 10,
    colors: {
      blood:  { stroke: '#88a9ad', fill: '#F5FAFA' },
      spouse: { stroke: '#b4c8ca', fill: '#F8FBFB' },
      focus:  { stroke: '#88a9ad', fill: '#FFF9E6' },
      linkBlood: '#bd9733',
      linkMarry: '#C97A7A'
    },
    zoom: { step: 0.15, min: 0.1, max: 4.0 }, // Nới rộng giới hạn zoom
    focusName: 'Phạm Văn Mỹ'
  };

  let sb, svg, gRoot, zoomBehavior;
  let persons = [], parentChild = [], marriages = [];
  let tree = null;
  let currentScale = 1;
  let layoutData = null;
  let viewMode = 'all';
  let familyFocusId = null;

  function isFaded(p) { return p && (p.special_status === 'Mất sớm' || p.special_status === 'Không rõ'); }
  function fadedLabel(p) {
    if (!p) return '';
    if (p.special_status === 'Mất sớm') return 'mất sớm';
    if (p.special_status === 'Không rõ') return 'thất lạc';
    return '';
  }

  function init() {
    try {
      sb = window.appSupabase || window.sbClient;
      if (!sb) return console.error(LOG, 'Supabase chưa sẵn sàng');
      const container = document.getElementById('pha-do-svg');
      if (!container) return console.warn(LOG, 'Không tìm thấy #pha-do-svg');

      setupToolbar();
      setupSearch();
      setupViewToggle();
      
      loadAll().then(() => {
        tree = buildTree(persons, parentChild, marriages);
        if (!tree || !tree.roots.length) return console.warn(LOG, 'Không có data');
        render(container);
        fillBranchDropdown();
      }).catch(err => console.error(LOG, 'loadAll error', err));
    } catch (e) { console.error(LOG, 'init crash', e); }
  }

  async function loadAll() {
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
    console.log(LOG, `loaded: ${persons.length} persons, ${parentChild.length} links`);
  }

  function buildTree(persons, pcLinks, marriages) {
    const byId = new Map(persons.map(p => [String(p.id), p]));
    const childrenOf = new Map();
    const parentsOf = new Map();
    const childToFather = new Map();
    const childToMother = new Map();
    const spousesOf = new Map();

    marriages.forEach(m => {
      const h = String(m.husband_id), w = String(m.wife_id);
      if (!byId.has(h) || !byId.has(w)) return;
      if (!spousesOf.has(h)) spousesOf.set(h, []);
      if (!spousesOf.has(w)) spousesOf.set(w, []);
      spousesOf.get(h).push({ spouseId: w, order: m.marriage_order || 0 });
      spousesOf.get(w).push({ spouseId: h, order: m.marriage_order || 0 });
    });

    pcLinks.forEach(l => {
      const pid = String(l.parent_id), cid = String(l.child_id);
      if (!byId.has(pid) || !byId.has(cid)) return;
      if (l.parent_role === 'Bố') childToFather.set(cid, pid);
      else if (l.parent_role === 'Mẹ') childToMother.set(cid, pid);
    });

    const allChildren = new Set([...childToFather.keys(), ...childToMother.keys()]);
    allChildren.forEach(cid => {
      if (childToFather.has(cid)) {
        const pid = childToFather.get(cid);
        if (!childrenOf.has(pid)) childrenOf.set(pid, new Set());
        childrenOf.get(pid).add(cid);
      }
      if (childToMother.has(cid)) {
        const pid = childToMother.get(cid);
        if (!childrenOf.has(pid)) childrenOf.set(pid, new Set());
        childrenOf.get(pid).add(cid);
      }
      const arr = [];
      if (childToFather.has(cid)) arr.push(childToFather.get(cid));
      if (childToMother.has(cid)) arr.push(childToMother.get(cid));
      parentsOf.set(cid, arr);
    });
    childrenOf.forEach((set, pid) => childrenOf.set(pid, Array.from(set)));

    // Magnetic gom cụm
    persons.forEach(p => {
      const pid = String(p.id);
      if (!childrenOf.has(pid)) return;
      childrenOf.get(pid).map(cid => byId.get(cid)).filter(Boolean).forEach(k => {
        const kidId = String(k.id);
        if (childToMother.has(kidId)) {
          const momId = childToMother.get(kidId);
          if (momId !== pid) {
             const sps = spousesOf.get(pid) || [];
             if (!sps.some(s => s.spouseId === momId)) {
               sps.push({ spouseId: momId, order: 99 }); spousesOf.set(pid, sps);
               const mSps = spousesOf.get(momId) || [];
               if (!mSps.some(s => s.spouseId === pid)) { mSps.push({ spouseId: pid, order: 99 }); spousesOf.set(momId, mSps); }
             }
          }
        }
      });
    });

    const rootsAll = persons.filter(p => !parentsOf.has(String(p.id)));
    rootsAll.sort((a, b) => (a.generation || 0) - (b.generation || 0));
    if (!rootsAll.length) return null;
    const minGen = rootsAll[0].generation || 1;
    const rootPersons = rootsAll.filter(p => (p.generation || 0) === minGen);
    if (!rootPersons.length) rootPersons.push(rootsAll[0]);

    const branchSet = new Set();
    persons.forEach(p => { if (p.branch && p.branch.trim()) branchSet.add(p.branch.trim()); });

    return { byId, childrenOf, parentsOf, spousesOf, roots: rootPersons, branches: Array.from(branchSet).sort(), minGen };
  }

  function computeLayout(tree) {
    const { byId, childrenOf, spousesOf, roots } = tree;
    const NW = CFG.node.w, NH = CFG.node.h;
    const nodes = [], links = [], treeCache = new Map();

    function buildSubtree(person, depth) {
      if (!person || depth > 50) return null;
      const pid = String(person.id);
      if (treeCache.has(pid)) return treeCache.get(pid);

      let spouses = (spousesOf.get(pid) || []).sort((a, b) => (a.order || 0) - (b.order || 0)).map(s => byId.get(s.spouseId)).filter(Boolean);
      const uniqueSpouses = []; const seenSpIds = new Set();
      spouses.forEach(sp => { if (!seenSpIds.has(sp.id)) { uniqueSpouses.push(sp); seenSpIds.add(sp.id); } });
      spouses = uniqueSpouses;

      const blockH = NH + spouses.length * (NH + CFG.spouseGap);
      const childIds = (childrenOf.get(pid) || []).map(cid => byId.get(cid)).filter(Boolean).sort((a, b) => {
        const sA = (a.special_status === 'Con nuôi' || a.special_status === 'Con ngoài giá thú') ? 1 : 0;
        const sB = (b.special_status === 'Con nuôi' || b.special_status === 'Con ngoài giá thú') ? 1 : 0;
        if (sA !== sB) return sA - sB;
        return (a.birth_order || a.sibling_order || a.birth_year || 9999) - (b.birth_order || b.sibling_order || b.birth_year || 9999);
      });

      const childSubtrees = [];
      for (const c of childIds) { const sub = buildSubtree(c, depth + 1); if (sub) childSubtrees.push(sub); }

      let totalChildWidth = 0;
      childSubtrees.forEach(sub => { totalChildWidth += sub.width + CFG.gapX; });
      const ownWidth = Math.max(NW, totalChildWidth - CFG.gapX);

      let cursorX = 0;
      childSubtrees.forEach(sub => { sub.offsetX = cursorX + sub.width / 2 - ownWidth / 2; cursorX += sub.width + CFG.gapX; });

      const height = blockH + (childSubtrees.length ? CFG.gapY + Math.max(...childSubtrees.map(s => s.height)) : 0);
      const info = { person, pid, spouses, width: ownWidth, blockH, height, children: childSubtrees, childY: blockH + CFG.gapY };
      treeCache.set(pid, info);
      return info;
    }

    const placed = new Set();
    function emit(subtree, absX, absY) {
      if (!subtree) return;
      const { person, pid, spouses, blockH, children, childY } = subtree;
      if (placed.has(pid)) return;
      placed.add(pid);

      nodes.push({ id: pid, person, x: absX - NW / 2, y: absY, w: NW, h: NH, type: 'blood' });

      let spY = absY + NH + CFG.spouseGap;
      spouses.forEach(sp => {
        if (placed.has(String(sp.id))) return;
        placed.add(String(sp.id));
        nodes.push({ id: String(sp.id), person: sp, x: absX - NW / 2, y: spY, w: NW, h: NH, type: 'spouse' });
        links.push({ from: { x: absX, y: spY - CFG.spouseGap }, to: { x: absX, y: spY }, type: 'marry' });
        spY += NH + CFG.spouseGap;
      });

      children.forEach(sub => {
        const childX = absX + sub.offsetX;
        const childYAbs = absY + childY;
        links.push({ from: { x: absX, y: absY + blockH }, to: { x: childX, y: childYAbs }, type: 'blood' });
        emit(sub, childX, childYAbs);
      });
    }

    const rootSubtrees = []; let totalRootWidth = 0;
    roots.forEach(r => { const sub = buildSubtree(r, 0); if (sub) { rootSubtrees.push(sub); totalRootWidth += sub.width + CFG.gapX; } });
    totalRootWidth = Math.max(0, totalRootWidth - CFG.gapX);

    let cursorX = CFG.padding + totalRootWidth / 2;
    rootSubtrees.forEach(sub => { emit(sub, cursorX, CFG.padding); cursorX += sub.width + CFG.gapX; });

    const maxX = Math.max(...nodes.map(n => n.x + n.w), 200) + CFG.padding;
    const maxY = Math.max(...nodes.map(n => n.y + n.h), 200) + CFG.padding;
    return { nodes, links, width: maxX, height: maxY };
  }

  function computeFamilyLayout(tree, focusId) {
    const { byId, childrenOf, spousesOf } = tree;
    const NW = CFG.node.w, NH = CFG.node.h;
    const focus = byId.get(String(focusId));
    if (!focus) return null;
    
    const nodes = [], links = [], seen = new Set();
    const wives = (spousesOf.get(String(focusId)) || []).sort((a,b) => (a.order||0) - (b.order||0)).map(s => byId.get(s.spouseId)).filter(Boolean);
    const allFocusKids = (childrenOf.get(String(focusId)) || []).map(cid => byId.get(cid)).filter(Boolean);

    const gapWife = NW / 2;            
    const yFather = 100;               
    const yWife = yFather + NH * 2;    
    const yChild = yWife + NH * 2.5;   
    const gapChild = NW / 2;           
    const stepGap = NW / 5;            

    const totalWifeWidth = Math.max(NW, wives.length * NW + Math.max(0, wives.length - 1) * gapWife);
    const centerX = 500 + totalWifeWidth / 2; 
    const fatherCx = centerX;

    nodes.push({ id: focus.id, person: focus, x: fatherCx - NW/2, y: yFather, w: NW, h: NH, type: 'blood' });
    seen.add(focus.id);

    let wifeStartX = centerX - totalWifeWidth / 2;
    const wifePos = {};
    wives.forEach(w => {
      if (seen.has(w.id)) return;
      nodes.push({ id: w.id, person: w, x: wifeStartX, y: yWife, w: NW, h: NH, type: 'spouse' });
      links.push({ from: { x: fatherCx, y: yFather + NH }, to: { x: wifeStartX + NW/2, y: yWife }, type: 'blood' });
      wifePos[w.id] = { cx: wifeStartX + NW/2 };
      wifeStartX += NW + gapWife; 
      seen.add(w.id);
    });

    let currentDrawX = 500; 

    function drawChildNode(k, drawX, isStep = false) {
      if (seen.has(k.id)) return null;
      nodes.push({ id: k.id, person: k, x: drawX, y: yChild, w: NW, h: NH, type: isStep ? 'spouse' : 'blood' });
      const sp = (spousesOf.get(String(k.id)) || []).map(s => byId.get(s.spouseId)).filter(Boolean)[0];
      if (sp && !seen.has(sp.id)) { nodes.push({ id: sp.id, person: sp, x: drawX, y: yChild + NH + 15, w: NW, h: NH, type: 'spouse' }); seen.add(sp.id); }
      seen.add(k.id);
      return drawX + NW/2;
    }

    const processedKids = new Set();
    wives.forEach(w => {
      const sharedKids = allFocusKids.filter(k => !processedKids.has(k.id) && parentChild.some(pc => pc.child_id === k.id && pc.parent_id === w.id && pc.parent_role === 'Mẹ'));
      const stepKids = (childrenOf.get(String(w.id)) || []).map(cid => byId.get(cid)).filter(Boolean).filter(k => !parentChild.some(pc => pc.child_id === k.id && pc.parent_id === focus.id && pc.parent_role === 'Bố')).sort((a,b) => (a.birth_order || 999) - (b.birth_order || 999));

      sharedKids.forEach(k => {
        const childCx = drawChildNode(k, currentDrawX, false);
        links.push({ from: { x: wifePos[w.id].cx, y: yWife + NH }, to: { x: childCx, y: yChild }, type: 'blood_straight' });
        processedKids.add(k.id); currentDrawX += NW + gapChild;
      });
      stepKids.forEach(k => {
        let stepX = sharedKids.length > 0 ? (currentDrawX - gapChild) + stepGap : currentDrawX;
        drawChildNode(k, stepX, true); processedKids.add(k.id); currentDrawX = stepX + NW + gapChild;
      });
    });

    const noMomKids = allFocusKids.filter(k => !processedKids.has(k.id) && !parentChild.some(pc => pc.child_id === k.id && pc.parent_role === 'Mẹ'));
    noMomKids.forEach(k => {
      let startX = currentDrawX > 500 ? currentDrawX + stepGap : currentDrawX;
      drawChildNode(k, startX, true); processedKids.add(k.id); currentDrawX = startX + NW + gapChild;
    });

    const maxX = Math.max(...nodes.map(n => n.x + n.w), 500) + 150;
    const maxY = Math.max(...nodes.map(n => n.y + n.h), 300) + 100;
    return { nodes, links, width: maxX, height: maxY };
  }

  function render(container) {
    try {
      container.innerHTML = '';
      if (viewMode === 'family' && familyFocusId) {
        layoutData = computeFamilyLayout(tree, familyFocusId) || computeLayout(tree);
      } else {
        layoutData = computeLayout(tree);
      }
      const { nodes, links, width, height } = layoutData;

      // ⭐ BỎ VIEWBOX, DÙNG KÍCH THƯỚC THỰC ĐỂ ZOOM KHÔNG BỊ LỖI
      svg = d3.select(container).append('svg')
        .attr('width', '100%').attr('height', '100%')
        .style('overflow', 'hidden'); // Ẩn thanh cuộn

      const defs = svg.append('defs');
      const glow = defs.append('filter').attr('id', 'focus-glow');
      glow.append('feGaussianBlur').attr('stdDeviation', '5').attr('result', 'blur');
      const merge = glow.append('feMerge');
      merge.append('feMergeNode').attr('in', 'blur'); merge.append('feMergeNode').attr('in', 'SourceGraphic');

      gRoot = svg.append('g').attr('class', 'pedigree-root');

      const linkG = gRoot.append('g').attr('class', 'links');
      linkG.selectAll('path').data(links).enter().append('path')
        .attr('d', d => {
          if (d.type === 'marry') return `M${d.from.x},${d.from.y} L${d.to.x},${d.to.y}`;
          if (d.type === 'blood_straight') return `M${d.from.x},${d.from.y} V${d.from.y + (d.to.y - d.from.y) * 0.5} H${d.to.x} V${d.to.y}`;
          return `M${d.from.x},${d.from.y} V${d.from.y + (d.to.y - d.from.y) * 0.6} H${d.to.x} V${d.to.y}`;
        })
        .attr('fill', 'none').attr('stroke', d => d.type === 'marry' ? CFG.colors.linkMarry : CFG.colors.linkBlood).attr('stroke-width', 2).attr('opacity', 0.7);

      const nodeG = gRoot.append('g').attr('class', 'nodes');
      const node = nodeG.selectAll('g.node').data(nodes, d => d.id).enter().append('g')
        .attr('class', d => `node node-${d.type}`).attr('transform', d => `translate(${d.x},${d.y})`)
        .attr('data-name', d => (d.person.full_name || '').trim()).style('cursor', 'pointer').style('opacity', d => isFaded(d.person) ? 0.55 : 1)
       .on('click', (evt, d) => { evt.stopPropagation(); if (viewMode === 'family') { familyFocusId = String(d.person.id); render(container); } if (window.PedigreePanel) window.PedigreePanel.show(d.person); })
       .on('dblclick', (evt, d) => { evt.stopPropagation(); if (typeof window.openPersonForm === 'function') window.openPersonForm(d.person.id); });

      node.append('rect').attr('width', d => d.w).attr('height', d => d.h).attr('rx', 10).attr('ry', 10)
        .attr('fill', d => d.type === 'spouse' ? CFG.colors.spouse.fill : CFG.colors.blood.fill)
        .attr('stroke', d => d.type === 'spouse' ? CFG.colors.spouse.stroke : CFG.colors.blood.stroke).attr('stroke-width', d => d.type === 'spouse' ? 1.5 : 2.5);

      node.append('text').attr('x', d => d.w / 2).attr('y', 22).attr('text-anchor', 'middle').attr('font-size', 14).attr('font-weight', 'bold').attr('fill', '#2c3e3f').text(d => d.person.full_name || '?');
      node.append('text').attr('x', d => d.w / 2).attr('y', 42).attr('text-anchor', 'middle').attr('font-size', 12).attr('fill', '#6b7c7d').text(d => {
        const b = d.person.birth_year, m = d.person.death_year; if (b && m) return `${b} – ${m}`; if (b) return `${b} –`; return '';
      });

      zoomBehavior = d3.zoom().scaleExtent([CFG.zoom.min, CFG.zoom.max]).on('zoom', evt => { gRoot.attr('transform', evt.transform); currentScale = evt.transform.k; });
      svg.call(zoomBehavior);

      // ⭐ AUTO ZOOM TÌM ĐÚNG NGƯỜI (Kể cả khi đổi Layout)
      let target = nodeG.selectAll('g.node').filter(d => (d.person.full_name || '').trim() === CFG.focusName);
      if (target.empty() && tree.roots.length > 0) {
         target = nodeG.selectAll('g.node').filter(d => String(d.person.id) === String(tree.roots[0].id));
      }

      if (!target.empty()) {
         target.select('rect').attr('fill', CFG.colors.focus.fill).attr('filter', 'url(#focus-glow)');
         const d = target.datum();
         const k = 1.5; // Phóng to 1.5 lần
         const centerX = d.x + CFG.node.w / 2; const centerY = d.y + CFG.node.h / 2;
         const svgW = svg.node().clientWidth || 1000; const svgH = svg.node().clientHeight || 800;
         const tx = svgW / 2 - centerX * k; const ty = svgH / 2 - centerY * k;
         
         // Dùng setTimeout để đảm bảo DOM đã render xong mới Zoom
         setTimeout(() => {
             svg.transition().duration(800).call(zoomBehavior.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
         }, 100);
      }
    } catch (e) { console.error(LOG, 'render crash', e); }
  }

  function setupToolbar() {
    document.getElementById('pd-zoom-in')?.addEventListener('click', () => zoomBy(CFG.zoom.step));
    document.getElementById('pd-zoom-out')?.addEventListener('click', () => zoomBy(-CFG.zoom.step));
    document.getElementById('pd-reset')?.addEventListener('click', () => { if (svg) svg.transition().duration(300).call(zoomBehavior.transform, d3.zoomIdentity); });
    document.getElementById('pd-branch-filter')?.addEventListener('change', (e) => filterBranch(e.target.value));
  }
  function zoomBy(d) { if (!svg || !zoomBehavior) return; const k = Math.max(CFG.zoom.min, Math.min(CFG.zoom.max, currentScale + d)); svg.transition().duration(200).call(zoomBehavior.scaleTo, k); }
  function filterBranch(branch) {
    if (!gRoot) return;
    if (!branch || branch === '__all__') return gRoot.selectAll('g.node').style('display', null);
    gRoot.selectAll('g.node').style('display', d => d.type === 'spouse' ? null : ((d.person.generation || 0) <= tree.minGen ? null : (d.person.branch === branch ? null : 'none')));
  }

  function setupViewToggle() {
    const btnAll = document.getElementById('pd-view-all'); const btnFam = document.getElementById('pd-view-family');
    if (!btnAll || !btnFam) return;
    btnAll.onclick = () => { viewMode = 'all'; familyFocusId = null; btnAll.classList.add('is-active'); btnFam.classList.remove('is-active'); render(document.getElementById('pha-do-svg')); };
    btnFam.onclick = () => {
      viewMode = 'family'; btnFam.classList.add('is-active'); btnAll.classList.remove('is-active');
      if (!familyFocusId) { const p = persons.find(p => (p.full_name || '').trim() === CFG.focusName); if (p) familyFocusId = String(p.id); else if(tree && tree.roots[0]) familyFocusId = String(tree.roots[0].id); }
      render(document.getElementById('pha-do-svg'));
    };
    btnAll.classList.add('is-active');
  }

  function setupSearch() {
    const input = document.getElementById('pd-search'); const clearBtn = document.getElementById('pd-search-clear');
    if (!input) return;
    input.addEventListener('input', function () {
      const q = this.value.trim(); if (clearBtn) clearBtn.style.display = q ? 'inline-block' : 'none';
      if (!q) { gRoot.selectAll('g.node').each(function () { const sel = d3.select(this); sel.style('opacity', isFaded(sel.datum().person) ? 0.55 : 1); sel.select('rect').attr('stroke', sel.classed('node-spouse') ? CFG.colors.spouse.stroke : CFG.colors.blood.stroke).attr('stroke-width', sel.classed('node-spouse') ? 1.5 : 2.5).attr('filter', null); }); return; }
      const qNorm = q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); let firstMatch = null;
      gRoot.selectAll('g.node').each(function (d) {
        const match = (d.person.full_name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(qNorm);
        const sel = d3.select(this); sel.style('opacity', match ? 1 : 0.15); const rect = sel.select('rect');
        if (match) { rect.attr('stroke', '#F2C94C').attr('stroke-width', 3.5).attr('filter', 'url(#focus-glow)'); if (!firstMatch) firstMatch = d; }
        else { rect.attr('stroke', sel.classed('node-spouse') ? CFG.colors.spouse.stroke : CFG.colors.blood.stroke).attr('stroke-width', sel.classed('node-spouse') ? 1.5 : 2.5).attr('filter', null); }
      });
      if (firstMatch && svg && zoomBehavior) {
        const k = 1.5; const centerX = firstMatch.x + CFG.node.w / 2; const centerY = firstMatch.y + CFG.node.h / 2;
        const svgW = svg.node().clientWidth || 800; const svgH = svg.node().clientHeight || 600;
        svg.transition().duration(800).call(zoomBehavior.transform, d3.zoomIdentity.translate(svgW / 2 - centerX * k, svgH / 2 - centerY * k).scale(k));
      }
    });
    if (clearBtn) clearBtn.onclick = () => { input.value = ''; input.dispatchEvent(new Event('input')); };
  }

  function fillBranchDropdown() {
    const sel = document.getElementById('pd-branch-filter');
    if (!sel || !tree) return; sel.innerHTML = '<option value="__all__">Tất cả các chi</option>';
    tree.branches.forEach(b => { const o = document.createElement('option'); o.value = b; o.textContent = b; sel.appendChild(o); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 500)); else setTimeout(init, 500);
})();
