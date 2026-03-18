import { getData, setData, addCategory, renameCategory, deleteCategory, addPrompt, updatePrompt, deletePrompt, movePrompt } from "../lib/storage.js";
import { escapeHtml, linkify } from "../lib/utils.js";

// --- State ---
let allData = { categories: [], prompts: [] };
let selectedCategoryId = null; // null = "Tümü"
let searchQuery = "";
let editingPromptId = null;

// --- DOM refs ---
const categoriesContainer = document.getElementById("categories-container");
const promptsContainer = document.getElementById("prompts-container");
const emptyState = document.getElementById("empty-state");
const searchInput = document.getElementById("search-input");
const addCategoryBtn = document.getElementById("add-category-btn");
const addCategoryForm = document.getElementById("add-category-form");
const newCategoryInput = document.getElementById("new-category-input");
const saveCategoryBtn = document.getElementById("save-category-btn");
const cancelCategoryBtn = document.getElementById("cancel-category-btn");

// Add Prompt form refs
const addPromptBtn = document.getElementById("add-prompt-btn");
const addPromptForm = document.getElementById("add-prompt-form");
const promptTitleInput = document.getElementById("prompt-title-input");
const promptTextInput = document.getElementById("prompt-text-input");
const promptCategorySelect = document.getElementById("prompt-category-select");
const savePromptBtn = document.getElementById("save-prompt-btn");
const cancelPromptBtn = document.getElementById("cancel-prompt-btn");
const exportPdfBtn = document.getElementById("export-pdf-btn");
const menuBtn = document.getElementById("menu-btn");
const dropdownMenu = document.getElementById("dropdown-menu");
const exportJsonBtn = document.getElementById("export-json-btn");
const importJsonBtn = document.getElementById("import-json-btn");
const importFileInput = document.getElementById("import-file-input");
const themeToggleBtn = document.getElementById("theme-toggle-btn");
const themeIconLight = document.getElementById("theme-icon-light");
const themeIconDark = document.getElementById("theme-icon-dark");

// --- Theme ---
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  if (theme === "dark") {
    themeIconLight.style.display = "none";
    themeIconDark.style.display = "block";
  } else {
    themeIconLight.style.display = "block";
    themeIconDark.style.display = "none";
  }
}

async function initTheme() {
  const result = await chrome.storage.local.get("promptbox_theme");
  const saved = result.promptbox_theme;
  if (saved) {
    applyTheme(saved);
  } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
    applyTheme("dark");
  }
}

// Apply theme immediately (before DOMContentLoaded) to prevent flash
initTheme();

// --- Toast Notification ---
function showToast(message, type = "success") {
  const existing = document.querySelector(".pb-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = `pb-toast pb-toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 2500);
}

// --- Template System ---
const TEMPLATE_REGEX = /\{\{([^}]+)\}\}/g;

function extractTemplateVars(text) {
  const vars = [];
  let match;
  const regex = new RegExp(TEMPLATE_REGEX.source, 'g');
  while ((match = regex.exec(text)) !== null) {
    const varName = match[1].trim();
    if (!vars.includes(varName)) vars.push(varName);
  }
  return vars;
}

function highlightTemplateVars(html) {
  return html.replace(/\{\{([^}]+)\}\}/g, '<span class="template-var">{{$1}}</span>');
}

function fillTemplate(text, values) {
  return text.replace(TEMPLATE_REGEX, (_, varName) => {
    const trimmed = varName.trim();
    return values[trimmed] !== undefined ? values[trimmed] : `{{${trimmed}}}`;
  });
}

function showTemplateDialog(vars, promptText) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "template-overlay";

    const dialog = document.createElement("div");
    dialog.className = "template-dialog";

    let html = `<div class="template-title">Değişkenleri Doldurun</div>`;
    vars.forEach(v => {
      html += `<div class="template-field">
        <label class="template-label">${escapeHtml(v)}</label>
        <input class="input template-input" data-var="${escapeHtml(v)}" placeholder="${escapeHtml(v)} değerini girin...">
      </div>`;
    });
    html += `<div class="form-actions">
      <button class="btn btn-secondary btn-sm" id="template-cancel">Vazgeç</button>
      <button class="btn btn-primary btn-sm" id="template-apply">Uygula</button>
    </div>`;

    dialog.innerHTML = html;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Focus first input
    const firstInput = dialog.querySelector(".template-input");
    if (firstInput) firstInput.focus();

    const cleanup = (result) => {
      overlay.remove();
      resolve(result);
    };

    dialog.querySelector("#template-cancel").addEventListener("click", () => cleanup(null));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) cleanup(null); });

    dialog.querySelector("#template-apply").addEventListener("click", () => {
      const values = {};
      dialog.querySelectorAll(".template-input").forEach(input => {
        values[input.dataset.var] = input.value;
      });
      const filled = fillTemplate(promptText, values);
      cleanup(filled);
    });

    // Enter to apply
    dialog.addEventListener("keydown", (e) => {
      if (e.key === "Enter") dialog.querySelector("#template-apply").click();
      if (e.key === "Escape") cleanup(null);
    });
  });
}

