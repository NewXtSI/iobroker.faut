import React, { useState } from 'react';
import {
	Box,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Divider,
	IconButton,
	Paper,
	TextField,
	Tooltip,
	Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { TreeView, TreeItem } from '@mui/x-tree-view';

// ── Types ──────────────────────────────────────────────────────────────────────

interface TreeNode {
	id: string;
	label: string;
	children?: TreeNode[];
}

// ── Sample data ────────────────────────────────────────────────────────────────

const INITIAL_DATA: TreeNode[] = [
	{
		id: '1',
		label: 'Gebäude',
		children: [
			{
				id: '1-1',
				label: 'Erdgeschoss',
				children: [
					{ id: '1-1-1', label: 'Wohnzimmer' },
					{ id: '1-1-2', label: 'Küche' },
					{ id: '1-1-3', label: 'Bad' },
				],
			},
			{
				id: '1-2',
				label: 'Obergeschoss',
				children: [
					{ id: '1-2-1', label: 'Schlafzimmer' },
					{ id: '1-2-2', label: 'Arbeitszimmer' },
				],
			},
		],
	},
	{
		id: '2',
		label: 'Garten',
		children: [
			{ id: '2-1', label: 'Terrasse' },
			{ id: '2-2', label: 'Garage' },
		],
	},
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function findNode(nodes: TreeNode[], id: string): TreeNode | null {
	for (const node of nodes) {
		if (node.id === id) return node;
		if (node.children) {
			const found = findNode(node.children, id);
			if (found) return found;
		}
	}
	return null;
}

function addNode(nodes: TreeNode[], parentId: string | null, newNode: TreeNode): TreeNode[] {
	if (parentId === null) return [...nodes, newNode];
	return nodes.map(node => {
		if (node.id === parentId) {
			return { ...node, children: [...(node.children ?? []), newNode] };
		}
		if (node.children) {
			return { ...node, children: addNode(node.children, parentId, newNode) };
		}
		return node;
	});
}

function renderNodes(nodes: TreeNode[]): React.ReactNode {
	return nodes.map(node => (
		<TreeItem key={node.id} itemId={node.id} label={node.label}>
			{node.children ? renderNodes(node.children) : null}
		</TreeItem>
	));
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function TabGrundstueck(): React.JSX.Element {
	const [treeData, setTreeData] = useState<TreeNode[]>(INITIAL_DATA);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [newName, setNewName] = useState('');

	const selectedNode = selectedId ? findNode(treeData, selectedId) : null;

	const openDialog = (): void => {
		setNewName('');
		setDialogOpen(true);
	};

	const handleAdd = (): void => {
		const trimmed = newName.trim();
		if (!trimmed) return;
		const newNode: TreeNode = { id: `node-${Date.now()}`, label: trimmed };
		setTreeData(prev => addNode(prev, selectedId, newNode));
		setDialogOpen(false);
	};

	return (
		<Box sx={{ display: 'flex', height: 'calc(100vh - 160px)', gap: 2 }}>
			{/* ── Left: Tree ─────────────────────────────────────────────────── */}
			<Paper
				variant="outlined"
				sx={{ width: 260, minWidth: 200, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
			>
				<Box
					sx={{
						display: 'flex',
						alignItems: 'center',
						px: 1.5,
						py: 0.75,
						borderBottom: '1px solid',
						borderColor: 'divider',
					}}
				>
					<Typography variant="subtitle2" sx={{ flex: 1 }}>
						Grundstück
					</Typography>
					<Tooltip title={selectedId ? `Unter "${selectedNode?.label}" hinzufügen` : 'Auf oberster Ebene hinzufügen'}>
						<IconButton size="small" onClick={openDialog}>
							<AddIcon fontSize="small" />
						</IconButton>
					</Tooltip>
				</Box>

				<Box sx={{ flex: 1, overflow: 'auto', py: 0.5 }}>
					<TreeView
						onNodeSelect={(_e: React.SyntheticEvent, nodeId: string) =>
							setSelectedId(nodeId)
						}
					>
						{renderNodes(treeData)}
					</TreeView>
				</Box>
			</Paper>

			{/* ── Right: Detail ──────────────────────────────────────────────── */}
			<Paper variant="outlined" sx={{ flex: 1, p: 2, overflow: 'auto' }}>
				{selectedNode ? (
					<>
						<Typography variant="h6" gutterBottom>
							{selectedNode.label}
						</Typography>
						<Divider sx={{ mb: 2 }} />
						<Typography variant="body2" color="text.secondary">
							<strong>ID:</strong> {selectedNode.id}
						</Typography>
						<Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
							<strong>Unterelemente:</strong> {selectedNode.children?.length ?? 0}
						</Typography>
					</>
				) : (
					<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
						<Typography color="text.secondary">Bitte ein Element auswählen</Typography>
					</Box>
				)}
			</Paper>

			{/* ── Add dialog ─────────────────────────────────────────────────── */}
			<Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
				<DialogTitle>
					{selectedId
						? `Element unter "${selectedNode?.label}" hinzufügen`
						: 'Element auf oberster Ebene hinzufügen'}
				</DialogTitle>
				<DialogContent>
					<TextField
						autoFocus
						label="Name"
						fullWidth
						value={newName}
						onChange={e => setNewName(e.target.value)}
						onKeyDown={e => e.key === 'Enter' && handleAdd()}
						sx={{ mt: 1 }}
					/>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setDialogOpen(false)}>Abbrechen</Button>
					<Button onClick={handleAdd} variant="contained" disabled={!newName.trim()}>
						Hinzufügen
					</Button>
				</DialogActions>
			</Dialog>
		</Box>
	);
}
