/*
 * Created with @iobroker/create-adapter
 */

import * as utils from '@iobroker/adapter-core';
import { type FautTreeNode } from './lib/treeTypes';

class Faut extends utils.Adapter {
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
			if (obj.type === 'folder' && (obj.native as Record<string, unknown>)?.fautNodeId) {
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

		this.log.info(`Tree sync complete: ${expectedIds.size} folder(s), ${toDelete.length} removed.`);
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

			if (node.children?.length) {
				await this.processTreeNodes(node.children, relId, expectedIds);
			}
		}
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
		if (state) {
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
		} else {
			this.log.info(`state ${id} deleted`);
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
