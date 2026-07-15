/**
 * Backend i18n for adapter messages
 * Uses ioBroker's system language configuration
 */

type Language = 'de' | 'en';

const translations: Record<Language, Record<string, string>> = {
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

export class I18nBackend {
	private language: Language = 'en';

	/**
	 * Initialize with system language from adapter
	 * @param systemLanguage - Language from adapter.systemConfig.common.language or similar
	 */
	init(systemLanguage?: string): void {
		this.language = this.normalizeLanguage(systemLanguage);
	}

	private normalizeLanguage(language?: string): Language {
		if (language === 'de') return 'de';
		return 'en'; // Default to English
	}

	t(key: string): string {
		return translations[this.language][key] ?? key;
	}
}

export const i18n = new I18nBackend();
export default i18n;
