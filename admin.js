/**
 * 婚礼找座位 · 管理员页逻辑（ES Module）
 *
 * 功能：
 *   1. 一键查看全体宾客名单 + 桌号 + 位置（列/排）
 *   2. 上传 Excel/CSV 覆盖导入（清空旧数据 + 写入新数据）
 *
 * 数据源优先级：云端数据库（listGuests/importGuests）
 */
// 注意：云函数接口用动态 import，加载失败不影响页面其余功能
async function callListGuests() {
  try {
    const mod = await import('./cloudbase-api.js?v=2');
    return await mod.listGuests();
  } catch (e) {
    return null;
  }
}
async function callImportGuests(guests) {
  try {
    const mod = await import('./cloudbase-api.js?v=2');
    return await mod.importGuests(guests);
  } catch (e) {
    return { code: 500, msg: e.message || '调用失败', imported: 0, deleted: 0 };
  }
}

const C = window.CONFIG || {};

// ===== 有效桌号集合（用于校验上传数据）=====
const validTables = new Set((C.TABLES || []).map((t) => t.no));
const HEAD_NO = (C.HEAD_TABLE || {}).no; // 主桌号（临时 28）

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatTime(ts) {
  if (!ts) return '未知';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '未知';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ===== 1. 名单查看 =====
let currentGuests = []; // 最近一次加载的名单（供"下载数据"用）

async function loadGuests() {
  const listEl = document.getElementById('guestList');
  const statsEl = document.getElementById('stats');
  listEl.innerHTML = '<div class="loading">加载中…</div>';

  let data = null;
  let updatedAt = null;
  let source = '云端数据库';

  const result = await callListGuests();
  if (result != null) {
    data = result.data;
    updatedAt = result.updatedAt;
  } else {
    // 云端不可用（加密后的本地 JSON 无法明文显示，不再回退）
    data = [];
    source = '云端数据库不可用（本地名单已加密，管理页仅支持云端数据）';
  }

  if (!data || data.length === 0) {
    currentGuests = [];
    statsEl.innerHTML = '';
    listEl.innerHTML = '<div class="empty">暂无宾客数据</div>';
    return;
  }
  currentGuests = data;

  const tables = new Set(data.map((g) => g.table_no));
  const totalPeople = data.reduce((s, g) => s + (Number(g.count) || 1), 0);
  const totalTables = validTables.size + 1; // 21 张宾客桌 + 1 张主桌 = 22
  statsEl.innerHTML = `共 <b>${data.length}</b> 组宾客 · <b>${totalPeople}</b> 人 · <b>${totalTables}</b> 张桌 · 数据源：${source}<br/>数据时间：<b>${formatTime(updatedAt)}</b>`;

  // 按桌号分组（升序，主桌 28 自然排最后）
  const byNo = {};
  data.forEach((g) => {
    const no = Number(g.table_no);
    (byNo[no] = byNo[no] || []).push(g);
  });
  const noList = Object.keys(byNo).map(Number).sort((a, b) => a - b);

  const rows = [];
  noList.forEach((no) => {
    const group = byNo[no];
    const isHead = no === HEAD_NO;
    const tableLabel = isHead ? '主桌' : esc(String(no)) + ' 号桌';
    // 1) 本桌宾客（桌号 | 姓名 | 身份 | 人数）
    group.forEach((g) => {
      rows.push(`
      <tr>
        <td class="td-table">${isHead ? '主桌' : esc(String(g.table_no)) + ' 号'}</td>
        <td class="td-name">${esc(g.name)}</td>
        <td class="td-identity">${g.identity ? esc(g.identity) : '<span class="dim">—</span>'}</td>
        <td class="td-count">${esc(String(g.count || 1))} 人</td>
      </tr>`);
    });
    // 2) 本桌合计行
    const sub = group.reduce((s, g) => s + (Number(g.count) || 1), 0);
    rows.push(`
      <tr class="row-subtotal">
        <td colspan="4">${tableLabel} 合计 <b>${sub}</b> 人</td>
      </tr>`);
    // 3) 空行分隔
    rows.push('<tr class="row-gap"><td colspan="4"></td></tr>');
  });

  listEl.innerHTML = `
    <table class="guest-table">
      <thead><tr><th>桌号</th><th>姓名</th><th>身份</th><th>人数</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>`;
}

// ===== 2. 文件解析（Excel / CSV，统一走 SheetJS）=====
function parseFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsArrayBuffer(file);
  });
}

