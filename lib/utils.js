// Shared utility functions for PromptBox

/**
 * HTML special characters escape — prevents XSS
 */
export function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Converts URLs in already-escaped HTML into clickable links
 */
export function linkify(escapedHtml) {
  const urlPattern = /(https?:\/\/[^\s<>"']+)/g;
  return escapedHtml.replace(
    urlPattern,
    '<a href="$1" class="prompt-link" target="_blank" rel="noopener" title="$1">$1</a>'
  );
}

/**
 * Input validation helpers
 */
export function validateCategoryName(name) {
  if (!name || typeof name !== "string") return { valid: false, error: "Kategori adı boş olamaz." };
  const trimmed = name.trim();
  if (trimmed.length === 0) return { valid: false, error: "Kategori adı boş olamaz." };
  if (trimmed.length > 50) return { valid: false, error: "Kategori adı en fazla 50 karakter olabilir." };
  return { valid: true, value: trimmed };
}

export function validatePromptText(text) {
  if (!text || typeof text !== "string") return { valid: false, error: "Prompt metni boş olamaz." };
  const trimmed = text.trim();
  if (trimmed.length === 0) return { valid: false, error: "Prompt metni boş olamaz." };
  if (trimmed.length > 10000) return { valid: false, error: "Prompt metni en fazla 10.000 karakter olabilir." };
  return { valid: true, value: trimmed };
}

export function validatePromptTitle(title) {
  if (!title || typeof title !== "string") return { valid: true, value: "" };
  const trimmed = title.trim();
  if (trimmed.length > 100) return { valid: false, error: "Başlık en fazla 100 karakter olabilir." };
  return { valid: true, value: trimmed };
}
