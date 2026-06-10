// popup.js - v2.3 全アプリ対応

let screenshotDataUrl = null;
let currentAppId = 841; // デフォルト：職遂

async function kintoneApi(url, method, body) {
  const response = await chrome.runtime.sendMessage({
    type: "KINTONE_API", url, method,
    body: body ? JSON.stringify(body) : undefined
  });
  if (!response.ok) throw new Error(response.error);
  return response.data;
}

// ===== 初期化 =====
document.addEventListener("DOMContentLoaded", async () => {
  const creds = await getCredentials();
  if (!creds.employeeId) {
    showView("view-notConfigured");
    return;
  }

  // アプリ選択タブを生成
  buildAppTabs();

  // デフォルトアプリ（前回選択を記憶）
  const saved = await new Promise(r => chrome.storage.local.get(["lastAppId"], r));
  currentAppId = saved.lastAppId || 841;

  await switchApp(currentAppId);

  const today = new Date();
  document.getElementById("dateInput").value =
    `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;

  await captureScreenshot();
  showView("view-form");
});

// アプリタブ生成
function buildAppTabs() {
  const tabsEl = document.getElementById("appTabs");
  tabsEl.innerHTML = "";
  Object.entries(APP_CONFIG).forEach(([id, cfg]) => {
    const btn = document.createElement("button");
    btn.className = "app-tab";
    btn.dataset.appId = id;
    btn.innerHTML = `<span class="tab-icon">${cfg.icon}</span><span class="tab-name">${cfg.name.split(" / ")[0]}</span>`;
    btn.addEventListener("click", () => switchApp(Number(id)));
    tabsEl.appendChild(btn);
  });
}

// アプリ切り替え
async function switchApp(appId) {
  currentAppId = appId;
  chrome.storage.local.set({ lastAppId: appId });

  const cfg = APP_CONFIG[appId];

  // タブのアクティブ状態
  document.querySelectorAll(".app-tab").forEach(btn => {
    btn.classList.toggle("active", Number(btn.dataset.appId) === appId);
  });

  // アプリバッジ更新
  document.getElementById("appBadge").innerHTML =
    `<span>${cfg.icon}</span><span>${cfg.name}（アプリ #${appId}）</span>`;

  // 項目ドロップダウン更新
  const topicLabel = document.getElementById("topicLabel");
  topicLabel.textContent = cfg.topicLabel + " *";

  const select = document.getElementById("workInput");
  select.innerHTML = '<option value="" disabled selected>選択してください</option>';

  let options = cfg.options;

  // 選択肢が空の場合はAPIから動的取得
  if (options.length === 0) {
    try {
      select.innerHTML = '<option value="" disabled selected>読み込み中...</option>';
      const data = await kintoneApi(
        `/k/v1/app/form/fields.json?app=${appId}`, "GET"
      );
      const tableFields = data.properties?.Table?.fields || {};
      const topicField = tableFields[cfg.topicField];
      if (topicField?.options) {
        options = Object.keys(topicField.options).sort((a,b) =>
          topicField.options[a].index - topicField.options[b].index
        );
        APP_CONFIG[appId].options = options; // キャッシュ
      }
    } catch(e) {
      console.error("選択肢取得失敗:", e);
    }
  }

  select.innerHTML = '<option value="" disabled selected>選択してください</option>';
  options.forEach(opt => {
    const el = document.createElement("option");
    el.value = opt;
    el.textContent = opt;
    select.appendChild(el);
  });
}

function showView(viewId) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById(viewId).classList.add("active");
}

function showLoading(text = "処理中...") {
  document.getElementById("loadingText").textContent = text;
  document.getElementById("loadingOverlay").classList.add("show");
}

function hideLoading() {
  document.getElementById("loadingOverlay").classList.remove("show");
}

function getCredentials() {
  return new Promise(resolve => chrome.storage.local.get(["employeeId"], resolve));
}

async function captureScreenshot() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    screenshotDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png", quality: 90 });
    document.getElementById("screenshotImg").src = screenshotDataUrl;
  } catch(e) {
    console.error("スクリーンショット取得失敗:", e);
  }
}

// 当月レコード検索
async function findCurrentMonthRecord(appId, employeeIdField) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const cfg = APP_CONFIG[appId];

  const query = `${employeeIdField} = "${(await getCredentials()).employeeId}" order by $id desc`;
  const url = `/k/v1/records.json?app=${appId}&query=${encodeURIComponent(query)}&fields[0]=$id&fields[1]=${cfg.subtable}&fields[2]=Categories`;

  const data = await kintoneApi(url, "GET");

  const monthRecords = data.records.filter(r => {
    const cats = r["Categories"]?.value || [];
    return cats.some(c => c.includes(String(year)) && c.includes(`${month}月`));
  });

  return monthRecords.length > 0 ? monthRecords[0] : (data.records.length > 0 ? data.records[0] : null);
}