function extractGuests(rows) {
  const cleaned = rows
    .map((r) => (Array.isArray(r) ? r.map((c) => String(c == null ? '' : c).trim()) : []))
    .filter((r) => r.some((c) => c !== ''));

  if (cleaned.length === 0) return [];

  // 找表头：name/姓名、table_no/桌号、count/人数、identity/身份
  let headerIdx = -1, idxName = -1, idxTable = -1, idxCount = -1, idxIdentity = -1;
  for (let i = 0; i < Math.min(cleaned.length, 6); i++) {
    const row = cleaned[i];
    const ni = row.findIndex((c) => ['name', '姓名', '姓名/名字'].includes(c));
    const ti = row.findIndex((c) => ['table_no', '桌号', '桌数', 'table', 'Table'].includes(c));
    const ci = row.findIndex((c) => ['count', '人数', '占位', '人'].includes(c));
    const ii = row.findIndex((c) => ['identity', '身份', '公司', '单位', '备注'].includes(c));
    if (ni >= 0 && ti >= 0) { headerIdx = i; idxName = ni; idxTable = ti; idxCount = ci; idxIdentity = ii; break; }
  }

  const dataRows = headerIdx >= 0 ? cleaned.slice(headerIdx + 1) : cleaned;
  // 无表头：默认第 1 列姓名、第 2 列桌号、第 3 列人数、第 4 列身份
  if (headerIdx < 0) { idxName = 0; idxTable = 1; idxCount = 2; idxIdentity = 3; }

  const guests = [];
  for (const row of dataRows) {
    const name = (row[idxName] || '').trim();
    const no = Number(row[idxTable]);
    if (name && Number.isFinite(no) && no > 0) {
      let count = 1;
      if (idxCount >= 0) {
        const c = Number(row[idxCount]);
        if (Number.isFinite(c) && c > 0) count = Math.round(c);
      }
      const identity = (idxIdentity >= 0 ? row[idxIdentity] : '').trim();
      guests.push({ name, table_no: no, count, identity });
    }
  }
  return guests;
}

// ===== 3. 事件绑定 =====
const fileInput = document.getElementById('fileInput');
const fileName = document.getElementById('fileName');
const preview = document.getElementById('preview');
const uploadBtn = document.getElementById('uploadBtn');
const uploadResult = document.getElementById('uploadResult');

let pendingGuests = null;

fileInput.addEventListener('change', async () => {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
  fileName.textContent = `已选择：${file.name}`;
  preview.innerHTML = '<div class="loading">解析中…</div>';
  uploadBtn.disabled = true;
  uploadResult.innerHTML = '';

  try {
    const rows = await parseFile(file);
    pendingGuests = extractGuests(rows);
    if (pendingGuests.length === 0) {
      preview.innerHTML = '<div class="empty">未解析到有效数据，请确认文件包含「姓名」「桌号」两列（人数列可选）。</div>';
      return;
    }
    const tables = new Set(pendingGuests.map((g) => g.table_no));
    const totalPeople = pendingGuests.reduce((s, g) => s + (g.count || 1), 0);
    const invalid = [...tables].filter((t) => !validTables.has(t));
    preview.innerHTML = `
      <div class="preview-ok">
        解析到 <b>${pendingGuests.length}</b> 组宾客 · 共 <b>${totalPeople}</b> 人，覆盖 <b>${tables.size}</b> 张桌
        ${invalid.length ? `<br/><span class="warn">⚠ 以下桌号不在桌位图中：${invalid.map((n) => esc(String(n))).join('、')}</span>` : ''}
        <br/><span class="sample">示例：${pendingGuests.slice(0, 3).map((g) => `${esc(g.name)}→${g.table_no}号(${g.count || 1}人)`).join('，')}…</span>
      </div>`;
    uploadBtn.disabled = false;
  } catch (err) {
    preview.innerHTML = `<div class="empty">解析失败：${esc(err.message || err)}</div>`;
  }
});

uploadBtn.addEventListener('click', async () => {
  if (!pendingGuests || pendingGuests.length === 0) return;
  uploadBtn.disabled = true;
  uploadBtn.textContent = '导入中…';
  uploadResult.innerHTML = '<div class="loading">正在覆盖数据…</div>';

  const r = await callImportGuests(pendingGuests);

  if (r && r.code === 0) {
    uploadResult.innerHTML = `<div class="preview-ok">✅ 导入成功：写入 ${r.imported} 条，清除 ${r.deleted} 条旧数据。</div>`;
    await loadGuests(); // 刷新名单
  } else {
    uploadResult.innerHTML = `<div class="warn">❌ 导入失败：${esc((r && r.msg) || '未知错误')}<br/>若提示数据库未初始化，请先在云开发控制台初始化数据库。</div>`;
  }
  uploadBtn.textContent = '确认覆盖并更新';
  uploadBtn.disabled = false;
});

// ===== 4. 下载数据（导出 Excel，与上传格式一致：姓名/桌号/人数/身份）=====
function downloadData() {
  if (!currentGuests || currentGuests.length === 0) {
    alert('当前没有可下载的数据（先刷新名单或导入数据）。');
    return;
  }
  const rows = currentGuests.map((g) => ({
    姓名: String(g.name == null ? '' : g.name),
    桌号: Number(g.table_no),
    人数: Number(g.count) || 1,
    身份: String(g.identity || ''),
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '宾客名单');
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const fname = `宾客名单_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.xlsx`;
  XLSX.writeFile(wb, fname);
}

document.getElementById('refreshBtn').addEventListener('click', loadGuests);
document.getElementById('downloadBtn').addEventListener('click', downloadData);

// 初始加载
loadGuests();
