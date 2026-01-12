/**
 * Apsidyne Entry Assistant Snippet Tool
 *  : ユーザーのキー入力を監視し、キーワード置換とDOM操作を行う。
 *  @author Apsidyne+ext2025[at]gmail.com
 *  @version 1.0.0
 **/


// スニペット展開のトリガーとなる文字
// KeyCode 187 or Key: ";")
//const TRIGGER_KEY = ';';


//
import { config, getDebugMode} from './config.js';
import { Logger } from './lib/logger.js';


(function () {
    'use strict';

    const logger = new Logger('ContentScript');

    logger.info(config.TRIGGER_KEY);
    let debugMode = getDebugMode();
    console.log("config.debugMode",debugMode);

logger.info("info");
logger.debug("debug");
//logger.error("error","error");

    // 多重読み込み防止
    if (window.hasRealEstateSnippetRun) {
        logger.debug('すでにロード済み。');
        return;
    }
    window.hasRealEstateSnippetRun = true;

    /**
     * スニペットエンジンクラス
     * 状態管理とDOM操作の責務を持つ
     */
    class SnippetEngine {
        constructor() {
            // スニペット辞書（メモリキャッシュ）
            // I/O負荷を下げるため、起動時にロードし、変更時のみ更新する
            this.snippets = {}; 
            
            // IME入力中かどうかのフラグ
            // 日本語入力確定前のエンターなどで誤爆しないために必須
            this.isComposing = false;

            // 初期化
            this.init();
        }

        /**
         * 初期化処理
         */
        async init() {
            try {
                await this.loadSnippets();
                this.attachEventListeners();
                this.listenForStorageChanges();
                 logger.info('起動した ');
            } catch (e) {
                logger.error('初期化エラー:', e);

            }
        }

        /**
         * ストレージからスニペット定義をロード
         */
        async loadSnippets() {
            return new Promise((resolve) => {
                chrome.storage.local.get(['snippets'], (result) => {
                    this.snippets = result.snippets || {};
                    resolve();
                });
            });
        }

        /**
         * オプション画面での変更をリアルタイムに反映
         */
        listenForStorageChanges() {
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === 'local' && changes.snippets) {
                    this.snippets = changes.snippets.newValue;
                     logger.info('定義を更新した');
                }
            });
        }

        /**
         * イベントリスナーの登録
         * focusinではなくkeydown/inputをdocumentレベルで監視することで
         * 動的に生成されるフォーム（モーダル等）にも対応する
         */
        attachEventListeners() {
            // IME開始
            document.addEventListener('compositionstart', () => {
                this.isComposing = true;
            }, true);

            // IME終了
            document.addEventListener('compositionend', () => {
                this.isComposing = false;
            }, true);

            // キー入力監視
            document.addEventListener('keydown', (e) => this.handleKeydown(e), true);
        }

        /**
         * キー入力ハンドラ
         * トリガーとなる「;」の検知と処理の分岐
         */
        handleKeydown(e) {
            // 入力可能な要素でなければ無視
            const target = e.target;
            if (!this.isInputable(target)) return;

            // IME入力中は変換しない
            if (this.isComposing) return;

            // トリガーキー（;）の判定 (KeyCode 187 or Key: ";")
            // JISキーボードとUSキーボードの差異を吸収するため event.key を優先
            if (e.key === config.TRIGGER_KEY ) {
                this.processTrigger(e, target);
            }
        }

        /**
         * 入力可能要素かどうかの判定
         * @param {HTMLElement} el 
         */
        isInputable(el) {
            const tagName = el.tagName.toLowerCase();
            const isContentEditable = el.isContentEditable;
            const isInput = tagName === 'input' && ['text', 'search', 'url', 'tel', 'email'].includes(el.type);
            const isTextarea = tagName === 'textarea';

            return isInput || isTextarea || isContentEditable;
        }

        /**
         * トリガー検知時の処理
         * @param {KeyboardEvent} e 
         * @param {HTMLElement} target 
         */
        processTrigger(e, target) {
            // カーソル位置と現在の値を取得
            const { value, selectionStart } = this.getInputState(target);
            
            // カーソル位置の直前の文字を取得（エスケープ判定用）
            const charBeforeCursor = value.slice(selectionStart - 1, selectionStart);

            // エスケープ処理: 直前が ";" の場合（つまり ";;" と入力された）
            if (charBeforeCursor === config.TRIGGER_KEY ) {
                e.preventDefault(); // 2つ目のセミコロン入力を阻止
                // 前のセミコロンを削除して、単一のセミコロンとして確定させるか、何もしないか。
                // 仕様：「;;」→「;」
                // 実装：直前の「;」を削除し、改めて「;」を入れる（あるいは何もしないで放置だと「;」が残る）
                // 確実に「ただの文字としてのセミコロン」にするため、特別な置換処理は走らせず終了。
                // ただし、このままだと「;」が1つ残る状態。
                // ユーザーは「;;」と打とうとした。1つ目はすでに入っている。
                // 2つ目を押した瞬間ここに来る。
                // 1つ目の「;」はトリガー待ち状態だったが、2つ目が来たので「文字としての;」と確定する。
                // つまり、何もしなければ1つ目の「;」が残る。それでOK。
                // ただし、2つ目の入力自体は preventDefault しているので画面には出ない。これで「;;」→「;」達成。
                return;
            }

            // キーワードマッチング
            // カーソル直前の単語を探す
            // パフォーマンス考慮: 全文検索せず、カーソル前から最大50文字程度をスキャンすれば十分
            const scanLength = 50;
            const scanStart = Math.max(0, selectionStart - scanLength);
            const textToScan = value.slice(scanStart, selectionStart);

            // ロングマッチ優先のため、登録されているキーワードでループして後方一致を確認
            let matchedKeyword = null;
            
            // Object.keysの順序は保証されないが、一般的な実装では登録順か辞書順。
            // 本来はキーワードの長さ順（長い順）にソートしてチェックすべき。
            const sortedKeys = Object.keys(this.snippets).sort((a, b) => b.length - a.length);

            for (const key of sortedKeys) {
                if (textToScan.endsWith(key)) {
                    if (this.isSnippetAllowedForCurrentSite(key)) {
                        matchedKeyword = key;
                        break;
                    }
                }
            }

            if (matchedKeyword) {
                // 置換処理実行
                e.preventDefault(); // トリガーの「;」入力を阻止
                // データを取り出し (オブジェクトか文字列か正規化して扱う)
                const rawVal = this.snippets[matchedKeyword];
                const replacementText = (typeof rawVal === 'string') ? rawVal : rawVal.body;

                this.executeReplacement(target, matchedKeyword, replacementText);
            }
            // マッチしない場合は、通常の「;」入力としてブラウザに処理させる
        }

        /**
        * 指定されたキーワードが現在のサイトで有効か判定
        */
        isSnippetAllowedForCurrentSite(key) {
            const rawVal = this.snippets[key];
        
            // 古いデータ(文字列)の場合は「全サイト許可」とみなす
            if (typeof rawVal === 'string') return true;

           const allowedSites = rawVal.sites;
        
            // サイト指定が空配列なら「全サイト許可」
            if (!allowedSites || allowedSites.length === 0) return true;

            // 現在のホスト名
            const currentHost = window.location.hostname;

            // 後方一致でチェック (例: suumo.jp は k-entry.suumo.jp にマッチ)
            return allowedSites.some(site => currentHost.endsWith(site));
        }

        /**
         * 要素の状態（値とカーソル位置）を取得するヘルパー
         * input/textarea と contentEditable で取得方法が異なる
         */
        getInputState(target) {
            if (target.value !== undefined) {
                return { value: target.value, selectionStart: target.selectionStart };
            } else {
                // contentEditable対応（簡易実装）
                // ※実務レベルではSelection APIを駆使してより厳密な位置特定が必要
                const selection = window.getSelection();
                // 簡易的に textContent を返す
                return { value: target.textContent, selectionStart: selection.focusOffset }; 
            }
        }

        /**
         * テキスト置換の実行
         * @param {HTMLElement} target 
         * @param {string} keyword 
         * @param {string} replacement 
         */
        executeReplacement(target, keyword, replacement) {
            logger.info(`Expanding: "${keyword}" -> "${replacement.substring(0, 10)}..."`);

            try {
                // 1. フォーカスを確実にする
                target.focus();

                // 2. Undo履歴を保存するために execCommand('insertText') を使用する。
                // これは非推奨だが、execCommand以外にブラウザのUndoスタックに載せる方法が存在しない。
                // ClipboardAPIを使う手もあるが、権限周りが面倒かつ遅い。
                
                if (document.queryCommandSupported('insertText')) {
                    // キーワード部分を選択状態にする
                    // input / textarea
                    if (['INPUT', 'TEXTAREA'].includes(target.tagName)) {
                        const endPos = target.selectionStart;
                        const startPos = endPos - keyword.length;
                        target.setSelectionRange(startPos, endPos);
                        
                        // 選択範囲（キーワード）を置換テキストで上書き
                        document.execCommand('insertText', false, replacement);
                    } else {
                        // contentEditable
                        // Rangeを使って選択範囲を作成
                        const selection = window.getSelection();
                        const range = selection.getRangeAt(0);
                        
                        // ※contentEditable内のカーソル位置計算は非常に複雑だが、
                        // ここでは「直前に入力していたテキストノード」内での置換を想定
                        // 厳密なDOMトラバーサルは省略するが、通常のテキスト入力であればこれで動く
                        const textNode = range.startContainer;
                        if (textNode.nodeType === Node.TEXT_NODE) {
                            const endOffset = range.startOffset;
                            const startOffset = endOffset - keyword.length;
                            
                            if (startOffset >= 0) {
                                range.setStart(textNode, startOffset);
                                range.setEnd(textNode, endOffset);
                                selection.removeAllRanges();
                                selection.addRange(range);
                                document.execCommand('insertText', false, replacement);
                            }
                        }
                    }
                } else {
                    // フォールバック: execCommandが使えない場合（稀だが将来的にあり得る）
                    // 直接値を書き換える（Undoは効かなくなる）
                    logger.debug('execCommand not supported. Fallback to direct manipulation.');
                    this.fallbackReplacement(target, keyword, replacement);
                }

                // 3. SPA (React/Vue/Angular) 向けにイベントを発火
                // これをやらないと、仮想DOMが値を認識せず、保存時に空になる
                this.dispatchInputEvents(target);

            } catch (err) {
                logger.error('置換処理中にエラー:', err);
                // ユーザーに通知（トースト）
                this.showToast('展開処理に失敗しました', 'error');
            }
        }

        /**
         * 直接書き換え
         */
        fallbackReplacement(target, keyword, replacement) {
             if (target.value !== undefined) {
                const current = target.value;
                const end = target.selectionStart;
                const start = end - keyword.length;
                const newValue = current.slice(0, start) + replacement + current.slice(end);
                
                target.value = newValue;
                // カーソル位置調整
                const newCursorPos = start + replacement.length;
                target.setSelectionRange(newCursorPos, newCursorPos);
             }
        }

        /**
         * モダンフレームワーク用のイベント発火
         * React等は input イベントや change イベントを監視している
         */
        dispatchInputEvents(target) {
            // inputイベント: 値が変更された瞬間に発火
            const inputEvent = new Event('input', { bubbles: true, cancelable: true });
            target.dispatchEvent(inputEvent);

            // changeイベント: 確定時（フォーカスアウト等）によく使われるが、念のため発火
            const changeEvent = new Event('change', { bubbles: true, cancelable: true });
            target.dispatchEvent(changeEvent);
        }
        
        /**
         * 簡易トースト通知（要件：モーダル禁止）
         */
        showToast(message, type = 'info') {
            const div = document.createElement('div');
            div.className = `re-snippet-toast re-snippet-toast-${type}`;
            div.textContent = message;
            document.body.appendChild(div);
            
            // アニメーション用クラス付与
            setTimeout(() => div.classList.add('show'), 10);
            
            // 3秒後に消去
            setTimeout(() => {
                div.classList.remove('show');
                setTimeout(() => div.remove(), 300);
            }, 3000);
        }
    }

    // インスタンス化して開始
    new SnippetEngine();

})();
