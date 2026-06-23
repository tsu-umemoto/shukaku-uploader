// options.js

function showStatus(message, type) {
  const el = document.getElementById("status");
  el.textContent = message;
  el.className = `status ${type}`;
}

window.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get(["employeeId"], (result) => {
    if (result.employeeId) document.getElementById("employeeId").value = result.employeeId;
  });
  initFavorites();
});

// ===== よく使う項目（お気に入り）設定 =====

// アプリ選択肢を取得（静的になければキントーンAPIから動的取得）
async function fetchAppOptions(appId) {
  const cfg = APP_CONFIG[appId];
  if (cfg.options && cfg.options.length > 0) return cfg.options;

  const response = await chrome.runtime.sendMessage({
    type: "KINTONE_API",
    url: `https://astecpaint.cybozu.com/k/v1/app/form/fields.json?app=${appId}`,
    method: "GET"
  });
  if (!response.ok) throw new Error(response.error);

  const tableFields = response.data.properties?.Table?.fields || {};
  const topicField = tableFields[cfg.topicField];
  if (topicField?.options) {
    const opts = Object.keys(topicField.options).sort((a, b) =>
      topicField.options[a].index - topicField.options[b].index
    );
    APP_CONFIG[appId].options = opts; // キャッシュ
    return opts;
  }
  return [];
}

function initFavorites() {
  const sel = document.getElementById("favAppSelect");
  Object.entries(APP_CONFIG).forEach(([id, cfg]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = `${cfg.icon} ${cfg.name}`;
    sel.appendChild(opt);
  });
  sel.addEventListener("change", () => loadFavOptions(Number(sel.value)));
  loadFavOptions(Number(sel.value));
}

async function loadFavOptions(appId) {
  const box = document.getElementById("favOptions");
  box.innerHTML = '<span style="color:#888; font-size:12px;">読み込み中...</span>';

  let options;
  try {
    options = await fetchAppOptions(appId);
  } catch (e) {
    box.innerHTML = `<span style="color:#c62828; font-size:12px;">選択肢の取得に失敗しました（キントーンにログインしてください）: ${e.message}</span>`;
    return;
  }

  if (!options || options.length === 0) {
    box.innerHTML = '<span style="color:#888; font-size:12px;">この項目に選択肢が見つかりませんでした</span>';
    return;
  }

  const saved = await new Promise(r => chrome.storage.local.get(["favorites"], r));
  const favs = (saved.favorites && saved.favorites[appId]) || [];

  box.innerHTML = "";
  options.forEach((opt, i) => {
    const row = document.createElement("label");
    row.style.cssText = "display:flex; align-items:center; gap:7px; padding:4px 0; font-size:12px; font-weight:normal; color:#333; cursor:pointer;";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = opt;
    cb.style.cssText = "width:auto; margin:0;";
    cb.checked = favs.includes(opt);
    const span = document.createElement("span");
    span.textContent = opt;
    row.appendChild(cb);
    row.appendChild(span);
    box.appendChild(row);
  });
}

document.getElementById("saveFavBtn").addEventListener("click", async () => {
  const appId = Number(document.getElementById("favAppSelect").value);
  const checked = Array.from(document.querySelectorAll("#favOptions input[type=checkbox]:checked"))
    .map(cb => cb.value);

  const saved = await new Promise(r => chrome.storage.local.get(["favorites"], r));
  const favorites = saved.favorites || {};
  favorites[appId] = checked;

  chrome.storage.local.set({ favorites }, () => {
    const cfg = APP_CONFIG[appId];
    showStatus(`✅ ${cfg.name} のお気に入り ${checked.length} 件を保存しました`, "success");
  });
});

document.getElementById("saveBtn").addEventListener("click", () => {
  const employeeId = document.getElementById("employeeId").value.trim();
  if (!employeeId) {
    showStatus("❌ 従業員番号を入力してください", "error");
    return;
  }
  chrome.storage.local.set({ employeeId }, () => {
    showStatus("✅ 設定を保存しました", "success");
  });
});

document.getElementById("testBtn").addEventListener("click", async () => {
  const employeeId = document.getElementById("employeeId").value.trim();
  if (!employeeId) {
    showStatus("❌ 従業員番号を入力してください", "error");
    return;
  }

  showStatus("🔄 接続テスト中...", "loading");

  try {
    // キントーンタブが開いているか確認
    const tabs = await chrome.tabs.query({ url: "https://astecpaint.cybozu.com/*" });
    if (tabs.length === 0) {
      showStatus("❌ キントーンのタブを開いてから接続テストしてください", "error");
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: "KINTONE_API",
      url: "https://astecpaint.cybozu.com/k/v1/app/form/fields.json?app=841",
      method: "GET"
    });

    if (response.ok) {
      const fields = response.data.properties;
      const fieldList = Object.entries(fields)
        .map(([code, info]) => `${info.label || code} → "${code}"`)
        .join("\n");
      console.log("=== フィールドコード一覧 ===\n" + fieldList);
      showStatus("✅ 接続成功！コンソール(F12)にフィールドコード一覧を出力しました", "success");
    } else {
      showStatus(`❌ 接続失敗: ${response.error}`, "error");
    }
  } catch (e) {
    showStatus(`❌ エラー: ${e.message}`, "error");
  }
});
