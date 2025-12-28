document.addEventListener('DOMContentLoaded', () => {
    const saveBtn = document.getElementById('saveBtn');
    const loadBtn = document.getElementById('loadBtn');
    const textArea = document.getElementById('snippetText');
    const status = document.getElementById('status');
  
    // 保存処理
    saveBtn.addEventListener('click', () => {
      const text = textArea.value;
      if (!text) return;
      
      chrome.storage.local.set({ 'savedSnippet': text }, () => {
        showStatus('Saved successfully!');
      });
    });
  
    // 読込み処理
    loadBtn.addEventListener('click', () => {
      chrome.storage.local.get(['savedSnippet'], (result) => {
        if (result.savedSnippet) {
          textArea.value = result.savedSnippet;
          navigator.clipboard.writeText(result.savedSnippet).then(() => {
            showStatus('Loaded & Copied to clipboard!');
          });
        } else {
          showStatus('No snippet found.');
        }
      });
    });
  
    function showStatus(msg) {
      status.textContent = msg;
      setTimeout(() => { status.textContent = ''; }, 2000);
    }
  });
  