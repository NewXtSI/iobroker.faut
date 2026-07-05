/*
 * Created with @iobroker/create-adapter
 */

import * as utils from '@iobroker/adapter-core';
import { type FautNodeConfig, type FautTreeNode } from './lib/treeTypes';

class Faut extends utils.Adapter {
	/** Maps a foreign state ID (source DP) to the relative ID of our own state. */
	private readonly dpToStateMap = new Map<string, string>();

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
			} catch (e) {
				this.log.warn(`Initial read failed for ${dpId}: ${(e as Error).message}`);
			}
		}
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
			}

			if (node.children?.length) this.collectDpMappings(node.children, relId);
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
					...(spec.unit !== undefined ? { unit: spec.unit } : {}),
					...(spec.def !== undefined ? { def: spec.def } : {}),
				},
				native: {
					fautStateKey: spec.id,
					fautNodeId: node.id,
				},
			});
		}
	}

	/** Returns the list of state definitions that should exist under a sensor node. */
	private getSensorStateSpecs(
		nodeType: string,
		cfg: FautNodeConfig,
	): Array<{ id: string; name: string; dataType: ioBroker.CommonType; role: string; unit?: string; def?: boolean | number }> {
		type Spec = { id: string; name: string; dataType: ioBroker.CommonType; role: string; unit?: string; def?: boolean | number };
		const specs: Spec[] = [];

		// Type-specific value states
		if (nodeType === 'Temperatur') {
			if (cfg.dpTemperatur)      specs.push({ id: 'temperature', name: 'Temperature', dataType: 'number',  role: 'value.temperature', unit: '°C' });
			if (cfg.dpLuftfeuchtigkeit) specs.push({ id: 'humidity',    name: 'Humidity',    dataType: 'number',  role: 'value.humidity',    unit: '%' });
		} else if (nodeType === 'Helligkeit') {
			if (cfg.dpLux)             specs.push({ id: 'lux',         name: 'Lux',         dataType: 'number',  role: 'value.brightness',  unit: 'lux' });
		}

		// Common sensor states
		if (cfg.batteriebetrieben) specs.push({ id: 'lowBat',  name: 'Low Battery',  dataType: 'boolean', role: 'indicator.lowbat',  def: false });
		if (cfg.erreichbarkeit)    specs.push({ id: 'unreach', name: 'Unreachable',  dataType: 'boolean', role: 'indicator.unreach', def: false });

		return specs;
	}

	// ---- lifecycle ----

	/**
	 * Is called when adapter shuts down – callback must be called under any circumstances!
	 */
	private onUnload(callback: () => void): void {
		try {
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
		if (!state) return; // state deleted, nothing to mirror

		const ownRelId = this.dpToStateMap.get(id);
		if (!ownRelId) return; // not one of our tracked source DPs

		this.setStateAsync(ownRelId, { val: state.val, ack: true }).catch(e => {
			this.log.error(`Failed to mirror ${id} → ${ownRelId}: ${(e as Error).message}`);
		});
	}
}

if (require.main !== module) {
	// Export the constructor in compact mode
	module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new Faut(options);
} else {
	// otherwise start the instance directly
	(() => new Faut())();
}
