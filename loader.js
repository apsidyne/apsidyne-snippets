// src/content/loader.js
(async () => {
  // モジュールとして動的に読み込む
  const src = chrome.runtime.getURL('content_script.js');
  await import(src);
})();
