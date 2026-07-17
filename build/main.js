"use strict";
/*
 * Created with @iobroker/create-adapter
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const utils = __importStar(require("@iobroker/adapter-core"));
const SunCalc = __importStar(require("suncalc2"));
const i18n_1 = require("./i18n");
const consumptionTracker_1 = require("./lib/consumptionTracker");
/** After this many ms without a trigger-DP update the sensor is considered unreachable. */
const UNREACH_TIMEOUT_MS = 3_600_000; // 60 minutes
/** Default timeout for messages in seconds. */
const MSG_DEFAULT_TIMEOUT_S = 600;
class Faut extends utils.Adapter {
    /** Maps a foreign state ID (source DP) to the relative ID of our own state. */
    dpToStateMap = new Map();
    /** Maps a motion DP ID to the room relIds that monitor it. */
    dpToRoomsMotion = new Map();
    /** Maps a lux DP ID to the room relIds that monitor it. */
    dpToRoomsLux = new Map();
    /** Runtime entries for rooms with active presence/dark logic. */
    roomEntries = new Map();
    /** Room relIds with lichtsteuerung=true (for lightOn trigger in onStateChange). */
    lightRoomIds = new Set();
    /** Tracks previous { lightOn, scene } per room to detect real changes (for retrigger=false lamps). */
    roomLightState = new Map();
    /** Maps roomRelId → all Lampe entries in that room. */
    roomToLamps = new Map();
    /** Active cooldown timers, keyed by room relId. */
    cooldownTimers = new Map();
    /** Maps a battery DP ID to the own lowBat state relId. */
    dpToLowBatMap = new Map();
    /** Tracks the current lowBat boolean per lowBat-state relId (hysteresis). */
    lowBatValues = new Map();
    /** Maps a trigger DP ID to the own unreach state relId. */
    dpToUnreachMap = new Map();
    /** Tracks the current unreach boolean per unreach-state relId (for change detection). */
    unreachValues = new Map();
    /** Active unreach timers, keyed by own unreach-state relId. */
    unreachTimers = new Map();
    /** RelIds of all Sonne nodes (for sun state updates). */
    sunNodeRelIds = [];
    /** 5-minute interval timer for sun position updates. */
    sunIntervalTimer = null;
    /** Geo position read from system.config. */
    sunLat = 0;
    sunLng = 0;
    /** External DP for night mode (from config.dpNachtmodus). */
    nightModeDpId = '';
    /** Rooms with active shutter control, keyed by room relId. */
    shutterRooms = new Map();
    /** Position DPs of all configured Rolladen (for extended logging). */
    shutterPositionDpIds = new Set();
    /** Maps Rolladen own relId → external position DP ID. */
    rolladenRelIdToPosDp = new Map();
    /** Maps Rolladen own relId → { sunblock%, heatblock%, aktiviert }. */
    rolladenPosCfg = new Map();
    /** Daily reschedule timer for shutter sunrise/sunset events. */
    shutterDailyTimer = null;
    /** Current sun azimuth (0=N, 90=E, 180=S, 270=W) – updated every 5 min by updateSunStates(). */
    currentSunAzimuth = 0;
    /** Current outside temperature (°C) from aussentemperatursensor – null if unavailable. */
    currentOutsideTemp = null;
    /** Current global lux value used for shutter decisions – null if unavailable. */
    currentShutterLux = null;
    /** Foreign DP ID of the global lux sensor subscribed for shutter control. */
    shutterGlobalLuxDpId = '';
    /** Foreign DP ID of the outside temperature sensor for shutter control. */
    shutterAussenTempDpId = '';
    /** Maps room-temperature foreign DP IDs → room relId (for heatblock evaluation). */
    shutterRoomTempDpToRoomId = new Map();
    /** Maps rolladen own relId → room relId (for resetManual and other lookups). */
    rolladenToRoom = new Map();
    /** Reverse map: external position DP → rolladen own relId. */
    posDpToRolladen = new Map();
    /** Adapter instance IDs whose position writes automatically switch a rolladen to manual mode. */
    manualTriggerAdapters = new Set([
        'system.adapter.web.0',
        'system.adapter.matter.0',
    ]);
    /** Last seen values of foreign DPs – used to suppress duplicate extended-log entries. */
    dpLastExtValues = new Map();
    /** Maps each node relId to a human-readable label path (e.g. "Gebäude.EG.Arbeitszimmer"). */
    relIdToLabel = new Map();
    /** Climate control: rooms with klimasteuerung=true. */
    climateRooms = new Map();
    /** Climate control: relId of the first Heizung node found. */
    heizungRelId = null;
    /** Climate control: full own-state IDs of presence states in climate rooms. */
    climatePresenceIds = new Set();
    /** Energy management: full foreign DP ID of Stromzähler current consumption. */
    energieVerbrauchDpId = null;
    /** Energy management: maps foreign Wechselrichter power DP ID → node relId (for labelling). */
    wechselrichterPowerDps = new Map();
    /** Energy management: maps foreign Batteriespeicher Wh DP ID → node relId. */
    batterieDps = new Map();
    /** Energy management: maps foreign Solarpanel power DP ID → node relId. */
    solarpanelDps = new Map();
    /** Energy management: last seen power value per foreign DP (W). */
    energiePowerCache = new Map();
    /** Energy management: last seen Wh value per Batteriespeicher DP. */
    batterieWhCache = new Map();
    /** Energy management: last seen W value per Solarpanel DP. */
    solarpanelWCache = new Map();
    /** Consumption history: tracker configs keyed by tracker ID. */
    consumptionConfigs = new Map();
    /** Consumption history: current (summed) meter reading per tracker. */
    consumptionReadings = new Map();
    /** Consumption history: last raw value per source DP (for multi-DP sum). */
    consumptionSrcLast = new Map();
    /** Consumption history: foreign DP ID → tracker IDs that use it. */
    consumptionDpToTrackers = new Map();
    /** Consumption history: current anchor set per tracker. */
    consumptionAnchors = new Map();
    /** Consumption history: midnight rollover timer. */
    consumptionMidnightTimer = null;
    /** In-memory message list (persisted to global.messages as JSON). */
    messages = [];
    /** Periodic timer for checking message expiry. */
    messagesCheckTimer = null;
    constructor(options = {}) {
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
    async migrateConfig() {
        const defaults = {
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
        const patch = {};
        for (const [key, def] of Object.entries(defaults)) {
            if (this.config[key] === undefined) {
                patch[key] = def;
                this.config[key] = def;
            }
        }
        if (Object.keys(patch).length > 0) {
            this.log.info(`Migrating config: adding missing fields: ${Object.keys(patch).join(', ')}`);
            await this.extendForeignObjectAsync(`system.adapter.${this.namespace}`, { native: patch });
        }
    }
    async onReady() {
        this.log.info('Faut adapter started');
        // Initialize i18n with system language
        const sysObj = await this.getForeignObjectAsync('system.config');
        const systemLang = sysObj?.common?.language;
        this.log.info(`System language detected: "${systemLang}"`);
        i18n_1.i18n.init(systemLang);
        this.setState('info.connection', { val: true, ack: true });
        await this.migrateConfig();
        const flags = [
            'logShuttercontrol', 'logShuttercontrolExtended',
            'logAdmin', 'logAlexa', 'logPresence',
            'logClimate', 'logClimateExtended',
            'logLight', 'logLightExtended',
            'logEnergy', 'logEnergyExtended',
        ];
        const active = flags.filter(f => !!this.config[f]);
        const inactive = flags.filter(f => !this.config[f]);
        this.log.info(`Log flags ON : ${active.length ? active.join(', ') : '(none)'}`);
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
    async setupGlobalStates() {
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
                name: 'Night Mode',
                type: 'boolean',
                role: 'switch',
                read: true,
                write: true,
                def: false,
            },
            native: {},
        });
        // Subscribe to own state so write-through can be triggered
        this.subscribeStates('global.nightMode');
        // Create hausverbrauch state
        await this.extendObjectAsync('global.hausverbrauch', {
            type: 'state',
            common: {
                name: 'Hausverbrauch',
                type: 'number',
                role: 'value.power',
                unit: 'W',
                read: true,
                write: false,
                def: 0,
            },
            native: {},
        });
        // Create batteryreserve state (sum of all Batteriespeicher in Wh)
        await this.extendObjectAsync('global.batteryreserve', {
            type: 'state',
            common: {
                name: 'Battery Reserve',
                type: 'number',
                role: 'value.energy',
                unit: 'Wh',
                read: true,
                write: false,
                def: 0,
            },
            native: {},
        });
        // Create solarpower state (sum of all Solarpanel power in W)
        await this.extendObjectAsync('global.solarpower', {
            type: 'state',
            common: {
                name: 'Solar Power',
                type: 'number',
                role: 'value.power',
                unit: 'W',
                read: true,
                write: false,
                def: 0,
            },
            native: {},
        });
        // Create messages state (JSON array of FautMessage, read+write for VIS)
        await this.extendObjectAsync('global.messages', {
            type: 'state',
            common: {
                name: 'Messages',
                type: 'string',
                role: 'json',
                read: true,
                write: true,
                def: '[]',
            },
            native: {},
        });
        this.subscribeStates('global.messages');
        // Load persisted messages on startup
        try {
            const msgSt = await this.getStateAsync('global.messages');
            if (typeof msgSt?.val === 'string' && msgSt.val !== '[]') {
                this.messages = JSON.parse(msgSt.val);
            }
        }
        catch (e) {
            this.log.warn(`Failed to load persisted messages: ${e.message}`);
        }
        const dpId = this.config.dpNachtmodus ?? '';
        this.nightModeDpId = dpId;
        if (!dpId)
            return;
        // Subscribe external DP and mirror initial value
        this.subscribeForeignStates(dpId);
        try {
            const state = await this.getForeignStateAsync(dpId);
            if (state?.val !== null && state?.val !== undefined) {
                await this.setStateAsync('global.nightMode', { val: !!state.val, ack: true });
            }
        }
        catch (e) {
            this.log.warn(`Initial night mode read failed for ${dpId}: ${e.message}`);
        }
    }
    /**
     * Subscribes to all configured source data points and reads their current values.
     * Only called when aktiviert = true.
     */
    async setupSensorSubscriptions() {
        const tree = Array.isArray(this.config.grundstueck)
            ? this.config.grundstueck
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
            }
            catch (e) {
                this.log.warn(`Initial read failed for ${dpId}: ${e.message}`);
            }
        }
        // Battery + unreach subscriptions and initial values
        await this.setupBatteryAndUnreach();
        // Room presence / darkness logic
        await this.setupRoomLogic(tree);
    }
    // ---- battery + unreach ----
    /** Walks the tree and fills dpToLowBatMap / dpToUnreachMap. */
    collectBatteryAndUnreachMappings(nodes, prefix) {
        for (const node of nodes) {
            const relId = prefix ? `${prefix}.${node.label}` : node.label;
            const cfg = node.config ?? {};
            if (cfg.batteriebetrieben && cfg.dpBatterie) {
                this.dpToLowBatMap.set(cfg.dpBatterie, `${relId}.lowBat`);
            }
            if (cfg.erreichbarkeit && cfg.dpErreichbarkeit) {
                this.dpToUnreachMap.set(cfg.dpErreichbarkeit, `${relId}.unreach`);
            }
            if (node.children?.length)
                this.collectBatteryAndUnreachMappings(node.children, relId);
        }
    }
    /** Subscribes to battery/trigger DPs and sets initial lowBat/unreach states. */
    async setupBatteryAndUnreach() {
        this.log.info(`Battery/Unreach setup: lowBat=${this.dpToLowBatMap.size}, unreach=${this.dpToUnreachMap.size}`);
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
            }
            catch (e) {
                this.log.warn(`Initial battery read failed for ${dpId}: ${e.message}`);
            }
        }
        // ---- Unreach ----
        for (const [dpId, unreachRelId] of this.dpToUnreachMap) {
            this.subscribeForeignStates(dpId);
            try {
                const state = await this.getForeignStateAsync(dpId);
                if (!state) {
                    this.log.info(`Unreach (startup): ${unreachRelId} – no state found for trigger DP ${dpId}`);
                    await this.setStateAsync(unreachRelId, { val: true, ack: true });
                    this.unreachValues.set(unreachRelId, true);
                }
                else {
                    const elapsed = Date.now() - (state.ts ?? 0);
                    if (elapsed >= UNREACH_TIMEOUT_MS) {
                        this.log.info(`Unreach (startup): ${unreachRelId} – last update ${(elapsed / 60_000).toFixed(0)} min ago (timeout=${(UNREACH_TIMEOUT_MS / 60_000).toFixed(0)} min)`);
                        await this.setStateAsync(unreachRelId, { val: true, ack: true });
                        this.unreachValues.set(unreachRelId, true);
                        // Post message on startup if already unreachable
                        const baseRelId = unreachRelId.endsWith('.unreach') ? unreachRelId.slice(0, -8) : unreachRelId;
                        const label = this.labelFor(baseRelId);
                        this.postMessage(`unreach.${unreachRelId}`, 'warning', `${label}: ${i18n_1.i18n.t('Unreachable')}`, true, 0);
                    }
                    else {
                        await this.setStateAsync(unreachRelId, { val: false, ack: true });
                        this.unreachValues.set(unreachRelId, false);
                        this.startUnreachTimer(unreachRelId, UNREACH_TIMEOUT_MS - elapsed);
                    }
                }
            }
            catch (e) {
                this.log.warn(`Initial unreach check failed for ${dpId}: ${e.message}`);
            }
        }
    }
    /**
     * Boolean DP → use directly.
     * Numeric DP (battery %): true below 20%, false above 21%, unchanged in 20–21% zone.
     */
    computeLowBat(val, current) {
        if (typeof val === 'boolean')
            return val;
        if (typeof val === 'number') {
            if (val < 20)
                return true;
            if (val > 21)
                return false;
            return current; // hysteresis zone
        }
        return current;
    }
    /** Starts (or restarts) an unreach timer for the given own-state relId. */
    startUnreachTimer(unreachRelId, delayMs) {
        const timer = setTimeout(() => {
            this.unreachTimers.delete(unreachRelId);
            this.setStateAsync(unreachRelId, { val: true, ack: true }).catch(e => {
                this.log.error(`Unreach timer failed for ${unreachRelId}: ${e.message}`);
            });
            this.unreachValues.set(unreachRelId, true);
            // Post message when sensor becomes unreachable
            const baseRelId = unreachRelId.endsWith('.unreach') ? unreachRelId.slice(0, -8) : unreachRelId; // Remove '.unreach' suffix
            const label = this.labelFor(baseRelId);
            if (label && label !== baseRelId) {
                this.postMessage(`unreach.${unreachRelId}`, 'warning', `${label}: ${i18n_1.i18n.t('Unreachable')}`, true, 0);
            }
            else {
                this.log.error(`Failed to get label for unreachable sensor ${unreachRelId} (baseRelId=${baseRelId})`);
                this.postMessage(`unreach.${unreachRelId}`, 'warning', `[${unreachRelId}]: ${i18n_1.i18n.t('Unreachable')}`, true, 0);
            }
        }, delayMs);
        this.unreachTimers.set(unreachRelId, timer);
    }
    /**
     * Recursively collects (foreignDpId → ownStateRelId) mappings from the tree.
     */
    collectDpMappings(nodes, prefix) {
        for (const node of nodes) {
            const relId = prefix ? `${prefix}.${node.label}` : node.label;
            const cfg = node.config ?? {};
            if (node.type === 'Temperatur') {
                if (cfg.dpTemperatur)
                    this.dpToStateMap.set(cfg.dpTemperatur, `${relId}.temperature`);
                if (cfg.dpLuftfeuchtigkeit)
                    this.dpToStateMap.set(cfg.dpLuftfeuchtigkeit, `${relId}.humidity`);
            }
            else if (node.type === 'Helligkeit') {
                if (cfg.dpLux)
                    this.dpToStateMap.set(cfg.dpLux, `${relId}.lux`);
            }
            else if (node.type === 'Bewegung') {
                if (cfg.dpBewegung)
                    this.dpToStateMap.set(cfg.dpBewegung, `${relId}.motion`);
            }
            else if (node.type === 'Fenster/Tür') {
                if (cfg.dpFensterTuer)
                    this.dpToStateMap.set(cfg.dpFensterTuer, `${relId}.open`);
            }
            else if (node.type === 'Rolladen') {
                if (cfg.dpPosition) {
                    this.dpToStateMap.set(cfg.dpPosition, `${relId}.position`);
                    this.shutterPositionDpIds.add(cfg.dpPosition);
                }
            }
            if (node.children?.length)
                this.collectDpMappings(node.children, relId);
        }
    }
    // ---- room logic (presence + dark) ----
    /**
     * Finds and subscribes room DPs, initialises initial states.
     * Called once from setupSensorSubscriptions.
     */
    async setupRoomLogic(tree) {
        const globalLuxDpId = this.findGlobalLuxDp(tree);
        this.collectRoomConfigs(tree, '', globalLuxDpId);
        this.collectLampConfigs(tree, '', null);
        if (this.roomEntries.size === 0)
            return;
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
    collectRoomConfigs(nodes, prefix, globalLuxDpId) {
        for (const node of nodes) {
            const relId = prefix ? `${prefix}.${node.label}` : node.label;
            const cfg = node.config ?? {};
            if (node.type === 'Raum' && (cfg.bewegungserkennung || cfg.dunkelheitserkennung || cfg.lichtsteuerung)) {
                const motionDpIds = [];
                const luxDpIds = [];
                if (cfg.bewegungserkennung) {
                    this.findChildDpIds(node.children ?? [], 'Bewegung', 'dpBewegung', motionDpIds);
                }
                if (cfg.dunkelheitserkennung) {
                    if (cfg.globalenSensorBenutzen && globalLuxDpId) {
                        luxDpIds.push(globalLuxDpId);
                    }
                    else {
                        this.findChildDpIds(node.children ?? [], 'Helligkeit', 'dpLux', luxDpIds);
                    }
                }
                if (motionDpIds.length > 0 || luxDpIds.length > 0) {
                    const entry = {
                        relId,
                        cooldownMs: (cfg.bewegungsCooldown ?? 3) * 60_000,
                        dunkelgrenze: cfg.dunkelgrenze ?? 150,
                        lichtsteuerung: cfg.lichtsteuerung ?? false,
                        motionDpIds,
                        luxDpIds,
                    };
                    this.roomEntries.set(relId, entry);
                    if (cfg.lichtsteuerung)
                        this.lightRoomIds.add(relId);
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
            if (node.children?.length)
                this.collectRoomConfigs(node.children, relId, globalLuxDpId);
        }
    }
    /**
     * Recursively collects Lampe child nodes for each lichtsteuerung room.
     * parentRoomRelId is the nearest ancestor Raum with lichtsteuerung=true.
     */
    collectLampConfigs(nodes, prefix, parentRoomRelId) {
        for (const node of nodes) {
            const relId = prefix ? `${prefix}.${node.label}` : node.label;
            const cfg = node.config ?? {};
            if (node.type === 'Raum') {
                // New room context: pass this room as parent if lichtsteuerung is enabled
                const roomRelId = cfg.lichtsteuerung ? relId : null;
                if (node.children?.length)
                    this.collectLampConfigs(node.children, relId, roomRelId);
            }
            else if (node.type === 'Lampe' && parentRoomRelId) {
                const lamp = {
                    relId,
                    aktiviert: cfg.lampeAktiviert ?? true,
                    retrigger: cfg.lampeRetrigger ?? true,
                    sceneConfigs: cfg.lampeSceneConfigs ?? [],
                    dpSchalter: cfg.dpLampeSchalter,
                    dpDimmer: cfg.dpLampeDimmer,
                    dpCt: cfg.dpLampeCt,
                    dpColorHex: cfg.dpLampeColorHex,
                    dpModus: cfg.dpLampeModus,
                    modeWertWeiss: cfg.lampeModeWertWeiss,
                    modeWertFarbe: cfg.lampeModeWertFarbe,
                    dpSzene: cfg.dpLampeSzene,
                };
                const arr = this.roomToLamps.get(parentRoomRelId) ?? [];
                arr.push(lamp);
                this.roomToLamps.set(parentRoomRelId, arr);
            }
            else if (node.children?.length) {
                this.collectLampConfigs(node.children, relId, parentRoomRelId);
            }
        }
    }
    /** Recursively collects all DP IDs of child nodes matching targetType. */
    findChildDpIds(nodes, targetType, cfgKey, result) {
        for (const node of nodes) {
            if (node.type === targetType) {
                const dpId = (node.config ?? {})[cfgKey];
                if (dpId)
                    result.push(dpId);
            }
            if (node.children?.length)
                this.findChildDpIds(node.children, targetType, cfgKey, result);
        }
    }
    /** Returns the dpLux of the first Helligkeit node with globalerSensor = true, or null. */
    findGlobalLuxDp(nodes) {
        for (const node of nodes) {
            if (node.type === 'Helligkeit') {
                const cfg = node.config ?? {};
                if (cfg.globalerSensor && cfg.dpLux)
                    return cfg.dpLux;
            }
            if (node.children?.length) {
                const found = this.findGlobalLuxDp(node.children);
                if (found)
                    return found;
            }
        }
        return null;
    }
    /**
     * Returns the dpTemperatur of the first interior Temperatur node in a room's direct children
     * (i.e. not marked as aussentemperatursensor).
     */
    findRoomTempDp(children) {
        for (const child of children) {
            if (child.type === 'Temperatur') {
                const cfg = child.config ?? {};
                if (!cfg.aussentemperatursensor && cfg.dpTemperatur)
                    return cfg.dpTemperatur;
            }
        }
        return null;
    }
    /** Returns the dpTemperatur of the first Temperatur node with aussentemperatursensor=true, or null. */
    findAussentemperaturDp(nodes) {
        for (const node of nodes) {
            if (node.type === 'Temperatur') {
                const cfg = node.config ?? {};
                if (cfg.aussentemperatursensor && cfg.dpTemperatur)
                    return cfg.dpTemperatur;
            }
            if (node.children?.length) {
                const found = this.findAussentemperaturDp(node.children);
                if (found)
                    return found;
            }
        }
        return null;
    }
    /** Reads current sensor values and sets initial presence / dark states for a room. */
    async initRoomStates(room) {
        // Presence: check if any motion sensor is currently active
        if (room.motionDpIds.length > 0) {
            let anyActive = false;
            for (const dpId of room.motionDpIds) {
                try {
                    const s = await this.getForeignStateAsync(dpId);
                    if (s?.val === true) {
                        anyActive = true;
                        break;
                    }
                }
                catch { /* ignore */ }
            }
            if (anyActive) {
                this.logPresence(`${this.labelFor(room.relId)}: startup → present (sensor active)`);
                await this.setStateAsync(`${room.relId}.presence`, { val: 'present', ack: true });
            }
            else {
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
                }
                else {
                    this.logPresence(`${this.labelFor(room.relId)}: startup → absent`);
                    await this.setStateAsync(`${room.relId}.presence`, { val: 'absent', ack: true });
                }
            }
        }
        // Dark: compute from first available lux reading
        if (room.luxDpIds.length > 0) {
            let lux = null;
            for (const dpId of room.luxDpIds) {
                try {
                    const s = await this.getForeignStateAsync(dpId);
                    if (typeof s?.val === 'number') {
                        lux = s.val;
                        break;
                    }
                }
                catch { /* ignore */ }
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
    async handleMotionChange(dpId, isMotion) {
        for (const roomRelId of (this.dpToRoomsMotion.get(dpId) ?? [])) {
            const room = this.roomEntries.get(roomRelId);
            if (!room)
                continue;
            if (isMotion) {
                // New motion: cancel cooldown, go to present
                const existing = this.cooldownTimers.get(roomRelId);
                if (existing !== undefined) {
                    clearTimeout(existing);
                    this.cooldownTimers.delete(roomRelId);
                }
                this.logPresence(`${this.labelFor(roomRelId)}: motion detected on ${dpId} → present`);
                await this.setStateAsync(`${roomRelId}.presence`, { val: 'present', ack: true });
                await this.updateLightOn(roomRelId);
            }
            else {
                // Motion cleared: check if another sensor is still active
                let anyOtherActive = false;
                for (const otherId of room.motionDpIds) {
                    if (otherId === dpId)
                        continue;
                    try {
                        const s = await this.getForeignStateAsync(otherId);
                        if (s?.val === true) {
                            anyOtherActive = true;
                            break;
                        }
                    }
                    catch { /* ignore */ }
                }
                if (!anyOtherActive) {
                    // Cancel any stale timer, start fresh cooldown
                    const existing = this.cooldownTimers.get(roomRelId);
                    if (existing !== undefined)
                        clearTimeout(existing);
                    this.logPresence(`${this.labelFor(roomRelId)}: motion cleared on ${dpId} → cooldown (${room.cooldownMs / 1000}s)`);
                    await this.setStateAsync(`${roomRelId}.presence`, { val: 'cooldown', ack: true });
                    await this.updateLightOn(roomRelId);
                    const timer = setTimeout(() => {
                        this.cooldownTimers.delete(roomRelId);
                        this.logPresence(`${this.labelFor(roomRelId)}: cooldown expired → absent`);
                        this.setStateAsync(`${roomRelId}.presence`, { val: 'absent', ack: true })
                            .then(() => this.updateLightOn(roomRelId))
                            .catch(e => {
                            this.log.error(`Cooldown expire failed for ${this.labelFor(roomRelId)}: ${e.message}`);
                        });
                    }, room.cooldownMs);
                    this.cooldownTimers.set(roomRelId, timer);
                }
                else {
                    this.logPresence(`${this.labelFor(roomRelId)}: motion cleared on ${dpId}, but other sensor still active → staying present`);
                }
            }
        }
    }
    /** Handles a lux DP change for all rooms that monitor it. */
    async handleLuxChange(dpId, lux) {
        for (const roomRelId of (this.dpToRoomsLux.get(dpId) ?? [])) {
            const room = this.roomEntries.get(roomRelId);
            if (!room)
                continue;
            // Check if any shutter in this room is closed (≤10%)
            const hasClosedShutter = await this.roomHasClosedShutter(roomRelId);
            const darkValue = hasClosedShutter ? 'dark' : this.computeDarkState(lux, room.dunkelgrenze);
            await this.setStateAsync(`${roomRelId}.dark`, {
                val: darkValue, ack: true,
            });
            await this.updateLightOn(roomRelId);
        }
    }
    /** Checks if any shutter in the room is closed (≤10%). */
    async roomHasClosedShutter(roomRelId) {
        const shutterRoom = this.shutterRooms.get(roomRelId);
        if (!shutterRoom?.rolladenRelIds?.length)
            return false;
        for (const rolladenRelId of shutterRoom.rolladenRelIds) {
            const posSt = await this.getStateAsync(`${rolladenRelId}.position`);
            const pos = typeof posSt?.val === 'number' ? posSt.val : 100;
            if (pos <= 10)
                return true;
        }
        return false;
    }
    /** Computes dark/twilight/bright with hysteresis = threshold / 10. */
    computeDarkState(lux, threshold) {
        const h = threshold / 10;
        if (lux < threshold - h)
            return 'dark';
        if (lux > threshold + h)
            return 'bright';
        return 'twilight';
    }
    /**
     * Recomputes and writes `lightOn` for a room with lichtsteuerung=true.
     * lightOn = (presence is 'present' or 'cooldown') AND (dark is 'dark' or 'twilight').
     */
    async updateLightOn(roomRelId) {
        if (!this.lightRoomIds.has(roomRelId))
            return;
        try {
            const presenceSt = await this.getStateAsync(`${roomRelId}.presence`);
            const darkSt = await this.getStateAsync(`${roomRelId}.dark`);
            const sceneSt = await this.getStateAsync(`${roomRelId}.scene`);
            const presence = typeof presenceSt?.val === 'string' ? presenceSt.val : 'absent';
            const dark = typeof darkSt?.val === 'string' ? darkSt.val : 'bright';
            const scene = typeof sceneSt?.val === 'string' ? sceneSt.val : 'Tag';
            const lightOn = (presence === 'present' || presence === 'cooldown') &&
                (dark === 'dark' || dark === 'twilight');
            // Detect whether lightOn or scene actually changed (for retrigger=false lamps)
            const prev = this.roomLightState.get(roomRelId);
            const changed = !prev || prev.lightOn !== lightOn || prev.scene !== scene;
            this.roomLightState.set(roomRelId, { lightOn, scene });
            await this.setStateAsync(`${roomRelId}.lightOn`, { val: lightOn, ack: true });
            this.logLight(`${this.labelFor(roomRelId)}: lightOn=${lightOn} (presence=${presence}, dark=${dark})${changed ? '' : ' [no change]'}`);
            await this.applyRoomScene(roomRelId, scene, lightOn, changed);
        }
        catch (e) {
            this.log.error(`updateLightOn failed for ${this.labelFor(roomRelId)}: ${e.message}`);
        }
    }
    // ---- light scene application ----
    /**
     * Applies the current scene to all lamps in a room.
     * Called after lightOn or scene changes.
     */
    async applyRoomScene(roomRelId, scene, lightOn, changed = true) {
        // "Manuell" suspends all automation – lamp state is not touched
        if (scene === 'Manuell') {
            this.logLight(`${this.labelFor(roomRelId)}: scene=Manuell → Steuerung pausiert`);
            return;
        }
        const lamps = this.roomToLamps.get(roomRelId);
        if (!lamps?.length)
            return;
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
    async applyLampAction(roomRelId, lamp, action, scene, lightOn) {
        const mode = lightOn ? 'Ein' : 'Aus';
        const dryRun = !lamp.aktiviert;
        const prefix = `${this.labelFor(roomRelId)} / ${this.labelFor(lamp.relId)} [scene=${scene}, ${mode}]`;
        const write = async (dp, val, label) => {
            if (dryRun) {
                this.logLightExtended(`[DRY RUN] ${prefix}: ${label} → ${val}`);
            }
            else {
                this.logLight(`${prefix}: ${label} → ${val}`);
                await this.setForeignStateAsync(dp, { val, ack: false });
            }
        };
        if (action.setSchalter && lamp.dpSchalter)
            await write(lamp.dpSchalter, action.schalterWert ?? false, 'Schalter');
        if (action.setDimmer && lamp.dpDimmer)
            await write(lamp.dpDimmer, action.dimmerWert ?? 0, 'Dimmer');
        if (action.setCt && lamp.dpCt)
            await write(lamp.dpCt, action.ctWert ?? 0, 'ct');
        if (action.setColorHex && lamp.dpColorHex)
            await write(lamp.dpColorHex, action.colorHexWert ?? '', 'Farbe');
        if (action.setModus && lamp.dpModus)
            await write(lamp.dpModus, action.modusWert ?? 0, 'Modus');
        if (action.setSzene && lamp.dpSzene)
            await write(lamp.dpSzene, action.szeneWert ?? 0, 'Szene');
    }
    /**
     * Sets scene to "Tag" or "Nacht" for all lichtsteuerung rooms based on night mode,
     * then applies lamps for the new scene.
     */
    async handleNightModeForLights(isNight) {
        if (this.lightRoomIds.size === 0)
            return;
        const scene = isNight ? 'Nacht' : 'Tag';
        for (const roomRelId of this.lightRoomIds) {
            const prev = this.roomLightState.get(roomRelId);
            const lightOnSt = await this.getStateAsync(`${roomRelId}.lightOn`);
            const lightOn = lightOnSt?.val === true;
            const changed = !prev || prev.lightOn !== lightOn || prev.scene !== scene;
            this.roomLightState.set(roomRelId, { lightOn, scene });
            await this.setStateAsync(`${roomRelId}.scene`, { val: scene, ack: true });
            this.logLight(`${this.labelFor(roomRelId)}: nightMode=${isNight} → scene=${scene}, lightOn=${lightOn}`);
            await this.applyRoomScene(roomRelId, scene, lightOn, changed);
        }
    }
    // ---- sun (Sonne) ----
    /** Collects all Sonne node relIds from the tree. */
    collectSunNodes(nodes, prefix) {
        for (const node of nodes) {
            const relId = prefix ? `${prefix}.${node.label}` : node.label;
            if (node.type === 'Sonne')
                this.sunNodeRelIds.push(relId);
            if (node.children?.length)
                this.collectSunNodes(node.children, relId);
        }
    }
    /**
     * Sets up sun position updates for all Sonne nodes.
     * Reads geo position from system.config, computes initial values,
     * then refreshes elevation + azimuth every 5 minutes.
     */
    async setupSunNodes() {
        const tree = Array.isArray(this.config.grundstueck)
            ? this.config.grundstueck
            : [];
        this.collectSunNodes(tree, '');
        if (this.sunNodeRelIds.length === 0)
            return;
        await this.ensureGeoPosition();
        if (this.sunLat === 0 && this.sunLng === 0) {
            this.log.warn('No geo position set in ioBroker system settings – sun calculation disabled.');
            return;
        }
        this.log.info(`Sun nodes: ${this.sunNodeRelIds.length}, position: ${this.sunLat}°N ${this.sunLng}°E`);
        await this.updateSunStates();
        this.sunIntervalTimer = setInterval(() => {
            this.updateSunStates().catch(e => {
                this.log.error(`Sun update error: ${e.message}`);
            });
        }, 5 * 60_000);
        // Start message expiry checker every 30s
        this.messagesCheckTimer = setInterval(() => this.checkMessageTimeouts(), 30_000);
    }
    /** Loads lat/lng from system.config once (no-op if already loaded). */
    async ensureGeoPosition() {
        if (this.sunLat !== 0 || this.sunLng !== 0)
            return;
        try {
            const sysCfg = await this.getForeignObjectAsync('system.config');
            const common = (sysCfg?.common ?? {});
            this.sunLat = typeof common.latitude === 'number' ? common.latitude : 0;
            this.sunLng = typeof common.longitude === 'number' ? common.longitude : 0;
        }
        catch (e) {
            this.log.warn(`Could not read system.config for geo position: ${e.message}`);
        }
    }
    /** Calculates and writes all sun states for the current moment. */
    async updateSunStates() {
        const now = new Date();
        const times = SunCalc.getTimes(now, this.sunLat, this.sunLng);
        const pos = SunCalc.getPosition(now, this.sunLat, this.sunLng);
        const pad = (n) => String(Math.floor(n)).padStart(2, '0');
        const fmtTime = (d) => isNaN(d.getTime()) ? '--:--' : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
        const sunriseStr = fmtTime(times.sunrise);
        const sunsetStr = fmtTime(times.sunset);
        // suncalc2 altitude = radians above horizon; azimuth = radians from south (positive=west)
        const elevation = Math.round(pos.altitude * (180 / Math.PI) * 100) / 100;
        const azimuth = Math.round(((pos.azimuth * (180 / Math.PI)) + 180) * 100) / 100;
        // Cache azimuth for shutter direction check
        this.currentSunAzimuth = azimuth;
        for (const relId of this.sunNodeRelIds) {
            await this.setStateAsync(`${relId}.sunrise`, { val: sunriseStr, ack: true });
            await this.setStateAsync(`${relId}.sunset`, { val: sunsetStr, ack: true });
            await this.setStateAsync(`${relId}.elevation`, { val: elevation, ack: true });
            await this.setStateAsync(`${relId}.azimuth`, { val: azimuth, ack: true });
        }
        // Re-evaluate shutter state based on updated sun position (every 5 min during daytime)
        if (this.shutterRooms.size > 0) {
            this.evaluateAllShutterRooms();
        }
    }
    // ---- climate control ----
    /** Walks the tree and populates climateRooms + heizungRelId. */
    collectClimateData(nodes, prefix) {
        for (const node of nodes) {
            const relId = prefix ? `${prefix}.${node.label}` : node.label;
            const cfg = node.config ?? {};
            if (node.type === 'Heizung' && this.heizungRelId === null) {
                this.heizungRelId = relId;
            }
            if (node.type === 'Raum' && cfg.klimasteuerung) {
                const hasPresence = !!(cfg.bewegungserkennung);
                this.climateRooms.set(relId, {
                    relId,
                    solltemperatur: cfg.solltemperatur ?? 20,
                    absenkungNacht: cfg.absenkungNacht ?? 4,
                    absenkungAbwesend: cfg.absenkungAbwesend ?? 3,
                    hasPresence,
                });
                if (hasPresence) {
                    this.climatePresenceIds.add(`${this.namespace}.${relId}.presence`);
                }
            }
            if (node.children?.length)
                this.collectClimateData(node.children, relId);
        }
    }
    /** Initialises climate control: subscribes to states and sets initial setpoints. */
    async setupClimateControl() {
        const tree = Array.isArray(this.config.grundstueck)
            ? this.config.grundstueck
            : [];
        this.collectClimateData(tree, '');
        if (this.climateRooms.size === 0 && this.heizungRelId === null)
            return;
        this.logClimate(`Climate control: ${this.climateRooms.size} room(s)` +
            (this.heizungRelId ? `, Heizung: ${this.labelFor(this.heizungRelId)}` : ', no Heizung node'));
        // Initialise / subscribe Heizung states
        if (this.heizungRelId) {
            const heizNode = this.findNodeByRelId(tree, this.heizungRelId);
            const heizCfg = heizNode?.config ?? {};
            const hpState = await this.getStateAsync(`${this.heizungRelId}.heizperiode`);
            const esState = await this.getStateAsync(`${this.heizungRelId}.energiesparmodus`);
            if (!hpState?.val && hpState?.val !== false)
                await this.setStateAsync(`${this.heizungRelId}.heizperiode`, { val: heizCfg.heizperiodeAktiv ?? false, ack: true });
            if (!esState?.val && esState?.val !== false)
                await this.setStateAsync(`${this.heizungRelId}.energiesparmodus`, { val: heizCfg.energiesparmodusAktiv ?? false, ack: true });
            this.subscribeStates(`${this.heizungRelId}.heizperiode`);
            this.subscribeStates(`${this.heizungRelId}.energiesparmodus`);
        }
        // Subscribe to presence states of climate rooms (own states)
        for (const room of this.climateRooms.values()) {
            if (room.hasPresence)
                this.subscribeStates(`${room.relId}.presence`);
        }
        // Set initial setpoints
        for (const room of this.climateRooms.values()) {
            await this.updateClimateSetpoint(room);
        }
    }
    /** Calculates and writes setpoint + mode for one climate room. */
    async updateClimateSetpoint(room) {
        const heizperiode = this.heizungRelId
            ? !!((await this.getStateAsync(`${this.heizungRelId}.heizperiode`))?.val)
            : true;
        const energiesparmodus = this.heizungRelId
            ? !!((await this.getStateAsync(`${this.heizungRelId}.energiesparmodus`))?.val)
            : false;
        const nightMode = !!((await this.getStateAsync('global.nightMode'))?.val);
        const presence = room.hasPresence
            ? (await this.getStateAsync(`${room.relId}.presence`))?.val ?? 'absent'
            : 'present';
        let mode;
        let setpoint;
        if (!heizperiode) {
            mode = 'off';
            setpoint = 5; // frost protection
        }
        else if (energiesparmodus || presence === 'absent') {
            mode = 'absent';
            setpoint = room.solltemperatur - room.absenkungAbwesend;
        }
        else if (nightMode) {
            mode = 'night';
            setpoint = room.solltemperatur - room.absenkungNacht;
        }
        else {
            mode = 'normal';
            setpoint = room.solltemperatur;
        }
        this.logClimate(`${this.labelFor(room.relId)}: mode=${mode}, setpoint=${setpoint}\u00b0C`);
        await this.setStateAsync(`${room.relId}.climate.setpoint`, { val: setpoint, ack: true });
        await this.setStateAsync(`${room.relId}.climate.mode`, { val: mode, ack: true });
    }
    /** Updates setpoints for all climate rooms. */
    async updateAllClimateSetpoints() {
        for (const room of this.climateRooms.values()) {
            await this.updateClimateSetpoint(room);
        }
    }
    /** Finds a node in the tree by its relId. */
    findNodeByRelId(nodes, targetRelId, prefix = '') {
        for (const node of nodes) {
            const relId = prefix ? `${prefix}.${node.label}` : node.label;
            if (relId === targetRelId)
                return node;
            if (node.children?.length) {
                const found = this.findNodeByRelId(node.children, targetRelId, relId);
                if (found)
                    return found;
            }
        }
        return null;
    }
    // ---- consumption tracking ----
    /** Walks the tree and populates consumptionConfigs + consumptionDpToTrackers. */
    collectConsumptionConfigs(nodes, prefix) {
        for (const node of nodes) {
            const relId = prefix ? `${prefix}.${node.label}` : node.label;
            const cfg = node.config ?? {};
            if (node.type === 'Energie') {
                if (cfg.dpStromzaehlerStand && !this.consumptionConfigs.has('grid')) {
                    const cc = { id: 'grid', label: 'Grid consumption (kWh)', unit: 'kWh', descending: false, dpIds: [cfg.dpStromzaehlerStand] };
                    this.consumptionConfigs.set('grid', cc);
                    this.consumptionDpToTrackers.set(cfg.dpStromzaehlerStand, ['grid']);
                }
                if (cfg.dpStromzaehlerEinspeisestand && !this.consumptionConfigs.has('feedin')) {
                    const cc = { id: 'feedin', label: 'Grid feed-in (kWh)', unit: 'kWh', descending: false, dpIds: [cfg.dpStromzaehlerEinspeisestand] };
                    this.consumptionConfigs.set('feedin', cc);
                    this.consumptionDpToTrackers.set(cfg.dpStromzaehlerEinspeisestand, ['feedin']);
                }
            }
            if (node.type === 'Wechselrichter' && cfg.dpGesamterzeugung) {
                if (!this.consumptionConfigs.has('solar')) {
                    const cc = { id: 'solar', label: 'Solar generation (kWh)', unit: 'kWh', descending: false, dpIds: [] };
                    this.consumptionConfigs.set('solar', cc);
                }
                const sc = this.consumptionConfigs.get('solar');
                sc.dpIds.push(cfg.dpGesamterzeugung);
                const trackers = this.consumptionDpToTrackers.get(cfg.dpGesamterzeugung) ?? [];
                trackers.push('solar');
                this.consumptionDpToTrackers.set(cfg.dpGesamterzeugung, trackers);
            }
            if (node.type === 'Heizung' && cfg.dpOelstand && !this.consumptionConfigs.has('oil')) {
                const cc = { id: 'oil', label: 'Oil consumption (l)', unit: 'l', descending: true, dpIds: [cfg.dpOelstand] };
                this.consumptionConfigs.set('oil', cc);
                this.consumptionDpToTrackers.set(cfg.dpOelstand, ['oil']);
            }
            if (node.children?.length)
                this.collectConsumptionConfigs(node.children, relId);
        }
    }
    /** Creates all ioBroker objects for one tracker + one year. */
    async ensureConsumptionObjects(id, unit, year) {
        const base = `global.consumption.${id}`;
        const yr = String(year);
        const numCommon = (name) => ({
            name, type: 'number', role: 'value', unit, read: true, write: false, def: 0,
        });
        await this.extendObjectAsync(`${base}._anchors`, {
            type: 'state',
            common: { name: 'Anchors (JSON – writable for init)', type: 'string', role: 'json', read: true, write: true, def: '' },
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
        for (const [mm, label] of Object.entries(consumptionTracker_1.MONTH_LABELS)) {
            await this.extendObjectAsync(`${base}.${yr}.consumed.months.${label}`, { type: 'state', common: numCommon(label.replace(/^\d\d_/, '')), native: {} });
            await this.extendObjectAsync(`${base}.${yr}.meterReadings.months.${label}`, { type: 'state', common: numCommon(label.replace(/^\d\d_/, '')), native: {} });
            void mm;
        }
        for (const q of ['Q1', 'Q2', 'Q3', 'Q4']) {
            await this.extendObjectAsync(`${base}.${yr}.consumed.quarters.${q}`, { type: 'state', common: numCommon(q), native: {} });
            await this.extendObjectAsync(`${base}.${yr}.meterReadings.quarters.${q}`, { type: 'state', common: numCommon(q), native: {} });
        }
        await this.extendObjectAsync(`${base}.${yr}.consumedCumulative`, { type: 'state', common: numCommon('Consumed cumulative'), native: {} });
        await this.extendObjectAsync(`${base}.${yr}.readingCumulative`, { type: 'state', common: numCommon('Reading cumulative'), native: {} });
    }
    /** Tries to load persisted anchors; falls back to default (current reading = baseline). */
    async loadOrInitAnchors(id, currentReading, now) {
        try {
            const st = await this.getStateAsync(`global.consumption.${id}._anchors`);
            if (st?.val && typeof st.val === 'string' && st.val.trim()) {
                const parsed = JSON.parse(st.val);
                if (typeof parsed.year === 'number') {
                    this.logEnergy(`Consumption ${id}: loaded anchors (${parsed.year}-${String(parsed.month + 1).padStart(2, '0')}-${String(parsed.dayOfMonth).padStart(2, '0')})`);
                    return parsed;
                }
            }
        }
        catch (e) {
            this.log.warn(`Consumption ${id}: could not parse anchors: ${e.message}`);
        }
        this.logEnergy(`Consumption ${id}: no anchors found — initialising from current reading ${currentReading}`);
        const anchors = (0, consumptionTracker_1.defaultAnchors)(currentReading, now);
        await this.saveConsumptionAnchors(id, anchors);
        return anchors;
    }
    /** Persists the anchor set for a tracker to its own state. */
    async saveConsumptionAnchors(id, anchors) {
        this.consumptionAnchors.set(id, anchors);
        await this.setStateAsync(`global.consumption.${id}._anchors`, { val: JSON.stringify(anchors), ack: true });
    }
    /** Writes all live "currentYear.consumed.*" states for one tracker. */
    async updateConsumptionLive(id, reading, anchors, now) {
        const cfg = this.consumptionConfigs.get(id);
        const base = `global.consumption.${id}.currentYear.consumed`;
        const d = (0, consumptionTracker_1.computeDelta)(anchors.startOfDay, reading, cfg.descending);
        const w = (0, consumptionTracker_1.computeDelta)(anchors.startOfWeek, reading, cfg.descending);
        const m = (0, consumptionTracker_1.computeDelta)(anchors.startOfMonth, reading, cfg.descending);
        const y = (0, consumptionTracker_1.computeDelta)(anchors.startOfYear, reading, cfg.descending);
        await Promise.all([
            this.setStateAsync(`${base}.01_currentDay`, { val: d, ack: true }),
            this.setStateAsync(`${base}.01_previousDay`, { val: anchors.prevDayConsumed, ack: true }),
            this.setStateAsync(`${base}.02_currentWeek`, { val: w, ack: true }),
            this.setStateAsync(`${base}.02_previousWeek`, { val: anchors.prevWeekConsumed, ack: true }),
            this.setStateAsync(`${base}.03_currentMonth`, { val: m, ack: true }),
            this.setStateAsync(`${base}.03_previousMonth`, { val: anchors.prevMonthConsumed, ack: true }),
            this.setStateAsync(`${base}.05_currentYear`, { val: y, ack: true }),
            this.setStateAsync(`${base}.05_previousYear`, { val: anchors.prevYearConsumed, ack: true }),
        ]);
        void now; // year context available for future extension
    }
    /**
     * Writes all per-year historical states (monthly breakdown, quarters, cumulative)
     * for the year stored in `anchors.year`.
     */
    async updateConsumptionHistory(id, anchors, currentReading) {
        const cfg = this.consumptionConfigs.get(id);
        const base = `global.consumption.${id}.${anchors.year}`;
        const quarterConsumed = { 1: 0, 2: 0, 3: 0, 4: 0 };
        const quarterReading = { 1: 0, 2: 0, 3: 0, 4: 0 };
        let yearConsumed = 0;
        for (let m0 = 0; m0 <= 11; m0++) {
            const mm = (0, consumptionTracker_1.mmOf)(m0 + 1); // '01'..'12'
            const label = consumptionTracker_1.MONTH_LABELS[mm];
            let consumed = 0;
            let reading = 0;
            if (m0 < anchors.month) {
                // Completed month in this year
                consumed = anchors.monthlyConsumed[mm] ?? 0;
                reading = anchors.monthlyReadings[mm] ?? 0;
            }
            else if (m0 === anchors.month) {
                // Current (live) month
                consumed = (0, consumptionTracker_1.computeDelta)(anchors.startOfMonth, currentReading, cfg.descending);
                reading = currentReading;
            }
            // Future months remain 0
            await this.setStateAsync(`${base}.consumed.months.${label}`, { val: consumed, ack: true });
            await this.setStateAsync(`${base}.meterReadings.months.${label}`, { val: reading, ack: true });
            yearConsumed += consumed;
            const q = (0, consumptionTracker_1.quarterOf)(m0);
            quarterConsumed[q] += consumed;
            if (reading > 0)
                quarterReading[q] = reading;
        }
        for (const q of [1, 2, 3, 4]) {
            await this.setStateAsync(`${base}.consumed.quarters.Q${q}`, { val: quarterConsumed[q], ack: true });
            await this.setStateAsync(`${base}.meterReadings.quarters.Q${q}`, { val: quarterReading[q], ack: true });
        }
        await this.setStateAsync(`${base}.consumedCumulative`, { val: yearConsumed, ack: true });
        await this.setStateAsync(`${base}.readingCumulative`, { val: currentReading, ack: true });
    }
    /** Sets up all consumption trackers: object creation, anchor loading, subscriptions. */
    async setupConsumptionTracking() {
        const tree = Array.isArray(this.config.grundstueck)
            ? this.config.grundstueck
            : [];
        this.collectConsumptionConfigs(tree, '');
        if (this.consumptionConfigs.size === 0)
            return;
        this.logEnergy(`Consumption tracking: ${[...this.consumptionConfigs.keys()].join(', ')}`);
        const now = new Date();
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
                    const st = await this.getForeignStateAsync(dpId);
                    const val = Number(st?.val) || 0;
                    this.consumptionSrcLast.set(dpId, val);
                    currentReading += val;
                }
                catch (e) {
                    this.log.warn(`Consumption ${id}: initial read of ${dpId} failed: ${e.message}`);
                }
            }
            this.consumptionReadings.set(id, currentReading);
            // Load (or initialise) anchors, then apply catch-up rollover
            let anchors = await this.loadOrInitAnchors(id, currentReading, now);
            const { anchors: rolled, closedMonths, yearRolled } = (0, consumptionTracker_1.rolloverAnchors)(anchors, currentReading, now, cc.descending);
            if (closedMonths.length > 0 || yearRolled) {
                this.logEnergy(`Consumption ${id}: catch-up rollover (${closedMonths.length} month(s), yearRolled=${yearRolled})`);
                if (yearRolled)
                    await this.ensureConsumptionObjects(id, cc.unit, year);
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
    handleConsumptionDpChange(dpId, rawVal) {
        const val = Number(rawVal) || 0;
        this.consumptionSrcLast.set(dpId, val);
        for (const trackerId of this.consumptionDpToTrackers.get(dpId) ?? []) {
            const cc = this.consumptionConfigs.get(trackerId);
            const anchors = this.consumptionAnchors.get(trackerId);
            if (!cc || !anchors)
                continue;
            let newReading = 0;
            for (const dpId2 of cc.dpIds)
                newReading += this.consumptionSrcLast.get(dpId2) ?? 0;
            this.consumptionReadings.set(trackerId, newReading);
            const now = new Date();
            this.setStateAsync(`global.consumption.${trackerId}.cumulativeReading`, { val: newReading, ack: true }).catch(() => null);
            this.updateConsumptionLive(trackerId, newReading, anchors, now).catch(e => this.log.error(`Consumption live update (${trackerId}) failed: ${e.message}`));
            const d = (0, consumptionTracker_1.computeDelta)(anchors.startOfDay, newReading, cc.descending);
            this.logEnergyExtended(`Consumption ${trackerId}: reading=${newReading} ${cc.unit}, today=${d} ${cc.unit}`);
            // Update derived Hausverbrauch whenever grid / solar / feedin changes
            if (trackerId === 'grid' || trackerId === 'feedin' || trackerId === 'solar') {
                this.updateHausverbrauchLive().catch(e => this.log.error(`Hausverbrauch live update failed: ${e.message}`));
            }
        }
    }
    /** Handles user writing to a _anchors state — parse JSON and apply immediately. */
    async handleConsumptionAnchorWrite(ownRelId, val) {
        // Extract tracker id from 'global.consumption.<id>._anchors'
        const parts = ownRelId.split('.');
        if (parts.length < 4)
            return; // safety
        const trackerId = parts[2];
        if (!this.consumptionConfigs.has(trackerId))
            return;
        if (typeof val !== 'string' || !val.trim())
            return;
        let newAnchors;
        try {
            newAnchors = JSON.parse(val);
            if (typeof newAnchors.year !== 'number')
                throw new Error('missing year field');
        }
        catch (e) {
            this.log.warn(`Consumption ${trackerId}: invalid _anchors JSON — ${e.message}`);
            return;
        }
        await this.saveConsumptionAnchors(trackerId, newAnchors);
        const reading = this.consumptionReadings.get(trackerId) ?? 0;
        const year = newAnchors.year;
        await this.ensureConsumptionObjects(trackerId, this.consumptionConfigs.get(trackerId).unit, year);
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
    async doConsumptionRollover() {
        const now = new Date();
        this.logEnergy(`Consumption: midnight rollover at ${now.toISOString()}`);
        for (const [id, anchors] of this.consumptionAnchors) {
            const cc = this.consumptionConfigs.get(id);
            const reading = this.consumptionReadings.get(id) ?? 0;
            const { anchors: rolled, yearRolled } = (0, consumptionTracker_1.rolloverAnchors)(anchors, reading, now, cc.descending);
            if (yearRolled)
                await this.ensureConsumptionObjects(id, cc.unit, now.getFullYear());
            await this.saveConsumptionAnchors(id, rolled);
            await this.updateConsumptionLive(id, reading, rolled, now);
            await this.updateConsumptionHistory(id, rolled, reading);
            this.logEnergyExtended(`Consumption rollover ${id}: prevDay=${rolled.prevDayConsumed} ${cc.unit}` +
                `, prevWeek=${rolled.prevWeekConsumed} ${cc.unit}`);
        }
        // Hausverbrauch: update derived history after all trackers have rolled over
        if (this.consumptionConfigs.has('grid') || this.consumptionConfigs.has('solar') || this.consumptionConfigs.has('feedin')) {
            await this.updateHausverbrauchLive();
            await this.updateHausverbrauchHistory(now.getFullYear());
        }
        this.scheduleConsumptionMidnight();
    }
    /** Creates ioBroker objects for the derived Hausverbrauch kWh tracker. */
    async ensureHausverbrauchObjects(year) {
        const base = 'global.consumption.hausverbrauch';
        const yr = String(year);
        const numC = (name) => ({
            name, type: 'number', role: 'value', unit: 'kWh', read: true, write: false, def: 0,
        });
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
        for (const [mm, label] of Object.entries(consumptionTracker_1.MONTH_LABELS)) {
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
    async updateHausverbrauchLive() {
        const gA = this.consumptionAnchors.get('grid');
        const fA = this.consumptionAnchors.get('feedin');
        const sA = this.consumptionAnchors.get('solar');
        if (!gA && !fA && !sA)
            return;
        const gR = this.consumptionReadings.get('grid') ?? 0;
        const fR = this.consumptionReadings.get('feedin') ?? 0;
        const sR = this.consumptionReadings.get('solar') ?? 0;
        const hv = (g, s, f) => Math.round(Math.max(0, g + s - f) * 1000) / 1000;
        const day = hv(gA ? (0, consumptionTracker_1.computeDelta)(gA.startOfDay, gR, false) : 0, sA ? (0, consumptionTracker_1.computeDelta)(sA.startOfDay, sR, false) : 0, fA ? (0, consumptionTracker_1.computeDelta)(fA.startOfDay, fR, false) : 0);
        const week = hv(gA ? (0, consumptionTracker_1.computeDelta)(gA.startOfWeek, gR, false) : 0, sA ? (0, consumptionTracker_1.computeDelta)(sA.startOfWeek, sR, false) : 0, fA ? (0, consumptionTracker_1.computeDelta)(fA.startOfWeek, fR, false) : 0);
        const month = hv(gA ? (0, consumptionTracker_1.computeDelta)(gA.startOfMonth, gR, false) : 0, sA ? (0, consumptionTracker_1.computeDelta)(sA.startOfMonth, sR, false) : 0, fA ? (0, consumptionTracker_1.computeDelta)(fA.startOfMonth, fR, false) : 0);
        const yr = hv(gA ? (0, consumptionTracker_1.computeDelta)(gA.startOfYear, gR, false) : 0, sA ? (0, consumptionTracker_1.computeDelta)(sA.startOfYear, sR, false) : 0, fA ? (0, consumptionTracker_1.computeDelta)(fA.startOfYear, fR, false) : 0);
        const prevDay = hv(gA?.prevDayConsumed ?? 0, sA?.prevDayConsumed ?? 0, fA?.prevDayConsumed ?? 0);
        const prevWeek = hv(gA?.prevWeekConsumed ?? 0, sA?.prevWeekConsumed ?? 0, fA?.prevWeekConsumed ?? 0);
        const prevMonth = hv(gA?.prevMonthConsumed ?? 0, sA?.prevMonthConsumed ?? 0, fA?.prevMonthConsumed ?? 0);
        const prevYear = hv(gA?.prevYearConsumed ?? 0, sA?.prevYearConsumed ?? 0, fA?.prevYearConsumed ?? 0);
        const base = 'global.consumption.hausverbrauch.currentYear.consumed';
        await Promise.all([
            this.setStateAsync(`${base}.01_currentDay`, { val: day, ack: true }),
            this.setStateAsync(`${base}.01_previousDay`, { val: prevDay, ack: true }),
            this.setStateAsync(`${base}.02_currentWeek`, { val: week, ack: true }),
            this.setStateAsync(`${base}.02_previousWeek`, { val: prevWeek, ack: true }),
            this.setStateAsync(`${base}.03_currentMonth`, { val: month, ack: true }),
            this.setStateAsync(`${base}.03_previousMonth`, { val: prevMonth, ack: true }),
            this.setStateAsync(`${base}.05_currentYear`, { val: yr, ack: true }),
            this.setStateAsync(`${base}.05_previousYear`, { val: prevYear, ack: true }),
        ]);
    }
    /** Writes yearly monthly/quarterly breakdown for the derived Hausverbrauch tracker. */
    async updateHausverbrauchHistory(year) {
        const gA = this.consumptionAnchors.get('grid');
        const fA = this.consumptionAnchors.get('feedin');
        const sA = this.consumptionAnchors.get('solar');
        if (!gA && !fA && !sA)
            return;
        const gR = this.consumptionReadings.get('grid') ?? 0;
        const fR = this.consumptionReadings.get('feedin') ?? 0;
        const sR = this.consumptionReadings.get('solar') ?? 0;
        // Use any available anchor as reference for current-month index
        const ref = gA ?? sA ?? fA;
        const base = `global.consumption.hausverbrauch.${year}`;
        const quarterConsumed = { 1: 0, 2: 0, 3: 0, 4: 0 };
        let yearConsumed = 0;
        for (let m0 = 0; m0 <= 11; m0++) {
            const mm = (0, consumptionTracker_1.mmOf)(m0 + 1);
            const label = consumptionTracker_1.MONTH_LABELS[mm];
            let consumed = 0;
            if (m0 < ref.month) {
                // Completed month: sum contributions from each tracker
                const g = gA?.monthlyConsumed[mm] ?? 0;
                const s = sA?.monthlyConsumed[mm] ?? 0;
                const f = fA?.monthlyConsumed[mm] ?? 0;
                consumed = Math.round(Math.max(0, g + s - f) * 1000) / 1000;
            }
            else if (m0 === ref.month) {
                // Current (live) month
                const g = gA ? (0, consumptionTracker_1.computeDelta)(gA.startOfMonth, gR, false) : 0;
                const s = sA ? (0, consumptionTracker_1.computeDelta)(sA.startOfMonth, sR, false) : 0;
                const f = fA ? (0, consumptionTracker_1.computeDelta)(fA.startOfMonth, fR, false) : 0;
                consumed = Math.round(Math.max(0, g + s - f) * 1000) / 1000;
            }
            await this.setStateAsync(`${base}.consumed.months.${label}`, { val: consumed, ack: true });
            yearConsumed += consumed;
            quarterConsumed[(0, consumptionTracker_1.quarterOf)(m0)] += consumed;
        }
        for (const q of [1, 2, 3, 4]) {
            await this.setStateAsync(`${base}.consumed.quarters.Q${q}`, {
                val: Math.round(quarterConsumed[q] * 1000) / 1000, ack: true,
            });
        }
        await this.setStateAsync(`${base}.consumedCumulative`, {
            val: Math.round(yearConsumed * 1000) / 1000, ack: true,
        });
    }
    /** Schedules a one-shot timer that fires 5 seconds past the next local midnight. */
    scheduleConsumptionMidnight() {
        if (this.consumptionMidnightTimer !== null) {
            clearTimeout(this.consumptionMidnightTimer);
            this.consumptionMidnightTimer = null;
        }
        const now = new Date();
        const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
        const ms = midnight.getTime() - now.getTime();
        this.consumptionMidnightTimer = setTimeout(() => {
            this.doConsumptionRollover().catch(e => this.log.error(`Consumption midnight rollover failed: ${e.message}`));
        }, ms);
        this.log.debug(`[consumption] Next rollover in ${Math.round(ms / 60_000)} min`);
    }
    // ---- energy management ----
    /** Walks the tree and fills energieVerbrauchDpId + wechselrichterPowerDps + batterieDps. */
    collectEnergyData(nodes, prefix) {
        for (const node of nodes) {
            const relId = prefix ? `${prefix}.${node.label}` : node.label;
            const cfg = node.config ?? {};
            if (node.type === 'Energie' && cfg.dpStromzaehlerVerbrauch && this.energieVerbrauchDpId === null) {
                this.energieVerbrauchDpId = cfg.dpStromzaehlerVerbrauch;
            }
            if (node.type === 'Wechselrichter' && cfg.dpWechselrichterPower) {
                this.wechselrichterPowerDps.set(cfg.dpWechselrichterPower, relId);
            }
            if (node.type === 'Batteriespeicher' && cfg.dpBatterieWh) {
                this.batterieDps.set(cfg.dpBatterieWh, relId);
            }
            if (node.type === 'Solarpanel' && cfg.dpSolarpanelPower) {
                this.solarpanelDps.set(cfg.dpSolarpanelPower, relId);
            }
            if (node.children?.length)
                this.collectEnergyData(node.children, relId);
        }
    }
    /** Initialises energy management: subscribes to power DPs and writes initial Hausverbrauch. */
    async setupEnergyControl() {
        const tree = Array.isArray(this.config.grundstueck)
            ? this.config.grundstueck
            : [];
        this.collectEnergyData(tree, '');
        if (!this.energieVerbrauchDpId && this.wechselrichterPowerDps.size === 0)
            return;
        this.logEnergy(`Energy management: ${this.wechselrichterPowerDps.size} inverter(s)` +
            (this.energieVerbrauchDpId ? ', grid meter configured' : ', no grid meter'));
        // Grid meter: subscribe + read initial
        if (this.energieVerbrauchDpId) {
            this.subscribeForeignStates(this.energieVerbrauchDpId);
            try {
                const st = await this.getForeignStateAsync(this.energieVerbrauchDpId);
                if (st?.val !== null && st?.val !== undefined) {
                    this.energiePowerCache.set(this.energieVerbrauchDpId, Number(st.val) || 0);
                }
            }
            catch (e) {
                this.log.warn(`Energy: initial read of Netzbezug failed: ${e.message}`);
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
            }
            catch (e) {
                this.log.warn(`Energy: initial read of inverter (${this.labelFor(relId)}) failed: ${e.message}`);
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
            }
            catch (e) {
                this.log.warn(`Energy: initial read of Batteriespeicher (${this.labelFor(relId)}) failed: ${e.message}`);
            }
        }
        // Solarpanel: subscribe + read initial
        for (const [dpId, relId] of this.solarpanelDps) {
            this.subscribeForeignStates(dpId);
            try {
                const st = await this.getForeignStateAsync(dpId);
                if (st?.val !== null && st?.val !== undefined) {
                    this.solarpanelWCache.set(dpId, Number(st.val) || 0);
                }
            }
            catch (e) {
                this.log.warn(`Energy: initial read of Solarpanel (${this.labelFor(relId)}) failed: ${e.message}`);
            }
        }
        await this.recalcHausverbrauch();
        await this.recalcBatteryReserve();
        await this.recalcSolarPower();
    }
    /** Sums all cached power values and writes global.hausverbrauch, then logs. */
    async recalcHausverbrauch() {
        const netzbezug = this.energieVerbrauchDpId
            ? (this.energiePowerCache.get(this.energieVerbrauchDpId) ?? 0)
            : 0;
        let solareinspeisung = 0;
        for (const dpId of this.wechselrichterPowerDps.keys()) {
            solareinspeisung += this.energiePowerCache.get(dpId) ?? 0;
        }
        const hausverbrauch = netzbezug + solareinspeisung;
        this.logEnergyExtended(`Hausverbrauch: ${hausverbrauch} W (Netzbezug: ${netzbezug} W, Solareinspeisung: ${solareinspeisung} W)`);
        await this.setStateAsync('global.hausverbrauch', { val: hausverbrauch, ack: true });
    }
    /** Sums all cached Wh values and writes global.batteryreserve. */
    async recalcBatteryReserve() {
        if (this.batterieDps.size === 0)
            return;
        let total = 0;
        for (const dpId of this.batterieDps.keys()) {
            total += this.batterieWhCache.get(dpId) ?? 0;
        }
        this.logEnergy(`Battery reserve: ${total} Wh (${this.batterieDps.size} storage unit(s))`);
        await this.setStateAsync('global.batteryreserve', { val: total, ack: true });
    }
    /** Sums all cached W values and writes global.solarpower. */
    async recalcSolarPower() {
        if (this.solarpanelDps.size === 0)
            return;
        let total = 0;
        for (const [dpId, relId] of this.solarpanelDps) {
            const val = this.solarpanelWCache.get(dpId) ?? 0;
            total += val;
            this.logEnergyExtended(`Solar panel ${this.labelFor(relId)}: dp=${dpId} cached=${val} W`);
        }
        this.logEnergy(`Solar power: ${total} W (${this.solarpanelDps.size} panel(s))`);
        await this.setStateAsync('global.solarpower', { val: total, ack: true });
    }
    // ---- shutter control ----
    /**
     * Builds relIdToLabel from the tree.
     * Since relId now uses node.label as path segment, relId == the human-readable path.
     * We still populate the map for backward-compatible labelFor() calls.
     */
    buildLabelMap(nodes, prefix, _labelPrefix) {
        for (const node of nodes) {
            const relId = prefix ? `${prefix}.${node.label}` : node.label;
            this.relIdToLabel.set(relId, relId);
            if (node.children?.length)
                this.buildLabelMap(node.children, relId, relId);
        }
    }
    /** Returns the human-readable label path for a relId (now identical since relId uses labels). */
    labelFor(relId) {
        return this.relIdToLabel.get(relId) ?? relId;
    }
    /** Logs a message at debug level when [shuttercontrol] or [shuttercontrol_extended] is active. */
    logShutter(msg) {
        if (this.config.logShuttercontrol || this.config.logShuttercontrolExtended) {
            this.log.debug(`[shuttercontrol] ${msg}`);
        }
    }
    /** Logs a message at debug level only when [shuttercontrol_extended] is active. */
    logShutterExtended(msg) {
        if (this.config.logShuttercontrolExtended) {
            this.log.debug(`[shuttercontrol_extended] ${msg}`);
        }
    }
    onMessage(obj) {
        if (obj.command === 'log' && obj.message) {
            const { flag, text } = obj.message;
            switch (flag) {
                case 'admin':
                    this.logAdmin(text);
                    break;
                case 'alexa':
                    this.logAlexa(text);
                    break;
                case 'presence':
                    this.logPresence(text);
                    break;
                case 'climate':
                    this.logClimate(text);
                    break;
                case 'climate_extended':
                    this.logClimateExtended(text);
                    break;
                case 'light':
                    this.logLight(text);
                    break;
                case 'light_extended':
                    this.logLightExtended(text);
                    break;
                case 'energy':
                    this.logEnergy(text);
                    break;
                case 'energy_extended':
                    this.logEnergyExtended(text);
                    break;
            }
        }
    }
    logAdmin(msg) {
        if (this.config.logAdmin)
            this.log.debug(`[admin] ${msg}`);
    }
    logAlexa(msg) {
        if (this.config.logAlexa)
            this.log.debug(`[alexa] ${msg}`);
    }
    logPresence(msg) {
        if (this.config.logPresence)
            this.log.debug(`[presence] ${msg}`);
    }
    logClimate(msg) {
        if (this.config.logClimate)
            this.log.debug(`[climate] ${msg}`);
    }
    logClimateExtended(msg) {
        if (this.config.logClimateExtended)
            this.log.debug(`[climate_extended] ${msg}`);
    }
    logLight(msg) {
        if (this.config.logLight)
            this.log.debug(`[light] ${msg}`);
    }
    logLightExtended(msg) {
        if (this.config.logLightExtended)
            this.log.debug(`[light_extended] ${msg}`);
    }
    logEnergy(msg) {
        if (this.config.logEnergy)
            this.log.debug(`[energy] ${msg}`);
    }
    logEnergyExtended(msg) {
        if (this.config.logEnergyExtended)
            this.log.debug(`[energy_extended] ${msg}`);
    }
    /**
     * Collects all rooms with shutter control configured and logs the found topology.
     */
    async setupShutterControl() {
        const tree = Array.isArray(this.config.grundstueck)
            ? this.config.grundstueck
            : [];
        this.collectShutterRooms(tree, '');
        if (this.shutterRooms.size === 0) {
            this.logShutter('No rooms with shutter control configured.');
            return;
        }
        this.logShutter(`Shutter control active for ${this.shutterRooms.size} room(s).`);
        for (const room of this.shutterRooms.values()) {
            this.logShutter(`Room "${this.labelFor(room.relId)}": direction=${room.himmelsrichtung}°, ` +
                `riseOffset=${room.aufgangOffset}min, setOffset=${room.untergangOffset}min, ` +
                `glare=${room.blendschutz}, heat=${room.hitzeschutz}, ` +
                `shutters=${room.rolladenRelIds.length}`);
            for (const rel of room.rolladenRelIds)
                this.logShutter(`  Rolladen: ${this.labelFor(rel)}`);
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
                if (typeof s?.val === 'number')
                    this.currentShutterLux = s.val;
            }
            catch { /* ignore */ }
            this.logShutter(`Lux DP: ${globalLuxDpId} (current: ${this.currentShutterLux ?? 'n/a'} lx)`);
        }
        else {
            this.logShutter('No global lux sensor – lux-based shutter control unavailable.');
        }
        // ---- Subscribe outside temperature sensor for heat-protection logic ----
        const aussenTempDpId = this.findAussentemperaturDp(tree);
        if (aussenTempDpId) {
            this.shutterAussenTempDpId = aussenTempDpId;
            this.subscribeForeignStates(aussenTempDpId);
            try {
                const s = await this.getForeignStateAsync(aussenTempDpId);
                if (typeof s?.val === 'number')
                    this.currentOutsideTemp = s.val;
            }
            catch { /* ignore */ }
            this.logShutter(`Outside temp DP: ${aussenTempDpId} (current: ${this.currentOutsideTemp ?? 'n/a'}°C)`);
        }
        else {
            this.logShutter('No outside temp sensor – heat-based shutter control unavailable.');
        }
        // ---- Subscribe room temperature sensors (for heatblock room-temp check) ----
        for (const room of this.shutterRooms.values()) {
            if (!room.roomTempDpId)
                continue;
            this.shutterRoomTempDpToRoomId.set(room.roomTempDpId, room.relId);
            this.subscribeForeignStates(room.roomTempDpId);
            try {
                const s = await this.getForeignStateAsync(room.roomTempDpId);
                if (typeof s?.val === 'number')
                    room.currentRoomTemp = s.val;
            }
            catch { /* ignore */ }
            this.logShutter(`Room "${this.labelFor(room.relId)}": room temp DP: ${room.roomTempDpId} ` +
                `(current: ${room.currentRoomTemp ?? 'n/a'}°C)`);
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
    async scheduleShutterEvents(room) {
        if (room.sunriseTimer !== null) {
            clearTimeout(room.sunriseTimer);
            room.sunriseTimer = null;
        }
        if (room.sunsetTimer !== null) {
            clearTimeout(room.sunsetTimer);
            room.sunsetTimer = null;
        }
        const now = new Date();
        const times = SunCalc.getTimes(now, this.sunLat, this.sunLng);
        const sunriseMs = times.sunrise.getTime() + room.aufgangOffset * 60_000;
        const sunsetMs = times.sunset.getTime() + room.untergangOffset * 60_000;
        const msToSunrise = sunriseMs - Date.now();
        const msToSunset = sunsetMs - Date.now();
        this.logShutter(`Room "${this.labelFor(room.relId)}": sunrise@${new Date(sunriseMs).toLocaleTimeString()}, ` +
            `sunset@${new Date(sunsetMs).toLocaleTimeString()}`);
        // ---- Apply initial state ----
        const isNightMode = !!(await this.getStateAsync('global.nightMode'))?.val;
        if (msToSunset <= 0) {
            for (const rel of room.rolladenRelIds)
                await this.applyShutterState(rel, 'closed', 'startup: past sunset');
        }
        else if (msToSunrise <= 0 && !isNightMode) {
            // Daytime without night mode: run full evaluation (lux + sun + temperature)
            // Manual-mode shutters are preserved inside evaluateShutterRoom (loop skips them)
            await this.evaluateShutterRoom(room);
        }
        else {
            // Before sunrise or night mode active: close shutters, but preserve manual mode at startup
            for (const rel of room.rolladenRelIds) {
                try {
                    const cur = await this.getStateAsync(`${rel}.state`);
                    if (cur?.val === 'manual') {
                        this.logShutter(`${this.labelFor(rel)}: startup – keeping manual mode`);
                        continue;
                    }
                }
                catch { /* state not yet created – proceed */ }
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
    triggerShutterSunrise(room) {
        this.logShutter(`Room "${this.labelFor(room.relId)}": sunrise → evaluating shutter state`);
        this.evaluateShutterRoom(room).catch(e => this.log.error(`Shutter sunrise eval failed for "${this.labelFor(room.relId)}": ${e.message}`));
    }
    /** Fires at sunset (+ offset): closes all shutters. */
    triggerShutterSunset(room) {
        this.logShutter(`Room "${this.labelFor(room.relId)}": sunset → closing shutters`);
        for (const rel of room.rolladenRelIds)
            this.applyShutterState(rel, 'closed', 'sunset').catch(e => this.log.error(`Shutter sunset error: ${e.message}`));
    }
    /** Reacts to night mode changes: closes or opens shutters accordingly. */
    async handleNightModeForShutters(isNight) {
        if (this.shutterRooms.size === 0)
            return;
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
            if (this.sunLat === 0 && this.sunLng === 0) {
                this.logShutter(`Room "${this.labelFor(room.relId)}": night mode OFF, no geo`);
                continue;
            }
            const times = SunCalc.getTimes(now, this.sunLat, this.sunLng);
            const rise = new Date(times.sunrise.getTime() + room.aufgangOffset * 60_000);
            const set = new Date(times.sunset.getTime() + room.untergangOffset * 60_000);
            if (now >= rise && now < set) {
                this.logShutter(`Room "${this.labelFor(room.relId)}": night mode OFF, daytime → evaluating`);
                await this.evaluateShutterRoom(room);
            }
            else if (now < rise) {
                // Night mode ended before sunrise – reschedule so a fresh sunrise timer fires and opens the shutters.
                this.logShutter(`Room "${this.labelFor(room.relId)}": night mode OFF before sunrise → rescheduling sunrise open`);
                this.scheduleShutterEvents(room).catch(e => this.log.error(`Re-schedule after night mode off failed: ${e.message}`));
            }
            else {
                this.logShutter(`Room "${this.labelFor(room.relId)}": night mode OFF, after sunset → staying closed`);
            }
        }
    }
    /**
     * Sets the shutter’s internal state and (if steuerungAktiviert) writes the position.
     * Skips if the shutter is in manual mode.
     */
    async applyShutterState(rolladenRelId, newState, reason, forceOverrideManual = false) {
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
            }
            catch { /* state object not yet created – proceed */ }
        }
        // Get current state for change detection (and message posting)
        let prevState = null;
        try {
            const cur = await this.getStateAsync(`${rolladenRelId}.state`);
            prevState = typeof cur?.val === 'string' ? cur.val : null;
        }
        catch { /* ignore */ }
        await this.setStateAsync(`${rolladenRelId}.state`, { val: newState, ack: true });
        this.logShutter(`${this.labelFor(rolladenRelId)}: state → ${newState} [${reason}]`);
        // Post message when entering sunblock/heatblock
        const label = this.labelFor(rolladenRelId);
        if (newState === 'sunblock' && prevState !== 'sunblock') {
            this.postMessage(`shutter.${rolladenRelId}.sunblock`, 'info', `${label}: ${i18n_1.i18n.t('Sunblock activated')}`, false, 1200);
        }
        if (newState === 'heatblock' && prevState !== 'heatblock') {
            this.postMessage(`shutter.${rolladenRelId}.heatblock`, 'info', `${label}: ${i18n_1.i18n.t('Heatblock activated')}`, false, 1200);
        }
        const pos = this.getShutterTargetPosition(rolladenRelId, newState);
        if (pos === null)
            return; // sunblock/heatblock handled later; manual = no-op
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
                }
                catch { /* cannot read current position – write anyway */ }
                if (shouldWrite) {
                    await this.setForeignStateAsync(dpId, { val: pos, ack: false });
                    this.logShutter(`${this.labelFor(rolladenRelId)}: wrote position=${pos} → ${dpId}`);
                }
            }
        }
        else {
            this.logShutter(`${this.labelFor(rolladenRelId)}: steuerungAktiviert=false → would set position=${pos} [${reason}]`);
        }
    }
    /** Returns the target position (%) for a given shutter state. */
    getShutterTargetPosition(relId, state) {
        switch (state) {
            case 'open': return 100;
            case 'closed': return 0;
            case 'sunblock': return this.rolladenPosCfg.get(relId)?.sunblock ?? 20;
            case 'heatblock': return this.rolladenPosCfg.get(relId)?.heatblock ?? 0;
            default: return null;
        }
    }
    // ---- Lux / temperature / direction-based shutter evaluation ----
    /**
     * Returns true if the current sun azimuth is within ±30° of the room's window direction.
     * azimuth: 0=N, 90=E, 180=S, 270=W (same convention as suncalc2 after +180 correction).
     */
    isSunInDirection(himmelsrichtung) {
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
    async evaluateShutterRoom(room) {
        const isNightMode = !!(await this.getStateAsync('global.nightMode'))?.val;
        if (isNightMode)
            return; // night mode handler already closed shutters
        const now = new Date();
        const times = SunCalc.getTimes(now, this.sunLat, this.sunLng);
        const rise = new Date(times.sunrise.getTime() + room.aufgangOffset * 60_000);
        const set = new Date(times.sunset.getTime() + room.untergangOffset * 60_000);
        const isDay = now >= rise && now < set;
        if (!isDay) {
            for (const rel of room.rolladenRelIds)
                await this.applyShutterState(rel, 'closed', 'eval: not daytime');
            return;
        }
        const lux = this.currentShutterLux;
        const temp = this.currentOutsideTemp;
        const sunInDir = this.isSunInDirection(room.himmelsrichtung);
        const tempDiff = temp !== null ? temp - room.solltemperatur : null;
        const isOutsideHot = tempDiff !== null && tempDiff > 6;
        // Room sensor must also be > Wunschtemp+3° (if sensor configured); if no sensor, only outside decides
        const roomTempDiff = room.currentRoomTemp !== null ? room.currentRoomTemp - room.solltemperatur : null;
        const isRoomHot = room.roomTempDpId === null || (roomTempDiff !== null && roomTempDiff > 3);
        const isHot = isOutsideHot && isRoomHot;
        for (const rel of room.rolladenRelIds) {
            let curState;
            try {
                const st = await this.getStateAsync(`${rel}.state`);
                curState = (typeof st?.val === 'string' ? st.val : null) ?? 'closed';
            }
            catch {
                curState = 'closed';
            }
            if (curState === 'manual')
                continue;
            let target = null;
            if (curState !== 'heatblock') {
                // Rows 3–6: normal operation (not in heatblock)
                if (lux !== null && lux < 10_000) {
                    target = 'open'; // Row 3: low light → open
                }
                else if (lux !== null && lux > 30_000 && isHot && room.hitzeschutz) {
                    target = 'heatblock'; // Row 6: hot+bright → heatblock
                }
                else if (lux !== null && lux > 30_000 && sunInDir && room.blendschutz) {
                    target = 'sunblock'; // Row 4: bright+sun in direction → sunblock
                }
                else if (lux !== null && lux < 20_000 && !sunInDir) {
                    target = 'open'; // Row 5: moderate light, sun not in direction → open
                }
                // else: hysteresis dead-zone → no change
            }
            else {
                // Rows 7–8: currently in heatblock – check if temperature dropped
                if (!isHot) {
                    if (sunInDir && room.blendschutz) {
                        target = 'sunblock'; // Row 8: still sun in direction → downgrade to sunblock
                    }
                    else {
                        target = 'open'; // Row 7: sun not in direction → fully open
                    }
                }
                // else: still hot → stay in heatblock
            }
            if (target !== null) {
                const reason = `eval: lux=${lux ?? '?'} sun=${Math.round(this.currentSunAzimuth)}° ` +
                    `dir=${room.himmelsrichtung}°(${sunInDir ? 'in' : 'out'}) ` +
                    `Δout=${tempDiff !== null ? tempDiff.toFixed(1) : '?'}° ` +
                    `Δroom=${roomTempDiff !== null ? roomTempDiff.toFixed(1) : 'n/a'}°`;
                await this.applyShutterState(rel, target, reason);
            }
            else {
                this.logShutterExtended(`${this.labelFor(rel)}: no change (dead zone) [lux=${lux ?? '?'} ` +
                    `sun=${Math.round(this.currentSunAzimuth)}° dir=${room.himmelsrichtung}°(${sunInDir ? 'in' : 'out'})]`);
            }
        }
    }
    /** Calls evaluateShutterRoom for every configured shutter room. */
    evaluateAllShutterRooms() {
        for (const room of this.shutterRooms.values()) {
            this.evaluateShutterRoom(room).catch(e => this.log.error(`Shutter eval failed for "${this.labelFor(room.relId)}": ${e.message}`));
        }
    }
    /** Schedules a daily timer to reschedule all shutter events at midnight + 1 min. */
    scheduleShutterDailyReset() {
        const now = new Date();
        const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 1, 0);
        const ms = midnight.getTime() - now.getTime();
        this.shutterDailyTimer = setTimeout(() => {
            this.shutterDailyTimer = null;
            this.logShutter('Daily reschedule of shutter timers.');
            Promise.all(Array.from(this.shutterRooms.values()).map(r => this.scheduleShutterEvents(r)))
                .then(() => this.scheduleShutterDailyReset())
                .catch(e => this.log.error(`Daily reschedule failed: ${e.message}`));
        }, ms);
    }
    /** Walks the tree and populates shutterRooms for rooms with rolladensteuerung=true. */
    collectShutterRooms(nodes, prefix) {
        for (const node of nodes) {
            const relId = prefix ? `${prefix}.${node.label}` : node.label;
            const cfg = node.config ?? {};
            if (node.type === 'Raum' && cfg.rolladensteuerung) {
                const rolladenRelIds = [];
                const rolladenPosDpIds = [];
                for (const child of node.children ?? []) {
                    if (child.type === 'Rolladen') {
                        const childRelId = `${relId}.${child.id}`;
                        const childCfg = child.config ?? {};
                        rolladenRelIds.push(childRelId);
                        if (childCfg.dpPosition) {
                            rolladenPosDpIds.push(childCfg.dpPosition);
                            this.rolladenRelIdToPosDp.set(childRelId, childCfg.dpPosition);
                            this.posDpToRolladen.set(childCfg.dpPosition, childRelId);
                        }
                        this.rolladenPosCfg.set(childRelId, {
                            sunblock: childCfg.sunblockPosition ?? 20,
                            heatblock: childCfg.heatblockPosition ?? 0,
                            aktiviert: childCfg.aktiviert ?? true,
                        });
                    }
                }
                this.shutterRooms.set(relId, {
                    relId,
                    himmelsrichtung: cfg.himmelsrichtung ?? 180,
                    aufgangOffset: cfg.rolladenAufgangOffset ?? 0,
                    untergangOffset: cfg.rolladenUntergangOffset ?? 0,
                    blendschutz: cfg.blendschutz ?? false,
                    hitzeschutz: cfg.hitzeschutz ?? false,
                    solltemperatur: cfg.solltemperatur ?? 20,
                    roomTempDpId: this.findRoomTempDp(node.children ?? []),
                    currentRoomTemp: null,
                    rolladenRelIds,
                    rolladenPosDpIds,
                    sunriseTimer: null,
                    sunsetTimer: null,
                });
            }
            if (node.children?.length)
                this.collectShutterRooms(node.children, relId);
        }
    }
    // ---- tree → objects sync ----
    /**
     * Synchronises the tree stored in native.grundstueck to ioBroker folder objects.
     * Creates missing folders, updates renamed ones, removes deleted ones.
     */
    async syncTreeToObjects() {
        const tree = Array.isArray(this.config.grundstueck)
            ? this.config.grundstueck
            : [];
        // 1. Create / update all objects in the tree and collect expected IDs
        const expectedIds = new Set();
        await this.processTreeNodes(tree, '', expectedIds);
        // 2. Remove objects that are no longer in the tree
        //    Only touch objects we own (marked via native.fautNodeId).
        const allObjects = await this.getAdapterObjectsAsync();
        const toDelete = [];
        for (const [fullId, obj] of Object.entries(allObjects)) {
            const native = obj.native;
            const isFautManaged = (obj.type === 'folder' && native?.fautNodeId) ||
                (obj.type === 'state' && native?.fautStateKey);
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
    async processTreeNodes(nodes, prefix, expectedIds) {
        for (const node of nodes) {
            const relId = prefix ? `${prefix}.${node.label}` : node.label;
            expectedIds.add(relId);
            await this.extendObjectAsync(relId, {
                type: 'folder',
                common: {
                    name: node.label,
                },
                native: {
                    fautNodeId: node.id, // original node-{timestamp} stored for reference
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
    async syncSensorStates(node, folderRelId, expectedIds) {
        const cfg = node.config ?? {};
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
                    ...(spec.unit !== undefined ? { unit: spec.unit } : {}),
                    ...(spec.def !== undefined ? { def: spec.def } : {}),
                    ...(spec.states !== undefined ? { states: spec.states } : {}),
                },
                native: {
                    fautStateKey: spec.id,
                    fautNodeId: node.id,
                },
            });
        }
    }
    getSensorStateSpecs(nodeType, cfg) {
        const specs = [];
        // Type-specific value states
        if (nodeType === 'Temperatur') {
            if (cfg.dpTemperatur)
                specs.push({ id: 'temperature', name: 'Temperature', dataType: 'number', role: 'value.temperature', unit: '°C' });
            if (cfg.dpLuftfeuchtigkeit)
                specs.push({ id: 'humidity', name: 'Humidity', dataType: 'number', role: 'value.humidity', unit: '%' });
        }
        else if (nodeType === 'Helligkeit') {
            if (cfg.dpLux)
                specs.push({ id: 'lux', name: 'Lux', dataType: 'number', role: 'value.brightness', unit: 'lux' });
        }
        else if (nodeType === 'Bewegung') {
            if (cfg.dpBewegung)
                specs.push({ id: 'motion', name: 'Motion', dataType: 'boolean', role: 'sensor.motion', def: false });
        }
        else if (nodeType === 'Fenster/Tür') {
            if (cfg.dpFensterTuer)
                specs.push({ id: 'open', name: 'Open', dataType: 'boolean', role: 'sensor.door', def: false });
        }
        else if (nodeType === 'Sonne') {
            specs.push({ id: 'sunrise', name: 'Sunrise', dataType: 'string', role: 'text' });
            specs.push({ id: 'sunset', name: 'Sunset', dataType: 'string', role: 'text' });
            specs.push({ id: 'elevation', name: 'Elevation', dataType: 'number', role: 'value', unit: '°' });
            specs.push({ id: 'azimuth', name: 'Azimuth', dataType: 'number', role: 'value', unit: '°' });
        }
        else if (nodeType === 'Rolladen') {
            specs.push({ id: 'state', name: 'State', dataType: 'string', role: 'text', def: 'open', write: true,
                states: { open: 'Open', closed: 'Closed', sunblock: 'Sunblock', heatblock: 'Heatblock', manual: 'Manual' },
            });
            specs.push({ id: 'resetManual', name: 'Reset Manual', dataType: 'boolean', role: 'button.play', def: false, write: true });
            if (cfg.dpPosition)
                specs.push({ id: 'position', name: 'Position', dataType: 'number', role: 'level.blind', unit: '%', def: 0, write: true });
        }
        else if (nodeType === 'Raum') {
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
                const sceneNames = ['Tag', 'Nacht', 'Manuell', ...(cfg.lampeSzenen ?? [])];
                specs.push({
                    id: 'scene', name: 'Scene', dataType: 'string', role: 'text', def: 'Tag',
                    states: Object.fromEntries(sceneNames.map(s => [s, s])),
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
        }
        else if (nodeType === 'Heizung') {
            specs.push({ id: 'heizperiode', name: 'Heizperiode', dataType: 'boolean', role: 'switch', def: cfg.heizperiodeAktiv ?? false, write: true });
            specs.push({ id: 'energiesparmodus', name: 'Energiesparmodus', dataType: 'boolean', role: 'switch', def: cfg.energiesparmodusAktiv ?? false, write: true });
        }
        // Common sensor states (all leaf sensor types, not Raum or Sonne)
        if (nodeType !== 'Raum' && nodeType !== 'Sonne') {
            if (cfg.batteriebetrieben)
                specs.push({ id: 'lowBat', name: 'Low Battery', dataType: 'boolean', role: 'indicator.lowbat', def: false });
            if (cfg.erreichbarkeit)
                specs.push({ id: 'unreach', name: 'Unreachable', dataType: 'boolean', role: 'indicator.unreach', def: false });
        }
        return specs;
    }
    // ---- lifecycle ----
    // ---- message management ----
    /** Generates a simple UUID v4. */
    generateUuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }
    /**
     * Posts a new notification message. If a message with the same source already exists,
     * it is replaced. Persists to global.messages and sends a Telegram notification.
     */
    /** Checks if a message should be posted: never repost if already acknowledged. */
    shouldPostMessage(source) {
        const existing = this.messages.find(m => m.source === source);
        if (!existing)
            return true; // No existing message, OK to post
        if (existing.acked)
            return false; // Already acknowledged, don't repost
        return true; // Existing but not acked, OK to update
    }
    postMessage(source, severity, message, needAck = false, msgTimeout = MSG_DEFAULT_TIMEOUT_S) {
        // Don't repost if already acknowledged
        if (!this.shouldPostMessage(source))
            return;
        // Replace existing message from same source
        this.messages = this.messages.filter(m => m.source !== source);
        const msg = {
            uuid: this.generateUuid(),
            severity, message, source, needAck, msgTimeout,
            createdAt: Date.now(),
            acked: false,
        };
        this.messages.push(msg);
        this.saveMessages().catch(e => this.log.error(`saveMessages failed: ${e.message}`));
        this.sendTelegramMessage(msg).catch(e => this.log.warn(`Telegram send failed: ${e.message}`));
    }
    /**
     * Removes an existing message by source key (e.g. when the condition that caused it is resolved).
     */
    removeMessage(source) {
        const before = this.messages.length;
        this.messages = this.messages.filter(m => m.source !== source);
        if (this.messages.length !== before) {
            this.saveMessages().catch(e => this.log.error(`saveMessages failed: ${e.message}`));
        }
    }
    /** Marks a single message as acknowledged by UUID. Starts the expiry timer. */
    ackMessage(uuid) {
        const msg = this.messages.find(m => m.uuid === uuid);
        if (msg && !msg.acked) {
            msg.acked = true;
            msg.ackedAt = Date.now();
            this.saveMessages().catch(e => this.log.error(`saveMessages failed: ${e.message}`));
        }
    }
    /** Acknowledges all pending messages. */
    ackAllMessages() {
        let changed = false;
        for (const msg of this.messages) {
            if (!msg.acked) {
                msg.acked = true;
                msg.ackedAt = Date.now();
                changed = true;
            }
        }
        if (changed) {
            this.saveMessages().catch(e => this.log.error(`saveMessages failed: ${e.message}`));
        }
    }
    /** Called every 30s – removes messages whose timeout has expired. */
    checkMessageTimeouts() {
        const now = Date.now();
        const before = this.messages.length;
        this.messages = this.messages.filter(msg => {
            if (msg.msgTimeout <= 0)
                return true;
            if (!msg.needAck) {
                // Timer starts at creation
                return now < msg.createdAt + msg.msgTimeout * 1000;
            }
            if (msg.acked && msg.ackedAt !== undefined) {
                // Timer starts after ack
                return now < msg.ackedAt + msg.msgTimeout * 1000;
            }
            return true; // needAck=true and not yet acked: keep forever
        });
        if (this.messages.length !== before) {
            this.saveMessages().catch(e => this.log.error(`saveMessages failed: ${e.message}`));
        }
    }
    /** Persists messages to global.messages state. */
    async saveMessages() {
        await this.setStateAsync('global.messages', { val: JSON.stringify(this.messages), ack: true });
    }
    /** Sends a Telegram notification for a new message. */
    async sendTelegramMessage(msg) {
        const instanz = this.config.telegramInstanz ?? '';
        if (!instanz)
            return;
        // Info messages: skip if night mode active (unless telegramSilentNachtmodus=false)
        if (msg.severity === 'info' && this.config.telegramSilentNachtmodus !== false) {
            try {
                const nightSt = await this.getStateAsync('global.nightMode');
                if (nightSt?.val === true)
                    return;
            }
            catch { /* ignore */ }
        }
        const prefix = msg.severity === 'error' ? '[ERROR]' : msg.severity === 'warning' ? '[WARN]' : '[INFO]';
        const text = `${prefix} ${msg.message}`;
        this.sendTo(instanz, 'send', { text });
    }
    /**
     * Is called when adapter shuts down – callback must be called under any circumstances!
     */
    onUnload(callback) {
        try {
            for (const timer of this.cooldownTimers.values())
                clearTimeout(timer);
            for (const timer of this.unreachTimers.values())
                clearTimeout(timer);
            if (this.sunIntervalTimer !== null)
                clearInterval(this.sunIntervalTimer);
            if (this.shutterDailyTimer !== null)
                clearTimeout(this.shutterDailyTimer);
            if (this.consumptionMidnightTimer !== null)
                clearTimeout(this.consumptionMidnightTimer);
            if (this.messagesCheckTimer !== null)
                clearInterval(this.messagesCheckTimer);
            for (const room of this.shutterRooms.values()) {
                if (room.sunriseTimer !== null)
                    clearTimeout(room.sunriseTimer);
                if (room.sunsetTimer !== null)
                    clearTimeout(room.sunsetTimer);
            }
            callback();
        }
        catch (error) {
            this.log.error(`Error during unloading: ${error.message}`);
            callback();
        }
    }
    /**
     * Is called if a subscribed state changes.
     */
    onStateChange(id, state) {
        if (!state)
            return;
        // Mirror sensor value to own state
        const ownRelId = this.dpToStateMap.get(id);
        if (ownRelId) {
            this.setStateAsync(ownRelId, { val: state.val, ack: true }).catch(e => {
                this.log.error(`Failed to mirror ${id} → ${ownRelId}: ${e.message}`);
            });
        }
        // Room presence: react to motion changes
        if (this.dpToRoomsMotion.has(id)) {
            this.handleMotionChange(id, state.val === true).catch(e => {
                this.log.error(`handleMotionChange error for ${id}: ${e.message}`);
            });
        }
        // Room darkness: react to lux changes
        if (this.dpToRoomsLux.has(id)) {
            const lux = typeof state.val === 'number' ? state.val : null;
            if (lux !== null) {
                this.handleLuxChange(id, lux).catch(e => {
                    this.log.error(`handleLuxChange error for ${id}: ${e.message}`);
                });
            }
        }
        // LowBat: battery DP changed
        if (this.dpToLowBatMap.has(id)) {
            const lowBatRelId = this.dpToLowBatMap.get(id);
            const cur = this.lowBatValues.get(lowBatRelId) ?? false;
            const newVal = this.computeLowBat(state.val, cur);
            const changed = cur !== newVal;
            this.lowBatValues.set(lowBatRelId, newVal);
            this.setStateAsync(lowBatRelId, { val: newVal, ack: true }).catch(e => {
                this.log.error(`LowBat update failed for ${lowBatRelId}: ${e.message}`);
            });
            // Post message on state change
            if (changed) {
                const baseRelId = lowBatRelId.endsWith('.lowBat') ? lowBatRelId.slice(0, -7) : lowBatRelId;
                const label = this.labelFor(baseRelId);
                if (newVal) {
                    this.postMessage(`lowbat.${lowBatRelId}`, 'warning', `${label}: ${i18n_1.i18n.t('Low battery')}`, false);
                }
                else {
                    this.removeMessage(`lowbat.${lowBatRelId}`);
                    this.postMessage(`lowbat.${lowBatRelId}.restored`, 'info', `${label}: ${i18n_1.i18n.t('Battery OK')}`, false, 600);
                }
            }
        }
        // Unreach: trigger DP updated → sensor is reachable again; restart timer
        if (this.dpToUnreachMap.has(id)) {
            const unreachRelId = this.dpToUnreachMap.get(id);
            const wasUnreach = this.unreachValues.get(unreachRelId) ?? false;
            const existing = this.unreachTimers.get(unreachRelId);
            if (existing !== undefined)
                clearTimeout(existing);
            this.setStateAsync(unreachRelId, { val: false, ack: true }).catch(e => {
                this.log.error(`Unreach clear failed for ${unreachRelId}: ${e.message}`);
            });
            this.unreachValues.set(unreachRelId, false);
            // Post message if sensor was unreachable and is now back
            if (wasUnreach) {
                const baseRelId = unreachRelId.endsWith('.unreach') ? unreachRelId.slice(0, -8) : unreachRelId; // Remove '.unreach' suffix
                const label = this.labelFor(baseRelId);
                this.removeMessage(`unreach.${unreachRelId}`);
                if (label && label !== baseRelId) {
                    this.postMessage(`unreach.${unreachRelId}.restored`, 'info', `${label}: ${i18n_1.i18n.t('Reachable again')}`, false, 600);
                }
                else {
                    this.postMessage(`unreach.${unreachRelId}.restored`, 'info', `[${unreachRelId}]: ${i18n_1.i18n.t('Reachable again')}`, false, 600);
                }
            }
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
                            this.setStateAsync(`${rolladenRelId}.state`, { val: 'manual', ack: true }).catch(e => this.log.error(`Auto-manual failed for ${rolladenRelId}: ${e.message}`));
                        }
                    }
                }
                else {
                    this.logShutterExtended(`DP changed: ${id} = ${JSON.stringify(state.val)} [from: ${fromAdapter}]`);
                }
            }
        }
        // Night mode: external DP changed → mirror to own state
        if (this.nightModeDpId && id === this.nightModeDpId) {
            this.setStateAsync('global.nightMode', { val: !!state.val, ack: true }).catch(e => {
                this.log.error(`Night mode mirror failed: ${e.message}`);
            });
            return;
        }
        // Night mode: own state written (ack=false) → write-through to external DP
        if (id === `${this.namespace}.global.nightMode` && !state.ack && this.nightModeDpId) {
            this.setForeignStateAsync(this.nightModeDpId, { val: !!state.val, ack: false }).catch(e => {
                this.log.error(`Night mode write-through failed: ${e.message}`);
            });
        }
        // global.messages: external write (ack=false) → apply acks from VIS
        if (id === `${this.namespace}.global.messages` && !state.ack && typeof state.val === 'string') {
            try {
                const incoming = JSON.parse(state.val);
                for (const ext of incoming) {
                    const local = this.messages.find(m => m.uuid === ext.uuid);
                    if (local && !local.acked && ext.acked) {
                        local.acked = true;
                        local.ackedAt = ext.ackedAt ?? Date.now();
                    }
                }
                this.saveMessages().catch(e => this.log.error(`saveMessages (VIS ack) failed: ${e.message}`));
            }
            catch (e) {
                this.log.warn(`global.messages external write parse error: ${e.message}`);
            }
            return;
        }
        // Rolladen: resetManual button → exit manual mode and re-evaluate shutter state
        if (!state.ack && id.startsWith(`${this.namespace}.`) && id.endsWith('.resetManual') && !!state.val) {
            const rolladenRelId = id.slice(this.namespace.length + 1).replace(/\.resetManual$/, '');
            const roomRelId = this.rolladenToRoom.get(rolladenRelId);
            const room = roomRelId ? this.shutterRooms.get(roomRelId) : undefined;
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
                    }
                    catch (e) {
                        this.log.error(`resetManual failed for ${this.labelFor(rolladenRelId)}: ${e.message}`);
                    }
                })();
            }
        }
        // Night mode: react for shutter control on confirmed state (ack=true, or no ext DP)
        if (id === `${this.namespace}.global.nightMode` && (state.ack || !this.nightModeDpId)) {
            this.handleNightModeForShutters(!!state.val).catch(e => {
                this.log.error(`Shutter night mode reaction failed: ${e.message}`);
            });
            // Also update climate setpoints when night mode changes
            if (this.climateRooms.size > 0) {
                this.updateAllClimateSetpoints().catch(e => {
                    this.log.error(`Climate night mode update failed: ${e.message}`);
                });
            }
            // Light control: update scene for all lichtsteuerung rooms
            if (this.lightRoomIds.size > 0) {
                this.handleNightModeForLights(!!state.val).catch(e => {
                    this.log.error(`Light night mode update failed: ${e.message}`);
                });
            }
        }
        // Shutter: global lux changed → update cache and re-evaluate all shutter rooms
        if (this.shutterGlobalLuxDpId && id === this.shutterGlobalLuxDpId && typeof state.val === 'number') {
            this.currentShutterLux = state.val;
            if (this.shutterRooms.size > 0)
                this.evaluateAllShutterRooms();
        }
        // Shutter: outside temperature changed → update cache and re-evaluate all shutter rooms
        if (this.shutterAussenTempDpId && id === this.shutterAussenTempDpId && typeof state.val === 'number') {
            this.currentOutsideTemp = state.val;
            if (this.shutterRooms.size > 0)
                this.evaluateAllShutterRooms();
        }
        // Shutter: room temperature changed → update cache and re-evaluate that room
        if (this.shutterRoomTempDpToRoomId.has(id) && typeof state.val === 'number') {
            const roomRelId = this.shutterRoomTempDpToRoomId.get(id);
            const room = this.shutterRooms.get(roomRelId);
            if (room) {
                room.currentRoomTemp = state.val;
                this.evaluateShutterRoom(room).catch(e => this.log.error(`Shutter room-temp eval failed for "${this.labelFor(roomRelId)}": ${e.message}`));
            }
        }
        // Consumption tracking: source DP changed (foreign state)
        if (this.consumptionDpToTrackers.has(id)) {
            this.handleConsumptionDpChange(id, state.val);
        }
        // Consumption tracking: user wrote new anchors JSON (own state, ack=false)
        if (!state.ack && id.startsWith(`${this.namespace}.global.consumption.`) && id.endsWith('._anchors')) {
            this.handleConsumptionAnchorWrite(id.slice(this.namespace.length + 1), state.val).catch(e => this.log.error(`Consumption anchor write failed: ${e.message}`));
            return;
        }
        // Energy: Wechselrichter power or Netzbezug changed → recalc Hausverbrauch
        if (this.energieVerbrauchDpId === id || this.wechselrichterPowerDps.has(id)) {
            this.energiePowerCache.set(id, Number(state.val) || 0);
            this.recalcHausverbrauch().catch(e => {
                this.log.error(`Hausverbrauch recalc failed: ${e.message}`);
            });
        }
        // Energy: Batteriespeicher Wh changed → update cache + recalc batteryreserve
        if (this.batterieDps.has(id)) {
            this.batterieWhCache.set(id, Number(state.val) || 0);
            this.recalcBatteryReserve().catch(e => {
                this.log.error(`BatteryReserve recalc failed: ${e.message}`);
            });
        }
        // Energy: Solarpanel W changed → update cache + recalc solarpower
        if (this.solarpanelDps.has(id)) {
            this.solarpanelWCache.set(id, Number(state.val) || 0);
            this.recalcSolarPower().catch(e => {
                this.log.error(`SolarPower recalc failed: ${e.message}`);
            });
        }
        // Climate: Heizung state write-through (ack=false) and setpoint update (ack=true)
        if (this.heizungRelId) {
            const hpId = `${this.namespace}.${this.heizungRelId}.heizperiode`;
            const esId = `${this.namespace}.${this.heizungRelId}.energiesparmodus`;
            if (id === hpId || id === esId) {
                if (!state.ack) {
                    this.setStateAsync(id.slice(this.namespace.length + 1), { val: !!state.val, ack: true }).catch(e => {
                        this.log.error(`Heizung write-through failed: ${e.message}`);
                    });
                }
                else {
                    this.updateAllClimateSetpoints().catch(e => {
                        this.log.error(`Climate heizung update failed: ${e.message}`);
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
                    this.log.error(`Climate presence update failed: ${e.message}`);
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
                    }
                    catch (e) {
                        this.log.error(`Scene apply failed for ${this.labelFor(roomRelId)}: ${e.message}`);
                    }
                })();
            }
        }
    }
}
if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options) => new Faut(options);
}
else {
    // otherwise start the instance directly
    (() => new Faut())();
}
//# sourceMappingURL=main.js.map