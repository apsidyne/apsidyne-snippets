/**
 * Apsidyne Tool - Sanitizer
 *  : ユーザー入力されたHTML文字列を無害化する。
 *  @author Apsidyne+ext2025[at]gmail(dot)com
 **/

import { getDebugMode } from '../config.js';
import { Logger } from './logger.js';

export const Sanitizer = {
    // 許可するタグのリスト（要件に基づき不動産サイトで必要な装飾のみ許可）
    ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 'font', 'br', 'p', 'span', 'div'],

    // 許可する属性のリスト
    ALLOWED_ATTRS: ['color', 'size', 'face'],

    /**
     * HTML文字列をサニタイズする
     * @param {string} inputHtml - ユーザー入力文字列
     * @returns {string} 無害化されたHTML
     */
    sanitize(inputHtml) {
        
        const logger = new Logger('ContentScript');
        
        if (!inputHtml) return '';

        logger.info("Sanitizing start...");

        // 1. 文字列をDOMツリーにパースする
        // これによりブラウザのHTML解釈ロジックを利用できるため、正規表現より遥かに正確
        const parser = new DOMParser();
        const doc = parser.parseFromString(inputHtml, 'text/html');
        
        // 2. body内の全ノードを走査し、不許可なものを排除/無害化
        // Array.fromで静的な配列に変換してから処理しないと、削除時にイテレータが壊れる
        const allNodes = Array.from(doc.body.querySelectorAll('*'));

        allNodes.forEach(node => {
            // 2-1. タグ名のチェック
            const tagName = node.tagName.toLowerCase();
            if (!this.ALLOWED_TAGS.includes(tagName)) {
                // 不許可タグの場合、タグ自体を削除するか、テキストのみ残すか。
                // ここでは安全側に倒し、タグそのものを削除するのではなく
                // 「タグを削除して中身のテキストだけ残す（unwrap）」処理を行う。
                // 例: <script>alert(1)</script> -> "alert(1)" (ただの文字になる)
                // ただし <script> の中身は実行コードなので、中身ごと消すべきタグもある。
                
                if (['script', 'style', 'iframe', 'object', 'embed'].includes(tagName)) {
                    node.remove(); // 中身ごと完全削除
                } else {
                    // 未知のタグなどは、タグだけ剥がして中身のテキストを残す
                    const parent = node.parentNode;
                    while (node.firstChild) {
                        parent.insertBefore(node.firstChild, node);
                    }
                    parent.removeChild(node);
                }
                return;
            }

            // 2-2. 属性のチェック
            const attrs = Array.from(node.attributes);
            attrs.forEach(attr => {
                const attrName = attr.name.toLowerCase();
                // 制御文字を削除
                const attrValue = attr.value.toLowerCase().replace(/[\s\x00-\x1f]/g, '');

                // on* 属性（イベントハンドラ）は絶対禁止
                if (attrName.startsWith('on')) {
                    node.removeAttribute(attr.name);
                    return;
                }

                // javascript: スキームの禁止（href, srcなど）
                if (attrValue.includes('javascript:') || attrValue.includes('vbscript:') || attrValue.includes('data:')) {
                    node.removeAttribute(attr.name);
                    return;
                }

                // 許可リストにない属性は削除
                if (!this.ALLOWED_ATTRS.includes(attrName)) {
                    node.removeAttribute(attr.name);
                }
            });
        });

        logger.info("Sanitizing complete...");

        return doc.body.innerHTML;
    }
};
