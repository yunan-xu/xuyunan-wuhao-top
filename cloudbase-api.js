/**
 * 婚礼找座位 · CloudBase 服务端接口（ES Module）
 * 供宾客页（findSeat）与管理员页（listGuests / importGuests）复用。
 *
 * 说明：数据库未初始化或匿名登录未开启时，调用会失败；
 *      宾客页会自动回退到本地 guests.json 兜底，管理员页会给出提示。
 *      本模块所有初始化均为懒加载 + try/catch，任何失败都不影响页面其余功能。
 */
import cloudbase from './cloudbase.esm.js';

const ENV_ID = 'wedding-env-d9grzbxj225af32a5';

let _app = null;
let _appFailed = false;
let _readyPromise = null;

function getApp() {
  if (_app === null && !_appFailed) {
    try {
      _app = cloudbase.init({ env: ENV_ID });
    } catch (e) {
      _appFailed = true;
    }
  }
  return _app;
}

function ensureReady() {
  if (_readyPromise === null) {
    const app = getApp();
    if (!app) {
      _readyPromise = Promise.resolve(false);
    } else {
      try {
        const auth = app.auth({ persistence: 'local' });
        _readyPromise = auth.anonymousAuthProvider().signIn()
          .then(() => true)
          .catch(() => false);
      } catch (e) {
        _readyPromise = Promise.resolve(false);
      }
    }
  }
  return _readyPromise;
}

async function call(name, data) {
  const ok = await ensureReady();
  if (!ok) throw new Error('cloud auth unavailable');
  const res = await getApp().callFunction({ name, data: data || {} });
  return (res && res.result) ? res.result : res;
}

/**
 * 按姓名查询（返回 [{name, table_no}]）。
 * 返回 null 表示服务不可用（数据库未初始化等），由调用方回退本地。
 */
export async function findSeat(name) {
  try {
    const r = await call('findSeat', { name });
    if (r && r.code === 0) return Array.isArray(r.data) ? r.data : [];
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * 返回全体宾客：{ data: [{name, table_no}], updatedAt: <时间戳|null> }。
 * 返回 null 表示服务不可用。
 */
export async function listGuests() {
  try {
    const r = await call('listGuests', {});
    if (r && r.code === 0) {
      return { data: Array.isArray(r.data) ? r.data : [], updatedAt: r.updatedAt || null };
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * 覆盖导入（清空 + 批量写入）。
 * 返回 { code, msg, imported, deleted }。
 */
export async function importGuests(guests) {
  try {
    return await call('importGuests', { guests });
  } catch (e) {
    return { code: 500, msg: e.message || '调用失败', imported: 0, deleted: 0 };
  }
}
