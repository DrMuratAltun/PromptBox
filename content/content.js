// PromptBox Content Script
// Handles: category dialog injection, focus tracking, prompt insertion

let lastFocusedElement = null;

// --- Focus Tracking ---
document.addEventListener("focusin", (e) => {
  if (isEditable(e.target)) {
    lastFocusedElement = e.target;
  }
}, true);

function isEditable(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "textarea") return true;
  if (tag === "input") {
    const textTypes = ["text", "search", "url", "tel", "email", "password", ""];
    return textTypes.includes((el.type || "").toLowerCase());
  }
  if (el.isContentEditable) return true;
  return false;
}

// --- Message Listener ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "SHOW_CATEGORY_DIALOG") {
    showCategoryDialog(message.selectedText);
  }
  if (message.action === "INSERT_PROMPT") {
    insertPrompt(message.text);
  }
});

// --- Prompt Insertion ---
function insertPrompt(text) {
  const el = lastFocusedElement || document.activeElement;
  if (!el) return;

  el.focus();
  setTimeout(() => {
    const tag = el.tagName.toLowerCase();

    if (tag === "textarea" || (tag === "input" && isEditable(el))) {
      insertIntoStandardInput(el, text);
    } else if (el.isContentEditable) {
      insertIntoContentEditable(el, text);
    } else {
      // Fallback: search for nearest editable
      const editable = el.querySelector("[contenteditable='true']") ||
                       el.closest("[contenteditable='true']");
      if (editable) {
        editable.focus();
        insertIntoContentEditable(editable, text);
      }
    }
  }, 50);
}

