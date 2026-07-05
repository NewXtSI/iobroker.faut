/*
 * Created with @iobroker/create-adapter
 */

import * as utils from '@iobroker/adapter-core';
import * as SunCalc from 'suncalc2';
import { type FautNodeConfig, type FautTreeNode } from './lib/treeTypes';

/** Runtime configuration for a room’s presence/dark sensor logic. */
interface RoomEntry {
	relId:        string;
	cooldownMs:   number;
	dunkelgrenze: number;
	motionDpIds:  string[];
	luxDpIds:     string[];
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

	public constructor(options: Partial<utils.AdapterOptions> = {}) {
		super({
			...options,
			name: 'faut',
		});
		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	private async onReady(): Promise<void> {
		this.log.info('Faut adapter started');
		this.setState('info.connection', { val: true, ack: true });
		await this.syncTreeToObjects();

		if (!this.config.aktiviert) {
			this.log.info('Adapter inactive (aktiviert = false) – no sensor subscriptions.');
			return;
		}

		await this.setupSensorSubscriptions();
		await this.setupSunNodes();
	}

	// ---- sensor subscriptions ----

	/**
	 * Subscribes to all configured source data points and reads their current values.
	 * Only called when aktiviert = true.
	 */
	private async setupSensorSubscriptions(): Promise<void> {
		const tree: FautTreeNode[] = Array.isArray(this.config.grundstueck)
			? (this.config.grundstueck as FautTreeNode[])
			: [];

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

			if (node.type === 'Raum' && (cfg.bewegungserkennung || cfg.dunkelheitserkennung)) {
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
						cooldownMs:   (cfg.bewegungsCooldown ?? 3) * 60_000,
						dunkelgrenze: cfg.dunkelgrenze ?? 150,
						motionDpIds,
						luxDpIds,
					};
					this.roomEntries.set(relId, entry);

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
			// If in "cooldown" from a previous run but no timer is running → reset to absent
			if (anyActive) {
				await this.setStateAsync(`${room.relId}.presence`, { val: 'present', ack: true });
			} else {
				await this.setStateAsync(`${room.relId}.presence`, { val: 'absent',  ack: true });
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
				await this.setStateAsync(`${roomRelId}.presence`, { val: 'present', ack: true });
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

					await this.setStateAsync(`${roomRelId}.presence`, { val: 'cooldown', ack: true });
					const timer = setTimeout(() => {
						this.cooldownTimers.delete(roomRelId);
						this.setStateAsync(`${roomRelId}.presence`, { val: 'absent', ack: true }).catch(e => {
							this.log.error(`Cooldown expire failed for ${roomRelId}: ${(e as Error).message}`);
						});
					}, room.cooldownMs);
					this.cooldownTimers.set(roomRelId, timer);
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
		}
	}

	/** Computes dark/twilight/bright with hysteresis = threshold / 10. */
	private computeDarkState(lux: number, threshold: number): 'dark' | 'twilight' | 'bright' {
		const h = threshold / 10;
		if (lux < threshold - h) return 'dark';
		if (lux > threshold + h) return 'bright';
		return 'twilight';
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

		// Read geo position from ioBroker system config
		try {
			const sysCfg = await this.getForeignObjectAsync('system.config');
			const common = (sysCfg?.common ?? {}) as Record<string, unknown>;
			this.sunLat = typeof common.latitude  === 'number' ? common.latitude  : 0;
			this.sunLng = typeof common.longitude === 'number' ? common.longitude : 0;
		} catch (e) {
			this.log.warn(`Could not read system.config for geo position: ${(e as Error).message}`);
		}

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

		for (const relId of this.sunNodeRelIds) {
			await this.setStateAsync(`${relId}.sunrise`,   { val: sunriseStr, ack: true });
			await this.setStateAsync(`${relId}.sunset`,    { val: sunsetStr,  ack: true });
			await this.setStateAsync(`${relId}.elevation`, { val: elevation,  ack: true });
			await this.setStateAsync(`${relId}.azimuth`,   { val: azimuth,    ack: true });
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
					write: false,
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
	): Array<{ id: string; name: string; dataType: ioBroker.CommonType; role: string; unit?: string; def?: boolean | number | string; states?: Record<string, string> }> {
		type Spec = { id: string; name: string; dataType: ioBroker.CommonType; role: string; unit?: string; def?: boolean | number | string; states?: Record<string, string> };
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
			// Clear all running presence cooldown timers
			for (const timer of this.cooldownTimers.values()) clearTimeout(timer);
			// Clear all running unreach timers
			for (const timer of this.unreachTimers.values()) clearTimeout(timer);
			// Clear sun interval
			if (this.sunIntervalTimer !== null) clearInterval(this.sunIntervalTimer);
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
	}
}

if (require.main !== module) {
	// Export the constructor in compact mode
	module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new Faut(options);
} else {
	// otherwise start the instance directly
	(() => new Faut())();
}
