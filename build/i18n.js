"use strict";
/**
 * Backend i18n for adapter messages
 * Uses ioBroker's system language configuration
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.i18n = exports.I18nBackend = void 0;
const translations = {
    de: {
        'Unreachable': 'Nicht erreichbar',
        'Reachable again': 'Wieder erreichbar',
        'Low battery': 'Batterie schwach',
        'Battery OK': 'Batterie OK',
        'Sunblock activated': 'Sonnenschutz aktiviert',
        'Heatblock activated': 'Hitzeschutz aktiviert',
    },
    en: {
        'Unreachable': 'Unreachable',
        'Reachable again': 'Reachable again',
        'Low battery': 'Low battery',
        'Battery OK': 'Battery OK',
        'Sunblock activated': 'Sunblock activated',
        'Heatblock activated': 'Heatblock activated',
    },
};
class I18nBackend {
    language = 'en';
    /**
     * Initialize with system language from adapter
     * @param systemLanguage - Language from adapter.systemConfig.common.language or similar
     */
    init(systemLanguage) {
        this.language = this.normalizeLanguage(systemLanguage);
    }
    normalizeLanguage(language) {
        if (language === 'de')
            return 'de';
        return 'en'; // Default to English
    }
    t(key) {
        return translations[this.language][key] ?? key;
    }
}
exports.I18nBackend = I18nBackend;
exports.i18n = new I18nBackend();
exports.default = exports.i18n;
//# sourceMappingURL=i18n.js.map