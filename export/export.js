import { getData } from "../lib/storage.js";
import { escapeHtml, linkify } from "../lib/utils.js";

const content = document.getElementById("content");
const printBtn = document.getElementById("print-btn");

printBtn.addEventListener("click", () => {
  window.print();
});

document.addEventListener("DOMContentLoaded", async () => {
  const data = await getData();

  if (!data.prompts || data.prompts.length === 0) {
    content.innerHTML = `<div class="empty-msg">Henüz prompt eklenmemiş.</div>`;
    return;
  }

  const cats = data.categories.sort((a, b) => a.order - b.order);
  const now = new Date();
  const dateStr = now.toLocaleDateString("tr-TR", {
    year: "numeric", month: "long", day: "numeric"
  });

  let html = `
    <div class="pdf-header">
      <h1>PromptBox</h1>
      <div class="pdf-date">${dateStr}</div>
      <div class="pdf-stats">${cats.length} kategori &middot; ${data.prompts.length} prompt</div>
    </div>
  `;

  cats.forEach(cat => {
    const catPrompts = data.prompts
      .filter(p => p.categoryId === cat.id)
      .sort((a, b) => b.updatedAt - a.updatedAt);

    if (catPrompts.length === 0) return;

    html += `<div class="cat-section">`;
    html += `<div class="cat-title">
      ${escapeHtml(cat.name)}
      <span class="cat-badge">${catPrompts.length} prompt</span>
    </div>`;

    catPrompts.forEach(prompt => {
      const date = new Date(prompt.updatedAt).toLocaleDateString("tr-TR", {
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit"
      });

      html += `<div class="prompt-item">
        <div class="prompt-item-title">${escapeHtml(prompt.title)}</div>
        <div class="prompt-item-text">${linkify(escapeHtml(prompt.text))}</div>
        <div class="prompt-item-meta">${date}</div>
      </div>`;
    });

    html += `</div>`;
  });

  content.innerHTML = html;
});

// escapeHtml and linkify imported from lib/utils.js
