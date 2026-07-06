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
		}
	}
}

export {};
