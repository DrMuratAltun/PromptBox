import { getData, setData, addPrompt, addCategory } from "../lib/storage.js";

// On install: create context menu + initialize default data
chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.create({
    id: "promptbox-add",
    title: "PromptBox'a Ekle",
    contexts: ["selection"]
  });

  try {
    const data = await getData();
    if (data.categories.length === 0) {
      await setData({
        categories: [{ id: "cat_default_genel", name: "Genel", order: 0 }],
        prompts: []
      });
    }
  } catch (err) {
    console.error("PromptBox: Kurulum hatası:", err);
  }
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "promptbox-add" && info.selectionText) {
    try {
      chrome.tabs.sendMessage(tab.id, {
        action: "SHOW_CATEGORY_DIALOG",
        selectedText: info.selectionText
      });
    } catch (err) {
      console.error("PromptBox: Context menu hatası:", err);
    }
  }
});

// Message router
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "SAVE_PROMPT") {
    addPrompt(message.categoryId, message.text)
      .then((prompt) => sendResponse({ success: true, prompt }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === "ADD_CATEGORY") {
    addCategory(message.name)
      .then((cat) => sendResponse({ success: true, category: cat }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === "GET_DATA") {
    getData()
      .then(sendResponse)
      .catch(() => sendResponse({ categories: [], prompts: [] }));
    return true;
  }

  if (message.action === "GET_CATEGORIES") {
    getData()
      .then(data => sendResponse(data.categories || []))
      .catch(() => sendResponse([]));
    return true;
  }
});
