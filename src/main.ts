/*
 * Created with @iobroker/create-adapter
 */

import * as utils from '@iobroker/adapter-core';
import * as SunCalc from 'suncalc2';
import { type FautNodeConfig, type FautTreeNode, type LampeSceneConfig, type LampeSceneAction } from './lib/treeTypes';
import {
	type TrackerAnchors,
	MONTH_LABELS,
	QUARTER_MONTHS,
	computeDelta,
	defaultAnchors,
	getISOWeek,
	mmOf,
	quarterOf,
	rolloverAnchors,
} from './lib/consumptionTracker';

/** Runtime configuration for a room climate control. */
interface ClimateRoomEntry {
	relId:              string;
	solltemperatur:     number;
	absenkungNacht:     number;
	absenkungAbwesend:  number;
	hasPresence:        boolean;
}

/** Configuration for one consumption history tracker. */
interface ConsumptionConfig {
	/** Short identifier, used in state paths (e.g. 'grid', 'feedin', 'solar', 'oil'). */
	id:          string;
	label:       string;
	unit:        string;
	/** true for oil tank: reading goes DOWN as fuel is consumed. */
	descending:  boolean;
	/** One or more foreign DP IDs whose values are SUMMED to form the tracker reading. */
	dpIds:       string[];
}

/** Runtime configuration for a room’s presence/dark sensor logic. */
interface RoomEntry {
	relId:          string;
	cooldownMs:     number;
	dunkelgrenze:   number;
	lichtsteuerung: boolean;
	motionDpIds:    string[];
	luxDpIds:       string[];
}
/** Runtime configuration for a room's shutter control. */
interface LampEntry {
	relId:            string;
	aktiviert:        boolean;
	retrigger:        boolean;
	sceneConfigs:     LampeSceneConfig[];
	dpSchalter?:      string;
	dpDimmer?:        string;
	dpCt?:            string;
	dpColorHex?:      string;
	dpModus?:         string;
	modeWertWeiss?:   number;
	modeWertFarbe?:   number;
	dpSzene?:         string;
}

interface ShutterRoomEntry {
	relId:              string;
	himmelsrichtung:    number;
	aufgangOffset:      number;
	untergangOffset:    number;
	blendschutz:        boolean;
	hitzeschutz:        boolean;
	/** Base target temperature for heat differential (Wunschtemperatur, without night/away offset). */
	solltemperatur:     number;
	/** Own state relIds of Rolladen in this room. */
	rolladenRelIds:     string[];
	/** External position DP IDs of Rolladen in this room. */
	rolladenPosDpIds:   string[];
	/** Foreign DP ID of the room's own temperature sensor (not outside), or null. */
	roomTempDpId:       string | null;
	/** Latest cached room temperature (°C), or null if sensor not yet read. */
	currentRoomTemp:    number | null;
	/** Pending sunrise open-event timer. */
	sunriseTimer:       ReturnType<typeof setTimeout> | null;
	/** Pending sunset close-event timer. */
	sunsetTimer:        ReturnType<typeof setTimeout> | null;
}
/** After this many ms without a trigger-DP update the sensor is considered unreachable. */
const UNREACH_TIMEOUT_MS = 1_800_000; // 30 minutes

class Faut extends utils.Adapter {
	/** Maps a foreign state ID (source DP) to the relative ID of our own state. */
	private readonly dpToStateMap    = new Map<string, string>();
	/** Maps a motion DP ID to the room relIds that monitor it. */
	private readonly dpToRoomsMotion = new Map<string, string[]>();
	/** Maps a lux DP ID to the room relIds that monitor it. */
	private readonly dpToRoomsLux    = new Map<string, string[]>();
	/** Runtime entries for rooms with active presence/dark logic. */
	private readonly roomEntries     = new Map<string, RoomEntry>();
	/** Room relIds with lichtsteuerung=true (for lightOn trigger in onStateChange). */
	private readonly lightRoomIds    = new Set<string>();
	/** Tracks previous { lightOn, scene } per room to detect real changes (for retrigger=false lamps). */
	private readonly roomLightState  = new Map<string, { lightOn: boolean; scene: string }>();
	/** Maps roomRelId → all Lampe entries in that room. */
	private readonly roomToLamps     = new Map<string, LampEntry[]>();
	/** Active cooldown timers, keyed by room relId. */
	private readonly cooldownTimers  = new Map<string, ReturnType<typeof setTimeout>>();
	/** Maps a battery DP ID to the own lowBat state relId. */
	private readonly dpToLowBatMap   = new Map<string, string>();
	/** Tracks the current lowBat boolean per lowBat-state relId (hysteresis). */
	private readonly lowBatValues    = new Map<string, boolean>();
	/** Maps a trigger DP ID to the own unreach state relId. */
	private readonly dpToUnreachMap  = new Map<string, string>();
	/** Active unreach timers, keyed by own unreach-state relId. */
	private readonly unreachTimers   = new Map<string, ReturnType<typeof setTimeout>>();
	/** RelIds of all Sonne nodes (for sun state updates). */
	private readonly sunNodeRelIds: string[] = [];
	/** 5-minute interval timer for sun position updates. */
	private sunIntervalTimer: ReturnType<typeof setInterval> | null = null;
	/** Geo position read from system.config. */
	private sunLat = 0;
	private sunLng = 0;
	/** External DP for night mode (from config.dpNachtmodus). */
	private nightModeDpId = '';
	/** Rooms with active shutter control, keyed by room relId. */
	private readonly shutterRooms           = new Map<string, ShutterRoomEntry>();
	/** Position DPs of all configured Rolladen (for extended logging). */
	private readonly shutterPositionDpIds   = new Set<string>();
	/** Maps Rolladen own relId → external position DP ID. */
	private readonly rolladenRelIdToPosDp   = new Map<string, string>();
	/** Maps Rolladen own relId → { sunblock%, heatblock%, aktiviert }. */
	private readonly rolladenPosCfg         = new Map<string, { sunblock: number; heatblock: number; aktiviert: boolean }>();
	/** Daily reschedule timer for shutter sunrise/sunset events. */
	private shutterDailyTimer: ReturnType<typeof setTimeout> | null = null;
	/** Current sun azimuth (0=N, 90=E, 180=S, 270=W) – updated every 5 min by updateSunStates(). */
	private currentSunAzimuth    = 0;
	/** Current outside temperature (°C) from aussentemperatursensor – null if unavailable. */
	private currentOutsideTemp:  number | null = null;
	/** Current global lux value used for shutter decisions – null if unavailable. */
	private currentShutterLux:  number | null = null;
	/** Foreign DP ID of the global lux sensor subscribed for shutter control. */
	private shutterGlobalLuxDpId  = '';
	/** Foreign DP ID of the outside temperature sensor for shutter control. */
	private shutterAussenTempDpId = '';
	/** Maps room-temperature foreign DP IDs → room relId (for heatblock evaluation). */
	private readonly shutterRoomTempDpToRoomId = new Map<string, string>();
	/** Maps rolladen own relId → room relId (for resetManual and other lookups). */
	private readonly rolladenToRoom = new Map<string, string>();
	/** Reverse map: external position DP → rolladen own relId. */
	private readonly posDpToRolladen = new Map<string, string>();
	/** Adapter instance IDs whose position writes automatically switch a rolladen to manual mode. */
	private readonly manualTriggerAdapters = new Set<string>([
		'system.adapter.web.0',
		'system.adapter.matter.0',
	]);
	/** Last seen values of foreign DPs – used to suppress duplicate extended-log entries. */
	private readonly dpLastExtValues = new Map<string, unknown>();
	/** Maps each node relId to a human-readable label path (e.g. "Gebäude.EG.Arbeitszimmer"). */
	private readonly relIdToLabel = new Map<string, string>();
	/** Climate control: rooms with klimasteuerung=true. */
	private readonly climateRooms = new Map<string, ClimateRoomEntry>();
	/** Climate control: relId of the first Heizung node found. */
	private heizungRelId: string | null = null;
	/** Climate control: full own-state IDs of presence states in climate rooms. */
	private readonly climatePresenceIds = new Set<string>();
	/** Energy management: full foreign DP ID of Stromzähler current consumption. */
	private energieVerbrauchDpId: string | null = null;
	/** Energy management: maps foreign Wechselrichter power DP ID → node relId (for labelling). */
	private readonly wechselrichterPowerDps = new Map<string, string>();
	/** Energy management: maps foreign Batteriespeicher Wh DP ID → node relId. */
	private readonly batterieDps = new Map<string, string>();
	/** Energy management: last seen power value per foreign DP (W). */
	private readonly energiePowerCache = new Map<string, number>();
	/** Energy management: last seen Wh value per Batteriespeicher DP. */
	private readonly batterieWhCache = new Map<string, number>();
	/** Consumption history: tracker configs keyed by tracker ID. */
	private readonly consumptionConfigs   = new Map<string, ConsumptionConfig>();
	/** Consumption history: current (summed) meter reading per tracker. */
	private readonly consumptionReadings  = new Map<string, number>();
	/** Consumption history: last raw value per source DP (for multi-DP sum). */
	private readonly consumptionSrcLast   = new Map<string, number>();
	/** Consumption history: foreign DP ID → tracker IDs that use it. */
	private readonly consumptionDpToTrackers = new Map<string, string[]>();
	/** Consumption history: current anchor set per tracker. */
	private readonly consumptionAnchors   = new Map<string, TrackerAnchors>();
	/** Consumption history: midnight rollover timer. */
	private consumptionMidnightTimer: ReturnType<typeof setTimeout> | null = null;