// ファイルアップロード
async function uploadFile(blob, filename) {
  const arrayBuffer = await blob.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < uint8Array.byteLength; i++) binary += String.fromCharCode(uint8Array[i]);
  const base64 = btoa(binary);
  const response = await chrome.runtime.sendMessage({ type: "KINTONE_UPLOAD", base64, filename });
  if (!response.ok) throw new Error(response.error);
  return response.fileKey;
}

// 登録
async function register() {
  const date = document.getElementById("dateInput").value;
  const work = document.getElementById("workInput").value;
  const explain = document.getElementById("explainInput").value.trim();
  const cfg = APP_CONFIG[currentAppId];

  if (!date || !work) { alert("実施日と項目は必須です。"); return; }
  if (!screenshotDataUrl) { alert("スクリーンショットが取得できていません。"); return; }

  try {
    showLoading("当月レコードを検索中...");
    const record = await findCurrentMonthRecord(currentAppId, cfg.employeeId);
    if (!record) throw new Error("当月のレコードが見つかりません。\nキントーンで当月レコードを先に作成してください。");

    const recordId = record.$id.value;
    const existingRows = record[cfg.subtable]?.value || [];

    showLoading("スクリーンショットをアップロード中...");
    const resp = await fetch(screenshotDataUrl);
    const blob = await resp.blob();
    const filename = `upload_${date.replace(/-/g,"")}_${Date.now()}.png`;
    const fileKey = await uploadFile(blob, filename);

    showLoading("キントーンに登録中...");

    // 番号採番
    const newRowValues = {};
    if (cfg.numberField) {
      const maxNo = existingRows.reduce((max, row) => {
        const n = parseInt(row.value?.[cfg.numberField]?.value || "0", 10);
        return n > max ? n : max;
      }, 0);
      newRowValues[cfg.numberField] = { value: String(maxNo + 1) };
    }

    newRowValues[cfg.dateField]    = { value: date };
    newRowValues[cfg.topicField]   = { value: work };
    newRowValues[cfg.explainField] = { value: explain };
    newRowValues[cfg.evidenceField]= { value: [{ fileKey }] };

    const body = {
      app: currentAppId,
      id: recordId,
      record: {
        [cfg.subtable]: {
          value: [...existingRows, { value: newRowValues }]
        }
      }
    };

    await kintoneApi(`/k/v1/record.json`, "PUT", body);
    hideLoading();

    document.getElementById("resultIcon").textContent = "✅";
    document.getElementById("resultTitle").textContent = "登録完了！";
    // XSS対策: ユーザー入力値はtextContentで設定
    const subEl = document.getElementById("resultSub");
    subEl.innerHTML = "";
    const line1 = document.createElement("div");
    line1.textContent = `${cfg.name} レコード #${recordId} に追加しました。`;
    const line2 = document.createElement("span");
    line2.style.cssText = "color:#2563d4; font-weight:bold; font-size:11px; display:block;";
    line2.textContent = work;
    const line3 = document.createElement("span");
    line3.style.cssText = "color:#888; font-size:11px; display:block;";
    line3.textContent = date;
    subEl.appendChild(line1);
    subEl.appendChild(line2);
    subEl.appendChild(line3);
    document.getElementById("retryBtn").style.display = "none";
    document.getElementById("resultContent").className = "result-view success";
    showView("view-result");

  } catch(e) {
    hideLoading();
    document.getElementById("resultIcon").textContent = "❌";
    document.getElementById("resultTitle").textContent = "登録失敗";
    // XSS対策: エラーメッセージはtextContentで設定
    const errEl = document.getElementById("resultSub");
    errEl.innerHTML = "";
    const errSpan = document.createElement("span");
    errSpan.style.color = "#c92a2a";
    errSpan.textContent = e.message;
    errEl.appendChild(errSpan);
    document.getElementById("retryBtn").style.display = "block";
    document.getElementById("resultContent").className = "result-view error";
    showView("view-result");
  }
}

document.getElementById("settingsBtn").addEventListener("click", () => chrome.runtime.openOptionsPage());
document.getElementById("goSettingsBtn")?.addEventListener("click", () => chrome.runtime.openOptionsPage());
document.getElementById("recaptureBtn")?.addEventListener("click", captureScreenshot);
document.getElementById("submitBtn")?.addEventListener("click", register);
document.getElementById("cancelBtn")?.addEventListener("click", () => window.close());
document.getElementById("doneBtn")?.addEventListener("click", () => window.close());
document.getElementById("retryBtn")?.addEventListener("click", () => showView("view-form"));
