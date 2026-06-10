// background.js - v2.1
// world:"MAIN"でkintoneグローバルにアクセス可能

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "KINTONE_API") {
    handleApi(message)
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (message.type === "KINTONE_UPLOAD") {
    handleUpload(message)
      .then(fileKey => sendResponse({ ok: true, fileKey }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

async function getKintoneTab() {
  const tabs = await chrome.tabs.query({ url: "https://astecpaint.cybozu.com/*" });
  if (tabs.length === 0) throw new Error("キントーンのタブを開いた状態で使用してください。");
  return tabs[0];
}

// world:"MAIN" でkintoneグローバルにアクセスしてトークン取得
async function getCsrfToken(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: () => {
      try { return kintone.getRequestToken(); } catch(e) { return null; }
    }
  });
  return results[0].result;
}

async function handleApi({ url, method, body }) {
  const tab = await getKintoneTab();
  const token = await getCsrfToken(tab.id);

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    func: async (url, method, body, token) => {
      try {
        const headers = { "X-Requested-With": "XMLHttpRequest" };
        if (body) headers["Content-Type"] = "application/json";
        if (token) headers["X-Cybozu-RequestToken"] = token;
        const options = { method, headers };
        if (body) options.body = body;
        const r = await fetch(url, options);
        const text = await r.text();
        const data = JSON.parse(text);
        if (!r.ok) return { error: data.message || `APIエラー: ${r.status}` };
        return { data };
      } catch(e) {
        return { error: e.message };
      }
    },
    args: [url, method, body || null, token]
  });

  const result = results[0].result;
  if (result.error) throw new Error(result.error);
  return result.data;
}

async function handleUpload({ base64, filename }) {
  const tab = await getKintoneTab();
  const token = await getCsrfToken(tab.id);

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    func: async (base64, filename, token) => {
      try {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: "image/png" });
        const formData = new FormData();
        formData.append("file", blob, filename);
        const headers = { "X-Requested-With": "XMLHttpRequest" };
        if (token) headers["X-Cybozu-RequestToken"] = token;
        const r = await fetch("/k/v1/file.json", {
          method: "POST",
          headers,
          body: formData
        });
        const data = await r.json();
        if (!r.ok) return { error: data.message || `アップロード失敗: ${r.status}` };
        return { fileKey: data.fileKey };
      } catch(e) {
        return { error: e.message };
      }
    },
    args: [base64, filename, token]
  });

  const result = results[0].result;
  if (result.error) throw new Error(result.error);
  return result.fileKey;
}