// --- Debounce ---
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// --- Init ---
document.addEventListener("DOMContentLoaded", async () => {
  try {
    allData = await getData();
    render();
    setupListeners();
  } catch (err) {
    showToast("Veriler yüklenirken hata oluştu.", "error");
    console.error("Init hatası:", err);
  }
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.promptbox_data) {
    allData = changes.promptbox_data.newValue;
    render();
  }
});

function setupListeners() {
  // Search (debounced)
  const debouncedSearch = debounce(() => renderPrompts(), 200);
  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    debouncedSearch();
  });

  // Add category toggle
  addCategoryBtn.addEventListener("click", () => {
    addCategoryForm.classList.toggle("hidden");
    if (!addCategoryForm.classList.contains("hidden")) {
      newCategoryInput.focus();
    }
  });

  cancelCategoryBtn.addEventListener("click", () => {
    addCategoryForm.classList.add("hidden");
    newCategoryInput.value = "";
  });

  saveCategoryBtn.addEventListener("click", async () => {
    const name = newCategoryInput.value.trim();
    if (!name) return;
    try {
      await addCategory(name);
      newCategoryInput.value = "";
      addCategoryForm.classList.add("hidden");
      allData = await getData();
      render();
      showToast("Kategori oluşturuldu.");
    } catch (err) {
      showToast(err.message, "error");
    }
  });

  newCategoryInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveCategoryBtn.click();
    if (e.key === "Escape") cancelCategoryBtn.click();
  });

  // --- Add Prompt ---
  addPromptBtn.addEventListener("click", () => {
    const isHidden = addPromptForm.classList.contains("hidden");
    addPromptForm.classList.toggle("hidden");
    if (isHidden) {
      // Close category form if open
      addCategoryForm.classList.add("hidden");
      newCategoryInput.value = "";
      // Populate category select
      populateCategorySelect();
      promptTextInput.focus();
    }
  });

  cancelPromptBtn.addEventListener("click", () => {
    addPromptForm.classList.add("hidden");
    promptTitleInput.value = "";
    promptTextInput.value = "";
  });

  savePromptBtn.addEventListener("click", async () => {
    const text = promptTextInput.value.trim();
    if (!text) {
      promptTextInput.focus();
      return;
    }
    const categoryId = promptCategorySelect.value;
    const title = promptTitleInput.value.trim();

    try {
      const newPrompt = await addPrompt(categoryId, text);
      // If user provided a custom title, update it
      if (title && newPrompt) {
        await updatePrompt(newPrompt.id, { title });
      }

      promptTitleInput.value = "";
      promptTextInput.value = "";
      addPromptForm.classList.add("hidden");
      allData = await getData();
      render();
      showToast("Prompt kaydedildi.");
    } catch (err) {
      showToast(err.message, "error");
    }
  });

  promptTextInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") cancelPromptBtn.click();
  });

  // --- Dropdown Menu ---
  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = dropdownMenu.classList.toggle("hidden");
    menuBtn.setAttribute("aria-expanded", !isHidden);
  });
  document.addEventListener("click", () => {
    dropdownMenu.classList.add("hidden");
    menuBtn.setAttribute("aria-expanded", "false");
  });

  // --- Export PDF ---
  exportPdfBtn.addEventListener("click", () => {
    dropdownMenu.classList.add("hidden");
    const exportUrl = chrome.runtime.getURL("export/export.html");
    chrome.tabs.create({ url: exportUrl });
  });

  // --- JSON Export ---
  exportJsonBtn.addEventListener("click", () => {
    dropdownMenu.classList.add("hidden");
    try {
      const json = JSON.stringify(allData, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `promptbox-yedek-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Yedek dosyası indirildi.");
    } catch (err) {
      showToast("Yedekleme başarısız oldu.", "error");
    }
  });

  // --- JSON Import ---
  importJsonBtn.addEventListener("click", () => {
    dropdownMenu.classList.add("hidden");
    importFileInput.click();
  });

  importFileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    importFileInput.value = "";

    try {
      const text = await file.text();
      const imported = JSON.parse(text);

      // Validate structure
      if (!Array.isArray(imported.categories) || !Array.isArray(imported.prompts)) {
        throw new Error("Geçersiz dosya formatı.");
      }

      if (!confirm(`${imported.categories.length} kategori ve ${imported.prompts.length} prompt içe aktarılacak. Mevcut verileriniz değiştirilecek. Devam etmek istiyor musunuz?`)) {
        return;
      }

      await setData(imported);
      allData = await getData();
      render();
      showToast("Veriler başarıyla geri yüklendi.");
    } catch (err) {
      showToast(err.message || "İçe aktarma başarısız oldu.", "error");
    }
  });

  // --- Theme Toggle ---
  themeToggleBtn.addEventListener("click", async () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next);
    await chrome.storage.local.set({ promptbox_theme: next });
  });
}

// --- Helpers ---
function populateCategorySelect() {
  const cats = allData.categories.sort((a, b) => a.order - b.order);
  promptCategorySelect.innerHTML = "";
  cats.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat.id;
    opt.textContent = cat.name;
    // Pre-select current category filter if active
    if (cat.id === selectedCategoryId) opt.selected = true;
    promptCategorySelect.appendChild(opt);
  });
}

// --- Render ---
function render() {
  renderCategories();
  renderPrompts();
}

function renderCategories() {
  const cats = allData.categories.sort((a, b) => a.order - b.order);
  const totalCount = allData.prompts.length;

  let html = `<div class="cat-chip ${selectedCategoryId === null ? 'active' : ''}" data-cat-id="__all__">
    Tümü <span class="cat-count">(${totalCount})</span>
  </div>`;

  cats.forEach(cat => {
    const count = allData.prompts.filter(p => p.categoryId === cat.id).length;
    const isActive = selectedCategoryId === cat.id;
    const isDefault = cat.id === "cat_default_genel";
    html += `<div class="cat-chip ${isActive ? 'active' : ''}" data-cat-id="${cat.id}">
      ${escapeHtml(cat.name)} <span class="cat-count">(${count})</span>
      <span class="cat-actions">
        <button class="cat-action-btn" data-action="rename" data-cat-id="${cat.id}" title="Yeniden Adlandır">✏️</button>
        ${!isDefault ? `<button class="cat-action-btn" data-action="delete-cat" data-cat-id="${cat.id}" title="Sil">🗑️</button>` : ''}
      </span>
    </div>`;
  });

  categoriesContainer.innerHTML = html;

  // Event: select category
  categoriesContainer.querySelectorAll(".cat-chip").forEach(chip => {
    chip.addEventListener("click", (e) => {
      if (e.target.closest(".cat-action-btn")) return;
      const catId = chip.dataset.catId;
      selectedCategoryId = catId === "__all__" ? null : catId;
      render();
    });
  });

  // Event: rename category
  categoriesContainer.querySelectorAll('[data-action="rename"]').forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const catId = btn.dataset.catId;
      const cat = allData.categories.find(c => c.id === catId);
      if (!cat) return;
      startCategoryRename(catId, cat.name);
    });
  });

  // Event: delete category
  categoriesContainer.querySelectorAll('[data-action="delete-cat"]').forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const catId = btn.dataset.catId;
      const cat = allData.categories.find(c => c.id === catId);
      const count = allData.prompts.filter(p => p.categoryId === catId).length;
      const msg = count > 0
        ? `"${cat.name}" kategorisini silmek istediğinize emin misiniz? İçerisindeki ${count} prompt "Genel" kategorisine taşınacak.`
        : `"${cat.name}" kategorisini silmek istediğinize emin misiniz?`;
      if (confirm(msg)) {
        handleDeleteCategory(catId);
      }
    });
  });
}

function startCategoryRename(catId, currentName) {
  const chip = categoriesContainer.querySelector(`[data-cat-id="${catId}"]`);
  if (!chip) return;
  const input = document.createElement("input");
  input.className = "cat-edit-input";
  input.value = currentName;
  chip.innerHTML = "";
  chip.appendChild(input);
  input.focus();
  input.select();

  const finish = async () => {
    const newName = input.value.trim();
    if (newName && newName !== currentName) {
      try {
        await renameCategory(catId, newName);
        allData = await getData();
        showToast("Kategori adı güncellendi.");
      } catch (err) {
        showToast(err.message, "error");
      }
    }
    render();
  };

  input.addEventListener("blur", finish);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") input.blur();
    if (e.key === "Escape") { input.value = currentName; input.blur(); }
  });
}

async function handleDeleteCategory(catId) {
  try {
    if (selectedCategoryId === catId) selectedCategoryId = null;
    await deleteCategory(catId);
    allData = await getData();
    render();
    showToast("Kategori silindi.");
  } catch (err) {
    showToast(err.message, "error");
  }
}

function renderPrompts() {
  let filtered = selectedCategoryId
    ? allData.prompts.filter(p => p.categoryId === selectedCategoryId)
    : [...allData.prompts];

  if (searchQuery) {
    filtered = filtered.filter(p =>
      p.title.toLowerCase().includes(searchQuery) ||
      p.text.toLowerCase().includes(searchQuery)
    );
  }

  filtered.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  if (filtered.length === 0) {
    promptsContainer.innerHTML = "";
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");

  promptsContainer.innerHTML = filtered.map((prompt, idx) => {
    const cat = allData.categories.find(c => c.id === prompt.categoryId);
    const catName = cat ? cat.name : "Bilinmiyor";
    const preview = prompt.text.length > 120 ? prompt.text.substring(0, 120) + "..." : prompt.text;
    const isFirst = idx === 0;
    const isLast = idx === filtered.length - 1;

    if (editingPromptId === prompt.id) {
      return renderEditMode(prompt, catName);
    }

    return `<div class="prompt-card" data-prompt-id="${prompt.id}" draggable="true" role="listitem">
      <div class="prompt-header">
        <div class="drag-handle" title="Sürükle">⠿</div>
        <div class="prompt-title">${escapeHtml(prompt.title)}</div>
        <div class="prompt-actions-hover">
          <button class="btn-ghost" data-action="edit" data-prompt-id="${prompt.id}" title="Düzenle">✏️</button>
          <button class="btn-ghost" data-action="delete" data-prompt-id="${prompt.id}" title="Sil">🗑️</button>
        </div>
      </div>
      <div class="prompt-preview">${highlightTemplateVars(linkify(escapeHtml(preview)))}</div>
      <div class="prompt-meta">
        <span class="prompt-category-badge">${escapeHtml(catName)}</span>
        <button class="prompt-action-icon" data-action="copy-full" data-prompt-id="${prompt.id}" title="Kopyala">📋</button>
        <button class="prompt-action-icon" data-action="paste" data-prompt-id="${prompt.id}" title="Yapıştır">📌</button>
      </div>
    </div>`;
  }).join("");

  // Attach events
  attachPromptEvents();
}

function renderEditMode(prompt) {
  const catOptions = allData.categories.map(c =>
    `<option value="${c.id}" ${c.id === prompt.categoryId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
  ).join("");

  return `<div class="prompt-card" data-prompt-id="${prompt.id}">
    <div class="prompt-edit">
      <input class="input" id="edit-title" value="${escapeHtml(prompt.title)}" placeholder="Prompt başlığı...">
      <textarea class="input" id="edit-text" rows="4" placeholder="Prompt metni...">${escapeHtml(prompt.text)}</textarea>
      <select class="select" id="edit-category">${catOptions}</select>
      <div class="form-actions">
        <button class="btn btn-secondary btn-sm" data-action="cancel-edit">Vazgeç</button>
        <button class="btn btn-primary btn-sm" data-action="save-edit" data-prompt-id="${prompt.id}">Kaydet</button>
      </div>
    </div>
  </div>`;
}

function attachPromptEvents() {
  // Drag & Drop reordering
  let draggedId = null;

  promptsContainer.querySelectorAll(".prompt-card[draggable]").forEach(card => {
    card.addEventListener("dragstart", (e) => {
      draggedId = card.dataset.promptId;
      card.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });

    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      document.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));
      draggedId = null;
    });

    card.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (card.dataset.promptId !== draggedId) {
        card.classList.add("drag-over");
      }
    });

    card.addEventListener("dragleave", () => {
      card.classList.remove("drag-over");
    });

    card.addEventListener("drop", async (e) => {
      e.preventDefault();
      card.classList.remove("drag-over");
      const targetId = card.dataset.promptId;
      if (!draggedId || draggedId === targetId) return;

      try {
        // Reorder: place dragged item at the target's position
        const data = await getData();
        const dragged = data.prompts.find(p => p.id === draggedId);
        const target = data.prompts.find(p => p.id === targetId);
        if (!dragged || !target) return;

        // Get category siblings sorted
        const siblings = data.prompts
          .filter(p => p.categoryId === dragged.categoryId)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

        const fromIdx = siblings.findIndex(p => p.id === draggedId);
        const toIdx = siblings.findIndex(p => p.id === targetId);
        if (fromIdx === -1 || toIdx === -1) return;

        // Move in array
        siblings.splice(fromIdx, 1);
        siblings.splice(toIdx, 0, dragged);

        // Reassign orders
        siblings.forEach((p, i) => { p.order = i; });
        await setData(data);
        allData = data;
        renderPrompts();
      } catch (err) {
        showToast("Sıralama değiştirilemedi.", "error");
      }
    });
  });

  // Links — open in new tab
  promptsContainer.querySelectorAll(".prompt-link").forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      chrome.tabs.create({ url: link.href });
    });
  });

  // Copy (template-aware)
  promptsContainer.querySelectorAll('[data-action="copy-full"]').forEach(btn => {
    btn.addEventListener("click", async () => {
      const promptId = btn.dataset.promptId;
      const prompt = allData.prompts.find(p => p.id === promptId);
      if (!prompt) return;

      let textToCopy = prompt.text;
      const vars = extractTemplateVars(textToCopy);
      if (vars.length > 0) {
        const filled = await showTemplateDialog(vars, textToCopy);
        if (!filled) return;
        textToCopy = filled;
      }

      try {
        await navigator.clipboard.writeText(textToCopy);
        const originalHTML = btn.innerHTML;
        btn.innerHTML = "✅";
        btn.classList.add("copied");
        setTimeout(() => {
          btn.innerHTML = originalHTML;
          btn.classList.remove("copied");
        }, 1500);
      } catch (err) {
        showToast("Kopyalama başarısız oldu.", "error");
      }
    });
  });

  // Paste (template-aware)
  promptsContainer.querySelectorAll('[data-action="paste"]').forEach(btn => {
    btn.addEventListener("click", async () => {
      const promptId = btn.dataset.promptId;
      const prompt = allData.prompts.find(p => p.id === promptId);
      if (!prompt) return;

      let textToPaste = prompt.text;
      const vars = extractTemplateVars(textToPaste);
      if (vars.length > 0) {
        const filled = await showTemplateDialog(vars, textToPaste);
        if (!filled) return;
        textToPaste = filled;
      }

      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
          chrome.tabs.sendMessage(tab.id, { action: "INSERT_PROMPT", text: textToPaste });
        }
      } catch (err) {
        showToast("Yapıştırma başarısız oldu.", "error");
      }
      window.close();
    });
  });

  // Edit
  promptsContainer.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener("click", () => {
      editingPromptId = btn.dataset.promptId;
      renderPrompts();
    });
  });

  // Delete
  promptsContainer.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener("click", async () => {
      const promptId = btn.dataset.promptId;
      const card = btn.closest(".prompt-card");
      // Show inline confirmation
      const existing = card.querySelector(".confirm-bar");
      if (existing) { existing.remove(); return; }

      const bar = document.createElement("div");
      bar.className = "confirm-bar";
      bar.innerHTML = `<span>Bu prompt'u silmek istediğinize emin misiniz?</span>
        <button class="btn btn-danger btn-sm" data-action="confirm-delete" data-prompt-id="${promptId}">Evet, Sil</button>
        <button class="btn btn-secondary btn-sm" data-action="cancel-delete">Vazgeç</button>`;
      card.appendChild(bar);

      bar.querySelector('[data-action="confirm-delete"]').addEventListener("click", async () => {
        try {
          await deletePrompt(promptId);
          allData = await getData();
          renderPrompts();
          renderCategories();
          showToast("Prompt silindi.");
        } catch (err) {
          showToast(err.message, "error");
        }
      });
      bar.querySelector('[data-action="cancel-delete"]').addEventListener("click", () => bar.remove());
    });
  });

  // Cancel Edit
  promptsContainer.querySelectorAll('[data-action="cancel-edit"]').forEach(btn => {
    btn.addEventListener("click", () => {
      editingPromptId = null;
      renderPrompts();
    });
  });

  // Save Edit
  promptsContainer.querySelectorAll('[data-action="save-edit"]').forEach(btn => {
    btn.addEventListener("click", async () => {
      const promptId = btn.dataset.promptId;
      const title = document.getElementById("edit-title").value;
      const text = document.getElementById("edit-text").value;
      const categoryId = document.getElementById("edit-category").value;
      try {
        await updatePrompt(promptId, { title, text, categoryId });
        editingPromptId = null;
        allData = await getData();
        render();
        showToast("Prompt güncellendi.");
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });
}
