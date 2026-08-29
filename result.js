/**
 * 婚礼找座位 · 结果页逻辑（ES Module）
 *
 * 从 URL 读取 ?name=&no=，显示座位卡片 + 渲染席位图并高亮命中桌。
 */
import { initFloorplan } from './floorplan.js?v=1';

(function () {
  'use strict';

  const C = window.CONFIG || {};
  const HEAD_NO = (C.HEAD_TABLE || { no: 28 }).no;

  const q = new URLSearchParams(window.location.search);
  const name = (q.get('name') || '').trim();
  const no = Number(q.get('no'));

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // 参数缺失/非法 -> 回首页
  if (!name || !Number.isFinite(no) || no <= 0) {
    window.location.replace('./index.html');
    return;
  }

  const isHead = no === HEAD_NO;

  // 1) 座位卡片
  const card = document.getElementById('resultCard');
  card.hidden = false;
  card.innerHTML = `
    <div class="result-card">
      <div class="result-label">${esc(name)} 的座位</div>
      ${isHead
        ? `<div class="result-table"><span class="couple-icon">👰🤵</span></div>
           <div class="result-name">请到最上方新人桌就座</div>`
        : `<div class="result-table"><span class="num">${no}</span> 号桌</div>
           <div class="result-name">您的座位已在下方席位图中标出</div>`}
    </div>`;

  // 2) 席位图 + 高亮
  const svg = document.getElementById('floorplan');
  initFloorplan(svg, C, no);

  // 3) 返回：直接重新加载干净的首页（不走 history.back，避免恢复缓存中的搜索状态）
  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = './index.html';
  });
})();
