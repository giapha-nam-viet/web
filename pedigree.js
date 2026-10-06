/* ============================================================
   pedigree.js — v4.0 LAYOUT DỌC
   - Cây gia phả theo chiều dọc (đời trên → đời dưới)
   - Con gái (Lâm) vẫn có Đời 3, nhưng KHÔNG vẽ tiếp Đời 4
   - Chồng: nét liền #88a9ad | Vợ/chồng: nét đứt #b4c8ca
   - Tự động focus Phạm Văn Mỹ
   - Toolbar: ＋ / − / ⟲
   ============================================================ */
console.log('[Pedigree] ★ v4.0 LAYOUT DOC loaded');

(function () {
  'use strict';

  const ROOT_NAME = 'Phạm Văn Thiện';
  const FOCUS_NAME = 'Phạm Văn Mỹ';
  const NODE_W = 180, NODE_H = 70;
  const COL_GAP = 60;      // khoảng cách giữa 2 chi (cột)
  const ROW_GAP = 200;     // khoảng cách giữa 2 đời
  const SPOUSE_GAP = 90;   // khoảng cách chồng-vợ (dọc)

  let svg, gRoot, gLinks, gNodes, zoomBehavior;
  let tooltipEl, loadingEl;
  let initialized = false;
  let currentNodes = [];
  let maxDepth = 3;   // vẽ tới đời 3 là dừng (con gái không vẽ tiếp)

  // ============ KHỞI TẠO ============
  function setup() {
    const tab = document.querySelector('[data-tab="pha-do"]');
    if (!tab) { console.error('[Pedigree] Không có tab pha-do'); return; }
    tab.addEventListener('click', () => setTimeout(function() { init(); }, 300));

    // Auto-init nếu tab đã active
    setTimeout(() => {
      const sec = document.getElementById('tab-pha-do');
      if (sec && sec.style.display !== 'none') init();
    }, 500);
  }

  async function init() {
    if (initialized) { await loadAndRender(); return; }
    initialized = true;
    console.log('[Pedigree] === INIT v4.0 ===');

    svg = d3.select('#pedigree-svg');
    if (svg.empty()) { console.error('[Pedigree] Không có #pedigree-svg'); return; }
    svg.selectAll('*').remove();

    tooltipEl = document.getElementById('pedigree-tooltip');
    loadingEl = document.getElementById('pedigree-loading');

    gRoot = svg.append('g');
    gLinks = gRoot.append('g').attr('class', 'ped-links');
    gNodes = gRoot.append('g').attr('class', 'ped-nodes');

    zoomBehavior = d3.zoom().scaleExtent([0.2, 2.5])
      .on('zoom', (e) => gRoot.attr('transform', e.transform));
    svg.call(zoomBehavior);

    const zIn = document.getElementById('pedZoomIn');
    const zOut = document.getElementById('pedZoomOut');
    const zReset = document.getElementById('pedZoomReset');
    if (zIn) zIn.onclick = () => svg.transition().call(zoomBehavior.scaleBy, 1.25);
    if (zOut) zOut.onclick = () => svg.transition().call(zoomBehavior.scaleBy, 0.8);
    if (zReset) zReset.onclick = () => centerView(currentNodes);

    await loadAndRender();
  }

  // ============ LOAD DATA ============
  async function loadAndRender() {
    if (loadingEl) { loadingEl.style.display = 'block'; loadingEl.innerHTML = 'Đang tải phả đồ...'; }
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
      console.log('[Pedigree] ✓ Session OK sau ' + tries + ' lần');

      // 1. Lấy tất cả persons (để vẽ toàn cây)
      const { data: allPersons } = await sb.from('persons')
        .select('id, full_name, gender, generation, branch, birth_year, death_year, sibling_order')
        .eq('is_deleted', false)
        .order('generation')
        .order('sibling_order', { nullsFirst: false });

      if (!allPersons || !allPersons.length) throw new Error('Không có dữ liệu persons');
      console.log('[Pedigree] ✓ Load', allPersons.length, 'người');

      // 2. Lấy parent_child
      const { data: parentChild } = await sb.from('parent_child').select('*');
      console.log('[Pedigree] ✓ Load', (parentChild || []).length, 'quan hệ cha-con');

      // 3. Lấy marriages
      const { data: marriages } = await sb.from('marriages').select('*');
      console.log('[Pedigree] ✓ Load', (marriages || []).length, 'hôn nhân');

      // 4. Xây cây từ gốc
      const data = buildTree(allPersons, parentChild || [], marriages || []);
      render(data);
      if (loadingEl) loadingEl.style.display = 'none';
      console.log('[Pedigree] ✓ DONE');
    } catch (err) {
      console.error('[Pedigree] ❌ LỖI:', err);
      if (loadingEl) loadingEl.innerHTML = '⚠ ' + (err.message || err);
    }
  }

  // ============ XÂY CÂY ============
  function buildTree(allPersons, parentChild, marriages) {
    const personsById = {};
    allPersons.forEach(p => personsById[p.id] = p);

    // Tìm cụ tổ (đời 1)
    let root = allPersons.find(p => p.full_name === ROOT_NAME && p.generation === 1);
    if (!root) root = allPersons.find(p => p.generation === 1);
    if (!root) throw new Error('Không tìm thấy cụ tổ (đời 1)');
    console.log('[Pedigree] Root:', root.full_name);

    // Map parent_id -> [child_ids]
    const childrenMap = {};
    parentChild.forEach(pc => {
      if (!childrenMap[pc.parent_id]) childrenMap[pc.parent_id] = [];
      childrenMap[pc.parent_id].push(pc.child_id);
    });

    // Map person_id -> [spouse_ids]
    const spouseMap = {};
    marriages.forEach(m => {
      if (!spouseMap[m.husband_id]) spouseMap[m.husband_id] = [];
      if (!spouseMap[m.wife_id]) spouseMap[m.wife_id] = [];
      if (m.husband_id) spouseMap[m.husband_id].push(m.wife_id);
      if (m.wife_id) spouseMap[m.wife_id].push(m.husband_id);
    });

    // Đệ quy xây cây
    function makeNode(person, depth) {
      if (!person) return null;
      const spouses = (spouseMap[person.id] || [])
        .map(id => personsById[id])
        .filter(Boolean);

      const children = [];
      // Đời 3 sẽ không vẽ con của con gái (nếu quy định "con gái dừng")
      // Với quy tắc của bạn: con gái Lâm VẪN vẽ Đời 3 nhưng dừng ở đó → nên vẫn lấy children
      // Nhưng nếu depth >= maxDepth thì dừng
      if (depth < maxDepth) {
        const childIds = (childrenMap[person.id] || []);
        childIds.forEach(cid => {
          const c = personsById[cid];
          if (!c) return;
          // Sort theo sibling_order
          children.push(c);
        });
        children.sort((a, b) => {
          const ao = a.sibling_order != null ? a.sibling_order : 9999;
          const bo = b.sibling_order != null ? b.sibling_order : 9999;
          if (ao !== bo) return ao - bo;
          return (a.full_name || '').localeCompare(b.full_name || '', 'vi');
        });
      }

      return {
        person,
        spouses,
        children: children.map(c => makeNode(c, depth + 1)).filter(Boolean),
        depth
      };
    }

    return makeNode(root, 1);
  }

  // ============ RENDER ============
  function render(rootNode) {
    gLinks.selectAll('*').remove();
    gNodes.selectAll('*').remove();

    const nodes = [], links = [];

    // Tính toán vị trí dọc: mỗi đời 1 hàng, mỗi chi 1 cột
    // Bước 1: Xác định số cột (số node ở đời 2 = số chi)
    const gen2 = (rootNode.children || []).length || 1;
    const totalWidth = gen2 * (NODE_W + COL_GAP);
    const startX = -totalWidth / 2 + NODE_W / 2;

    // Bước 2: Vẽ đệ quy từ gốc
    let colIndex = 0;
    const usedCols = new Set();

    function assignCol(node, level) {
      // Nếu node ở đời 2 (chi) → gán cột riêng
      if (level === 2) {
        const col = colIndex++;
        node.colX = startX + col * (NODE_W + COL_GAP);
        return node.colX;
      }
      // Nếu là gốc → căn giữa
      if (level === 1) {
        node.colX = 0;
        return 0;
      }
      // Nếu là con → cùng cột với cha/mẹ
      return node._parentColX || 0;
    }

    function walk(node, level, parentColX) {
      if (!node) return;

      // Gán x
      if (level === 1) {
        node.x = 0;
      } else if (level === 2) {
        const col = colIndex++;
        node.x = startX + col * (NODE_W + COL_GAP);
      } else {
        node.x = parentColX;
      }

      // Y = level * ROW_GAP
      node.y = (level - 1) * ROW_GAP;

      // Add node vào list
      nodes.push({
        id: node.person.id,
        person: node.person,
        x: node.x,
        y: node.y,
        kind: level === 2 && node.children && node.children.length === 0 ? 'focus' : 'blood',
        level: level
      });

      // Add spouses (xếp dọc dưới person)
      let spouseOffsetY = 0;
      node.spouses.forEach((sp, i) => {
        spouseOffsetY += SPOUSE_GAP;
        nodes.push({
          id: sp.id,
          person: sp,
          x: node.x,
          y: node.y + spouseOffsetY,
          kind: 'spouse',
          level: level,
          isSpouse: true
        });

        // Link person -> spouse
        links.push({
          from: node.person.id,
          to: sp.id,
          type: 'marriage',
          spouseOffset: spouseOffsetY
        });
      });

      // Vẽ con (xếp dọc dưới cha mẹ)
      if (node.children && node.children.length) {
        node.children.forEach((child, i) => {
          walk(child, level + 1, node.x);

          // Link cha mẹ → con
          const childY = (level + 1 - 1) * ROW_GAP;
          const spouseTotalY = spouseOffsetY;
          links.push({
            from: node.person.id,
            to: child.person.id,
            type: 'blood',
            parentX: node.x,
            parentY: node.y + NODE_H / 2,
            spouseBottomY: node.y + spouseTotalY + NODE_H / 2,
            childX: child.x,
            childY: childY - NODE_H / 2
          });
        });
      }
    }

    walk(rootNode, 1, 0);

    console.log('[Pedigree] Vẽ', nodes.length, 'nodes,', links.length, 'links');

    // Vẽ links
    gLinks.selectAll('path').data(links).enter().append('path')
      .attr('class', d => 'ped-link ' + (d.type === 'marriage' ? 'marriage' : 'blood'))
      .attr('d', d => computePath(d));

    // Vẽ nodes
    const nodeSel = gNodes.selectAll('g.ped-node')
      .data(nodes, d => d.id + '_' + d.kind)
      .enter().append('g')
      .attr('class', d => 'ped-node ' + (d.isSpouse ? 'spouse' : 'blood'))
      .attr('transform', d => 'translate(' + (d.x - NODE_W/2) + ',' + (d.y - NODE_H/2) + ')')
      .style('cursor', 'pointer');

    nodeSel.append('rect')
      .attr('width', NODE_W).attr('height', NODE_H);

    nodeSel.append('text').attr('class', 'name')
      .attr('x', NODE_W / 2).attr('y', 28).attr('text-anchor', 'middle')
      .text(d => d.person.full_name || '?');

    nodeSel.append('text').attr('class', 'years')
      .attr('x', NODE_W / 2).attr('y', 50).attr('text-anchor', 'middle')
      .text(d => {
        const b = d.person.birth_year ? String(d.person.birth_year) : '?';
        const dd = d.person.death_year ? String(d.person.death_year) : '';
        return dd ? '(' + b + ' - ' + dd + ')' : '(' + b + ')';
      });

    // Sự kiện
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

    // Auto-focus vào Phạm Văn Mỹ
    const focusNode = nodes.find(n => n.person.full_name === FOCUS_NAME);
    if (focusNode) {
      console.log('[Pedigree] Auto-focus vào:', FOCUS_NAME);
      focusOn(focusNode);
    } else {
      centerView(nodes);
    }
  }

  // ============ PATH ============
  function computePath(link) {
    if (link.type === 'marriage') {
      // Đường nối chồng → vợ (dọc, ngay dưới)
      const x = link.spouseOffset != null ? 0 : 0;  // sẽ tính lại từ nodes
      return '';  // để trống, sẽ vẽ lại theo toạ độ thực
    }
    if (link.type === 'blood') {
      const px = link.parentX;
      const py = link.spouseBottomY;  // từ đáy vợ cuối cùng
      const cx = link.childX;
      const cy = link.childY;
      const midY = (py + cy) / 2;
      return `M ${px} ${py} L ${px} ${midY} L ${cx} ${midY} L ${cx} ${cy}`;
    }
    return '';
  }

  // ============ FOCUS / CENTER ============
  function focusOn(node) {
    if (!svg || !svg.node()) return;
    const svgW = svg.node().clientWidth;
    const svgH = svg.node().clientHeight;
    const scale = 0.85;
    const tx = svgW / 2 - node.x * scale;
    const ty = svgH / 2 - node.y * scale;
    svg.transition().duration(600).call(
      zoomBehavior.transform,
      d3.zoomIdentity.translate(tx, ty).scale(scale)
    );
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
    svg.transition().duration(400).call(
      zoomBehavior.transform,
      d3.zoomIdentity.translate(tx, ty).scale(scale)
    );
  }

  // ============ TOOLTIP ============
  function showTooltip(event, d) {
    const p = d.person;
    tooltipEl.innerHTML =
      '<b style="color:#C49504">' + (p.full_name || '?') + '</b><br>' +
      'Đời: ' + (p.generation || '?') + ' • Nhánh: ' + (p.branch || '?') + '<br>' +
      'Giới tính: ' + (p.gender || '?') + '<br>' +
      'Sinh: ' + (p.birth_year || '?') + (p.death_year ? ' • Mất: ' + p.death_year : '') +
      '<br><em style="opacity:.7">Đúp chuột để mở Danh tính</em>';
    tooltipEl.style.display = 'block';
    const r = svg.node().getBoundingClientRect();
    tooltipEl.style.left = (event.clientX - r.left + 12) + 'px';
    tooltipEl.style.top = (event.clientY - r.top + 12) + 'px';
    clearTimeout(showTooltip._t);
    showTooltip._t = setTimeout(() => tooltipEl.style.display = 'none', 4000);
  }

  // ============ BOOT ============
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }

  window.Pedigree = { init, loadAndRender };
})();
