/**
 * 婚礼找座位 · 席位图渲染模块（结果页专用）
 *
 * 渲染原图 + 每张桌的透明命中圈，提供高亮函数。
 * 用法：import { initFloorplan } from './floorplan.js';
 */

const NS = 'http://www.w3.org/2000/svg';
const R = 42; // 高亮圈半径（像素）

function el(name, attrs) {
  const node = document.createElementNS(NS, name);
  for (const k in attrs) node.setAttribute(k, attrs[k]);
  return node;
}

/**
 * @param {SVGSVGElement} svg
 * @param {object} C window.CONFIG（含 FLOORPLAN_IMG/IMG_W/IMG_H/TABLES/HEAD_TABLE）
 * @param {number|null} highlightNo 初始高亮的桌号（可为 null）
 * @returns {{ highlightTable: (no:number|null)=>void }}
 */
export function initFloorplan(svg, C, highlightNo) {
  // 1) 原图作为底图（与 viewBox 对齐，image 元素坐标系同原图）
  svg.appendChild(el('image', {
    href: C.FLOORPLAN_IMG || 'floorplan.jpg',
    x: 0, y: 0,
    width: C.IMG_W || 991,
    height: C.IMG_H || 1778,
    preserveAspectRatio: 'xMidYMid meet',
  }));

  // 2) 高亮覆盖层：每张桌一个透明命中圈（命中时显示）
  function makeHitZone(no, x, y, isHead) {
    const g = el('g', { class: isHead ? 'table head-table' : 'table', 'data-no': no, transform: `translate(${x},${y})` });
    // 命中光晕
    g.appendChild(el('circle', { class: 'halo', cx: 0, cy: 0, r: R + 8, fill: '#e8b4b4', opacity: 0 }));
    // 高亮描边圈
    g.appendChild(el('circle', { class: 'hit-ring', cx: 0, cy: 0, r: R, fill: 'none', stroke: '#c0392b', 'stroke-width': 5, opacity: 0 }));
    // 内圈脉冲
    g.appendChild(el('circle', { class: 'hit-ring2', cx: 0, cy: 0, r: R, fill: 'none', stroke: '#e74c3c', 'stroke-width': 2, opacity: 0 }));
    return g;
  }

  const headTable = C.HEAD_TABLE || { no: 28, x: 613, y: 488 };
  svg.appendChild(makeHitZone(headTable.no, headTable.x, headTable.y, true));

  (C.TABLES || []).forEach((t) => {
    svg.appendChild(makeHitZone(t.no, t.x, t.y, false));
  });

  function highlightTable(no) {
    svg.querySelectorAll('.table').forEach((g) => g.classList.remove('hit'));
    if (no == null) return;
    const target = svg.querySelector(`.table[data-no="${no}"]`);
    if (target) {
      target.classList.add('hit');
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  if (highlightNo != null) highlightTable(highlightNo);

  return { highlightTable };
}
