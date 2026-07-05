import React, { useState } from 'react';
import { SimpleTreeView, TreeItem } from '@mui/x-tree-view';
import {
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControl,
    IconButton,
    InputLabel,
    MenuItem,
    Select,
    TextField,
    Typography,
    Paper,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { I18n } from '@iobroker/adapter-react-v5';
import {
    type FautTreeNode,
    type FautNodeType,
    ALLOWED_CHILDREN,
    NODE_TYPE_DEFS,
} from '../types/treeTypes';

interface TabGrundstueckProps {
    common: Record<string, any>;
    socket: any;
    native: Record<string, any>;
    instance: number;
    adapterName: string;
    onChange: (attr: string, value: any) => void;
}

// ---- tree helpers ----

function renderTree(nodes: FautTreeNode[]): React.JSX.Element[] {
    return nodes.map(node => {
        const def = NODE_TYPE_DEFS[node.type];
        const labelEl = (
            <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <span>{node.label}</span>
                {node.label !== def.label && (
                    <Chip
                        label={def.label}
                        size="small"
                        variant="outlined"
                        sx={{ height: 16, fontSize: '0.65rem' }}
                    />
                )}
            </Box>
        );
        return (
            <TreeItem key={node.id} itemId={node.id} label={labelEl}>
                {node.children ? renderTree(node.children) : null}
            </TreeItem>
        );
    });
}

function findNode(nodes: FautTreeNode[], id: string): FautTreeNode | null {
    for (const node of nodes) {
        if (node.id === id) return node;
        if (node.children) {
            const found = findNode(node.children, id);
            if (found) return found;
        }
    }
    return null;
}

function addNodeUnder(
    nodes: FautTreeNode[],
    parentId: string | null,
    newNode: FautTreeNode,
): FautTreeNode[] {
    if (parentId === null) {
        return [...nodes, newNode];
    }
    return nodes.map(node => {
        if (node.id === parentId) {
            return { ...node, children: [...(node.children ?? []), newNode] };
        }
        if (node.children) {
            return { ...node, children: addNodeUnder(node.children, parentId, newNode) };
        }
        return node;
    });
}

// ---- component ----

export default function TabGrundstueck({ native, onChange }: TabGrundstueckProps): React.JSX.Element {
    const [tree, setTree] = useState<FautTreeNode[]>(() =>
        (native.grundstueck as FautTreeNode[] | undefined) ?? [],
    );
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);

    // dialog state
    const [selectedType, setSelectedType] = useState<FautNodeType | ''>('');
    const [nodeLabel, setNodeLabel] = useState('');
    // track whether user manually edited the label
    const [labelEdited, setLabelEdited] = useState(false);

    const selectedNode = selectedId ? findNode(tree, selectedId) : null;
    const parentKey: 'root' | FautNodeType = selectedNode ? selectedNode.type : 'root';
    const allowedTypes: FautNodeType[] = ALLOWED_CHILDREN[parentKey];

    const handleOpenDialog = (): void => {
        const firstType = allowedTypes[0] ?? '';
        setSelectedType(firstType as FautNodeType | '');
        setNodeLabel(firstType ? NODE_TYPE_DEFS[firstType as FautNodeType].label : '');
        setLabelEdited(false);
        setDialogOpen(true);
    };

    const handleTypeChange = (type: FautNodeType): void => {
        setSelectedType(type);
        // Auto-update label only if user hasn't manually changed it
        if (!labelEdited) {
            setNodeLabel(NODE_TYPE_DEFS[type].label);
        }
    };

    const handleLabelChange = (value: string): void => {
        setNodeLabel(value);
        setLabelEdited(true);
    };

    const handleAdd = (): void => {
        if (!selectedType || !nodeLabel.trim()) return;
        const newNode: FautTreeNode = {
            id: `node-${Date.now()}`,
            type: selectedType,
            label: nodeLabel.trim(),
        };
        const newTree = addNodeUnder(tree, selectedId, newNode);
        setTree(newTree);
        onChange('grundstueck', newTree);
        setDialogOpen(false);
    };

    const dialogTitle = selectedNode
        ? `${I18n.t('Add under')} "${selectedNode.label}"`
        : I18n.t('Add root element');

    return (
        <Box sx={{ display: 'flex', height: '100%', gap: 2, p: 1 }}>
            {/* Tree Panel */}
            <Box sx={{ width: 300, flexShrink: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>
                        {I18n.t('Property')}
                    </Typography>
                    <IconButton
                        size="small"
                        onClick={handleOpenDialog}
                        disabled={allowedTypes.length === 0}
                        title={dialogTitle}
                    >
                        <AddIcon />
                    </IconButton>
                </Box>
                <Paper variant="outlined" sx={{ p: 1, minHeight: 200 }}>
                    {tree.length === 0 ? (
                        <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
                            {I18n.t('Tree is empty. Click + to add.')}
                        </Typography>
                    ) : (
                        <SimpleTreeView onSelectedItemsChange={(_e, id) => setSelectedId(id)}>
                            {renderTree(tree)}
                        </SimpleTreeView>
                    )}
                </Paper>
            </Box>

            <Divider orientation="vertical" flexItem />

            {/* Detail Panel */}
            <Box sx={{ flexGrow: 1, p: 1 }}>
                {selectedNode ? (
                    <>
                        <Typography variant="h6">{selectedNode.label}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            {I18n.t('Type')}: {NODE_TYPE_DEFS[selectedNode.type].label}
                        </Typography>
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
            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="xs">
                <DialogTitle>{dialogTitle}</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
                    <FormControl fullWidth>
                        <InputLabel>{I18n.t('Type')}</InputLabel>
                        <Select
                            value={selectedType}
                            label={I18n.t('Type')}
                            onChange={e => handleTypeChange(e.target.value as FautNodeType)}
                        >
                            {allowedTypes.map(type => (
                                <MenuItem key={type} value={type}>
                                    {NODE_TYPE_DEFS[type].label}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <TextField
                        label={I18n.t('Name')}
                        fullWidth
                        value={nodeLabel}
                        onChange={e => handleLabelChange(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDialogOpen(false)}>{I18n.t('Cancel')}</Button>
                    <Button
                        onClick={handleAdd}
                        variant="contained"
                        disabled={!selectedType || !nodeLabel.trim()}
                    >
                        {I18n.t('Add')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