	public constructor(options: Partial<utils.AdapterOptions> = {}) {
		super({
			...options,
			name: 'faut',
		});
		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		this.on('message', this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	/** Ensures all native config fields exist (fills in missing flags for existing instances). */
	private async migrateConfig(): Promise<void> {
		const defaults: Partial<ioBroker.AdapterConfig> = {
			dpNachtmodus: '',
			logShuttercontrol: false,
			logShuttercontrolExtended: false,
			logAdmin: false,
			logAlexa: false,
			logPresence: false,
			logClimate: false,
			logClimateExtended: false,
			logLight: false,
			logLightExtended: false,
			logEnergy: false,
			logEnergyExtended: false,
		};
		const patch: Partial<ioBroker.AdapterConfig> = {};
		for (const [key, def] of Object.entries(defaults)) {
			if ((this.config as unknown as Record<string, unknown>)[key] === undefined) {
				(patch as Record<string, unknown>)[key] = def;
				(this.config as unknown as Record<string, unknown>)[key] = def;
			}
		}
		if (Object.keys(patch).length > 0) {
			this.log.info(`Migrating config: adding missing fields: ${Object.keys(patch).join(', ')}`);
			await this.extendForeignObjectAsync(`system.adapter.${this.namespace}`, { native: patch });
		}
	}

	private async onReady(): Promise<void> {
		this.log.info('Faut adapter started');
		this.setState('info.connection', { val: true, ack: true });
		await this.migrateConfig();

		const flags = [
			'logShuttercontrol', 'logShuttercontrolExtended',
			'logAdmin', 'logAlexa', 'logPresence',
			'logClimate', 'logClimateExtended',
			'logLight', 'logLightExtended',
			'logEnergy', 'logEnergyExtended',
		] as const;
		const active   = flags.filter(f => !!(this.config as unknown as Record<string, unknown>)[f]);
		const inactive = flags.filter(f => !(this.config as unknown as Record<string, unknown>)[f]);
		this.log.info(`Log flags ON : ${active.length   ? active.join(', ')   : '(none)'}`);
		this.log.info(`Log flags OFF: ${inactive.length ? inactive.join(', ') : '(none)'}`);

		await this.syncTreeToObjects();
		await this.setupGlobalStates();

		if (!this.config.aktiviert) {
			this.log.info('Adapter inactive (aktiviert = false) – no sensor subscriptions.');
			return;
		}

		await this.setupSensorSubscriptions();
		await this.setupSunNodes();
		await this.setupShutterControl();
		await this.setupClimateControl();
		await this.setupEnergyControl();
		await this.setupConsumptionTracking();
	}

	// ---- sensor subscriptions ----

	/**
	 * Creates the global folder + nightMode state and wires up the external DP.
	 * Runs unconditionally (independent of the aktiviert flag).
	 */
	private async setupGlobalStates(): Promise<void> {
		// Create global folder
		await this.extendObjectAsync('global', {
			type: 'folder',
			common: { name: 'Global' },
			native: {},
		});

		// Create nightMode state (read + write)
		await this.extendObjectAsync('global.nightMode', {
			type: 'state',
			common: {
				name:  'Night Mode',
				type:  'boolean',
				role:  'switch',
				read:  true,
				write: true,
				def:   false,
			},
			native: {},
		});

		// Subscribe to own state so write-through can be triggered
		this.subscribeStates('global.nightMode');

		// Create hausverbrauch state
		await this.extendObjectAsync('global.hausverbrauch', {
			type: 'state',
			common: {
				name:  'Hausverbrauch',
				type:  'number',
				role:  'value.power',
				unit:  'W',
				read:  true,
				write: false,
				def:   0,
			},
			native: {},
		});

		// Create batteryreserve state (sum of all Batteriespeicher in Wh)
		await this.extendObjectAsync('global.batteryreserve', {
			type: 'state',
			common: {
				name:  'Battery Reserve',
				type:  'number',
				role:  'value.energy',
				unit:  'Wh',
				read:  true,
				write: false,
				def:   0,
			},
			native: {},
		});

		const dpId = (this.config.dpNachtmodus as string | undefined) ?? '';
		this.nightModeDpId = dpId;
		if (!dpId) return;

		// Subscribe external DP and mirror initial value
		this.subscribeForeignStates(dpId);
		try {
			const state = await this.getForeignStateAsync(dpId);
			if (state?.val !== null && state?.val !== undefined) {
				await this.setStateAsync('global.nightMode', { val: !!state.val, ack: true });
			}
		} catch (e) {
			this.log.warn(`Initial night mode read failed for ${dpId}: ${(e as Error).message}`);
		}
	}

	/**
	 * Subscribes to all configured source data points and reads their current values.
	 * Only called when aktiviert = true.
	 */
	private async setupSensorSubscriptions(): Promise<void> {
		const tree: FautTreeNode[] = Array.isArray(this.config.grundstueck)
			? (this.config.grundstueck as FautTreeNode[])
			: [];

		this.buildLabelMap(tree, '', '');
		this.collectDpMappings(tree, '');
		this.collectBatteryAndUnreachMappings(tree, '');

		const hasAnyDp = this.dpToStateMap.size > 0 || this.dpToLowBatMap.size > 0 || this.dpToUnreachMap.size > 0;
		if (!hasAnyDp) {
			this.log.info('No sensor data points configured.');
			return;
		}

		this.log.info(`Subscribing to ${this.dpToStateMap.size} sensor data point(s).`);

		for (const [dpId, ownRelId] of this.dpToStateMap) {
			this.subscribeForeignStates(dpId);
			try {
				const state = await this.getForeignStateAsync(dpId);
				if (state?.val !== null && state?.val !== undefined) {
					await this.setStateAsync(ownRelId, { val: state.val, ack: true });
				}
			} catch (e) {
				this.log.warn(`Initial read failed for ${dpId}: ${(e as Error).message}`);
			}
		}

		// Battery + unreach subscriptions and initial values
		await this.setupBatteryAndUnreach();

		// Room presence / darkness logic
		await this.setupRoomLogic(tree);
	}

	// ---- battery + unreach ----

	/** Walks the tree and fills dpToLowBatMap / dpToUnreachMap. */
	private collectBatteryAndUnreachMappings(nodes: FautTreeNode[], prefix: string): void {
		for (const node of nodes) {
			const relId = prefix ? `${prefix}.${node.id}` : node.id;
			const cfg = (node.config as FautNodeConfig | undefined) ?? {};
			if (cfg.batteriebetrieben && cfg.dpBatterie)       this.dpToLowBatMap.set(cfg.dpBatterie,      `${relId}.lowBat`);
			if (cfg.erreichbarkeit    && cfg.dpErreichbarkeit) this.dpToUnreachMap.set(cfg.dpErreichbarkeit, `${relId}.unreach`);
			if (node.children?.length) this.collectBatteryAndUnreachMappings(node.children, relId);
		}
	}

	/** Subscribes to battery/trigger DPs and sets initial lowBat/unreach states. */
	private async setupBatteryAndUnreach(): Promise<void> {
		// ---- LowBat ----
		for (const [dpId, lowBatRelId] of this.dpToLowBatMap) {
			this.subscribeForeignStates(dpId);
			try {
				const state = await this.getForeignStateAsync(dpId);
				if (state?.val !== null && state?.val !== undefined) {
					const cur = this.lowBatValues.get(lowBatRelId) ?? false;
					const val = this.computeLowBat(state.val, cur);
					this.lowBatValues.set(lowBatRelId, val);
					await this.setStateAsync(lowBatRelId, { val, ack: true });
				}
			} catch (e) { this.log.warn(`Initial battery read failed for ${dpId}: ${(e as Error).message}`); }
		}

		// ---- Unreach ----
		for (const [dpId, unreachRelId] of this.dpToUnreachMap) {
			this.subscribeForeignStates(dpId);
			try {
				const state = await this.getForeignStateAsync(dpId);
				if (!state) {
					await this.setStateAsync(unreachRelId, { val: true, ack: true });
				} else {
					const elapsed = Date.now() - (state.ts ?? 0);
					if (elapsed >= UNREACH_TIMEOUT_MS) {
						await this.setStateAsync(unreachRelId, { val: true, ack: true });
					} else {
						await this.setStateAsync(unreachRelId, { val: false, ack: true });
						this.startUnreachTimer(unreachRelId, UNREACH_TIMEOUT_MS - elapsed);
					}
				}
			} catch (e) { this.log.warn(`Initial unreach check failed for ${dpId}: ${(e as Error).message}`); }
		}
	}

	/**
	 * Boolean DP → use directly.
	 * Numeric DP (battery %): true below 20%, false above 21%, unchanged in 20–21% zone.
	 */
	private computeLowBat(val: ioBroker.StateValue, current: boolean): boolean {
		if (typeof val === 'boolean') return val;
		if (typeof val === 'number') {
			if (val < 20) return true;
			if (val > 21) return false;
			return current; // hysteresis zone
		}
		return current;
	}

	/** Starts (or restarts) an unreach timer for the given own-state relId. */
	private startUnreachTimer(unreachRelId: string, delayMs: number): void {
		const timer = setTimeout(() => {
			this.unreachTimers.delete(unreachRelId);
			this.setStateAsync(unreachRelId, { val: true, ack: true }).catch(e => {
				this.log.error(`Unreach timer failed for ${unreachRelId}: ${(e as Error).message}`);
			});
		}, delayMs);
		this.unreachTimers.set(unreachRelId, timer);
	}

	/**
	 * Recursively collects (foreignDpId → ownStateRelId) mappings from the tree.
	 */
	private collectDpMappings(nodes: FautTreeNode[], prefix: string): void {
		for (const node of nodes) {
			const relId = prefix ? `${prefix}.${node.id}` : node.id;
			const cfg: FautNodeConfig = (node.config as FautNodeConfig | undefined) ?? {};

			if (node.type === 'Temperatur') {
				if (cfg.dpTemperatur)       this.dpToStateMap.set(cfg.dpTemperatur,       `${relId}.temperature`);
				if (cfg.dpLuftfeuchtigkeit) this.dpToStateMap.set(cfg.dpLuftfeuchtigkeit, `${relId}.humidity`);
			} else if (node.type === 'Helligkeit') {
				if (cfg.dpLux)              this.dpToStateMap.set(cfg.dpLux,              `${relId}.lux`);
			} else if (node.type === 'Bewegung') {
				if (cfg.dpBewegung)         this.dpToStateMap.set(cfg.dpBewegung,         `${relId}.motion`);
			} else if (node.type === 'Fenster/Tür') {
				if (cfg.dpFensterTuer)      this.dpToStateMap.set(cfg.dpFensterTuer,      `${relId}.open`);
			} else if (node.type === 'Rolladen') {
			if (cfg.dpPosition) {
				this.dpToStateMap.set(cfg.dpPosition, `${relId}.position`);
				this.shutterPositionDpIds.add(cfg.dpPosition);
			}
		}

			if (node.children?.length) this.collectDpMappings(node.children, relId);
		}
	}

	// ---- room logic (presence + dark) ----

	/**
	 * Finds and subscribes room DPs, initialises initial states.
	 * Called once from setupSensorSubscriptions.
	 */
	private async setupRoomLogic(tree: FautTreeNode[]): Promise<void> {
		const globalLuxDpId = this.findGlobalLuxDp(tree);
		this.collectRoomConfigs(tree, '', globalLuxDpId);
		this.collectLampConfigs(tree, '', null);

		if (this.roomEntries.size === 0) return;

		this.log.info(`Room logic active for ${this.roomEntries.size} room(s).`);

		// Subscribe to all room-relevant DPs (overlapping with sensor subscriptions is idempotent)
		for (const room of this.roomEntries.values()) {
			for (const dpId of [...room.motionDpIds, ...room.luxDpIds]) {
				this.subscribeForeignStates(dpId);
			}
		}

		// Initialise states from current sensor values
		for (const room of this.roomEntries.values()) {
			await this.initRoomStates(room);
		}
	}

	/** Walks the tree and populates roomEntries / dpToRoomsMotion / dpToRoomsLux. */
	private collectRoomConfigs(nodes: FautTreeNode[], prefix: string, globalLuxDpId: string | null): void {
		for (const node of nodes) {
			const relId = prefix ? `${prefix}.${node.id}` : node.id;
			const cfg = (node.config as FautNodeConfig | undefined) ?? {};

			if (node.type === 'Raum' && (cfg.bewegungserkennung || cfg.dunkelheitserkennung || cfg.lichtsteuerung)) {
				const motionDpIds: string[] = [];
				const luxDpIds:    string[] = [];

				if (cfg.bewegungserkennung) {
					this.findChildDpIds(node.children ?? [], 'Bewegung',   'dpBewegung', motionDpIds);
				}
				if (cfg.dunkelheitserkennung) {
					if (cfg.globalenSensorBenutzen && globalLuxDpId) {
						luxDpIds.push(globalLuxDpId);
					} else {
						this.findChildDpIds(node.children ?? [], 'Helligkeit', 'dpLux',      luxDpIds);
					}
				}

				if (motionDpIds.length > 0 || luxDpIds.length > 0) {
					const entry: RoomEntry = {
						relId,
						cooldownMs:     (cfg.bewegungsCooldown ?? 3) * 60_000,
						dunkelgrenze:   cfg.dunkelgrenze ?? 150,
						lichtsteuerung: cfg.lichtsteuerung ?? false,
						motionDpIds,
						luxDpIds,
					};
					this.roomEntries.set(relId, entry);
					if (cfg.lichtsteuerung) this.lightRoomIds.add(relId);

					for (const dpId of motionDpIds) {
						const arr = this.dpToRoomsMotion.get(dpId) ?? [];
						arr.push(relId);
						this.dpToRoomsMotion.set(dpId, arr);
					}
					for (const dpId of luxDpIds) {
						const arr = this.dpToRoomsLux.get(dpId) ?? [];
						arr.push(relId);
						this.dpToRoomsLux.set(dpId, arr);
					}
				}
			}

			if (node.children?.length) this.collectRoomConfigs(node.children, relId, globalLuxDpId);
		}
	}

	/**
	 * Recursively collects Lampe child nodes for each lichtsteuerung room.
	 * parentRoomRelId is the nearest ancestor Raum with lichtsteuerung=true.
	 */
	private collectLampConfigs(nodes: FautTreeNode[], prefix: string, parentRoomRelId: string | null): void {
		for (const node of nodes) {
			const relId = prefix ? `${prefix}.${node.id}` : node.id;
			const cfg   = (node.config as FautNodeConfig | undefined) ?? {};

			if (node.type === 'Raum') {
				// New room context: pass this room as parent if lichtsteuerung is enabled
				const roomRelId = cfg.lichtsteuerung ? relId : null;
				if (node.children?.length) this.collectLampConfigs(node.children, relId, roomRelId);
			} else if (node.type === 'Lampe' && parentRoomRelId) {
				const lamp: LampEntry = {
					relId,
					aktiviert:      cfg.lampeAktiviert ?? true,
					retrigger:      cfg.lampeRetrigger  ?? true,
					sceneConfigs:   (cfg.lampeSceneConfigs as LampeSceneConfig[] | undefined) ?? [],
					dpSchalter:     cfg.dpLampeSchalter  as string | undefined,
					dpDimmer:       cfg.dpLampeDimmer    as string | undefined,
					dpCt:           cfg.dpLampeCt        as string | undefined,
					dpColorHex:     cfg.dpLampeColorHex  as string | undefined,
					dpModus:        cfg.dpLampeModus     as string | undefined,
					modeWertWeiss:  cfg.lampeModeWertWeiss as number | undefined,
					modeWertFarbe:  cfg.lampeModeWertFarbe as number | undefined,
					dpSzene:        cfg.dpLampeSzene     as string | undefined,
				};
				const arr = this.roomToLamps.get(parentRoomRelId) ?? [];
				arr.push(lamp);
				this.roomToLamps.set(parentRoomRelId, arr);
			} else if (node.children?.length) {
				this.collectLampConfigs(node.children, relId, parentRoomRelId);
			}
		}
	}

	/** Recursively collects all DP IDs of child nodes matching targetType. */
	private findChildDpIds(
		nodes: FautTreeNode[],
		targetType: string,
		cfgKey: 'dpBewegung' | 'dpLux',
		result: string[],
	): void {
		for (const node of nodes) {
			if (node.type === targetType) {
				const dpId = ((node.config as FautNodeConfig | undefined) ?? {})[cfgKey];
				if (dpId) result.push(dpId);
			}
			if (node.children?.length) this.findChildDpIds(node.children, targetType, cfgKey, result);
		}
	}

	/** Returns the dpLux of the first Helligkeit node with globalerSensor = true, or null. */
	private findGlobalLuxDp(nodes: FautTreeNode[]): string | null {
		for (const node of nodes) {
			if (node.type === 'Helligkeit') {
				const cfg = (node.config as FautNodeConfig | undefined) ?? {};
				if (cfg.globalerSensor && cfg.dpLux) return cfg.dpLux;
			}
			if (node.children?.length) {
				const found = this.findGlobalLuxDp(node.children);
				if (found) return found;
			}
		}
		return null;
	}

	/**
	 * Returns the dpTemperatur of the first interior Temperatur node in a room's direct children
	 * (i.e. not marked as aussentemperatursensor).
	 */
	private findRoomTempDp(children: FautTreeNode[]): string | null {
		for (const child of children) {
			if (child.type === 'Temperatur') {
				const cfg = (child.config as FautNodeConfig | undefined) ?? {};
				if (!cfg.aussentemperatursensor && cfg.dpTemperatur) return cfg.dpTemperatur;
			}
		}
		return null;
	}

	/** Returns the dpTemperatur of the first Temperatur node with aussentemperatursensor=true, or null. */
	private findAussentemperaturDp(nodes: FautTreeNode[]): string | null {
		for (const node of nodes) {
			if (node.type === 'Temperatur') {
				const cfg = (node.config as FautNodeConfig | undefined) ?? {};
				if (cfg.aussentemperatursensor && cfg.dpTemperatur) return cfg.dpTemperatur;
			}
			if (node.children?.length) {
				const found = this.findAussentemperaturDp(node.children);
				if (found) return found;
			}
		}
		return null;
	}

	/** Reads current sensor values and sets initial presence / dark states for a room. */
	private async initRoomStates(room: RoomEntry): Promise<void> {
		// Presence: check if any motion sensor is currently active
		if (room.motionDpIds.length > 0) {
			let anyActive = false;
			for (const dpId of room.motionDpIds) {
				try {
					const s = await this.getForeignStateAsync(dpId);
					if (s?.val === true) { anyActive = true; break; }
				} catch { /* ignore */ }
			}
			if (anyActive) {
				this.logPresence(`${this.labelFor(room.relId)}: startup → present (sensor active)`);
				await this.setStateAsync(`${room.relId}.presence`, { val: 'present', ack: true });
			} else {
				// Check if presence was 'cooldown' from a previous run (no timer running after restart).
				// Instead of switching to absent immediately, restart the cooldown timer so light
				// doesn't cut out abruptly. Better to stay on a little longer than to switch off suddenly.
				const prevPresence = await this.getStateAsync(`${room.relId}.presence`);
				if (prevPresence?.val === 'cooldown') {
					this.logPresence(`${this.labelFor(room.relId)}: startup → cooldown was active, restarting cooldown timer`);
					await this.setStateAsync(`${room.relId}.presence`, { val: 'cooldown', ack: true });
					const timerId = setTimeout(async () => {
						this.cooldownTimers.delete(room.relId);
						this.logPresence(`${this.labelFor(room.relId)}: cooldown (restarted at startup) expired → absent`);
						await this.setStateAsync(`${room.relId}.presence`, { val: 'absent', ack: true });
						await this.updateLightOn(room.relId);
					}, room.cooldownMs);
					this.cooldownTimers.set(room.relId, timerId);
				} else {
					this.logPresence(`${this.labelFor(room.relId)}: startup → absent`);
					await this.setStateAsync(`${room.relId}.presence`, { val: 'absent', ack: true });
				}
			}
		}

		// Dark: compute from first available lux reading
		if (room.luxDpIds.length > 0) {
			let lux: number | null = null;
			for (const dpId of room.luxDpIds) {
				try {
					const s = await this.getForeignStateAsync(dpId);
					if (typeof s?.val === 'number') { lux = s.val; break; }
				} catch { /* ignore */ }
			}
			if (lux !== null) {
				await this.setStateAsync(`${room.relId}.dark`, {
					val: this.computeDarkState(lux, room.dunkelgrenze), ack: true,
				});
			}
		}

		// Light control: set initial scene from nightMode, then compute lightOn
		if (room.lichtsteuerung) {
			const nightSt = await this.getStateAsync('global.nightMode');
			const isNight = nightSt?.val === true;
			await this.setStateAsync(`${room.relId}.scene`, { val: isNight ? 'Nacht' : 'Tag', ack: true });
		}
		await this.updateLightOn(room.relId);
	}

	/** Handles a motion DP change for all rooms that monitor it. */
	private async handleMotionChange(dpId: string, isMotion: boolean): Promise<void> {
		for (const roomRelId of (this.dpToRoomsMotion.get(dpId) ?? [])) {
			const room = this.roomEntries.get(roomRelId);
			if (!room) continue;

			if (isMotion) {
				// New motion: cancel cooldown, go to present
				const existing = this.cooldownTimers.get(roomRelId);
				if (existing !== undefined) { clearTimeout(existing); this.cooldownTimers.delete(roomRelId); }
				this.logPresence(`${this.labelFor(roomRelId)}: motion detected on ${dpId} → present`);
				await this.setStateAsync(`${roomRelId}.presence`, { val: 'present', ack: true });
				await this.updateLightOn(roomRelId);
			} else {
				// Motion cleared: check if another sensor is still active
				let anyOtherActive = false;
				for (const otherId of room.motionDpIds) {
					if (otherId === dpId) continue;
					try {
						const s = await this.getForeignStateAsync(otherId);
						if (s?.val === true) { anyOtherActive = true; break; }
					} catch { /* ignore */ }
				}
				if (!anyOtherActive) {
					// Cancel any stale timer, start fresh cooldown
					const existing = this.cooldownTimers.get(roomRelId);
					if (existing !== undefined) clearTimeout(existing);

					this.logPresence(`${this.labelFor(roomRelId)}: motion cleared on ${dpId} → cooldown (${room.cooldownMs / 1000}s)`);
					await this.setStateAsync(`${roomRelId}.presence`, { val: 'cooldown', ack: true });
					await this.updateLightOn(roomRelId);
					const timer = setTimeout(() => {
						this.cooldownTimers.delete(roomRelId);
						this.logPresence(`${this.labelFor(roomRelId)}: cooldown expired → absent`);
						this.setStateAsync(`${roomRelId}.presence`, { val: 'absent', ack: true }).catch(e => {
							this.log.error(`Cooldown expire failed for ${this.labelFor(roomRelId)}: ${(e as Error).message}`);
						});
						this.updateLightOn(roomRelId).catch(e => {
							this.log.error(`lightOn cooldown-expire failed for ${this.labelFor(roomRelId)}: ${(e as Error).message}`);
						});
					}, room.cooldownMs);
					this.cooldownTimers.set(roomRelId, timer);
				} else {
					this.logPresence(`${this.labelFor(roomRelId)}: motion cleared on ${dpId}, but other sensor still active → staying present`);
				}
			}
		}
	}

	/** Handles a lux DP change for all rooms that monitor it. */
	private async handleLuxChange(dpId: string, lux: number): Promise<void> {
		for (const roomRelId of (this.dpToRoomsLux.get(dpId) ?? [])) {
			const room = this.roomEntries.get(roomRelId);
			if (!room) continue;
			await this.setStateAsync(`${roomRelId}.dark`, {
				val: this.computeDarkState(lux, room.dunkelgrenze), ack: true,
			});
			await this.updateLightOn(roomRelId);
		}
	}

	/** Computes dark/twilight/bright with hysteresis = threshold / 10. */
	private computeDarkState(lux: number, threshold: number): 'dark' | 'twilight' | 'bright' {
		const h = threshold / 10;
		if (lux < threshold - h) return 'dark';
		if (lux > threshold + h) return 'bright';
		return 'twilight';
	}

	/**
	 * Recomputes and writes `lightOn` for a room with lichtsteuerung=true.
	 * lightOn = (presence is 'present' or 'cooldown') AND (dark is 'dark' or 'twilight').
	 */
	private async updateLightOn(roomRelId: string): Promise<void> {
		if (!this.lightRoomIds.has(roomRelId)) return;
		try {
			const presenceSt = await this.getStateAsync(`${roomRelId}.presence`);
			const darkSt     = await this.getStateAsync(`${roomRelId}.dark`);
			const sceneSt    = await this.getStateAsync(`${roomRelId}.scene`);
			const presence   = typeof presenceSt?.val === 'string' ? presenceSt.val : 'absent';
			const dark       = typeof darkSt?.val     === 'string' ? darkSt.val     : 'bright';
			const scene      = typeof sceneSt?.val    === 'string' ? sceneSt.val    : 'Tag';
			const lightOn    = (presence === 'present' || presence === 'cooldown') &&
			                   (dark === 'dark' || dark === 'twilight');
			// Detect whether lightOn or scene actually changed (for retrigger=false lamps)
			const prev    = this.roomLightState.get(roomRelId);
			const changed = !prev || prev.lightOn !== lightOn || prev.scene !== scene;
			this.roomLightState.set(roomRelId, { lightOn, scene });
			await this.setStateAsync(`${roomRelId}.lightOn`, { val: lightOn, ack: true });
			this.logLight(`${this.labelFor(roomRelId)}: lightOn=${lightOn} (presence=${presence}, dark=${dark})${changed ? '' : ' [no change]'}`);
			await this.applyRoomScene(roomRelId, scene, lightOn, changed);
		} catch (e) {
			this.log.error(`updateLightOn failed for ${this.labelFor(roomRelId)}: ${(e as Error).message}`);
		}
	}

	// ---- light scene application ----

	/**
	 * Applies the current scene to all lamps in a room.
	 * Called after lightOn or scene changes.
	 */
	private async applyRoomScene(roomRelId: string, scene: string, lightOn: boolean, changed = true): Promise<void> {
		// "Manuell" suspends all automation – lamp state is not touched
		if (scene === 'Manuell') {
			this.logLight(`${this.labelFor(roomRelId)}: scene=Manuell → Steuerung pausiert`);
			return;
		}
		const lamps = this.roomToLamps.get(roomRelId);
		if (!lamps?.length) return;
		for (const lamp of lamps) {
			// Skip lamps with retrigger=false when nothing actually changed
			if (!lamp.retrigger && !changed) {
				this.logLightExtended(`${this.labelFor(lamp.relId)}: retrigger=false, no change → skip`);
				continue;
			}
			const config = lamp.sceneConfigs.find(c => c.scene === scene);
			if (!config) {
				this.logLightExtended(`${this.labelFor(roomRelId)} / ${this.labelFor(lamp.relId)}: no config for scene "${scene}" – skipping`);
				continue;
			}
			const action = lightOn ? config.lightOn : config.lightOff;
			await this.applyLampAction(roomRelId, lamp, action, scene, lightOn);
		}
	}

	/** Applies one LampeSceneAction to a lamp (or dry-runs if aktiviert=false). */
	private async applyLampAction(
		roomRelId: string,
		lamp:      LampEntry,
		action:    LampeSceneAction,
		scene:     string,
		lightOn:   boolean,
	): Promise<void> {
		const mode    = lightOn ? 'Ein' : 'Aus';
		const dryRun  = !lamp.aktiviert;
		const prefix  = `${this.labelFor(roomRelId)} / ${this.labelFor(lamp.relId)} [scene=${scene}, ${mode}]`;

		const write = async (dp: string, val: boolean | number | string, label: string): Promise<void> => {
			if (dryRun) {
				this.logLightExtended(`[DRY RUN] ${prefix}: ${label} → ${val}`);
			} else {
				this.logLight(`${prefix}: ${label} → ${val}`);
				await this.setForeignStateAsync(dp, { val, ack: false });
			}
		};

		if (action.setSchalter  && lamp.dpSchalter)  await write(lamp.dpSchalter,  action.schalterWert  ?? false, 'Schalter');
		if (action.setDimmer    && lamp.dpDimmer)    await write(lamp.dpDimmer,    action.dimmerWert    ?? 0,     'Dimmer');
		if (action.setCt        && lamp.dpCt)        await write(lamp.dpCt,        action.ctWert        ?? 0,     'ct');
		if (action.setColorHex  && lamp.dpColorHex)  await write(lamp.dpColorHex,  action.colorHexWert  ?? '',    'Farbe');
		if (action.setModus     && lamp.dpModus)     await write(lamp.dpModus,     action.modusWert     ?? 0,     'Modus');
		if (action.setSzene     && lamp.dpSzene)     await write(lamp.dpSzene,     action.szeneWert     ?? 0,     'Szene');
	}

	/**
	 * Sets scene to "Tag" or "Nacht" for all lichtsteuerung rooms based on night mode,
	 * then applies lamps for the new scene.
	 */
	private async handleNightModeForLights(isNight: boolean): Promise<void> {
		if (this.lightRoomIds.size === 0) return;
		const scene = isNight ? 'Nacht' : 'Tag';
		for (const roomRelId of this.lightRoomIds) {
			const prev      = this.roomLightState.get(roomRelId);
			const lightOnSt = await this.getStateAsync(`${roomRelId}.lightOn`);
			const lightOn   = lightOnSt?.val === true;
			const changed   = !prev || prev.lightOn !== lightOn || prev.scene !== scene;
			this.roomLightState.set(roomRelId, { lightOn, scene });
			await this.setStateAsync(`${roomRelId}.scene`, { val: scene, ack: true });
			this.logLight(`${this.labelFor(roomRelId)}: nightMode=${isNight} → scene=${scene}, lightOn=${lightOn}`);
			await this.applyRoomScene(roomRelId, scene, lightOn, changed);
		}
	}

	// ---- sun (Sonne) ----

	/** Collects all Sonne node relIds from the tree. */
	private collectSunNodes(nodes: FautTreeNode[], prefix: string): void {
		for (const node of nodes) {
			const relId = prefix ? `${prefix}.${node.id}` : node.id;
			if (node.type === 'Sonne') this.sunNodeRelIds.push(relId);
			if (node.children?.length) this.collectSunNodes(node.children, relId);
		}
	}

	/**
	 * Sets up sun position updates for all Sonne nodes.
	 * Reads geo position from system.config, computes initial values,
	 * then refreshes elevation + azimuth every 5 minutes.
	 */
	private async setupSunNodes(): Promise<void> {
		const tree: FautTreeNode[] = Array.isArray(this.config.grundstueck)
			? (this.config.grundstueck as FautTreeNode[])
			: [];
		this.collectSunNodes(tree, '');
		if (this.sunNodeRelIds.length === 0) return;

		await this.ensureGeoPosition();

		if (this.sunLat === 0 && this.sunLng === 0) {
			this.log.warn('No geo position set in ioBroker system settings – sun calculation disabled.');
			return;
		}

		this.log.info(`Sun nodes: ${this.sunNodeRelIds.length}, position: ${this.sunLat}°N ${this.sunLng}°E`);

		await this.updateSunStates();

		this.sunIntervalTimer = setInterval(() => {
			this.updateSunStates().catch(e => {
				this.log.error(`Sun update error: ${(e as Error).message}`);
			});
		}, 5 * 60_000);
	}

	/** Loads lat/lng from system.config once (no-op if already loaded). */
	private async ensureGeoPosition(): Promise<void> {
		if (this.sunLat !== 0 || this.sunLng !== 0) return;
		try {
			const sysCfg = await this.getForeignObjectAsync('system.config');
			const common = (sysCfg?.common ?? {}) as Record<string, unknown>;
			this.sunLat = typeof common.latitude  === 'number' ? common.latitude  : 0;
			this.sunLng = typeof common.longitude === 'number' ? common.longitude : 0;
		} catch (e) {
			this.log.warn(`Could not read system.config for geo position: ${(e as Error).message}`);
		}
	}

	/** Calculates and writes all sun states for the current moment. */
	private async updateSunStates(): Promise<void> {
		const now    = new Date();
		const times  = SunCalc.getTimes(now, this.sunLat, this.sunLng);
		const pos    = SunCalc.getPosition(now, this.sunLat, this.sunLng);

		const pad = (n: number): string => String(Math.floor(n)).padStart(2, '0');
		const fmtTime = (d: Date): string =>
			isNaN(d.getTime()) ? '--:--' : `${pad(d.getHours())}:${pad(d.getMinutes())}`;

		const sunriseStr  = fmtTime(times.sunrise);
		const sunsetStr   = fmtTime(times.sunset);
		// suncalc2 altitude = radians above horizon; azimuth = radians from south (positive=west)
		const elevation   = Math.round(pos.altitude * (180 / Math.PI) * 100) / 100;
		const azimuth     = Math.round(((pos.azimuth * (180 / Math.PI)) + 180) * 100) / 100;

		// Cache azimuth for shutter direction check
		this.currentSunAzimuth = azimuth;

		for (const relId of this.sunNodeRelIds) {
			await this.setStateAsync(`${relId}.sunrise`,   { val: sunriseStr, ack: true });
			await this.setStateAsync(`${relId}.sunset`,    { val: sunsetStr,  ack: true });
			await this.setStateAsync(`${relId}.elevation`, { val: elevation,  ack: true });
			await this.setStateAsync(`${relId}.azimuth`,   { val: azimuth,    ack: true });
		}

		// Re-evaluate shutter state based on updated sun position (every 5 min during daytime)
		if (this.shutterRooms.size > 0) {
			this.evaluateAllShutterRooms();
		}
	}

	// ---- climate control ----

	/** Walks the tree and populates climateRooms + heizungRelId. */
	private collectClimateData(nodes: FautTreeNode[], prefix: string): void {
		for (const node of nodes) {
			const relId = prefix ? `${prefix}.${node.id}` : node.id;
			const cfg   = (node.config as FautNodeConfig | undefined) ?? {};

			if (node.type === 'Heizung' && this.heizungRelId === null) {
				this.heizungRelId = relId;
			}

			if (node.type === 'Raum' && cfg.klimasteuerung) {
				const hasPresence = !!(cfg.bewegungserkennung);
				this.climateRooms.set(relId, {
					relId,
					solltemperatur:    cfg.solltemperatur    ?? 20,
					absenkungNacht:    cfg.absenkungNacht    ?? 4,
					absenkungAbwesend: cfg.absenkungAbwesend ?? 3,
					hasPresence,
				});
				if (hasPresence) {
					this.climatePresenceIds.add(`${this.namespace}.${relId}.presence`);
				}
			}

			if (node.children?.length) this.collectClimateData(node.children, relId);
		}
	}

	/** Initialises climate control: subscribes to states and sets initial setpoints. */
	private async setupClimateControl(): Promise<void> {
		const tree: FautTreeNode[] = Array.isArray(this.config.grundstueck)
			? (this.config.grundstueck as FautTreeNode[])
			: [];
		this.collectClimateData(tree, '');

		if (this.climateRooms.size === 0 && this.heizungRelId === null) return;

		this.logClimate(
			`Climate control: ${this.climateRooms.size} room(s)` +
			(this.heizungRelId ? `, Heizung: ${this.labelFor(this.heizungRelId)}` : ', no Heizung node'),
		);

		// Initialise / subscribe Heizung states
		if (this.heizungRelId) {
			const heizNode  = this.findNodeByRelId(tree, this.heizungRelId);
			const heizCfg   = (heizNode?.config as FautNodeConfig | undefined) ?? {};
			const hpState   = await this.getStateAsync(`${this.heizungRelId}.heizperiode`);
			const esState   = await this.getStateAsync(`${this.heizungRelId}.energiesparmodus`);
			if (!hpState?.val && hpState?.val !== false)
				await this.setStateAsync(`${this.heizungRelId}.heizperiode`,     { val: heizCfg.heizperiodeAktiv     ?? false, ack: true });
			if (!esState?.val && esState?.val !== false)
				await this.setStateAsync(`${this.heizungRelId}.energiesparmodus`, { val: heizCfg.energiesparmodusAktiv ?? false, ack: true });
			this.subscribeStates(`${this.heizungRelId}.heizperiode`);
			this.subscribeStates(`${this.heizungRelId}.energiesparmodus`);
		}

		// Subscribe to presence states of climate rooms (own states)
		for (const room of this.climateRooms.values()) {
			if (room.hasPresence) this.subscribeStates(`${room.relId}.presence`);
		}

		// Set initial setpoints
		for (const room of this.climateRooms.values()) {
			await this.updateClimateSetpoint(room);
		}
	}

	/** Calculates and writes setpoint + mode for one climate room. */
	private async updateClimateSetpoint(room: ClimateRoomEntry): Promise<void> {
		const heizperiode = this.heizungRelId
			? !!((await this.getStateAsync(`${this.heizungRelId}.heizperiode`))?.val)
			: true;
		const energiesparmodus = this.heizungRelId
			? !!((await this.getStateAsync(`${this.heizungRelId}.energiesparmodus`))?.val)
			: false;
		const nightMode = !!((await this.getStateAsync('global.nightMode'))?.val);
		const presence  = room.hasPresence
			? ((await this.getStateAsync(`${room.relId}.presence`))?.val as string | null) ?? 'absent'
			: 'present';

		let mode: string;
		let setpoint: number;

		if (!heizperiode) {
			mode     = 'off';
			setpoint = 5; // frost protection
		} else if (energiesparmodus || presence === 'absent') {
			mode     = 'absent';
			setpoint = room.solltemperatur - room.absenkungAbwesend;
		} else if (nightMode) {
			mode     = 'night';
			setpoint = room.solltemperatur - room.absenkungNacht;
		} else {
			mode     = 'normal';
			setpoint = room.solltemperatur;
		}

		this.logClimate(`${this.labelFor(room.relId)}: mode=${mode}, setpoint=${setpoint}\u00b0C`);
		await this.setStateAsync(`${room.relId}.climate.setpoint`, { val: setpoint, ack: true });
		await this.setStateAsync(`${room.relId}.climate.mode`,     { val: mode,     ack: true });
	}

	/** Updates setpoints for all climate rooms. */
	private async updateAllClimateSetpoints(): Promise<void> {
		for (const room of this.climateRooms.values()) {
			await this.updateClimateSetpoint(room);
		}
	}

	/** Finds a node in the tree by its relId. */
	private findNodeByRelId(nodes: FautTreeNode[], targetRelId: string, prefix = ''): FautTreeNode | null {
		for (const node of nodes) {
			const relId = prefix ? `${prefix}.${node.id}` : node.id;
			if (relId === targetRelId) return node;
			if (node.children?.length) {
				const found = this.findNodeByRelId(node.children, targetRelId, relId);
				if (found) return found;
			}
		}
		return null;
	}

	// ---- consumption tracking ----

	/** Walks the tree and populates consumptionConfigs + consumptionDpToTrackers. */
	private collectConsumptionConfigs(nodes: FautTreeNode[], prefix: string): void {
		for (const node of nodes) {
			const relId = prefix ? `${prefix}.${node.id}` : node.id;
			const cfg   = (node.config as FautNodeConfig | undefined) ?? {};

			if (node.type === 'Energie') {
				if (cfg.dpStromzaehlerStand && !this.consumptionConfigs.has('grid')) {
					const cc: ConsumptionConfig = { id: 'grid', label: 'Grid consumption (kWh)', unit: 'kWh', descending: false, dpIds: [cfg.dpStromzaehlerStand] };
					this.consumptionConfigs.set('grid', cc);
					this.consumptionDpToTrackers.set(cfg.dpStromzaehlerStand, ['grid']);
				}
				if (cfg.dpStromzaehlerEinspeisestand && !this.consumptionConfigs.has('feedin')) {
					const cc: ConsumptionConfig = { id: 'feedin', label: 'Grid feed-in (kWh)', unit: 'kWh', descending: false, dpIds: [cfg.dpStromzaehlerEinspeisestand] };
					this.consumptionConfigs.set('feedin', cc);
					this.consumptionDpToTrackers.set(cfg.dpStromzaehlerEinspeisestand, ['feedin']);
				}
			}

			if (node.type === 'Wechselrichter' && cfg.dpGesamterzeugung) {
				if (!this.consumptionConfigs.has('solar')) {
					const cc: ConsumptionConfig = { id: 'solar', label: 'Solar generation (kWh)', unit: 'kWh', descending: false, dpIds: [] };
					this.consumptionConfigs.set('solar', cc);
				}
				const sc = this.consumptionConfigs.get('solar')!;
				sc.dpIds.push(cfg.dpGesamterzeugung);
				const trackers = this.consumptionDpToTrackers.get(cfg.dpGesamterzeugung) ?? [];
				trackers.push('solar');
				this.consumptionDpToTrackers.set(cfg.dpGesamterzeugung, trackers);
			}

			if (node.type === 'Heizung' && cfg.dpOelstand && !this.consumptionConfigs.has('oil')) {
				const cc: ConsumptionConfig = { id: 'oil', label: 'Oil consumption (l)', unit: 'l', descending: true, dpIds: [cfg.dpOelstand] };
				this.consumptionConfigs.set('oil', cc);
				this.consumptionDpToTrackers.set(cfg.dpOelstand, ['oil']);
			}

			if (node.children?.length) this.collectConsumptionConfigs(node.children, relId);
		}
	}

	/** Creates all ioBroker objects for one tracker + one year. */
	private async ensureConsumptionObjects(id: string, unit: string, year: number): Promise<void> {
		const base = `global.consumption.${id}`;
		const yr   = String(year);
		const numCommon = (name: string): ioBroker.StateCommon => ({
			name, type: 'number', role: 'value', unit, read: true, write: false, def: 0,
		} as ioBroker.StateCommon);

		await this.extendObjectAsync(`${base}._anchors`, {
			type: 'state',
			common: { name: 'Anchors (JSON – writable for init)', type: 'string', role: 'json', read: true, write: true, def: '' } as ioBroker.StateCommon,
			native: {},
		});
		await this.extendObjectAsync(`${base}.cumulativeReading`, {
			type: 'state', common: numCommon('Cumulative Reading'), native: {},
		});
		for (const k of [
			'01_currentDay', '01_previousDay',
			'02_currentWeek', '02_previousWeek',
			'03_currentMonth', '03_previousMonth',
			'05_currentYear', '05_previousYear',
		]) {
			await this.extendObjectAsync(`${base}.currentYear.consumed.${k}`, {
				type: 'state', common: numCommon(k.replace(/^\d\d_/, '')), native: {},
			});
		}
		for (const [mm, label] of Object.entries(MONTH_LABELS)) {
			await this.extendObjectAsync(`${base}.${yr}.consumed.months.${label}`,       { type: 'state', common: numCommon(label.replace(/^\d\d_/, '')), native: {} });
			await this.extendObjectAsync(`${base}.${yr}.meterReadings.months.${label}`,  { type: 'state', common: numCommon(label.replace(/^\d\d_/, '')), native: {} });
			void mm;
		}
		for (const q of ['Q1', 'Q2', 'Q3', 'Q4']) {
			await this.extendObjectAsync(`${base}.${yr}.consumed.quarters.${q}`,      { type: 'state', common: numCommon(q), native: {} });
			await this.extendObjectAsync(`${base}.${yr}.meterReadings.quarters.${q}`, { type: 'state', common: numCommon(q), native: {} });
		}
		await this.extendObjectAsync(`${base}.${yr}.consumedCumulative`, { type: 'state', common: numCommon('Consumed cumulative'), native: {} });
		await this.extendObjectAsync(`${base}.${yr}.readingCumulative`,  { type: 'state', common: numCommon('Reading cumulative'),  native: {} });
	}

	/** Tries to load persisted anchors; falls back to default (current reading = baseline). */
	private async loadOrInitAnchors(id: string, currentReading: number, now: Date): Promise<TrackerAnchors> {
		try {
			const st = await this.getStateAsync(`global.consumption.${id}._anchors`);
			if (st?.val && typeof st.val === 'string' && st.val.trim()) {
				const parsed = JSON.parse(st.val) as TrackerAnchors;
				if (typeof parsed.year === 'number') {
					this.logEnergy(`Consumption ${id}: loaded anchors (${parsed.year}-${String(parsed.month + 1).padStart(2, '0')}-${String(parsed.dayOfMonth).padStart(2, '0')})`);
					return parsed;
				}
			}
		} catch (e) {
			this.log.warn(`Consumption ${id}: could not parse anchors: ${(e as Error).message}`);
		}
		this.logEnergy(`Consumption ${id}: no anchors found — initialising from current reading ${currentReading}`);
		const anchors = defaultAnchors(currentReading, now);
		await this.saveConsumptionAnchors(id, anchors);
		return anchors;
	}

	/** Persists the anchor set for a tracker to its own state. */
	private async saveConsumptionAnchors(id: string, anchors: TrackerAnchors): Promise<void> {
		this.consumptionAnchors.set(id, anchors);
		await this.setStateAsync(`global.consumption.${id}._anchors`, { val: JSON.stringify(anchors), ack: true });
	}

	/** Writes all live "currentYear.consumed.*" states for one tracker. */
	private async updateConsumptionLive(id: string, reading: number, anchors: TrackerAnchors, now: Date): Promise<void> {
		const cfg  = this.consumptionConfigs.get(id)!;
		const base = `global.consumption.${id}.currentYear.consumed`;

		const d = computeDelta(anchors.startOfDay,   reading, cfg.descending);
		const w = computeDelta(anchors.startOfWeek,  reading, cfg.descending);
		const m = computeDelta(anchors.startOfMonth, reading, cfg.descending);
		const y = computeDelta(anchors.startOfYear,  reading, cfg.descending);

		await Promise.all([
			this.setStateAsync(`${base}.01_currentDay`,    { val: d, ack: true }),
			this.setStateAsync(`${base}.01_previousDay`,   { val: anchors.prevDayConsumed,   ack: true }),
			this.setStateAsync(`${base}.02_currentWeek`,   { val: w, ack: true }),
			this.setStateAsync(`${base}.02_previousWeek`,  { val: anchors.prevWeekConsumed,  ack: true }),
			this.setStateAsync(`${base}.03_currentMonth`,  { val: m, ack: true }),
			this.setStateAsync(`${base}.03_previousMonth`, { val: anchors.prevMonthConsumed, ack: true }),
			this.setStateAsync(`${base}.05_currentYear`,   { val: y, ack: true }),
			this.setStateAsync(`${base}.05_previousYear`,  { val: anchors.prevYearConsumed,  ack: true }),
		]);
		void now; // year context available for future extension
	}

	/**
	 * Writes all per-year historical states (monthly breakdown, quarters, cumulative)
	 * for the year stored in `anchors.year`.
	 */
	private async updateConsumptionHistory(id: string, anchors: TrackerAnchors, currentReading: number): Promise<void> {
		const cfg  = this.consumptionConfigs.get(id)!;
		const base = `global.consumption.${id}.${anchors.year}`;

		const quarterConsumed: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
		const quarterReading:  Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
		let yearConsumed = 0;

		for (let m0 = 0; m0 <= 11; m0++) {
			const mm     = mmOf(m0 + 1); // '01'..'12'
			const label  = MONTH_LABELS[mm];
			let consumed = 0;
			let reading  = 0;

			if (m0 < anchors.month) {
				// Completed month in this year
				consumed = anchors.monthlyConsumed[mm] ?? 0;
				reading  = anchors.monthlyReadings[mm] ?? 0;
			} else if (m0 === anchors.month) {
				// Current (live) month
				consumed = computeDelta(anchors.startOfMonth, currentReading, cfg.descending);
				reading  = currentReading;
			}
			// Future months remain 0

			await this.setStateAsync(`${base}.consumed.months.${label}`,      { val: consumed, ack: true });
			await this.setStateAsync(`${base}.meterReadings.months.${label}`, { val: reading,  ack: true });

			yearConsumed += consumed;
			const q = quarterOf(m0);
			quarterConsumed[q] += consumed;
			if (reading > 0) quarterReading[q] = reading;
		}

		for (const q of [1, 2, 3, 4] as const) {
			await this.setStateAsync(`${base}.consumed.quarters.Q${q}`,      { val: quarterConsumed[q], ack: true });
			await this.setStateAsync(`${base}.meterReadings.quarters.Q${q}`, { val: quarterReading[q],  ack: true });
		}
		await this.setStateAsync(`${base}.consumedCumulative`, { val: yearConsumed,    ack: true });
		await this.setStateAsync(`${base}.readingCumulative`,  { val: currentReading, ack: true });
	}

	/** Sets up all consumption trackers: object creation, anchor loading, subscriptions. */
	private async setupConsumptionTracking(): Promise<void> {
		const tree: FautTreeNode[] = Array.isArray(this.config.grundstueck)
			? (this.config.grundstueck as FautTreeNode[])
			: [];
		this.collectConsumptionConfigs(tree, '');

		if (this.consumptionConfigs.size === 0) return;

		this.logEnergy(`Consumption tracking: ${[...this.consumptionConfigs.keys()].join(', ')}`);

		const now  = new Date();
		const year = now.getFullYear();

		// Ensure global.consumption folder exists
		await this.extendObjectAsync('global.consumption', {
			type: 'folder', common: { name: 'Consumption history' }, native: {},
		});

		for (const [id, cc] of this.consumptionConfigs) {
			await this.ensureConsumptionObjects(id, cc.unit, year);

			// Subscribe to _anchors so the user can write a corrected JSON
			this.subscribeStates(`global.consumption.${id}._anchors`);

			// Read initial values from source DPs
			let currentReading = 0;
			for (const dpId of cc.dpIds) {
				this.subscribeForeignStates(dpId);
				try {
					const st  = await this.getForeignStateAsync(dpId);
					const val = Number(st?.val) || 0;
					this.consumptionSrcLast.set(dpId, val);
					currentReading += val;
				} catch (e) {
					this.log.warn(`Consumption ${id}: initial read of ${dpId} failed: ${(e as Error).message}`);
				}
			}
			this.consumptionReadings.set(id, currentReading);

			// Load (or initialise) anchors, then apply catch-up rollover
			let anchors = await this.loadOrInitAnchors(id, currentReading, now);
			const { anchors: rolled, closedMonths, yearRolled } = rolloverAnchors(anchors, currentReading, now, cc.descending);
			if (closedMonths.length > 0 || yearRolled) {
				this.logEnergy(`Consumption ${id}: catch-up rollover (${closedMonths.length} month(s), yearRolled=${yearRolled})`);
				if (yearRolled) await this.ensureConsumptionObjects(id, cc.unit, year);
				anchors = rolled;
				await this.saveConsumptionAnchors(id, anchors);
			}
			this.consumptionAnchors.set(id, anchors);

			// Write initial state values
			await this.setStateAsync(`global.consumption.${id}.cumulativeReading`, { val: currentReading, ack: true });
			await this.updateConsumptionLive(id, currentReading, anchors, now);
			await this.updateConsumptionHistory(id, anchors, currentReading);
		}

		// Derived tracker: Hausverbrauch kWh = grid + solar − feedin
		if (this.consumptionConfigs.has('grid') || this.consumptionConfigs.has('solar') || this.consumptionConfigs.has('feedin')) {
			await this.ensureHausverbrauchObjects(year);
			await this.updateHausverbrauchLive();
			await this.updateHausverbrauchHistory(year);
		}

		this.scheduleConsumptionMidnight();
	}

	/** Handles a source DP value change: updates reading cache and live states. */
	private handleConsumptionDpChange(dpId: string, rawVal: unknown): void {
		const val = Number(rawVal) || 0;
		this.consumptionSrcLast.set(dpId, val);

		for (const trackerId of this.consumptionDpToTrackers.get(dpId) ?? []) {
			const cc      = this.consumptionConfigs.get(trackerId);
			const anchors = this.consumptionAnchors.get(trackerId);
			if (!cc || !anchors) continue;

			let newReading = 0;
			for (const dpId2 of cc.dpIds) newReading += this.consumptionSrcLast.get(dpId2) ?? 0;
			this.consumptionReadings.set(trackerId, newReading);

			const now = new Date();
			this.setStateAsync(`global.consumption.${trackerId}.cumulativeReading`, { val: newReading, ack: true }).catch(() => null);
			this.updateConsumptionLive(trackerId, newReading, anchors, now).catch(e =>
				this.log.error(`Consumption live update (${trackerId}) failed: ${(e as Error).message}`));

			const d = computeDelta(anchors.startOfDay, newReading, cc.descending);
			this.logEnergyExtended(`Consumption ${trackerId}: reading=${newReading} ${cc.unit}, today=${d} ${cc.unit}`);

			// Update derived Hausverbrauch whenever grid / solar / feedin changes
			if (trackerId === 'grid' || trackerId === 'feedin' || trackerId === 'solar') {
				this.updateHausverbrauchLive().catch(e =>
					this.log.error(`Hausverbrauch live update failed: ${(e as Error).message}`));
			}
		}
	}

	/** Handles user writing to a _anchors state — parse JSON and apply immediately. */
	private async handleConsumptionAnchorWrite(ownRelId: string, val: unknown): Promise<void> {
		// Extract tracker id from 'global.consumption.<id>._anchors'
		const parts = ownRelId.split('.');
		if (parts.length < 4) return; // safety
		const trackerId = parts[2];
		if (!this.consumptionConfigs.has(trackerId)) return;

		if (typeof val !== 'string' || !val.trim()) return;
		let newAnchors: TrackerAnchors;
		try {
			newAnchors = JSON.parse(val) as TrackerAnchors;
			if (typeof newAnchors.year !== 'number') throw new Error('missing year field');
		} catch (e) {
			this.log.warn(`Consumption ${trackerId}: invalid _anchors JSON — ${(e as Error).message}`);
			return;
		}

		await this.saveConsumptionAnchors(trackerId, newAnchors);
		const reading = this.consumptionReadings.get(trackerId) ?? 0;
		const year    = newAnchors.year;
		await this.ensureConsumptionObjects(trackerId, this.consumptionConfigs.get(trackerId)!.unit, year);
		await this.setStateAsync(`global.consumption.${trackerId}.cumulativeReading`, { val: reading, ack: true });
		await this.updateConsumptionLive(trackerId, reading, newAnchors, new Date());
		await this.updateConsumptionHistory(trackerId, newAnchors, reading);
		if (trackerId === 'grid' || trackerId === 'feedin' || trackerId === 'solar') {
			await this.updateHausverbrauchLive();
			await this.updateHausverbrauchHistory(newAnchors.year);
		}
		this.logEnergy(`Consumption ${trackerId}: anchors updated by user write`);
	}

	/** Performs the midnight rollover for all trackers, then reschedules itself. */
	private async doConsumptionRollover(): Promise<void> {
		const now = new Date();
		this.logEnergy(`Consumption: midnight rollover at ${now.toISOString()}`);

		for (const [id, anchors] of this.consumptionAnchors) {
			const cc      = this.consumptionConfigs.get(id)!;
			const reading = this.consumptionReadings.get(id) ?? 0;
			const { anchors: rolled, yearRolled } = rolloverAnchors(anchors, reading, now, cc.descending);

			if (yearRolled) await this.ensureConsumptionObjects(id, cc.unit, now.getFullYear());

			await this.saveConsumptionAnchors(id, rolled);
			await this.updateConsumptionLive(id, reading, rolled, now);
			await this.updateConsumptionHistory(id, rolled, reading);

			this.logEnergyExtended(
				`Consumption rollover ${id}: prevDay=${rolled.prevDayConsumed} ${cc.unit}` +
				`, prevWeek=${rolled.prevWeekConsumed} ${cc.unit}`,
			);
		}

		// Hausverbrauch: update derived history after all trackers have rolled over
		if (this.consumptionConfigs.has('grid') || this.consumptionConfigs.has('solar') || this.consumptionConfigs.has('feedin')) {
			await this.updateHausverbrauchLive();
			await this.updateHausverbrauchHistory(now.getFullYear());
		}

		this.scheduleConsumptionMidnight();
	}

	/** Creates ioBroker objects for the derived Hausverbrauch kWh tracker. */
	private async ensureHausverbrauchObjects(year: number): Promise<void> {
		const base = 'global.consumption.hausverbrauch';
		const yr   = String(year);
		const numC = (name: string): ioBroker.StateCommon => ({
			name, type: 'number', role: 'value', unit: 'kWh', read: true, write: false, def: 0,
		} as ioBroker.StateCommon);

		for (const k of [
			'01_currentDay', '01_previousDay',
			'02_currentWeek', '02_previousWeek',
			'03_currentMonth', '03_previousMonth',
			'05_currentYear', '05_previousYear',
		]) {
			await this.extendObjectAsync(`${base}.currentYear.consumed.${k}`, {
				type: 'state', common: numC(k.replace(/^\d\d_/, '')), native: {},
			});
		}
		for (const [mm, label] of Object.entries(MONTH_LABELS)) {
			await this.extendObjectAsync(`${base}.${yr}.consumed.months.${label}`, {
				type: 'state', common: numC(label.replace(/^\d\d_/, '')), native: {},
			});
			void mm;
		}
		for (const q of ['Q1', 'Q2', 'Q3', 'Q4']) {
			await this.extendObjectAsync(`${base}.${yr}.consumed.quarters.${q}`, {
				type: 'state', common: numC(q), native: {},
			});
		}
		await this.extendObjectAsync(`${base}.${yr}.consumedCumulative`, {
			type: 'state', common: numC('Consumed cumulative'), native: {},
		});
	}

	/** Writes all currentYear.consumed.* states for the derived Hausverbrauch tracker. */
	private async updateHausverbrauchLive(): Promise<void> {
		const gA = this.consumptionAnchors.get('grid');
		const fA = this.consumptionAnchors.get('feedin');
		const sA = this.consumptionAnchors.get('solar');
		if (!gA && !fA && !sA) return;

		const gR = this.consumptionReadings.get('grid')   ?? 0;
		const fR = this.consumptionReadings.get('feedin') ?? 0;
		const sR = this.consumptionReadings.get('solar')  ?? 0;

		const hv = (g: number, s: number, f: number): number =>
			Math.round(Math.max(0, g + s - f) * 1000) / 1000;

		const day   = hv(
			gA ? computeDelta(gA.startOfDay,   gR, false) : 0,
			sA ? computeDelta(sA.startOfDay,   sR, false) : 0,
			fA ? computeDelta(fA.startOfDay,   fR, false) : 0,
		);
		const week  = hv(
			gA ? computeDelta(gA.startOfWeek,  gR, false) : 0,
			sA ? computeDelta(sA.startOfWeek,  sR, false) : 0,
			fA ? computeDelta(fA.startOfWeek,  fR, false) : 0,
		);
		const month = hv(
			gA ? computeDelta(gA.startOfMonth, gR, false) : 0,
			sA ? computeDelta(sA.startOfMonth, sR, false) : 0,
			fA ? computeDelta(fA.startOfMonth, fR, false) : 0,
		);
		const yr    = hv(
			gA ? computeDelta(gA.startOfYear,  gR, false) : 0,
			sA ? computeDelta(sA.startOfYear,  sR, false) : 0,
			fA ? computeDelta(fA.startOfYear,  fR, false) : 0,
		);
		const prevDay   = hv(gA?.prevDayConsumed   ?? 0, sA?.prevDayConsumed   ?? 0, fA?.prevDayConsumed   ?? 0);
		const prevWeek  = hv(gA?.prevWeekConsumed  ?? 0, sA?.prevWeekConsumed  ?? 0, fA?.prevWeekConsumed  ?? 0);
		const prevMonth = hv(gA?.prevMonthConsumed ?? 0, sA?.prevMonthConsumed ?? 0, fA?.prevMonthConsumed ?? 0);
		const prevYear  = hv(gA?.prevYearConsumed  ?? 0, sA?.prevYearConsumed  ?? 0, fA?.prevYearConsumed  ?? 0);

		const base = 'global.consumption.hausverbrauch.currentYear.consumed';
		await Promise.all([
			this.setStateAsync(`${base}.01_currentDay`,    { val: day,       ack: true }),
			this.setStateAsync(`${base}.01_previousDay`,   { val: prevDay,   ack: true }),
			this.setStateAsync(`${base}.02_currentWeek`,   { val: week,      ack: true }),
			this.setStateAsync(`${base}.02_previousWeek`,  { val: prevWeek,  ack: true }),
			this.setStateAsync(`${base}.03_currentMonth`,  { val: month,     ack: true }),
			this.setStateAsync(`${base}.03_previousMonth`, { val: prevMonth, ack: true }),
			this.setStateAsync(`${base}.05_currentYear`,   { val: yr,        ack: true }),
			this.setStateAsync(`${base}.05_previousYear`,  { val: prevYear,  ack: true }),
		]);
	}

	/** Writes yearly monthly/quarterly breakdown for the derived Hausverbrauch tracker. */
	private async updateHausverbrauchHistory(year: number): Promise<void> {
		const gA = this.consumptionAnchors.get('grid');
		const fA = this.consumptionAnchors.get('feedin');
		const sA = this.consumptionAnchors.get('solar');
		if (!gA && !fA && !sA) return;

		const gR = this.consumptionReadings.get('grid')   ?? 0;
		const fR = this.consumptionReadings.get('feedin') ?? 0;
		const sR = this.consumptionReadings.get('solar')  ?? 0;

		// Use any available anchor as reference for current-month index
		const ref = gA ?? sA ?? fA!;
		const base = `global.consumption.hausverbrauch.${year}`;
		const quarterConsumed: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
		let yearConsumed = 0;

		for (let m0 = 0; m0 <= 11; m0++) {
			const mm    = mmOf(m0 + 1);
			const label = MONTH_LABELS[mm];
			let consumed = 0;

			if (m0 < ref.month) {
				// Completed month: sum contributions from each tracker
				const g = gA?.monthlyConsumed[mm] ?? 0;
				const s = sA?.monthlyConsumed[mm] ?? 0;
				const f = fA?.monthlyConsumed[mm] ?? 0;
				consumed = Math.round(Math.max(0, g + s - f) * 1000) / 1000;
			} else if (m0 === ref.month) {
				// Current (live) month
				const g = gA ? computeDelta(gA.startOfMonth, gR, false) : 0;
				const s = sA ? computeDelta(sA.startOfMonth, sR, false) : 0;
				const f = fA ? computeDelta(fA.startOfMonth, fR, false) : 0;
				consumed = Math.round(Math.max(0, g + s - f) * 1000) / 1000;
			}

			await this.setStateAsync(`${base}.consumed.months.${label}`, { val: consumed, ack: true });
			yearConsumed += consumed;
			quarterConsumed[quarterOf(m0)] += consumed;
		}

		for (const q of [1, 2, 3, 4] as const) {
			await this.setStateAsync(`${base}.consumed.quarters.Q${q}`, {
				val: Math.round(quarterConsumed[q] * 1000) / 1000, ack: true,
			});
		}
		await this.setStateAsync(`${base}.consumedCumulative`, {
			val: Math.round(yearConsumed * 1000) / 1000, ack: true,
		});
	}

	/** Schedules a one-shot timer that fires 5 seconds past the next local midnight. */
	private scheduleConsumptionMidnight(): void {
		if (this.consumptionMidnightTimer !== null) {
			clearTimeout(this.consumptionMidnightTimer);
			this.consumptionMidnightTimer = null;
		}
		const now      = new Date();
		const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
		const ms       = midnight.getTime() - now.getTime();
		this.consumptionMidnightTimer = setTimeout(() => {
			this.doConsumptionRollover().catch(e =>
				this.log.error(`Consumption midnight rollover failed: ${(e as Error).message}`));
		}, ms);
		this.log.debug(`[consumption] Next rollover in ${Math.round(ms / 60_000)} min`);
	}

	// ---- energy management ----

	/** Walks the tree and fills energieVerbrauchDpId + wechselrichterPowerDps + batterieDps. */
	private collectEnergyData(nodes: FautTreeNode[], prefix: string): void {
		for (const node of nodes) {
			const relId = prefix ? `${prefix}.${node.id}` : node.id;
			const cfg   = (node.config as FautNodeConfig | undefined) ?? {};

			if (node.type === 'Energie' && cfg.dpStromzaehlerVerbrauch && this.energieVerbrauchDpId === null) {
				this.energieVerbrauchDpId = cfg.dpStromzaehlerVerbrauch;
			}
			if (node.type === 'Wechselrichter' && cfg.dpWechselrichterPower) {
				this.wechselrichterPowerDps.set(cfg.dpWechselrichterPower, relId);
			}
			if (node.type === 'Batteriespeicher' && cfg.dpBatterieWh) {
				this.batterieDps.set(cfg.dpBatterieWh, relId);
			}

			if (node.children?.length) this.collectEnergyData(node.children, relId);
		}
	}

	/** Initialises energy management: subscribes to power DPs and writes initial Hausverbrauch. */
	private async setupEnergyControl(): Promise<void> {
		const tree: FautTreeNode[] = Array.isArray(this.config.grundstueck)
			? (this.config.grundstueck as FautTreeNode[])
			: [];
		this.collectEnergyData(tree, '');

		if (!this.energieVerbrauchDpId && this.wechselrichterPowerDps.size === 0) return;

		this.logEnergy(
			`Energy management: ${this.wechselrichterPowerDps.size} inverter(s)` +
			(this.energieVerbrauchDpId ? ', grid meter configured' : ', no grid meter'),
		);

		// Grid meter: subscribe + read initial
		if (this.energieVerbrauchDpId) {
			this.subscribeForeignStates(this.energieVerbrauchDpId);
			try {
				const st = await this.getForeignStateAsync(this.energieVerbrauchDpId);
				if (st?.val !== null && st?.val !== undefined) {
					this.energiePowerCache.set(this.energieVerbrauchDpId, Number(st.val) || 0);
				}
			} catch (e) {
				this.log.warn(`Energy: initial read of Netzbezug failed: ${(e as Error).message}`);
			}
		}

		// Inverters: subscribe + read initial
		for (const [dpId, relId] of this.wechselrichterPowerDps) {
			this.subscribeForeignStates(dpId);
			try {
				const st = await this.getForeignStateAsync(dpId);
				if (st?.val !== null && st?.val !== undefined) {
					this.energiePowerCache.set(dpId, Number(st.val) || 0);
				}
			} catch (e) {
				this.log.warn(`Energy: initial read of inverter (${this.labelFor(relId)}) failed: ${(e as Error).message}`);
			}
		}

		// Batteriespeicher: subscribe + read initial
		for (const [dpId, relId] of this.batterieDps) {
			this.subscribeForeignStates(dpId);
			try {
				const st = await this.getForeignStateAsync(dpId);
				if (st?.val !== null && st?.val !== undefined) {
					this.batterieWhCache.set(dpId, Number(st.val) || 0);
				}
			} catch (e) {
				this.log.warn(`Energy: initial read of Batteriespeicher (${this.labelFor(relId)}) failed: ${(e as Error).message}`);
			}
		}

		await this.recalcHausverbrauch();
		await this.recalcBatteryReserve();
	}

	/** Sums all cached power values and writes global.hausverbrauch, then logs. */
	private async recalcHausverbrauch(): Promise<void> {
		const netzbezug = this.energieVerbrauchDpId
			? (this.energiePowerCache.get(this.energieVerbrauchDpId) ?? 0)
			: 0;
		let solareinspeisung = 0;
		for (const dpId of this.wechselrichterPowerDps.keys()) {
			solareinspeisung += this.energiePowerCache.get(dpId) ?? 0;
		}
		const hausverbrauch = netzbezug + solareinspeisung;

		this.logEnergyExtended(
			`Hausverbrauch: ${hausverbrauch} W (Netzbezug: ${netzbezug} W, Solareinspeisung: ${solareinspeisung} W)`,
		);
		await this.setStateAsync('global.hausverbrauch', { val: hausverbrauch, ack: true });
	}

	/** Sums all cached Wh values and writes global.batteryreserve. */
	private async recalcBatteryReserve(): Promise<void> {
		if (this.batterieDps.size === 0) return;
		let total = 0;
		for (const dpId of this.batterieDps.keys()) {
			total += this.batterieWhCache.get(dpId) ?? 0;
		}
		this.logEnergy(`Battery reserve: ${total} Wh (${this.batterieDps.size} storage unit(s))`);
		await this.setStateAsync('global.batteryreserve', { val: total, ack: true });
	}

	// ---- shutter control ----

	/** Builds relIdToLabel from the tree (full label path per node). */
	private buildLabelMap(nodes: FautTreeNode[], prefix: string, labelPrefix: string): void {
		for (const node of nodes) {
			const relId     = prefix      ? `${prefix}.${node.id}`         : node.id;
			const labelPath = labelPrefix ? `${labelPrefix}.${node.label}` : node.label;
			this.relIdToLabel.set(relId, labelPath);
			if (node.children?.length) this.buildLabelMap(node.children, relId, labelPath);
		}
	}

	/** Returns the human-readable label path for a relId, or the relId itself as fallback. */
	private labelFor(relId: string): string {
		return this.relIdToLabel.get(relId) ?? relId;
	}

	/** Logs a message at debug level when [shuttercontrol] or [shuttercontrol_extended] is active. */
	private logShutter(msg: string): void {
		if (this.config.logShuttercontrol || this.config.logShuttercontrolExtended) {
			this.log.debug(`[shuttercontrol] ${msg}`);
		}
	}

	/** Logs a message at debug level only when [shuttercontrol_extended] is active. */
	private logShutterExtended(msg: string): void {
		if (this.config.logShuttercontrolExtended) {
			this.log.debug(`[shuttercontrol_extended] ${msg}`);
		}
	}

	private onMessage(obj: ioBroker.Message): void {
		if (obj.command === 'log' && obj.message) {
			const { flag, text } = obj.message as { flag: string; text: string };
			switch (flag) {
				case 'admin':            this.logAdmin(text); break;
				case 'alexa':            this.logAlexa(text); break;
				case 'presence':         this.logPresence(text); break;
				case 'climate':          this.logClimate(text); break;
				case 'climate_extended': this.logClimateExtended(text); break;
				case 'light':            this.logLight(text); break;
				case 'light_extended':   this.logLightExtended(text); break;
				case 'energy':           this.logEnergy(text); break;
				case 'energy_extended':  this.logEnergyExtended(text); break;
			}
		}
	}

	private logAdmin(msg: string): void {
		if (this.config.logAdmin) this.log.debug(`[admin] ${msg}`);
	}
	private logAlexa(msg: string): void {
		if (this.config.logAlexa) this.log.debug(`[alexa] ${msg}`);
	}
	private logPresence(msg: string): void {
		if (this.config.logPresence) this.log.debug(`[presence] ${msg}`);
	}
	private logClimate(msg: string): void {
		if (this.config.logClimate) this.log.debug(`[climate] ${msg}`);
	}
	private logClimateExtended(msg: string): void {
		if (this.config.logClimateExtended) this.log.debug(`[climate_extended] ${msg}`);
	}
	private logLight(msg: string): void {
		if (this.config.logLight) this.log.debug(`[light] ${msg}`);
	}
	private logLightExtended(msg: string): void {
		if (this.config.logLightExtended) this.log.debug(`[light_extended] ${msg}`);
	}
	private logEnergy(msg: string): void {
		if (this.config.logEnergy) this.log.debug(`[energy] ${msg}`);
	}
	private logEnergyExtended(msg: string): void {
		if (this.config.logEnergyExtended) this.log.debug(`[energy_extended] ${msg}`);
	}

	/**
	 * Collects all rooms with shutter control configured and logs the found topology.
	 */
	private async setupShutterControl(): Promise<void> {
		const tree: FautTreeNode[] = Array.isArray(this.config.grundstueck)
			? (this.config.grundstueck as FautTreeNode[])
			: [];

		this.collectShutterRooms(tree, '');

		if (this.shutterRooms.size === 0) {
			this.logShutter('No rooms with shutter control configured.');
			return;
		}

		this.logShutter(`Shutter control active for ${this.shutterRooms.size} room(s).`);

		for (const room of this.shutterRooms.values()) {
			this.logShutter(
				`Room "${this.labelFor(room.relId)}": direction=${room.himmelsrichtung}°, ` +
				`riseOffset=${room.aufgangOffset}min, setOffset=${room.untergangOffset}min, ` +
				`glare=${room.blendschutz}, heat=${room.hitzeschutz}, ` +
				`shutters=${room.rolladenRelIds.length}`,
			);
			for (const rel of room.rolladenRelIds) this.logShutter(`  Rolladen: ${this.labelFor(rel)}`);
		}

		// Log context sources
		this.logShutter(this.sunNodeRelIds.length > 0
			? `Sun node(s): ${this.sunNodeRelIds.map(r => this.labelFor(r)).join(', ')}`
			: 'No sun node found – sun-based control unavailable.');

		this.logShutter(this.nightModeDpId ? `Night mode DP: ${this.nightModeDpId}` : 'Night mode DP not configured.');

		// Ensure geo position is loaded (may have been skipped if no Sonne node)
		await this.ensureGeoPosition();

		if (this.sunLat === 0 && this.sunLng === 0) {
			this.logShutter('No geo position – time-based shutter control disabled.');
			return;
		}

		// ---- Subscribe global lux sensor for shutter logic ----
		const globalLuxDpId = this.findGlobalLuxDp(tree);
		if (globalLuxDpId) {
			this.shutterGlobalLuxDpId = globalLuxDpId;
			this.subscribeForeignStates(globalLuxDpId); // idempotent if already subscribed by room logic
			try {
				const s = await this.getForeignStateAsync(globalLuxDpId);
				if (typeof s?.val === 'number') this.currentShutterLux = s.val;
			} catch { /* ignore */ }
			this.logShutter(`Lux DP: ${globalLuxDpId} (current: ${this.currentShutterLux ?? 'n/a'} lx)`);
		} else {
			this.logShutter('No global lux sensor – lux-based shutter control unavailable.');
		}

		// ---- Subscribe outside temperature sensor for heat-protection logic ----
		const aussenTempDpId = this.findAussentemperaturDp(tree);
		if (aussenTempDpId) {
			this.shutterAussenTempDpId = aussenTempDpId;
			this.subscribeForeignStates(aussenTempDpId);
			try {
				const s = await this.getForeignStateAsync(aussenTempDpId);
				if (typeof s?.val === 'number') this.currentOutsideTemp = s.val;
			} catch { /* ignore */ }
			this.logShutter(`Outside temp DP: ${aussenTempDpId} (current: ${this.currentOutsideTemp ?? 'n/a'}°C)`);
		} else {
			this.logShutter('No outside temp sensor – heat-based shutter control unavailable.');
		}

		// ---- Subscribe room temperature sensors (for heatblock room-temp check) ----
		for (const room of this.shutterRooms.values()) {
			if (!room.roomTempDpId) continue;
			this.shutterRoomTempDpToRoomId.set(room.roomTempDpId, room.relId);
			this.subscribeForeignStates(room.roomTempDpId);
			try {
				const s = await this.getForeignStateAsync(room.roomTempDpId);
				if (typeof s?.val === 'number') room.currentRoomTemp = s.val;
			} catch { /* ignore */ }
			this.logShutter(
				`Room "${this.labelFor(room.relId)}": room temp DP: ${room.roomTempDpId} ` +
				`(current: ${room.currentRoomTemp ?? 'n/a'}°C)`,
			);
		}

		// Schedule sunrise/sunset timers and apply initial state
		for (const room of this.shutterRooms.values()) {
			await this.scheduleShutterEvents(room);
		}
		
		// ---- Subscribe resetManual states for all Rolladen ----
		for (const room of this.shutterRooms.values()) {
			for (const rel of room.rolladenRelIds) {
				this.rolladenToRoom.set(rel, room.relId);
				this.subscribeStates(`${rel}.resetManual`);
			}
		}

		this.scheduleShutterDailyReset();
	}

	/** Schedules sunrise/sunset timers for one room and applies the correct initial state. */
	private async scheduleShutterEvents(room: ShutterRoomEntry): Promise<void> {
		if (room.sunriseTimer !== null) { clearTimeout(room.sunriseTimer); room.sunriseTimer = null; }
		if (room.sunsetTimer  !== null) { clearTimeout(room.sunsetTimer);  room.sunsetTimer  = null; }

		const now    = new Date();
		const times  = SunCalc.getTimes(now, this.sunLat, this.sunLng);

		const sunriseMs = times.sunrise.getTime() + room.aufgangOffset   * 60_000;
		const sunsetMs  = times.sunset.getTime()  + room.untergangOffset * 60_000;
		const msToSunrise = sunriseMs - Date.now();
		const msToSunset  = sunsetMs  - Date.now();

		this.logShutter(
			`Room "${this.labelFor(room.relId)}": sunrise@${new Date(sunriseMs).toLocaleTimeString()}, ` +
			`sunset@${new Date(sunsetMs).toLocaleTimeString()}`,
		);

		// ---- Apply initial state ----
		const isNightMode = !!(await this.getStateAsync('global.nightMode'))?.val;

		if (msToSunset <= 0) {
			for (const rel of room.rolladenRelIds)
				await this.applyShutterState(rel, 'closed', 'startup: past sunset');
		} else if (msToSunrise <= 0 && !isNightMode) {
			// Daytime without night mode: run full evaluation (lux + sun + temperature)
			// Manual-mode shutters are preserved inside evaluateShutterRoom (loop skips them)
			await this.evaluateShutterRoom(room);
		} else {
			// Before sunrise or night mode active: close shutters, but preserve manual mode at startup
			for (const rel of room.rolladenRelIds) {
				try {
					const cur = await this.getStateAsync(`${rel}.state`);
					if (cur?.val === 'manual') {
						this.logShutter(`${this.labelFor(rel)}: startup – keeping manual mode`);
						continue;
					}
				} catch { /* state not yet created – proceed */ }
				await this.applyShutterState(rel, 'closed', 'startup: before sunrise or night mode active');
			}
		}

		// ---- Schedule future events ----
		if (msToSunrise > 0) {
			room.sunriseTimer = setTimeout(() => { room.sunriseTimer = null; this.triggerShutterSunrise(room); }, msToSunrise);
			this.logShutter(`Room "${this.labelFor(room.relId)}": sunrise timer in ${Math.round(msToSunrise / 60_000)}min`);
		}
		if (msToSunset > 0) {
			room.sunsetTimer = setTimeout(() => { room.sunsetTimer = null; this.triggerShutterSunset(room); }, msToSunset);
			this.logShutter(`Room "${this.labelFor(room.relId)}": sunset timer in ${Math.round(msToSunset / 60_000)}min`);
		}
	}

	/** Fires at sunrise (+ offset): evaluates the full shutter state machine. */
	private triggerShutterSunrise(room: ShutterRoomEntry): void {
		this.logShutter(`Room "${this.labelFor(room.relId)}": sunrise → evaluating shutter state`);
		this.evaluateShutterRoom(room).catch(e =>
			this.log.error(`Shutter sunrise eval failed for "${this.labelFor(room.relId)}": ${(e as Error).message}`));
	}

	/** Fires at sunset (+ offset): closes all shutters. */
	private triggerShutterSunset(room: ShutterRoomEntry): void {
		this.logShutter(`Room "${this.labelFor(room.relId)}": sunset → closing shutters`);
		for (const rel of room.rolladenRelIds)
			this.applyShutterState(rel, 'closed', 'sunset').catch(e =>
				this.log.error(`Shutter sunset error: ${(e as Error).message}`));
	}

	/** Reacts to night mode changes: closes or opens shutters accordingly. */
	private async handleNightModeForShutters(isNight: boolean): Promise<void> {
		if (this.shutterRooms.size === 0) return;

		if (isNight) {
			// Night mode ON: force-close ALL shutters, including those in manual mode.
			// This resets manual mode (state changes from 'manual' → 'closed').
			for (const room of this.shutterRooms.values()) {
				this.logShutter(`Room "${this.labelFor(room.relId)}": night mode ON → closing (overrides manual)`);
				for (const rel of room.rolladenRelIds)
					await this.applyShutterState(rel, 'closed', 'night mode activated', true);
			}
			return;
		}

		// Night mode turned OFF → evaluate full shutter state (lux + sun + temp)
		const now = new Date();
		for (const room of this.shutterRooms.values()) {
			if (this.sunLat === 0 && this.sunLng === 0) { this.logShutter(`Room "${this.labelFor(room.relId)}": night mode OFF, no geo`); continue; }
			const times = SunCalc.getTimes(now, this.sunLat, this.sunLng);
			const rise  = new Date(times.sunrise.getTime() + room.aufgangOffset   * 60_000);
			const set   = new Date(times.sunset.getTime()  + room.untergangOffset * 60_000);
			if (now >= rise && now < set) {
				this.logShutter(`Room "${this.labelFor(room.relId)}": night mode OFF, daytime → evaluating`);
				await this.evaluateShutterRoom(room);
			} else if (now < rise) {
				// Night mode ended before sunrise – reschedule so a fresh sunrise timer fires and opens the shutters.
				this.logShutter(`Room "${this.labelFor(room.relId)}": night mode OFF before sunrise → rescheduling sunrise open`);
				this.scheduleShutterEvents(room).catch(e =>
					this.log.error(`Re-schedule after night mode off failed: ${(e as Error).message}`));
			} else {
				this.logShutter(`Room "${this.labelFor(room.relId)}": night mode OFF, after sunset → staying closed`);
			}
		}
	}

	/**
	 * Sets the shutter’s internal state and (if steuerungAktiviert) writes the position.
	 * Skips if the shutter is in manual mode.
	 */
	private async applyShutterState(rolladenRelId: string, newState: string, reason: string, forceOverrideManual = false): Promise<void> {
		// Check if this actuator is enabled
		if (this.rolladenPosCfg.get(rolladenRelId)?.aktiviert === false) {
			this.logShutter(`${this.labelFor(rolladenRelId)}: deaktiviert – ignoring [${reason}]`);
			return;
		}

		// Respect manual mode (unless forced, e.g. by night mode)
		if (!forceOverrideManual) {
			try {
				const cur = await this.getStateAsync(`${rolladenRelId}.state`);
				if (cur?.val === 'manual') {
					this.logShutter(`${this.labelFor(rolladenRelId)}: manual – ignoring [${reason}]`);
					return;
				}
			} catch { /* state object not yet created – proceed */ }
		}

		await this.setStateAsync(`${rolladenRelId}.state`, { val: newState, ack: true });
		this.logShutter(`${this.labelFor(rolladenRelId)}: state → ${newState} [${reason}]`);

		const pos = this.getShutterTargetPosition(rolladenRelId, newState);
		if (pos === null) return; // sunblock/heatblock handled later; manual = no-op

		if (this.config.steuerungAktiviert) {
			const dpId = this.rolladenRelIdToPosDp.get(rolladenRelId);
			if (dpId) {
				// Only send if current position deviates by more than 5% from target
				let shouldWrite = true;
				try {
					const curPos = await this.getForeignStateAsync(dpId);
					if (typeof curPos?.val === 'number' && Math.abs(curPos.val - pos) <= 5) {
						this.logShutter(`${this.labelFor(rolladenRelId)}: position already at ${curPos.val}% (target=${pos}%) – skipping write`);
						shouldWrite = false;
					}
				} catch { /* cannot read current position – write anyway */ }

				if (shouldWrite) {
					await this.setForeignStateAsync(dpId, { val: pos, ack: false });
					this.logShutter(`${this.labelFor(rolladenRelId)}: wrote position=${pos} → ${dpId}`);
				}
			}
		} else {
			this.logShutter(`${this.labelFor(rolladenRelId)}: steuerungAktiviert=false → would set position=${pos} [${reason}]`);
		}
	}

	/** Returns the target position (%) for a given shutter state. */
	private getShutterTargetPosition(relId: string, state: string): number | null {
		switch (state) {
			case 'open':     return 100;
			case 'closed':   return 0;
			case 'sunblock':  return this.rolladenPosCfg.get(relId)?.sunblock  ?? 20;
			case 'heatblock': return this.rolladenPosCfg.get(relId)?.heatblock ?? 0;
			default:          return null;
		}
	}

	// ---- Lux / temperature / direction-based shutter evaluation ----

	/**
	 * Returns true if the current sun azimuth is within ±30° of the room's window direction.
	 * azimuth: 0=N, 90=E, 180=S, 270=W (same convention as suncalc2 after +180 correction).
	 */
	private isSunInDirection(himmelsrichtung: number): boolean {
		const diff = ((this.currentSunAzimuth - himmelsrichtung + 360) % 360);
		return diff <= 30 || diff >= 330; // within ±30°
	}

	/**
	 * Evaluates the full shutter state machine for one room according to the logic table:
	 *
	 *  Nachtmodus=true              → no change (shutters were closed when NM activated)
	 *  !isDay                       → closed
	 *  !manual, !heatblock, lux<10k → open
	 *  !manual, lux>30k, hot, hitzeschutz          → heatblock  (priority over sunblock)
	 *  !manual, !heatblock, lux>30k, sunDir, blend → sunblock
	 *  !manual, !heatblock, lux<20k, !sunDir       → open
	 *  heatblock, !hot, sunDir, blend              → sunblock
	 *  heatblock, !hot, !sunDir                    → open
	 */
	private async evaluateShutterRoom(room: ShutterRoomEntry): Promise<void> {
		const isNightMode = !!(await this.getStateAsync('global.nightMode'))?.val;
		if (isNightMode) return; // night mode handler already closed shutters

		const now   = new Date();
		const times = SunCalc.getTimes(now, this.sunLat, this.sunLng);
		const rise  = new Date(times.sunrise.getTime() + room.aufgangOffset   * 60_000);
		const set   = new Date(times.sunset.getTime()  + room.untergangOffset * 60_000);
		const isDay = now >= rise && now < set;

		if (!isDay) {
			for (const rel of room.rolladenRelIds)
				await this.applyShutterState(rel, 'closed', 'eval: not daytime');
			return;
		}

		const lux           = this.currentShutterLux;
		const temp          = this.currentOutsideTemp;
		const sunInDir      = this.isSunInDirection(room.himmelsrichtung);
		const tempDiff      = temp !== null ? temp - room.solltemperatur : null;
		const isOutsideHot  = tempDiff !== null && tempDiff > 6;
		// Room sensor must also be > Wunschtemp+3° (if sensor configured); if no sensor, only outside decides
		const roomTempDiff  = room.currentRoomTemp !== null ? room.currentRoomTemp - room.solltemperatur : null;
		const isRoomHot     = room.roomTempDpId === null || (roomTempDiff !== null && roomTempDiff > 3);
		const isHot         = isOutsideHot && isRoomHot;

		for (const rel of room.rolladenRelIds) {
			let curState: string;
			try {
				const st = await this.getStateAsync(`${rel}.state`);
				curState = (typeof st?.val === 'string' ? st.val : null) ?? 'closed';
			} catch { curState = 'closed'; }

			if (curState === 'manual') continue;

			let target: string | null = null;

			if (curState !== 'heatblock') {
				// Rows 3–6: normal operation (not in heatblock)
				if (lux !== null && lux < 10_000) {
					target = 'open';                                                     // Row 3: low light → open
				} else if (lux !== null && lux > 30_000 && isHot && room.hitzeschutz) {
					target = 'heatblock';                                                // Row 6: hot+bright → heatblock
				} else if (lux !== null && lux > 30_000 && sunInDir && room.blendschutz) {
					target = 'sunblock';                                                 // Row 4: bright+sun in direction → sunblock
				} else if (lux !== null && lux < 20_000 && !sunInDir) {
					target = 'open';                                                     // Row 5: moderate light, sun not in direction → open
				}
				// else: hysteresis dead-zone → no change
			} else {
				// Rows 7–8: currently in heatblock – check if temperature dropped
				if (!isHot) {
					if (sunInDir && room.blendschutz) {
						target = 'sunblock'; // Row 8: still sun in direction → downgrade to sunblock
					} else {
						target = 'open';     // Row 7: sun not in direction → fully open
					}
				}
				// else: still hot → stay in heatblock
			}

			if (target !== null) {
				const reason =
					`eval: lux=${lux ?? '?'} sun=${Math.round(this.currentSunAzimuth)}° ` +
					`dir=${room.himmelsrichtung}°(${sunInDir ? 'in' : 'out'}) ` +
					`Δout=${tempDiff !== null ? tempDiff.toFixed(1) : '?'}° ` +
					`Δroom=${roomTempDiff !== null ? roomTempDiff.toFixed(1) : 'n/a'}°`;
				await this.applyShutterState(rel, target, reason);
			} else {
				this.logShutterExtended(
					`${this.labelFor(rel)}: no change (dead zone) [lux=${lux ?? '?'} ` +
					`sun=${Math.round(this.currentSunAzimuth)}° dir=${room.himmelsrichtung}°(${sunInDir ? 'in' : 'out'})]`,
				);
			}
		}
	}

	/** Calls evaluateShutterRoom for every configured shutter room. */
	private evaluateAllShutterRooms(): void {
		for (const room of this.shutterRooms.values()) {
			this.evaluateShutterRoom(room).catch(e =>
				this.log.error(`Shutter eval failed for "${this.labelFor(room.relId)}": ${(e as Error).message}`));
		}
	}

	/** Schedules a daily timer to reschedule all shutter events at midnight + 1 min. */
	private scheduleShutterDailyReset(): void {
		const now = new Date();
		const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 1, 0);
		const ms = midnight.getTime() - now.getTime();
		this.shutterDailyTimer = setTimeout(() => {
			this.shutterDailyTimer = null;
			this.logShutter('Daily reschedule of shutter timers.');
			Promise.all(Array.from(this.shutterRooms.values()).map(r => this.scheduleShutterEvents(r)))
				.then(() => this.scheduleShutterDailyReset())
				.catch(e => this.log.error(`Daily reschedule failed: ${(e as Error).message}`));
		}, ms);
	}

	/** Walks the tree and populates shutterRooms for rooms with rolladensteuerung=true. */
	private collectShutterRooms(nodes: FautTreeNode[], prefix: string): void {
		for (const node of nodes) {
			const relId = prefix ? `${prefix}.${node.id}` : node.id;
			const cfg   = (node.config as FautNodeConfig | undefined) ?? {};

			if (node.type === 'Raum' && cfg.rolladensteuerung) {
				const rolladenRelIds:   string[] = [];
				const rolladenPosDpIds: string[] = [];

				for (const child of node.children ?? []) {
					if (child.type === 'Rolladen') {
						const childRelId = `${relId}.${child.id}`;
						const childCfg   = (child.config as FautNodeConfig | undefined) ?? {};
						rolladenRelIds.push(childRelId);
						if (childCfg.dpPosition) {
							rolladenPosDpIds.push(childCfg.dpPosition);
							this.rolladenRelIdToPosDp.set(childRelId, childCfg.dpPosition);
							this.posDpToRolladen.set(childCfg.dpPosition, childRelId);
						}
						this.rolladenPosCfg.set(childRelId, {
							sunblock:  childCfg.sunblockPosition  ?? 20,
							heatblock: childCfg.heatblockPosition ?? 0,
							aktiviert: childCfg.aktiviert         ?? true,
						});
					}
				}

				this.shutterRooms.set(relId, {
					relId,
					himmelsrichtung:  cfg.himmelsrichtung         ?? 180,
					aufgangOffset:    cfg.rolladenAufgangOffset    ?? 0,
					untergangOffset:  cfg.rolladenUntergangOffset  ?? 0,
					blendschutz:      cfg.blendschutz              ?? false,
					hitzeschutz:      cfg.hitzeschutz              ?? false,
					solltemperatur:   cfg.solltemperatur           ?? 20,
					roomTempDpId:     this.findRoomTempDp(node.children ?? []),
					currentRoomTemp:  null,
					rolladenRelIds,
					rolladenPosDpIds,
					sunriseTimer: null,
					sunsetTimer:  null,
				});
			}

			if (node.children?.length) this.collectShutterRooms(node.children, relId);
		}
	}

	// ---- tree → objects sync ----

	/**
	 * Synchronises the tree stored in native.grundstueck to ioBroker folder objects.
	 * Creates missing folders, updates renamed ones, removes deleted ones.
	 */
	private async syncTreeToObjects(): Promise<void> {
		const tree: FautTreeNode[] = Array.isArray(this.config.grundstueck)
			? (this.config.grundstueck as FautTreeNode[])
			: [];

		// 1. Create / update all objects in the tree and collect expected IDs
		const expectedIds = new Set<string>();
		await this.processTreeNodes(tree, '', expectedIds);

		// 2. Remove objects that are no longer in the tree
		//    Only touch objects we own (marked via native.fautNodeId).
		const allObjects = await this.getAdapterObjectsAsync();
		const toDelete: string[] = [];

		for (const [fullId, obj] of Object.entries(allObjects)) {
			const native = obj.native as Record<string, unknown>;
			const isFautManaged =
				(obj.type === 'folder' && native?.fautNodeId) ||
				(obj.type === 'state'  && native?.fautStateKey);
			if (isFautManaged) {
				// Convert "faut.0.some.path" → "some.path"
				const relId = fullId.slice(this.namespace.length + 1);
				if (!expectedIds.has(relId)) {
					toDelete.push(relId);
				}
			}
		}

		// Delete deepest paths first so parents are not removed before children
		toDelete.sort((a, b) => b.length - a.length);
		for (const relId of toDelete) {
			this.log.info(`Removing obsolete object: ${this.namespace}.${relId}`);
			await this.delObjectAsync(relId);
		}

		this.log.info(`Tree sync complete: ${expectedIds.size} object(s) expected, ${toDelete.length} removed.`);
	}

	/**
	 * Recursively creates / updates folder objects for the given nodes.
	 */
	private async processTreeNodes(
		nodes: FautTreeNode[],
		prefix: string,
		expectedIds: Set<string>,
	): Promise<void> {
		for (const node of nodes) {
			const relId = prefix ? `${prefix}.${node.id}` : node.id;
			expectedIds.add(relId);

			await this.extendObjectAsync(relId, {
				type: 'folder',
				common: {
					name: node.label,
				},
				native: {
					fautNodeId: node.id,
					fautNodeType: node.type,
				},
			});

			// Create sensor states based on node config
			await this.syncSensorStates(node, relId, expectedIds);

			if (node.children?.length) {
				await this.processTreeNodes(node.children, relId, expectedIds);
			}
		}
	}

	/**
	 * Creates / updates ioBroker state objects for a sensor node.
	 * States are only created when the corresponding config field is populated.
	 */
	private async syncSensorStates(
		node: FautTreeNode,
		folderRelId: string,
		expectedIds: Set<string>,
	): Promise<void> {
		const cfg: FautNodeConfig = (node.config as FautNodeConfig | undefined) ?? {};
		const specs = this.getSensorStateSpecs(node.type, cfg);

		for (const spec of specs) {
			const stateRelId = `${folderRelId}.${spec.id}`;
			expectedIds.add(stateRelId);
			await this.extendObjectAsync(stateRelId, {
				type: 'state',
				common: {
					name: spec.name,
					type: spec.dataType,
					role: spec.role,
					read: true,
					write: spec.write ?? false,
					...(spec.unit   !== undefined ? { unit:   spec.unit   } : {}),
					...(spec.def    !== undefined ? { def:    spec.def    } : {}),
					...(spec.states !== undefined ? { states: spec.states } : {}),
				},
				native: {
					fautStateKey: spec.id,
					fautNodeId: node.id,
				},
			});
		}
	}

	private getSensorStateSpecs(
		nodeType: string,
		cfg: FautNodeConfig,
	): Array<{ id: string; name: string; dataType: ioBroker.CommonType; role: string; unit?: string; def?: boolean | number | string; states?: Record<string, string>; write?: boolean }> {
		type Spec = { id: string; name: string; dataType: ioBroker.CommonType; role: string; unit?: string; def?: boolean | number | string; states?: Record<string, string>; write?: boolean };
		const specs: Spec[] = [];

		// Type-specific value states
		if (nodeType === 'Temperatur') {
			if (cfg.dpTemperatur)       specs.push({ id: 'temperature', name: 'Temperature', dataType: 'number',  role: 'value.temperature', unit: '°C' });
			if (cfg.dpLuftfeuchtigkeit) specs.push({ id: 'humidity',    name: 'Humidity',    dataType: 'number',  role: 'value.humidity',    unit: '%' });
		} else if (nodeType === 'Helligkeit') {
			if (cfg.dpLux)              specs.push({ id: 'lux',         name: 'Lux',         dataType: 'number',  role: 'value.brightness',  unit: 'lux' });
		} else if (nodeType === 'Bewegung') {
			if (cfg.dpBewegung)         specs.push({ id: 'motion',      name: 'Motion',      dataType: 'boolean', role: 'sensor.motion',     def: false });
		} else if (nodeType === 'Fenster/Tür') {
			if (cfg.dpFensterTuer)      specs.push({ id: 'open',        name: 'Open',        dataType: 'boolean', role: 'sensor.door',       def: false });
		} else if (nodeType === 'Sonne') {
			specs.push({ id: 'sunrise',   name: 'Sunrise',   dataType: 'string', role: 'text' });
			specs.push({ id: 'sunset',    name: 'Sunset',    dataType: 'string', role: 'text' });
			specs.push({ id: 'elevation', name: 'Elevation', dataType: 'number', role: 'value', unit: '°' });
			specs.push({ id: 'azimuth',   name: 'Azimuth',   dataType: 'number', role: 'value', unit: '°' });
		} else if (nodeType === 'Rolladen') {
			specs.push({ id: 'state',       name: 'State',        dataType: 'string',  role: 'text',        def: 'open', write: true,
				states: { open: 'Open', closed: 'Closed', sunblock: 'Sunblock', heatblock: 'Heatblock', manual: 'Manual' },
			});
			specs.push({ id: 'resetManual', name: 'Reset Manual', dataType: 'boolean', role: 'button.play', def: false,  write: true });
			if (cfg.dpPosition) specs.push({ id: 'position', name: 'Position', dataType: 'number', role: 'level.blind', unit: '%', def: 0, write: true });
		} else if (nodeType === 'Raum') {
			if (cfg.bewegungserkennung) {
				specs.push({
					id: 'presence', name: 'Presence', dataType: 'string', role: 'text', def: 'absent',
					states: { absent: 'Absent', cooldown: 'Cooldown', present: 'Present' },
				});
			}
			if (cfg.dunkelheitserkennung) {
				specs.push({
					id: 'dark', name: 'Dark', dataType: 'string', role: 'text', def: 'bright',
					states: { dark: 'Dark', twilight: 'Twilight', bright: 'Bright' },
				});
			}
			if (cfg.lichtsteuerung) {
				specs.push({ id: 'lightOn', name: 'Light On', dataType: 'boolean', role: 'switch.light', def: false });
				// scene: writable state with all available scenes as enum
				// 'Manuell' is a reserved hidden scene; not shown in admin but valid as a state value
				const sceneNames = ['Tag', 'Nacht', 'Manuell', ...((cfg.lampeSzenen as string[] | undefined) ?? [])];
				specs.push({
					id: 'scene', name: 'Scene', dataType: 'string', role: 'text', def: 'Tag',
					states: Object.fromEntries(sceneNames.map(s => [s, s])) as Record<string, string>,
					write: true,
				});
			}
			if (cfg.klimasteuerung) {
				specs.push({ id: 'climate.setpoint', name: 'Climate Setpoint', dataType: 'number', role: 'value.temperature', unit: '\u00b0C', def: cfg.solltemperatur ?? 20 });
				specs.push({
					id: 'climate.mode', name: 'Climate Mode', dataType: 'string', role: 'text', def: 'normal',
					states: { normal: 'Normal', night: 'Night', absent: 'Absent', off: 'Off' },
				});
			}
		} else if (nodeType === 'Heizung') {
			specs.push({ id: 'heizperiode',      name: 'Heizperiode',      dataType: 'boolean', role: 'switch', def: cfg.heizperiodeAktiv     ?? false, write: true });
			specs.push({ id: 'energiesparmodus', name: 'Energiesparmodus', dataType: 'boolean', role: 'switch', def: cfg.energiesparmodusAktiv ?? false, write: true });
		}

		// Common sensor states (all leaf sensor types, not Raum or Sonne)
		if (nodeType !== 'Raum' && nodeType !== 'Sonne') {
			if (cfg.batteriebetrieben) specs.push({ id: 'lowBat',  name: 'Low Battery',  dataType: 'boolean', role: 'indicator.lowbat',  def: false });
			if (cfg.erreichbarkeit)    specs.push({ id: 'unreach', name: 'Unreachable',  dataType: 'boolean', role: 'indicator.unreach', def: false });
		}

		return specs;
	}

	// ---- lifecycle ----

	/**
	 * Is called when adapter shuts down – callback must be called under any circumstances!
	 */
	private onUnload(callback: () => void): void {
		try {
			for (const timer of this.cooldownTimers.values()) clearTimeout(timer);
			for (const timer of this.unreachTimers.values()) clearTimeout(timer);
			if (this.sunIntervalTimer !== null) clearInterval(this.sunIntervalTimer);
			if (this.shutterDailyTimer !== null) clearTimeout(this.shutterDailyTimer);
			if (this.consumptionMidnightTimer !== null) clearTimeout(this.consumptionMidnightTimer);
			for (const room of this.shutterRooms.values()) {
				if (room.sunriseTimer !== null) clearTimeout(room.sunriseTimer);
				if (room.sunsetTimer  !== null) clearTimeout(room.sunsetTimer);
			}
			callback();
		} catch (error) {
			this.log.error(`Error during unloading: ${(error as Error).message}`);
			callback();
		}
	}

	/**
	 * Is called if a subscribed state changes.
	 */
	private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
		if (!state) return;

		// Mirror sensor value to own state
		const ownRelId = this.dpToStateMap.get(id);
		if (ownRelId) {
			this.setStateAsync(ownRelId, { val: state.val, ack: true }).catch(e => {
				this.log.error(`Failed to mirror ${id} → ${ownRelId}: ${(e as Error).message}`);
			});
		}

		// Room presence: react to motion changes
		if (this.dpToRoomsMotion.has(id)) {
			this.handleMotionChange(id, state.val === true).catch(e => {
				this.log.error(`handleMotionChange error for ${id}: ${(e as Error).message}`);
			});
		}

		// Room darkness: react to lux changes
		if (this.dpToRoomsLux.has(id)) {
			const lux = typeof state.val === 'number' ? state.val : null;
			if (lux !== null) {
				this.handleLuxChange(id, lux).catch(e => {
					this.log.error(`handleLuxChange error for ${id}: ${(e as Error).message}`);
				});
			}
		}

		// LowBat: battery DP changed
		if (this.dpToLowBatMap.has(id)) {
			const lowBatRelId = this.dpToLowBatMap.get(id)!;
			const cur    = this.lowBatValues.get(lowBatRelId) ?? false;
			const newVal = this.computeLowBat(state.val, cur);
			this.lowBatValues.set(lowBatRelId, newVal);
			this.setStateAsync(lowBatRelId, { val: newVal, ack: true }).catch(e => {
				this.log.error(`LowBat update failed for ${lowBatRelId}: ${(e as Error).message}`);
			});
		}

		// Unreach: trigger DP updated → sensor is reachable again; restart timer
		if (this.dpToUnreachMap.has(id)) {
			const unreachRelId = this.dpToUnreachMap.get(id)!;
			const existing = this.unreachTimers.get(unreachRelId);
			if (existing !== undefined) clearTimeout(existing);
			this.setStateAsync(unreachRelId, { val: false, ack: true }).catch(e => {
				this.log.error(`Unreach clear failed for ${unreachRelId}: ${(e as Error).message}`);
			});
			this.startUnreachTimer(unreachRelId, UNREACH_TIMEOUT_MS);
		}

		// Extended shutter logging: only DPs relevant to shutter control (position + night mode)
		const isShutterRelevantDp = this.shutterPositionDpIds.has(id) || (!!this.nightModeDpId && id === this.nightModeDpId);
		if (isShutterRelevantDp) {
			const last = this.dpLastExtValues.get(id);
			if (last !== state.val) {
				this.dpLastExtValues.set(id, state.val);
				// Log source adapter for position changes so manual-mode rules can be built
				const fromAdapter = state.from ?? 'unknown';
				if (this.shutterPositionDpIds.has(id)) {
					this.logShutterExtended(`Position DP changed: ${id} = ${JSON.stringify(state.val)} [from: ${fromAdapter}]`);
					// Auto-manual: if the change came from a whitelisted adapter, switch to manual
					if (this.manualTriggerAdapters.has(fromAdapter)) {
						const rolladenRelId = this.posDpToRolladen.get(id);
						if (rolladenRelId) {
							this.logShutter(`${this.labelFor(rolladenRelId)}: position changed by ${fromAdapter} → switching to manual`);
							this.setStateAsync(`${rolladenRelId}.state`, { val: 'manual', ack: true }).catch(e =>
								this.log.error(`Auto-manual failed for ${rolladenRelId}: ${(e as Error).message}`));
						}
					}
				} else {
					this.logShutterExtended(`DP changed: ${id} = ${JSON.stringify(state.val)} [from: ${fromAdapter}]`);
				}
			}
		}

		// Night mode: external DP changed → mirror to own state
		if (this.nightModeDpId && id === this.nightModeDpId) {
			this.setStateAsync('global.nightMode', { val: !!state.val, ack: true }).catch(e => {
				this.log.error(`Night mode mirror failed: ${(e as Error).message}`);
			});
			return;
		}

		// Night mode: own state written (ack=false) → write-through to external DP
		if (id === `${this.namespace}.global.nightMode` && !state.ack && this.nightModeDpId) {
			this.setForeignStateAsync(this.nightModeDpId, { val: !!state.val, ack: false }).catch(e => {
				this.log.error(`Night mode write-through failed: ${(e as Error).message}`);
			});
		}

		// Rolladen: resetManual button → exit manual mode and re-evaluate shutter state
		if (!state.ack && id.startsWith(`${this.namespace}.`) && id.endsWith('.resetManual') && !!state.val) {
			const rolladenRelId = id.slice(this.namespace.length + 1).replace(/\.resetManual$/, '');
			const roomRelId     = this.rolladenToRoom.get(rolladenRelId);
			const room          = roomRelId ? this.shutterRooms.get(roomRelId) : undefined;
			if (room) {
				this.logShutter(`${this.labelFor(rolladenRelId)}: resetManual → exiting manual mode`);
				(async () => {
					try {
						// Clear manual state (temporary; evaluation will overwrite immediately)
						await this.setStateAsync(`${rolladenRelId}.state`, { val: 'open', ack: true });
						// Acknowledge the button
						await this.setStateAsync(`${rolladenRelId}.resetManual`, { val: false, ack: true });
						// Re-evaluate → sets correct target (open/closed/sunblock/heatblock)
						await this.evaluateShutterRoom(room);
					} catch (e) {
						this.log.error(`resetManual failed for ${this.labelFor(rolladenRelId)}: ${(e as Error).message}`);
					}
				})();
			}
		}

		// Night mode: react for shutter control on confirmed state (ack=true, or no ext DP)
		if (id === `${this.namespace}.global.nightMode` && (state.ack || !this.nightModeDpId)) {
			this.handleNightModeForShutters(!!state.val).catch(e => {
				this.log.error(`Shutter night mode reaction failed: ${(e as Error).message}`);
			});
			// Also update climate setpoints when night mode changes
			if (this.climateRooms.size > 0) {
				this.updateAllClimateSetpoints().catch(e => {
					this.log.error(`Climate night mode update failed: ${(e as Error).message}`);
				});
			}
			// Light control: update scene for all lichtsteuerung rooms
			if (this.lightRoomIds.size > 0) {
				this.handleNightModeForLights(!!state.val).catch(e => {
					this.log.error(`Light night mode update failed: ${(e as Error).message}`);
				});
			}
		}

		// Shutter: global lux changed → update cache and re-evaluate all shutter rooms
		if (this.shutterGlobalLuxDpId && id === this.shutterGlobalLuxDpId && typeof state.val === 'number') {
			this.currentShutterLux = state.val;
			if (this.shutterRooms.size > 0) this.evaluateAllShutterRooms();
		}

		// Shutter: outside temperature changed → update cache and re-evaluate all shutter rooms
		if (this.shutterAussenTempDpId && id === this.shutterAussenTempDpId && typeof state.val === 'number') {
			this.currentOutsideTemp = state.val;
			if (this.shutterRooms.size > 0) this.evaluateAllShutterRooms();
		}

		// Shutter: room temperature changed → update cache and re-evaluate that room
		if (this.shutterRoomTempDpToRoomId.has(id) && typeof state.val === 'number') {
			const roomRelId = this.shutterRoomTempDpToRoomId.get(id)!;
			const room      = this.shutterRooms.get(roomRelId);
			if (room) {
				room.currentRoomTemp = state.val;
				this.evaluateShutterRoom(room).catch(e =>
					this.log.error(`Shutter room-temp eval failed for "${this.labelFor(roomRelId)}": ${(e as Error).message}`));
			}
		}

		// Consumption tracking: source DP changed (foreign state)
		if (this.consumptionDpToTrackers.has(id)) {
			this.handleConsumptionDpChange(id, state.val);
		}

		// Consumption tracking: user wrote new anchors JSON (own state, ack=false)
		if (!state.ack && id.startsWith(`${this.namespace}.global.consumption.`) && id.endsWith('._anchors')) {
			this.handleConsumptionAnchorWrite(id.slice(this.namespace.length + 1), state.val).catch(e =>
				this.log.error(`Consumption anchor write failed: ${(e as Error).message}`));
			return;
		}

		// Energy: Wechselrichter power or Netzbezug changed → recalc Hausverbrauch
		if (this.energieVerbrauchDpId === id || this.wechselrichterPowerDps.has(id)) {			this.energiePowerCache.set(id, Number(state.val) || 0);
			this.recalcHausverbrauch().catch(e => {
				this.log.error(`Hausverbrauch recalc failed: ${(e as Error).message}`);
			});
		}

		// Energy: Batteriespeicher Wh changed → update cache + recalc batteryreserve
		if (this.batterieDps.has(id)) {
			this.batterieWhCache.set(id, Number(state.val) || 0);
			this.recalcBatteryReserve().catch(e => {
				this.log.error(`BatteryReserve recalc failed: ${(e as Error).message}`);
			});
		}

		// Climate: Heizung state write-through (ack=false) and setpoint update (ack=true)
		if (this.heizungRelId) {			const hpId = `${this.namespace}.${this.heizungRelId}.heizperiode`;
			const esId = `${this.namespace}.${this.heizungRelId}.energiesparmodus`;
			if (id === hpId || id === esId) {
				if (!state.ack) {
					this.setStateAsync(id.slice(this.namespace.length + 1), { val: !!state.val, ack: true }).catch(e => {
						this.log.error(`Heizung write-through failed: ${(e as Error).message}`);
					});
				} else {
					this.updateAllClimateSetpoints().catch(e => {
						this.log.error(`Climate heizung update failed: ${(e as Error).message}`);
					});
				}
			}
		}

		// Climate: room presence changed → update that room's setpoint
		if (state.ack && this.climatePresenceIds.has(id)) {
			const roomRelId = id.slice(this.namespace.length + 1).replace(/\.presence$/, '');
			const room = this.climateRooms.get(roomRelId);
			if (room) {
				this.updateClimateSetpoint(room).catch(e => {
					this.log.error(`Climate presence update failed: ${(e as Error).message}`);
				});
			}
		}

		// Light control: user wrote to room.scene (ack=false) → ack + recompute full light state
		// Note: presence/dark → lightOn is handled directly in handleMotionChange/handleLuxChange, not here.
		if (!state.ack && id.startsWith(`${this.namespace}.`) && id.endsWith('.scene')) {
			const roomRelId = id.slice(this.namespace.length + 1).replace(/\.scene$/, '');
			if (this.lightRoomIds.has(roomRelId) && typeof state.val === 'string') {
				const scene = state.val;
				(async () => {
					try {
						// Ack the new scene first so updateLightOn reads it back correctly
						await this.setStateAsync(`${roomRelId}.scene`, { val: scene, ack: true });
						this.logLight(`${this.labelFor(roomRelId)}: scene set to "${scene}" → recomputing light state`);
						// Full recompute: reads presence+dark+scene, writes lightOn, applies lamps
						await this.updateLightOn(roomRelId);
					} catch (e) {
						this.log.error(`Scene apply failed for ${this.labelFor(roomRelId)}: ${(e as Error).message}`);
					}
				})();
			}
		}
	}
}

if (require.main !== module) {
	// Export the constructor in compact mode
	module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new Faut(options);
} else {
	// otherwise start the instance directly
	(() => new Faut())();
}
