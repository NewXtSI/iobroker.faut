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
class Faut extends utils.Adapter {
    /** Maps a foreign state ID (source DP) to the relative ID of our own state. */
    dpToStateMap = new Map();
    constructor(options = {}) {
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
    async onReady() {
        this.log.info('Faut adapter started');
        this.setState('info.connection', { val: true, ack: true });
        await this.syncTreeToObjects();
        if (!this.config.aktiviert) {
            this.log.info('Adapter inactive (aktiviert = false) – no sensor subscriptions.');
            return;
        }
        await this.setupSensorSubscriptions();
    }
    // ---- sensor subscriptions ----
    /**
     * Subscribes to all configured source data points and reads their current values.
     * Only called when aktiviert = true.
     */
    async setupSensorSubscriptions() {
        const tree = Array.isArray(this.config.grundstueck)
            ? this.config.grundstueck
            : [];
        this.collectDpMappings(tree, '');
        if (this.dpToStateMap.size === 0) {
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
    }
    /**
     * Recursively collects (foreignDpId → ownStateRelId) mappings from the tree.
     */
    collectDpMappings(nodes, prefix) {
        for (const node of nodes) {
            const relId = prefix ? `${prefix}.${node.id}` : node.id;
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
            if (node.children?.length)
                this.collectDpMappings(node.children, relId);
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
                    write: false,
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
        }
        // Common sensor states (all leaf sensor types, not Raum)
        if (nodeType !== 'Raum') {
            if (cfg.batteriebetrieben)
                specs.push({ id: 'lowBat', name: 'Low Battery', dataType: 'boolean', role: 'indicator.lowbat', def: false });
            if (cfg.erreichbarkeit)
                specs.push({ id: 'unreach', name: 'Unreachable', dataType: 'boolean', role: 'indicator.unreach', def: false });
        }
        return specs;
    }
    // ---- lifecycle ----
    /**
     * Is called when adapter shuts down – callback must be called under any circumstances!
     */
    onUnload(callback) {
        try {
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
            return; // state deleted, nothing to mirror
        const ownRelId = this.dpToStateMap.get(id);
        if (!ownRelId)
            return; // not one of our tracked source DPs
        this.setStateAsync(ownRelId, { val: state.val, ack: true }).catch(e => {
            this.log.error(`Failed to mirror ${id} → ${ownRelId}: ${e.message}`);
        });
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