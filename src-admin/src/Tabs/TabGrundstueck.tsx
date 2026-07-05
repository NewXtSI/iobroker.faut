import React, { useState } from 'react';
import { SimpleTreeView, TreeItem } from '@mui/x-tree-view';
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    IconButton,
    TextField,
    Typography,
    Paper,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { I18n } from '@iobroker/adapter-react-v5';

interface TreeNode {
    id: string;
    label: string;
    children?: TreeNode[];
}

interface TabGrundstueckProps {
    common: Record<string, any>;
    socket: any;
    native: Record<string, any>;
    instance: number;
    adapterName: string;
    onChange: (attr: string, value: any) => void;
}

const initialTree: TreeNode[] = [
    {
        id: '1',
        label: 'Gebäude',
        children: [
            { id: '1-1', label: 'Wohnhaus' },
            { id: '1-2', label: 'Garage' },
        ],
    },
    {
        id: '2',
        label: 'Garten',
        children: [
            { id: '2-1', label: 'Rasen' },
            { id: '2-2', label: 'Terrasse' },
        ],
    },
];

function renderTree(nodes: TreeNode[]): React.JSX.Element[] {
    return nodes.map(node => (
        <TreeItem key={node.id} itemId={node.id} label={node.label}>
            {node.children ? renderTree(node.children) : null}
        </TreeItem>
    ));
}

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

export default function TabGrundstueck(_props: TabGrundstueckProps): React.JSX.Element {
    const [tree, setTree] = useState<TreeNode[]>(initialTree);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [newLabel, setNewLabel] = useState('');

    const selectedNode = selectedId ? findNode(tree, selectedId) : null;

    const handleAdd = (): void => {
        if (!newLabel.trim()) return;
        const newNode: TreeNode = {
            id: `node-${Date.now()}`,
            label: newLabel.trim(),
        };
        setTree(prev => [...prev, newNode]);
        setNewLabel('');
        setDialogOpen(false);
    };

    return (
        <Box sx={{ display: 'flex', height: '100%', gap: 2, p: 1 }}>
            {/* Tree Panel */}
            <Box sx={{ width: 280, flexShrink: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>
                        {I18n.t('Property')}
                    </Typography>
                    <IconButton size="small" onClick={() => setDialogOpen(true)}>
                        <AddIcon />
                    </IconButton>
                </Box>
                <Paper variant="outlined" sx={{ p: 1 }}>
                    <SimpleTreeView
                        onSelectedItemsChange={(_e, id) => setSelectedId(id)}
                    >
                        {renderTree(tree)}
                    </SimpleTreeView>
                </Paper>
            </Box>

            <Divider orientation="vertical" flexItem />

            {/* Detail Panel */}
            <Box sx={{ flexGrow: 1, p: 1 }}>
                {selectedNode ? (
                    <>
                        <Typography variant="h6">{selectedNode.label}</Typography>
                        <Typography variant="body2" color="text.secondary">
                            ID: {selectedNode.id}
                        </Typography>
                    </>
                ) : (
                    <Typography color="text.secondary">
                        {I18n.t('Select an item in the tree')}
                    </Typography>
                )}
            </Box>

            {/* Add Dialog */}
            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
                <DialogTitle>{I18n.t('Add new element')}</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label={I18n.t('Name')}
                        fullWidth
                        value={newLabel}
                        onChange={e => setNewLabel(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDialogOpen(false)}>{I18n.t('Cancel')}</Button>
                    <Button onClick={handleAdd} variant="contained">
                        {I18n.t('Add')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
