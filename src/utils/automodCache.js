const config = require('../../config/config.js');

const ESCAPE_REGEX = /[.*+?^${}()|[\]\\]/g;

class BannedWordCache {
    constructor() {
        this.invalidate();
    }

    invalidate() {
        this.signature = null;
        this.regex = null;
        this.highlightRegex = null;
        this.words = [];
    }

    _build() {
        const words = (config.autoModeration?.bannedWords || [])
            .map(word => (typeof word === 'string' ? word.trim() : ''))
            .filter(Boolean);

        const signature = words.join('|');
        if (signature === this.signature) {
            return;
        }

        this.signature = signature;
        this.words = words;

        if (!words.length) {
            this.regex = null;
            this.highlightRegex = null;
            return;
        }

        const escaped = words
            .map(word => word.replace(ESCAPE_REGEX, '\\$&'))
            .join('|');

        this.regex = new RegExp(`(${escaped})`, 'gi');
        this.highlightRegex = new RegExp(`(${escaped})`, 'gi');
    }

    getMatches(content) {
        if (!content) return [];
        this._build();
        if (!this.regex) return [];
        const matches = content.match(this.regex);
        if (!matches) return [];
        return matches.map(word => word.toLowerCase());
    }

    highlight(content) {
        if (!content) return '*Sin contenido*';
        this._build();
        if (!this.highlightRegex) return content;
        return content.replace(this.highlightRegex, '**$1**');
    }
}

module.exports = new BannedWordCache();
