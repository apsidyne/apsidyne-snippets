/**
 * Simple Snippet Tool 
 */

let snippetCache = [];

// 初期化：データの読み込み
const init = () => {
    chrome.storage.local.get('snippetList', (data) => {
        if (data.snippetList) snippetCache = data.snippetList;
    });
    chrome.storage.onChanged.addListener((changes) => {
        if (changes.snippetList) snippetCache = changes.snippetList.newValue || [];
    });
};

// 置換実行ロジック
const performReplacement = (element, trigger, replacement) => {
    try {
        // type="number" など selectionEnd が使えない時
        // 不動産の数値入力欄でエラーが起きないように
        let selectionEnd = 0;
        try {
            selectionEnd = element.selectionEnd;
        } catch (e) {
            // selectionEndが取得できないタイプのinputは対象外として処理を中断
            return;
        }

        const startPos = selectionEnd - trigger.length;
        if (startPos < 0) return;

        // イベント競合を防ぐための遅延実行(Next Tick)
        setTimeout(() => {
            element.focus();
            
            // トリガー部分（キーワード）を選択状態にする
            element.setSelectionRange(startPos, selectionEnd);

            // ブラウザ標準のテキスト挿入コマンド（Undo履歴が残る）
            const success = document.execCommand('insertText', false, replacement);

            // execCommand がブロックされた場合の強制書き換え（フォールバック）
            if (!success) {
                const val = element.value;
                const before = val.substring(0, startPos);
                const after = val.substring(selectionEnd);
                element.value = before + replacement + after;
                
                // サイト側のバリデーション（必須項目チェック等）を反応させるための通知
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, 0);

    } catch (error) {
        // 業務を止めないよう、エラーはコンソールに出すだけ
        console.warn("[SnippetTool] Skip:", error);
    }
};

// 入力監視
const handleInput = (event) => {
    // IME変換中（日本語入力中）は何もしない
    if (event.isComposing) return;

    const target = event.target;
    
    // 入力欄以外は無視
    if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') return;
    if (target.type === 'password') return;
    if (target.readOnly || target.disabled) return;

    const val = target.value;
    if (!val) return;

    const currentHost = window.location.hostname.toLowerCase();

    // スニペット検索
    for (const item of snippetCache) {
        // ドメイン指定がある場合のみチェック（入稿サイト以外での誤爆防止）
        if (item.domain && !currentHost.includes(item.domain)) continue;

        // トリガー検知
        if (val.endsWith(item.trigger)) {
            performReplacement(target, item.trigger, item.text);
            break; // 1つ見つかったら終了
        }
    }
};

document.addEventListener('input', handleInput, true);
init();