function insertIntoStandardInput(el, text) {
  // Use native setter for React/Vue compatibility
  const nativeSetter = Object.getOwnPropertyDescriptor(
    el.tagName.toLowerCase() === "textarea"
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype,
    "value"
  )?.set;

  const start = el.selectionStart || 0;
  const end = el.selectionEnd || 0;
  const before = el.value.substring(0, start);
  const after = el.value.substring(end);
  const newValue = before + text + after;

  if (nativeSetter) {
    nativeSetter.call(el, newValue);
  } else {
    el.value = newValue;
  }

  el.selectionStart = el.selectionEnd = start + text.length;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function insertIntoContentEditable(el, text) {
  el.focus();
  document.execCommand("insertText", false, text);
}

// --- Category Dialog (Shadow DOM) ---
function showCategoryDialog(selectedText) {
  // Remove existing dialog
  const existing = document.getElementById("promptbox-shadow-host");
  if (existing) existing.remove();

  const host = document.createElement("div");
  host.id = "promptbox-shadow-host";
  host.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;";
  const shadow = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = `
    .pb-overlay {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.4); display: flex; align-items: center;
      justify-content: center; font-family: system-ui, -apple-system, sans-serif;
    }
    .pb-dialog {
      background: #fff; border-radius: 12px; padding: 24px;
      width: 340px; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      animation: pb-slide-in 0.2s ease-out;
    }
    @keyframes pb-slide-in {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .pb-title {
      font-size: 16px; font-weight: 600; color: #111827; margin: 0 0 4px 0;
    }
    .pb-subtitle {
      font-size: 12px; color: #6B7280; margin: 0 0 16px 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .pb-label {
      font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 6px; display: block;
    }
    .pb-select, .pb-input {
      width: 100%; padding: 8px 12px; border: 1px solid #D1D5DB;
      border-radius: 8px; font-size: 14px; color: #111827;
      background: #fff; outline: none; box-sizing: border-box;
    }
    .pb-select:focus, .pb-input:focus {
      border-color: #2563EB; box-shadow: 0 0 0 3px rgba(37,99,235,0.1);
    }
    .pb-new-cat {
      margin-top: 12px;
    }
    .pb-new-cat-row {
      display: flex; gap: 8px; margin-top: 6px;
    }
    .pb-new-cat-row .pb-input { flex: 1; }
    .pb-btn {
      padding: 8px 16px; border-radius: 8px; border: none;
      font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s;
    }
    .pb-btn-primary {
      background: #2563EB; color: #fff;
    }
    .pb-btn-primary:hover { background: #1D4ED8; }
    .pb-btn-secondary {
      background: #F3F4F6; color: #374151;
    }
    .pb-btn-secondary:hover { background: #E5E7EB; }
    .pb-btn-small {
      padding: 6px 12px; font-size: 12px;
    }
    .pb-actions {
      display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px;
    }
    .pb-toast {
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
      background: #059669; color: #fff; padding: 10px 20px; border-radius: 8px;
      font-size: 14px; font-weight: 500; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      animation: pb-toast-in 0.3s ease-out;
    }
    @keyframes pb-toast-in {
      from { opacity: 0; transform: translateX(-50%) translateY(10px); }
      to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
  `;

  const overlay = document.createElement("div");
  overlay.className = "pb-overlay";

  const dialog = document.createElement("div");
  dialog.className = "pb-dialog";

  const preview = selectedText.length > 60 ? selectedText.substring(0, 60) + "..." : selectedText;
  dialog.innerHTML = `
    <p class="pb-title">PromptBox'a Ekle</p>
    <p class="pb-subtitle" title="${selectedText.replace(/"/g, '&quot;')}">"${preview}"</p>
    <label class="pb-label">Kategori Seçin</label>
    <select class="pb-select" id="pb-cat-select"></select>
    <div class="pb-new-cat">
      <label class="pb-label">veya Yeni Kategori Oluşturun</label>
      <div class="pb-new-cat-row">
        <input class="pb-input" id="pb-new-cat-input" placeholder="Kategori adı..." />
        <button class="pb-btn pb-btn-primary pb-btn-small" id="pb-new-cat-btn">Ekle</button>
      </div>
    </div>
    <div class="pb-actions">
      <button class="pb-btn pb-btn-secondary" id="pb-cancel">Vazgeç</button>
      <button class="pb-btn pb-btn-primary" id="pb-save">Kaydet</button>
    </div>
  `;

  overlay.appendChild(dialog);
  shadow.appendChild(style);
  shadow.appendChild(overlay);
  document.body.appendChild(host);

  // Populate categories
  chrome.runtime.sendMessage({ action: "GET_CATEGORIES" }, (categories) => {
    const select = shadow.getElementById("pb-cat-select");
    if (!categories || categories.length === 0) {
      categories = [{ id: "cat_default_genel", name: "Genel" }];
    }
    categories.sort((a, b) => a.order - b.order);
    categories.forEach(cat => {
      const opt = document.createElement("option");
      opt.value = cat.id;
      opt.textContent = cat.name;
      select.appendChild(opt);
    });
  });

  // Add new category
  shadow.getElementById("pb-new-cat-btn").addEventListener("click", () => {
    const input = shadow.getElementById("pb-new-cat-input");
    const name = input.value.trim();
    if (!name) return;
    chrome.runtime.sendMessage({ action: "ADD_CATEGORY", name }, (resp) => {
      if (resp && resp.success) {
        const select = shadow.getElementById("pb-cat-select");
        const opt = document.createElement("option");
        opt.value = resp.category.id;
        opt.textContent = resp.category.name;
        select.appendChild(opt);
        select.value = resp.category.id;
        input.value = "";
      }
    });
  });

  // Cancel
  shadow.getElementById("pb-cancel").addEventListener("click", () => host.remove());
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) host.remove();
  });

  // Save
  shadow.getElementById("pb-save").addEventListener("click", () => {
    const categoryId = shadow.getElementById("pb-cat-select").value;
    chrome.runtime.sendMessage({
      action: "SAVE_PROMPT",
      categoryId,
      text: selectedText
    }, (resp) => {
      host.remove();
      if (resp && resp.success) {
        showToast("Kaydedildi!");
      }
    });
  });
}

function showToast(message) {
  const existing = document.getElementById("promptbox-toast-host");
  if (existing) existing.remove();

  const host = document.createElement("div");
  host.id = "promptbox-toast-host";
  host.style.cssText = "position:fixed;bottom:0;left:0;width:100%;z-index:2147483647;pointer-events:none;";
  const shadow = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = `
    .pb-toast {
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
      background: #059669; color: #fff; padding: 10px 20px; border-radius: 8px;
      font-size: 14px; font-weight: 500; font-family: system-ui, sans-serif;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      animation: pb-toast-in 0.3s ease-out;
    }
    @keyframes pb-toast-in {
      from { opacity: 0; transform: translateX(-50%) translateY(10px); }
      to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
  `;

  const toast = document.createElement("div");
  toast.className = "pb-toast";
  toast.textContent = message;

  shadow.appendChild(style);
  shadow.appendChild(toast);
  document.body.appendChild(host);

  setTimeout(() => host.remove(), 2000);
}
