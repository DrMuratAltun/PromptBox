const STORAGE_KEY = "promptbox_data";

const DEFAULT_DATA = {
  categories: [{ id: "cat_default_genel", name: "Genel", order: 0 }],
  prompts: []
};

// Simple mutex to prevent concurrent read-modify-write operations
let _lock = Promise.resolve();
function withLock(fn) {
  const prev = _lock;
  let release;
  _lock = new Promise(r => { release = r; });
  return prev.then(() => fn().finally(release));
}

export async function getData() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const data = result[STORAGE_KEY];
    if (!data || !Array.isArray(data.categories) || !Array.isArray(data.prompts)) {
      return structuredClone(DEFAULT_DATA);
    }
    return data;
  } catch (err) {
    console.error("PromptBox: Veri okuma hatası:", err);
    return structuredClone(DEFAULT_DATA);
  }
}

export async function setData(data) {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: data });
  } catch (err) {
    console.error("PromptBox: Veri kaydetme hatası:", err);
    throw new Error("Veri kaydedilemedi. Depolama alanı dolu olabilir.");
  }
}

// --- Category CRUD ---

export function addCategory(name) {
  const trimmed = (name || "").trim();
  if (!trimmed) throw new Error("Kategori adı boş olamaz.");
  if (trimmed.length > 50) throw new Error("Kategori adı en fazla 50 karakter olabilir.");

  return withLock(async () => {
    const data = await getData();
    if (data.categories.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) {
      throw new Error("Bu isimde bir kategori zaten mevcut.");
    }
    const maxOrder = data.categories.reduce((max, c) => Math.max(max, c.order), -1);
    const newCat = {
      id: "cat_" + Date.now(),
      name: trimmed,
      order: maxOrder + 1
    };
    data.categories.push(newCat);
    await setData(data);
    return newCat;
  });
}

export function renameCategory(categoryId, newName) {
  const trimmed = (newName || "").trim();
  if (!trimmed) throw new Error("Kategori adı boş olamaz.");
  if (trimmed.length > 50) throw new Error("Kategori adı en fazla 50 karakter olabilir.");

  return withLock(async () => {
    const data = await getData();
    const cat = data.categories.find(c => c.id === categoryId);
    if (!cat) throw new Error("Kategori bulunamadı.");
    if (data.categories.some(c => c.id !== categoryId && c.name.toLowerCase() === trimmed.toLowerCase())) {
      throw new Error("Bu isimde bir kategori zaten mevcut.");
    }
    cat.name = trimmed;
    await setData(data);
  });
}

export function deleteCategory(categoryId) {
  if (categoryId === "cat_default_genel") {
    throw new Error("Varsayılan kategori silinemez.");
  }
  return withLock(async () => {
    const data = await getData();
    data.categories = data.categories.filter(c => c.id !== categoryId);
    data.prompts.forEach(p => {
      if (p.categoryId === categoryId) p.categoryId = "cat_default_genel";
    });
    await setData(data);
  });
}

// --- Prompt CRUD ---

export function addPrompt(categoryId, text) {
  const trimmedText = (text || "").trim();
  if (!trimmedText) throw new Error("Prompt metni boş olamaz.");
  if (trimmedText.length > 10000) throw new Error("Prompt metni en fazla 10.000 karakter olabilir.");

  return withLock(async () => {
    const data = await getData();
    if (!data.categories.some(c => c.id === categoryId)) {
      categoryId = "cat_default_genel";
    }
    const now = Date.now();
    const title = trimmedText.substring(0, 50).split("\n")[0];
    data.prompts
      .filter(p => p.categoryId === categoryId)
      .forEach(p => { p.order = (p.order ?? 0) + 1; });
    const newPrompt = {
      id: "prm_" + now,
      categoryId,
      text: trimmedText,
      title,
      order: 0,
      createdAt: now,
      updatedAt: now
    };
    data.prompts.push(newPrompt);
    await setData(data);
    return newPrompt;
  });
}

export function updatePrompt(promptId, updates) {
  return withLock(async () => {
    const data = await getData();
    const prompt = data.prompts.find(p => p.id === promptId);
    if (!prompt) throw new Error("Prompt bulunamadı.");

    if (updates.text !== undefined) {
      const trimmedText = updates.text.trim();
      if (!trimmedText) throw new Error("Prompt metni boş olamaz.");
      if (trimmedText.length > 10000) throw new Error("Prompt metni en fazla 10.000 karakter olabilir.");
      prompt.text = trimmedText;
      if (!updates.title) {
        prompt.title = prompt.text.substring(0, 50).split("\n")[0];
      }
    }
    if (updates.categoryId !== undefined) prompt.categoryId = updates.categoryId;
    if (updates.title !== undefined) {
      const trimmedTitle = updates.title.trim();
      if (trimmedTitle.length > 100) throw new Error("Başlık en fazla 100 karakter olabilir.");
      prompt.title = trimmedTitle;
    }
    prompt.updatedAt = Date.now();
    await setData(data);
  });
}

export function deletePrompt(promptId) {
  return withLock(async () => {
    const data = await getData();
    const before = data.prompts.length;
    data.prompts = data.prompts.filter(p => p.id !== promptId);
    if (data.prompts.length === before) throw new Error("Prompt bulunamadı.");
    await setData(data);
  });
}

// --- Prompt Reorder ---

export function movePrompt(promptId, direction) {
  return withLock(async () => {
    const data = await getData();
    const prompt = data.prompts.find(p => p.id === promptId);
    if (!prompt) return;

    const siblings = data.prompts
      .filter(p => p.categoryId === prompt.categoryId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    siblings.forEach((p, i) => { p.order = i; });

    const idx = siblings.findIndex(p => p.id === promptId);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;

    const tempOrder = siblings[idx].order;
    siblings[idx].order = siblings[swapIdx].order;
    siblings[swapIdx].order = tempOrder;

    await setData(data);
  });
}
