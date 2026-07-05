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
    InputAdornment,
    InputLabel,
    MenuItem,
    Select,
    TextField,
    Typography,
    Paper,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import AirIcon from '@mui/icons-material/Air';
import BlindsIcon from '@mui/icons-material/Blinds';
import BoltIcon from '@mui/icons-material/Bolt';
import DeviceThermostatIcon from '@mui/icons-material/DeviceThermostat';
import DoorFrontIcon from '@mui/icons-material/DoorFront';
import DirectionsRunIcon from '@mui/icons-material/DirectionsRun';
import HomeIcon from '@mui/icons-material/Home';
import LayersIcon from '@mui/icons-material/Layers';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import ParkIcon from '@mui/icons-material/Park';
import PersonIcon from '@mui/icons-material/Person';
import ThermostatIcon from '@mui/icons-material/Thermostat';
import WaterDropIcon from '@mui/icons-material/WaterDrop';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import WhatshotIcon from '@mui/icons-material/Whatshot';

import { I18n, type IobTheme } from '@iobroker/adapter-react-v5';
import {
    type FautNodeConfig,
    type FautTreeNode,
    type FautNodeType,
    ALLOWED_CHILDREN,
    NODE_TYPE_DEFS,
} from '../types/treeTypes';
import SensorDetailPanel from '../components/SensorDetailPanel';
import RaumDetailPanel from '../components/RaumDetailPanel';

// ---- icon map ----

type SvgIconComponent = React.ComponentType<{ sx?: object; fontSize?: 'inherit' | 'small' | 'medium' | 'large' }>;

const TYPE_ICONS: Record<FautNodeType, SvgIconComponent> = {
    Garten:          ParkIcon,
    Gebäude:         HomeIcon,
    Heizung:         WhatshotIcon,
    Energie:         BoltIcon,
    Umwelt:          WbSunnyIcon,
    Person:          PersonIcon,
    Etage:           LayersIcon,
    Raum:            MeetingRoomIcon,
    Temperatur:      DeviceThermostatIcon,
    Helligkeit:      WbSunnyIcon,
    Regen:           WaterDropIcon,
    Bewegung:        DirectionsRunIcon,
    'Fenster/Tür':   DoorFrontIcon,
    Thermostat:      ThermostatIcon,
    Rolladen:        BlindsIcon,
    Ventilator:      AirIcon,
    Lampe:           LightbulbIcon,
};

// ---- props ----

interface TabGrundstueckProps {
    common: Record<string, any>;
    socket: any;
    theme: IobTheme;
    native: Record<string, any>;
    instance: number;
    adapterName: string;
    onChange: (attr: string, value: any) => void;
}

// ---- tree helpers ----

