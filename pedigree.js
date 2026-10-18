/* ============================================================
   pedigree.js v9.0 — Bản sửa lỗi tuyệt đối (Layout A)
   - Sửa lỗi vị trí và màu sắc của Vợ/Chồng (Trần Thị Mai).
   - Sắp xếp con chuẩn: Con trưởng trái, Con nuôi/Ngoài giá thú phải.
   - Lớp 2: Bỏ đường nối giữa các bà vợ. Bỏ đường nối của con riêng & con nuôi.
   ============================================================ */
(function () {
  'use strict';
  const LOG = '[Pedigree]';
  console.log(LOG, '⭐ v9.0 loaded — Bản sửa lỗi tuyệt đối');

  // ---------- CONFIG ----------
  const CFG = {
    node:      { w: 180, h: 56 },
    gapX:      40,
    gapY:      90,
    padding:   60,
    spouseGap: 10,
    colors: {
      blood:  { stroke: '#88a9ad', fill: '#F5FAFA' }, // Xanh đậm cho huyết thống
      spouse: { stroke: '#b4c8ca', fill: '#F8FBFB' }, // Xanh nhạt cho vợ/chồng/con riêng
      focus:  { stroke: '#88a9ad', fill: '#FFF9E6' },
      linkBlood: '#bd9733',
      linkMarry: '#C97A7A'
    },
    zoom: { step: 0.15, min: 0.3, max: 4.0 },
    focusName: 'Phạm Văn Mỹ'
  };

  // ---------- STATE ----------
  let sb, svg, gRoot, zoomBehavior;
  let persons = [], parentChild = [], marriages = [];
  let tree = null;
  let currentScale = 1;
  let layoutData = null;
  let viewMode = 'all';        // 'all' | 'family'
  let familyFocusId = null;    // ID người focus khi viewMode='family'

  // ---------- HELPERS ----------
  function isFaded(p) {
    return p && (p.special_status === 'Mất sớm' || p.special_status === 'Không rõ');
  }
  function fadedLabel(p) {
    if (!p) return '';
    if (p.special_status === 'Mất sớm') return 'mất sớm';
    if (p.special_status === 'Không rõ') return 'thất lạc';
    return '';
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
      setupSearch();
      setupViewToggle();
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

    const childrenOf = new Map();
    const parentsOf = new Map();
    const childToFather = new Map();
    const childToMother = new Map();
    const spousesOf = new Map();

    // 1. Xử lý hôn nhân (Marriages)
    marriages.forEach(m => {
      const h = String(m.husband_id), w = String(m.wife_id);
      const ord = m.marriage_order || 0;
      if (!byId.has(h) || !byId.has(w)) return;
      if (!spousesOf.has(h)) spousesOf.set(h, []);
      if (!spousesOf.has(w)) spousesOf.set(w, []);
      spousesOf.get(h).push({ spouseId: w, order: ord });
      spousesOf.get(w).push({ spouseId: h, order: ord });
    });

    // 2. Xử lý cha mẹ - con cái (Parent-Child)
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

    // 3. Tìm Cụ tổ
    const rootsAll = persons.filter(p => !parentsOf.has(String(p.id)));
    rootsAll.sort((a, b) => (a.generation || 0) - (b.generation || 0));
    if (!rootsAll.length) return null;
    const minGen = rootsAll[0].generation || 1;
    const rootPersons = rootsAll.filter(p => (p.generation || 0) === minGen);
    if (!rootPersons.length) rootPersons.push(rootsAll[0]);

    const branchSet = new Set();
    persons.forEach(p => { if (p.branch && p.branch.trim()) branchSet.add(p.branch.trim()); });
    const branches = Array.from(branchSet).sort();

    return { byId, childrenOf, parentsOf, spousesOf, roots: rootPersons, branches, minGen };
  }

  // ---------- 3) COMPUTE LAYOUT (Toàn cảnh) ----------
  function computeLayout(tree) {
    console.log(LOG, 'computeLayout v9.0...');
    const { byId, childrenOf, spousesOf, roots } = tree;
    const NW = CFG.node.w, NH = CFG.node.h;
    const spouseGap = CFG.spouseGap;

    const nodes = [];
    const links = [];
    const treeCache = new Map();

    function buildSubtree(person, depth) {
      if (!person || depth > 50) return null;
      const pid = String(person.id);
      if (treeCache.has(pid)) return treeCache.get(pid);

      const spouses = (spousesOf.get(pid) || [])
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map(s => byId.get(s.spouseId))
        .filter(Boolean);

      const blockH = NH + spouses.length * (NH + spouseGap);

      // ⭐ SẮP XẾP CON CHUẨN XÁC
      const childIds = (childrenOf.get(pid) || [])
        .map(cid => byId.get(cid))
        .filter(Boolean)
        .sort((a, b) => {
          // Ưu tiên 1: Con ruột (0) xếp trước, Con nuôi/Ngoài giá thú (1) xếp sau
          const isSpecialA = (a.special_status === 'Con nuôi' || a.special_status === 'Con ngoài giá thú') ? 1 : 0;
          const isSpecialB = (b.special_status === 'Con nuôi' || b.special_status === 'Con ngoài giá thú') ? 1 : 0;
          if (isSpecialA !== isSpecialB) return isSpecialA - isSpecialB;
          
          // Ưu tiên 2: Thứ tự sinh
          let orderA = a.birth_order || a.sibling_order;
          let orderB = b.birth_order || b.sibling_order;
          
          // Fallback: Nếu DB trống, dùng năm sinh để sắp xếp (ai sinh trước xếp trước)
          if (orderA === undefined || orderA === null) {
            orderA = a.birth_year || 9999;
            if (b.birth_year && orderA === 9999) orderA = b.birth_year + 1; 
          }
          if (orderB === undefined || orderB === null) {
            orderB = b.birth_year || 9999;
            if (a.birth_year && orderB === 9999) orderB = a.birth_year + 1;
          }
          
          if (orderA !== orderB) return orderA - orderB;
          return (a.full_name || '').localeCompare(b.full_name || '');
        });

      const childSubtrees = [];
      for (const c of childIds) {
        const sub = buildSubtree(c, depth + 1);
        if (sub) childSubtrees.push(sub);
      }

      let totalChildWidth = 0;
      childSubtrees.forEach(sub => { totalChildWidth += sub.width + CFG.gapX; });
      const ownWidth = Math.max(NW, totalChildWidth - CFG.gapX);

      let cursorX = 0;
      childSubtrees.forEach(sub => {
        sub.offsetX = cursorX + sub.width / 2 - ownWidth / 2;
        cursorX += sub.width + CFG.gapX;
      });

      const height = blockH + (childSubtrees.length
        ? CFG.gapY + Math.max(...childSubtrees.map(s => s.height))
        : 0);

      const info = {
        person, pid, spouses, width: ownWidth, blockH, height,
        children: childSubtrees, childY: blockH + CFG.gapY
      };
      treeCache.set(pid, info);
      return info;
    }

    const placed = new Set();

    function emit(subtree, absX, absY) {
      if (!subtree) return;
      const { person, pid, spouses, blockH, children, childY } = subtree;
      if (placed.has(pid)) return;
      placed.add(pid);

      const nodeX = absX - NW / 2;
      const nodeY = absY;

      // Người chính (Nếu là Vợ/Chồng thì màu nhạt, ngược lại màu đậm)
      const isFocusSpouse = person.role_type === 'Vợ' || person.role_type === 'Chồng' || person.gender === 'Nữ' && !childrenOf.has(pid);
      nodes.push({
        id: pid, person, spouse: null,
        x: nodeX, y: nodeY, w: NW, h: NH,
        type: isFocusSpouse ? 'spouse' : 'blood'
      });

      // Vẽ vợ/chồng (Luôn màu nhạt, xếp dọc bên dưới)
      let spY = nodeY + NH + spouseGap;
      spouses.forEach(sp => {
        const spId = String(sp.id);
        if (placed.has(spId)) return;
        placed.add(spId);
        nodes.push({
          id: spId, person: sp, spouse: person,
          x: nodeX, y: spY, w: NW, h: NH, type: 'spouse'
        });
        links.push({
          from: { x: nodeX + NW / 2, y: spY - spouseGap },
          to:   { x: nodeX + NW / 2, y: spY },
          type: 'marry'
        });
        spY += NH + spouseGap;
      });

      // Vẽ các con
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

    return { nodes, links, width: maxX, height: maxY };
  }

  // ---------- 3.5) FAMILY LAYOUT (Lớp 2) ----------
  function computeFamilyLayout(tree, focusId) {
    console.log(LOG, 'computeFamilyLayout v9.0 (Lớp 2)...');
    const { byId, childrenOf, spousesOf } = tree;
    const NW = CFG.node.w, NH = CFG.node.h;
    const focus = byId.get(String(focusId));
    if (!focus) return null;
    
    const nodes = [], links = [], seen = new Set();
    const wives = (spousesOf.get(String(focusId)) || [])
      .sort((a,b) => (a.order||0) - (b.order||0))
      .map(s => byId.get(s.spouseId)).filter(Boolean);
    
    // Lấy tất cả các con của Focus
    const allFocusKids = (childrenOf.get(String(focusId)) || [])
      .map(cid => byId.get(cid)).filter(Boolean)
      .sort((a, b) => {
        let orderA = a.birth_order || a.sibling_order || 999;
        let orderB = b.birth_order || b.sibling_order || 999;
        return orderA - orderB;
      });

    // --- CẤU HÌNH KHOẢNG CÁCH LỚP 2 (FILE 888) ---
    const gapWife = NW / 2;            // Khoảng cách giữa các bà vợ = 1/2 khung tên
    const yFather = 100;               
    const yWife = yFather + NH * 2;    // Bố -> Vợ: Rộng rãi (2 lần chiều cao)
    const yChild = yWife + NH * 2.5;   // Mẹ -> Con: Đúng 2.5 lần chiều cao
    const gapChild = NW / 2;           // Khoảng cách giữa các dòng con = 1/2 khung tên
    const stepGap = NW / 5;            // Con riêng cách con chung = 1/5 khung tên

    // Tính toán độ rộng tổng thể để căn giữa
    const totalWifeWidth = Math.max(NW, wives.length * NW + Math.max(0, wives.length - 1) * gapWife);
    const centerX = 400 + totalWifeWidth / 2; 
    const fatherCx = centerX;

    // 1. Vẽ Bố (Hàng trên, ở giữa)
    nodes.push({ id: focus.id, person: focus, x: fatherCx - NW/2, y: yFather, w: NW, h: NH, type: 'blood' });
    seen.add(focus.id);

    // 2. Vẽ các bà vợ (Hàng giữa) - KHÔNG NỐI VỚI NHAU
    let wifeStartX = centerX - totalWifeWidth / 2;
    const wifePos = {};
    wives.forEach(w => {
      if (seen.has(w.id)) return;
      nodes.push({ id: w.id, person: w, x: wifeStartX, y: yWife, w: NW, h: NH, type: 'spouse' });
      // Nối từ Bố xuống Vợ (Duy nhất đường này)
      links.push({ from: { x: fatherCx, y: yFather + NH }, to: { x: wifeStartX + NW/2, y: yWife }, type: 'blood' });
      wifePos[w.id] = { cx: wifeStartX + NW/2 };
      wifeStartX += NW + gapWife; 
      seen.add(w.id);
    });

    // 3. Vẽ các con (Hàng dưới)
    let currentDrawX = 400; 

    function drawChildNode(k, drawX, isStep = false) {
      if (seen.has(k.id)) return null;
      const nodeType = isStep ? 'spouse' : 'blood';
      nodes.push({ id: k.id, person: k, x: drawX, y: yChild, w: NW, h: NH, type: nodeType });
      
      // Vẽ vợ/chồng của người con này (nếu có) - đặt ngay dưới
      const sp = (spousesOf.get(String(k.id)) || []).map(s => byId.get(s.spouseId)).filter(Boolean)[0];
      if (sp && !seen.has(sp.id)) {
        nodes.push({ id: sp.id, person: sp, x: drawX, y: yChild + NH + 15, w: NW, h: NH, type: 'spouse' });
        seen.add(sp.id);
      }
      seen.add(k.id);
      return drawX + NW/2;
    }

    // 3.1. Phân bổ con theo từng bà vợ
    const processedKids = new Set();
    
    wives.forEach(w => {
      // Tìm con chung
      const sharedKids = allFocusKids.filter(k => 
        !processedKids.has(k.id) &&
        parentChild.some(pc => pc.child_id === k.id && pc.parent_id === w.id && pc.parent_role === 'Mẹ')
      );
      
      // Tìm con riêng của bà vợ này
      const stepKids = (childrenOf.get(String(w.id)) || [])
        .map(cid => byId.get(cid)).filter(Boolean)
        .filter(k => !parentChild.some(pc => pc.child_id === k.id && pc.parent_id === focus.id && pc.parent_role === 'Bố'))
        .sort((a,b) => (a.birth_order || 999) - (b.birth_order || 999));

      // Vẽ con chung (Có đường nối từ Mẹ xuống)
      sharedKids.forEach(k => {
        const childCx = drawChildNode(k, currentDrawX, false);
        links.push({
           from: { x: wifePos[w.id].cx, y: yWife + NH },
           to:   { x: childCx, y: yChild },
           type: 'blood_straight'
        });
        processedKids.add(k.id);
        currentDrawX += NW + gapChild;
      });

      // Vẽ con riêng (Ngang hàng bên phải con chung, KHÔNG CÓ ĐƯỜNG NỐI)
      stepKids.forEach(k => {
        let stepX = sharedKids.length > 0 
          ? (currentDrawX - gapChild) + stepGap 
          : currentDrawX;
        
        drawChildNode(k, stepX, true); 
        processedKids.add(k.id);
        currentDrawX = stepX + NW + gapChild;
      });
    });

    // 3.2. Vẽ con không mẹ (Con nuôi, ngoài giá thú) - ĐẨY SANG PHẢI, KHÔNG CÓ ĐƯỜNG NỐI
    const noMomKids = allFocusKids.filter(k => 
      !processedKids.has(k.id) && 
      !parentChild.some(pc => pc.child_id === k.id && pc.parent_role === 'Mẹ')
    );
    
    noMomKids.forEach(k => {
      // Thụt lề thêm 1 khoảng so với con chung cuối cùng để tách biệt
      let startX = currentDrawX > 400 ? currentDrawX + stepGap : currentDrawX;
      drawChildNode(k, startX, true); // type 'spouse' (nhạt) hoặc tùy data
      processedKids.add(k.id);
      currentDrawX = startX + NW + gapChild;
    });

    const maxX = Math.max(...nodes.map(n => n.x + n.w), 400) + 100;
    const maxY = Math.max(...nodes.map(n => n.y + n.h), 300) + 100;
    return { nodes, links, width: maxX, height: maxY };
  }

  // ---------- 4) RENDER ----------
  function render(container) {
    console.log(LOG, 'render...');
    try {
      container.innerHTML = '';
      if (viewMode === 'family' && familyFocusId) {
        layoutData = computeFamilyLayout(tree, familyFocusId) || computeLayout(tree);
      } else {
        layoutData = computeLayout(tree);
      }
      const { nodes, links, width, height } = layoutData;

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
          if (d.type === 'marry') {
            return `M${d.from.x},${d.from.y} L${d.to.x},${d.to.y}`;
          }
          if (d.type === 'blood_straight') {
             const midY = d.from.y + (d.to.y - d.from.y) * 0.5; 
             return `M${d.from.x},${d.from.y} V${midY} H${d.to.x} V${d.to.y}`;
          }
          const midY = d.from.y + (d.to.y - d.from.y) * 0.6;
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
          if (viewMode === 'family') {
            familyFocusId = String(d.person.id);
            const container = document.getElementById('pha-do-svg');
            if (container) render(container);
          }
          if (window.PedigreePanel) window.PedigreePanel.show(d.person);
        })
        .on('dblclick', (evt, d) => {
          evt.stopPropagation();
          if (typeof window.openPersonForm === 'function') {
            window.openPersonForm(d.person.id);
          }
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
    const bIn = document.getElementById('pd-zoom-in');
    const bOut = document.getElementById('pd-zoom-out');
    const bRst = document.getElementById('pd-reset');
    const sel = document.getElementById('pd-branch-filter');
    if (bIn) bIn.onclick = () => zoomBy(CFG.zoom.step);
    if (bOut) bOut.onclick = () => zoomBy(-CFG.zoom.step);
    if (bRst) bRst.onclick = () => resetZoom();
    if (sel) sel.onchange = () => filterBranch(sel.value);
  }

  // ---------- 5.4) VIEW TOGGLE (Toàn cảnh / Lớp 2) ----------
  function setupViewToggle() {
    const btnAll = document.getElementById('pd-view-all');
    const btnFam = document.getElementById('pd-view-family');
    if (!btnAll || !btnFam) return;

    btnAll.onclick = () => {
      viewMode = 'all';
      familyFocusId = null;
      btnAll.classList.add('is-active');
      btnFam.classList.remove('is-active');
      const container = document.getElementById('pha-do-svg');
      if (container) render(container);
    };

    btnFam.onclick = () => {
      viewMode = 'family';
      btnFam.classList.add('is-active');
      btnAll.classList.remove('is-active');
      if (!familyFocusId) {
        const preferred = persons.find(p => (p.full_name || '').trim() === 'Phạm Văn Mỹ');
        const fallback = (tree && tree.roots && tree.roots[0]) || null;
        const target = preferred || fallback;
        if (target) familyFocusId = String(target.id);
      }
      const container = document.getElementById('pha-do-svg');
      if (container) render(container);
    };

    btnAll.classList.add('is-active');
  }

  function setupSearch() {
    const input = document.getElementById('pd-search');
    const clearBtn = document.getElementById('pd-search-clear');
    if (!input) return;

    input.addEventListener('input', function () {
      const q = this.value.trim();
      if (clearBtn) clearBtn.style.display = q ? 'inline-block' : 'none';

      if (!q) {
        gRoot.selectAll('g.node').each(function () {
          const sel = d3.select(this);
          const d = sel.datum();
          sel.style('opacity', isFaded(d.person) ? 0.55 : 1);
          const isSp = sel.classed('node-spouse');
          sel.select('rect')
            .attr('stroke', isSp ? CFG.colors.spouse.stroke : CFG.colors.blood.stroke)
            .attr('stroke-width', isSp ? 1.5 : 2.5)
            .attr('filter', null);
        });
        return;
      }

      const qNorm = q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      let firstMatch = null;

      gRoot.selectAll('g.node').each(function (d) {
        const name = (d.person.full_name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const match = name.includes(qNorm);
        const sel = d3.select(this);
        sel.style('opacity', match ? 1 : 0.15);
        const rect = sel.select('rect');
        if (match) {
          rect.attr('stroke', '#F2C94C').attr('stroke-width', 3.5);
          rect.attr('filter', 'url(#focus-glow)');
        } else {
          const isSp = sel.classed('node-spouse');
          rect.attr('stroke', isSp ? CFG.colors.spouse.stroke : CFG.colors.blood.stroke);
          rect.attr('stroke-width', isSp ? 1.5 : 2.5);
          rect.attr('filter', null);
        }
        if (match && !firstMatch) firstMatch = d;
      });
      if (firstMatch && svg && zoomBehavior) {
        const k = 4.0;
        const NW = CFG.node.w, NH = CFG.node.h;
        const centerX = firstMatch.x + NW / 2;
        const centerY = firstMatch.y + NH / 2;
        const svgW = svg.node().clientWidth || 800;
        const svgH = svg.node().clientHeight || 600;
        const tx = svgW / 2 - centerX * k;
        const ty = svgH / 2 - centerY * k;
        svg.transition().duration(800).ease(d3.easeCubicOut).call(
          zoomBehavior.transform,
          d3.zoomIdentity.translate(tx, ty).scale(k)
        );
      }
    });

    if (clearBtn) {
      clearBtn.onclick = () => {
        input.value = '';
        input.dispatchEvent(new Event('input'));
      };
    }
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

  function autoFocus() {
    if (!gRoot) return;
    const target = gRoot.selectAll('g.node')
      .filter(d => (d.person.full_name || '').trim() === CFG.focusName);
    if (target.empty()) return;
    target.select('rect')
      .attr('fill', CFG.colors.focus.fill)
      .attr('filter', 'url(#focus-glow)');
  }

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

  function boot() {
    setTimeout(function () { init(); }, 500);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

 window.Pedigree = {
  init, loadAll, buildTree, computeLayout, render, CFG,
  getLayout: () => layoutData,
  refresh: async function () {
    try {
      await loadAll();
      tree = buildTree(persons, parentChild, marriages);
      if (!tree || !tree.roots.length) return;
      const container = document.getElementById('pha-do-svg');
      if (!container) return;
      render(container);
      fillBranchDropdown();
      autoFocus();
    } catch (e) {
      console.error(LOG, 'refresh error', e);
    }
  }
};
})();
