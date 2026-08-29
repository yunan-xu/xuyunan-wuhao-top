/**
 * 婚礼找座位 · 首页逻辑（ES Module）
 *
 * 两页流程：
 *   1. 首页：新人名字 + 搜索框。输入姓名查询；
 *      有重名 -> 页面内弹出选择列表；命中唯一 -> 直接跳转结果页。
 *   2. 结果页 result.html：显示座位 + 高亮席位图（见 result.js / floorplan.js）
 *
 * 查询优先级：
 *   1. 输入 805100 -> 进入管理员页
 *   2. 服务端云函数 findSeat（数据库就绪时生效，动态加载，失败不影响本地兜底）
 *   3. 服务不可用 -> 回退到本地 guests.json 兜底
 */
(function () {
  'use strict';

  const C = window.CONFIG || {};

  // ===== 1. 顶部名字 =====
  const coupleEl = document.getElementById('coupleNames');
  if (coupleEl) coupleEl.textContent = C.COUPLE_NAMES || '新郎 & 新娘';

  const HEAD_NO = (C.HEAD_TABLE || { no: 28 }).no;

  // ===== 2. 本地兜底数据 =====
  let localGuests = [];
  fetch('./guests.json?v=7')
    .then((r) => (r.ok ? r.json() : []))
    .then((arr) => { localGuests = Array.isArray(arr) ? arr : []; })
    .catch(() => {});

  function searchLocal(name) {
    const q = name.trim();
    if (!q) return [];
    const exact = localGuests.filter((g) => g.name === q);
    if (exact.length > 0) return exact;
    const lower = q.toLowerCase();
    return localGuests.filter((g) => String(g.name).toLowerCase().includes(lower)).slice(0, 20);
  }

  // ===== 3. 服务器查询（CloudBase 云函数，动态加载）=====
  async function searchServer(name) {
    try {
      const mod = await import('./cloudbase-api.js?v=2');
      const data = await mod.findSeat(name); // null = 服务不可用
      return data;
    } catch (e) {
      return null;
    }
  }

  // ===== 4. 查询入口 =====
  const input = document.getElementById('nameInput');
  const btn = document.getElementById('searchBtn');
  const resultArea = document.getElementById('resultArea');

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // 跳转到结果页（URL 携带姓名 + 桌号）
  function gotoResult(guest) {
    const q = new URLSearchParams({
      name: guest.name,
      no: String(guest.table_no),
    });
    window.location.href = `./result.html?${q.toString()}`;
  }

  function renderLoading() {
    resultArea.hidden = false;
    resultArea.innerHTML = '<div class="loading"><span class="spinner"></span>查询中…</div>';
  }

  function renderNotFound(name) {
    resultArea.hidden = false;
    resultArea.innerHTML = `
      <div class="result-empty">
        未找到「${escapeHtml(name)}」的座位信息<br/>
        请确认姓名是否与请柬一致，或联系现场工作人员
      </div>`;
  }

  function renderMultiple(list) {
    resultArea.hidden = false;
    const items = list.map((g) => {
      const isHead = Number(g.table_no) === HEAD_NO;
      const tableText = isHead ? '👰🤵 新人桌' : `${escapeHtml(String(g.table_no))} 号桌`;
      const idText = g.identity ? `<span class="multi-id">${escapeHtml(g.identity)}</span>` : '';
      return `
      <div class="multi-item" data-no="${escapeHtml(String(g.table_no))}" data-name="${escapeHtml(g.name)}">
        <span class="multi-name">${escapeHtml(g.name)}</span>
        ${idText}
        <span class="multi-table">${tableText}</span>
      </div>`;
    }).join('');
    resultArea.innerHTML = `<div class="multi-list">${items}</div>
      <div class="result-tip">查到多位同名的宾客，请点击确认您的姓名</div>`;
    resultArea.querySelectorAll('.multi-item').forEach((node) => {
      node.addEventListener('click', () => {
        gotoResult({ name: node.dataset.name, table_no: Number(node.dataset.no) });
      });
    });
  }

  async function doSearch() {
    const name = input.value.trim();
    if (!name) {
      input.focus();
      return;
    }

    // 管理员入口：输入 805100
    if (name === '805100') {
      window.location.href = './admin.html';
      return;
    }

    renderLoading();

    let data = null;
    data = await searchServer(name);
    if (data == null) {
      data = searchLocal(name);
    }

    if (!data || data.length === 0) {
      renderNotFound(name);
    } else if (data.length === 1) {
      gotoResult(data[0]);
    } else {
      renderMultiple(data);
    }
  }

  btn.addEventListener('click', doSearch);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.keyCode === 13) doSearch();
  });
})();