function renderTree(nodes: FautTreeNode[]): React.JSX.Element[] {
    return nodes.map(node => {
        const def = NODE_TYPE_DEFS[node.type];
        const Icon = TYPE_ICONS[node.type];
        const labelEl = (
            <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Icon fontSize="small" sx={{ color: 'text.secondary', flexShrink: 0 }} />
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

function addNodeUnder(nodes: FautTreeNode[], parentId: string | null, newNode: FautTreeNode): FautTreeNode[] {
    if (parentId === null) return [...nodes, newNode];
    return nodes.map(node => {
        if (node.id === parentId) return { ...node, children: [...(node.children ?? []), newNode] };
        if (node.children) return { ...node, children: addNodeUnder(node.children, parentId, newNode) };
        return node;
    });
}

function renameNode(nodes: FautTreeNode[], id: string, newLabel: string): FautTreeNode[] {
    return nodes.map(node => {
        if (node.id === id) return { ...node, label: newLabel };
        if (node.children) return { ...node, children: renameNode(node.children, id, newLabel) };
        return node;
    });
}

function updateNodeConfig(
    nodes: FautTreeNode[],
    id: string,
    key: keyof FautNodeConfig,
    value: string | boolean | number,
): FautTreeNode[] {
    return nodes.map(node => {
        if (node.id === id) return { ...node, config: { ...(node.config ?? {}), [key]: value } };
        if (node.children) return { ...node, children: updateNodeConfig(node.children, id, key, value) };
        return node;
    });
}

/** Clears globalerSensor on all Helligkeit nodes except the one with exceptId. */
function clearGlobalSensor(nodes: FautTreeNode[], exceptId: string): FautTreeNode[] {
    return nodes.map(node => {
        let updated: FautTreeNode = node;
        if (node.type === 'Helligkeit' && node.id !== exceptId && node.config?.globalerSensor) {
            updated = { ...node, config: { ...(node.config ?? {}), globalerSensor: false } };
        }
        if (node.children?.length) {
            updated = { ...updated, children: clearGlobalSensor(node.children, exceptId) };
        }
        return updated;
    });
}

// ---- component ----

export default function TabGrundstueck({ native, socket, theme, onChange }: TabGrundstueckProps): React.JSX.Element {
    const [tree, setTree] = useState<FautTreeNode[]>(() =>
        (native.grundstueck as FautTreeNode[] | undefined) ?? [],
    );
    const [selectedId, setSelectedId] = useState<string | null>(null);

    // add dialog state
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedType, setSelectedType] = useState<FautNodeType | ''>('');
    const [nodeLabel, setNodeLabel] = useState('');
    const [labelEdited, setLabelEdited] = useState(false);

    // rename state
    const [renaming, setRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState('');

    const selectedNode = selectedId ? findNode(tree, selectedId) : null;
    const parentKey: 'root' | FautNodeType = selectedNode ? selectedNode.type : 'root';
    const allowedTypes: FautNodeType[] = ALLOWED_CHILDREN[parentKey];

    // ---- add dialog ----

    const handleOpenDialog = (): void => {
        const firstType = allowedTypes[0] ?? '';
        setSelectedType(firstType as FautNodeType | '');
        setNodeLabel(firstType ? NODE_TYPE_DEFS[firstType as FautNodeType].label : '');
        setLabelEdited(false);
        setDialogOpen(true);
    };

    const handleTypeChange = (type: FautNodeType): void => {
        setSelectedType(type);
        if (!labelEdited) setNodeLabel(NODE_TYPE_DEFS[type].label);
    };

    const handleAdd = (): void => {
        if (!selectedType || !nodeLabel.trim()) return;
        const newNode: FautTreeNode = { id: `node-${Date.now()}`, type: selectedType, label: nodeLabel.trim() };
        const newTree = addNodeUnder(tree, selectedId, newNode);
        setTree(newTree);
        onChange('grundstueck', newTree);
        setDialogOpen(false);
    };

    // ---- rename ----

    const handleStartRename = (): void => {
        if (!selectedNode) return;
        setRenameValue(selectedNode.label);
        setRenaming(true);
    };

    const handleConfirmRename = (): void => {
        if (!selectedNode || !renameValue.trim()) return;
        const newTree = renameNode(tree, selectedNode.id, renameValue.trim());
        setTree(newTree);
        onChange('grundstueck', newTree);
        setRenaming(false);
    };

    const handleCancelRename = (): void => setRenaming(false);

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
                        <SimpleTreeView onSelectedItemsChange={(_e, id) => { setSelectedId(id); setRenaming(false); }}>
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
                        {/* Name row with edit button */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            {renaming ? (
                                <TextField
                                    value={renameValue}
                                    onChange={e => setRenameValue(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') handleConfirmRename();
                                        if (e.key === 'Escape') handleCancelRename();
                                    }}
                                    size="small"
                                    autoFocus
                                    sx={{ flexGrow: 1 }}
                                    InputProps={{
                                        endAdornment: (
                                            <InputAdornment position="end">
                                                <IconButton size="small" onClick={handleConfirmRename} color="primary">
                                                    <CheckIcon fontSize="small" />
                                                </IconButton>
                                                <IconButton size="small" onClick={handleCancelRename}>
                                                    <CloseIcon fontSize="small" />
                                                </IconButton>
                                            </InputAdornment>
                                        ),
                                    }}
                                />
                            ) : (
                                <>
                                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                                        {selectedNode.label}
                                    </Typography>
                                    <IconButton size="small" onClick={handleStartRename} title={I18n.t('Rename')}>
                                        <EditIcon fontSize="small" />
                                    </IconButton>
                                </>
                            )}
                        </Box>

                        {/* Type + ID */}
                        <Typography variant="body2" color="text.secondary">
                            {I18n.t('Type')}: {NODE_TYPE_DEFS[selectedNode.type].label}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            ID: {selectedNode.id}
                        </Typography>

                        {/* Sensor config */}
                        {NODE_TYPE_DEFS[selectedNode.type].kind === 'sensor' && (
                            <SensorDetailPanel
                                node={selectedNode}
                                socket={socket}
                                theme={theme}
                                onConfigChange={(key, value) => {
                                    let newTree = updateNodeConfig(tree, selectedNode.id, key, value);
                                    if (key === 'globalerSensor' && value === true) {
                                        newTree = clearGlobalSensor(newTree, selectedNode.id);
                                    }
                                    setTree(newTree);
                                    onChange('grundstueck', newTree);
                                }}
                            />
                        )}

                        {/* Raum config */}
                        {selectedNode.type === 'Raum' && (
                            <RaumDetailPanel
                                node={selectedNode}
                                onConfigChange={(key, value) => {
                                    const newTree = updateNodeConfig(tree, selectedNode.id, key, value);
                                    setTree(newTree);
                                    onChange('grundstueck', newTree);
                                }}
                            />
                        )}
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
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        {React.createElement(TYPE_ICONS[type], { fontSize: 'small', sx: { color: 'text.secondary' } })}
                                        {NODE_TYPE_DEFS[type].label}
                                    </Box>
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <TextField
                        label={I18n.t('Name')}
                        fullWidth
                        value={nodeLabel}
                        onChange={e => { setNodeLabel(e.target.value); setLabelEdited(true); }}
                        onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDialogOpen(false)}>{I18n.t('Cancel')}</Button>
                    <Button onClick={handleAdd} variant="contained" disabled={!selectedType || !nodeLabel.trim()}>
                        {I18n.t('Add')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
