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
