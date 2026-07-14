// Placeholder for strongly-typed adapter config.
// Add properties that mirror io-package.json "native" here.
declare global {
	namespace ioBroker {
		interface AdapterConfig {
			/** Adapter aktiviert */
			aktiviert: boolean;
			/** Steuerung aktiviert (nur wenn aktiviert = true) */
			steuerungAktiviert: boolean;
			/** Grundstück-Baumstruktur (serialisierte FautTreeNode[]) */
			grundstueck: any[];
			/** Externer Datenpunkt für den Nachtmodus */
			dpNachtmodus: string;
			/** Log-Flag: Rolladensteuerung */
			logShuttercontrol: boolean;
			/** Log-Flag: Rolladensteuerung erweitert */
			logShuttercontrolExtended: boolean;
			/** Log-Flag: Admin-Initialisierung & Datenpunkt-Suche */
			logAdmin: boolean;
			/** Log-Flag: Alexa Sprachausgaben */
			logAlexa: boolean;
			/** Log-Flag: Anwesenheitserkennung */
			logPresence: boolean;
			/** Log-Flag: Klimasteuerung */
			logClimate: boolean;
			/** Log-Flag: Klimasteuerung erweitert */
			logClimateExtended: boolean;
			/** Log-Flag: Lichtsteuerung */
			logLight: boolean;
			/** Log-Flag: Lichtsteuerung erweitert */
			logLightExtended: boolean;
			/** Log-Flag: Energieverbrauch */
			logEnergy: boolean;
			/** Log-Flag: Energieverbrauch erweitert */
			logEnergyExtended: boolean;
			/** Telegram Instanz-ID für Benachrichtigungen (z.B. 'telegram.0') */
			telegramInstanz: string;
			/** Info-Meldungen im Nachtmodus nicht senden */
			telegramSilentNachtmodus: boolean;
			/** Alexa Multiroom Gruppe DP-Pfad */
			alexaMultiroomGruppe: string;
			/** Raumspezifische Alexa-Ausgabe aktivieren */
			alexaRaumspezifischAktiv: boolean;
		}
	}
}

export {};
