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
import SpeakerIcon from '@mui/icons-material/Speaker';
import ThermostatIcon from '@mui/icons-material/Thermostat';
import WaterDropIcon from '@mui/icons-material/WaterDrop';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import Brightness5Icon from '@mui/icons-material/Brightness5';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import SolarPowerIcon from '@mui/icons-material/SolarPower';
import BatteryChargingFullIcon from '@mui/icons-material/BatteryChargingFull';
import ElectricalServicesIcon from '@mui/icons-material/ElectricalServices';

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
import RolladenDetailPanel from '../components/RolladenDetailPanel';
import PersonDetailPanel from '../components/PersonDetailPanel';
import AlexaDetailPanel from '../components/AlexaDetailPanel';
import LampeDetailPanel from '../components/LampeDetailPanel';
import HeizungDetailPanel from '../components/HeizungDetailPanel';
import EnergieDetailPanel from '../components/EnergieDetailPanel';
import EnergyNodeDetailPanel from '../components/EnergyNodeDetailPanel';
import ThermostatDetailPanel from '../components/ThermostatDetailPanel';

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
    Sonne:           Brightness5Icon,
    Thermostat:      ThermostatIcon,
    Rolladen:        BlindsIcon,
    Ventilator:      AirIcon,
    Lampe:           LightbulbIcon,
    Alexa:           SpeakerIcon,
    Wechselrichter:  ElectricalServicesIcon,
    Batteriespeicher: BatteryChargingFullIcon,
    Solarpanel:      SolarPowerIcon,
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
    value: unknown,
): FautTreeNode[] {
    return nodes.map(node => {
        if (node.id === id) return { ...node, config: { ...(node.config ?? {}), [key]: value as any } };
        if (node.children) return { ...node, children: updateNodeConfig(node.children, id, key, value) };
        return node;
    });
}

function findParentNode(nodes: FautTreeNode[], childId: string): FautTreeNode | null {
    for (const node of nodes) {
        if (node.children?.some(c => c.id === childId)) return node;
        if (node.children) {
            const found = findParentNode(node.children, childId);
            if (found) return found;
        }
    }
    return null;
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

/** Clears aussentemperatursensor on all Temperatur nodes except the one with exceptId. */
function clearAussentemperatursensor(nodes: FautTreeNode[], exceptId: string): FautTreeNode[] {
    return nodes.map(node => {
        let updated: FautTreeNode = node;
        if (node.type === 'Temperatur' && node.id !== exceptId && node.config?.aussentemperatursensor) {
            updated = { ...node, config: { ...(node.config ?? {}), aussentemperatursensor: false } };
        }
        if (node.children?.length) {
            updated = { ...updated, children: clearAussentemperatursensor(node.children, exceptId) };
        }
        return updated;
    });
}

/** Returns sibling labels for a given parent (or root-level labels when parentId is null). */
function getSiblingLabels(nodes: FautTreeNode[], parentId: string | null, excludeId?: string): string[] {
    if (parentId === null) {
        return nodes.filter(n => n.id !== excludeId).map(n => n.label.toLowerCase());
    }
    for (const node of nodes) {
        if (node.id === parentId) {
            return (node.children ?? []).filter(n => n.id !== excludeId).map(n => n.label.toLowerCase());
        }
        if (node.children) {
            const result = getSiblingLabels(node.children, parentId, excludeId);
            if (result.length >= 0 && parentId !== null) {
                // recurse deeper only if found
                const parent = node.children.find(c => c.id === parentId);
                if (parent) return result;
            }
        }
    }
    return [];
}

/** Validates that a label contains no dots (path separator). */
function isValidLabel(label: string): boolean {
    return label.trim().length > 0 && !label.includes('.');
}


export default function TabGrundstueck({ native, socket, theme, onChange, instance, adapterName }: TabGrundstueckProps): React.JSX.Element {
    const [tree, setTree] = useState<FautTreeNode[]>(() =>
        (native.grundstueck as FautTreeNode[] | undefined) ?? [],
    );
    const [selectedId, setSelectedId] = useState<string | null>(null);

    // add dialog state
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedType, setSelectedType] = useState<FautNodeType | ''>('');
    const [nodeLabel, setNodeLabel] = useState('');
    const [labelEdited, setLabelEdited] = useState(false);
    const [addLabelError, setAddLabelError] = useState<string | null>(null);

    // rename state
    const [renaming, setRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState('');
    const [renameLabelError, setRenameLabelError] = useState<string | null>(null);

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
        const trimmed = nodeLabel.trim();
        if (!isValidLabel(trimmed)) {
            setAddLabelError(I18n.t('Name darf keinen Punkt enthalten'));
            return;
        }
        const siblings = getSiblingLabels(tree, selectedId);
        if (siblings.includes(trimmed.toLowerCase())) {
            setAddLabelError(I18n.t('Name bereits vorhanden'));
            return;
        }
        const newNode: FautTreeNode = { id: `node-${Date.now()}`, type: selectedType, label: trimmed };
        const newTree = addNodeUnder(tree, selectedId, newNode);
        setTree(newTree);
        onChange('grundstueck', newTree);
        setAddLabelError(null);
        setDialogOpen(false);
    };

    // ---- rename ----

    const handleStartRename = (): void => {
        if (!selectedNode) return;
        setRenameValue(selectedNode.label);
        setRenameLabelError(null);
        setRenaming(true);
    };

    const handleConfirmRename = (): void => {
        if (!selectedNode || !renameValue.trim()) return;
        const trimmed = renameValue.trim();
        if (!isValidLabel(trimmed)) {
            setRenameLabelError(I18n.t('Name darf keinen Punkt enthalten'));
            return;
        }
        const parent = findParentNode(tree, selectedNode.id);
        const parentId = parent ? parent.id : null;
        const siblings = getSiblingLabels(tree, parentId, selectedNode.id);
        if (siblings.includes(trimmed.toLowerCase())) {
            setRenameLabelError(I18n.t('Name bereits vorhanden'));
            return;
        }
        const newTree = renameNode(tree, selectedNode.id, trimmed);
        setTree(newTree);
        onChange('grundstueck', newTree);
        setRenameLabelError(null);
        setRenaming(false);
    };

    const handleCancelRename = (): void => {
        setRenameLabelError(null);
        setRenaming(false);
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
                                    onChange={e => { setRenameValue(e.target.value); setRenameLabelError(null); }}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') handleConfirmRename();
                                        if (e.key === 'Escape') handleCancelRename();
                                    }}
                                    size="small"
                                    autoFocus
                                    sx={{ flexGrow: 1 }}
                                    error={!!renameLabelError}
                                    helperText={renameLabelError ?? undefined}
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
                        {NODE_TYPE_DEFS[selectedNode.type].kind === 'sensor' &&
                            selectedNode.type !== 'Sonne' &&
                            selectedNode.type !== 'Solarpanel' && (
                            <SensorDetailPanel
                                node={selectedNode}
                                socket={socket}
                                theme={theme}
                                onConfigChange={(key, value) => {
                                    let newTree = updateNodeConfig(tree, selectedNode.id, key, value);
                                    if (key === 'globalerSensor' && value === true) {
                                        newTree = clearGlobalSensor(newTree, selectedNode.id);
                                    }
                                    if (key === 'aussentemperatursensor' && value === true) {
                                        newTree = clearAussentemperatursensor(newTree, selectedNode.id);
                                    }
                                    setTree(newTree);
                                    onChange('grundstueck', newTree);
                                }}
                            />
                        )}

                        {/* Sonne info */}
                        {selectedNode.type === 'Sonne' && (
                            <Box sx={{ mt: 2, p: 1.5, borderRadius: 1, bgcolor: 'action.hover' }}>
                                <Typography variant="body2" color="text.secondary">
                                    {I18n.t('Sun data (sunrise, sunset, elevation, azimuth) is calculated automatically every 5 minutes using the geo position from ioBroker system settings.')}
                                </Typography>
                            </Box>
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

                        {/* Thermostat config */}
                        {selectedNode.type === 'Thermostat' && (
                            <ThermostatDetailPanel
                                node={selectedNode}
                                socket={socket}
                                theme={theme}
                                onConfigChange={(key, value) => {
                                    const newTree = updateNodeConfig(tree, selectedNode.id, key, value);
                                    setTree(newTree);
                                    onChange('grundstueck', newTree);
                                }}
                            />
                        )}

                        {/* Rolladen config */}
                        {selectedNode.type === 'Rolladen' && (
                            <RolladenDetailPanel
                                node={selectedNode}
                                socket={socket}
                                theme={theme}
                                onConfigChange={(key, value) => {
                                    const newTree = updateNodeConfig(tree, selectedNode.id, key, value);
                                    setTree(newTree);
                                    onChange('grundstueck', newTree);
                                }}
                            />
                        )}

                        {/* Heizung config */}
                        {selectedNode.type === 'Heizung' && (
                            <HeizungDetailPanel
                                node={selectedNode}
                                socket={socket}
                                theme={theme}
                                onConfigChange={(key, value) => {
                                    const newTree = updateNodeConfig(tree, selectedNode.id, key, value);
                                    setTree(newTree);
                                    onChange('grundstueck', newTree);
                                }}
                            />
                        )}

                        {/* Energie config */}
                        {selectedNode.type === 'Energie' && (
                            <EnergieDetailPanel
                                node={selectedNode}
                                socket={socket}
                                theme={theme}
                                onConfigChange={(key, value) => {
                                    const newTree = updateNodeConfig(tree, selectedNode.id, key, value);
                                    setTree(newTree);
                                    onChange('grundstueck', newTree);
                                }}
                            />
                        )}

                        {/* Wechselrichter / Batteriespeicher / Solarpanel config */}
                        {(selectedNode.type === 'Wechselrichter' ||
                            selectedNode.type === 'Batteriespeicher' ||
                            selectedNode.type === 'Solarpanel') && (
                            <EnergyNodeDetailPanel
                                node={selectedNode}
                                socket={socket}
                                theme={theme}
                                onConfigChange={(key, value) => {
                                    const newTree = updateNodeConfig(tree, selectedNode.id, key, value);
                                    setTree(newTree);
                                    onChange('grundstueck', newTree);
                                }}
                            />
                        )}

                        {/* Person config */}
                        {selectedNode.type === 'Person' && (
                            <PersonDetailPanel
                                node={selectedNode}
                                socket={socket}
                                adapterName={adapterName}
                                instance={instance}
                                onConfigChange={(key, value) => {
                                    const newTree = updateNodeConfig(tree, selectedNode.id, key, value);
                                    setTree(newTree);
                                    onChange('grundstueck', newTree);
                                }}
                            />
                        )}

                        {/* Alexa actor config */}
                        {selectedNode.type === 'Alexa' && (
                            <AlexaDetailPanel
                                node={selectedNode}
                                socket={socket}
                                theme={theme}
                                adapterName={adapterName}
                                instance={instance}
                                onConfigChange={(key, value) => {
                                    const newTree = updateNodeConfig(tree, selectedNode.id, key, value);
                                    setTree(newTree);
                                    onChange('grundstueck', newTree);
                                }}
                            />
                        )}

                        {/* Lampe actor config */}
                        {selectedNode.type === 'Lampe' && (
                            <LampeDetailPanel
                                node={selectedNode}
                                parentRoom={findParentNode(tree, selectedNode.id)}
                                socket={socket}
                                theme={theme}
                                onConfigChange={(key, value) => {
                                    const newTree = updateNodeConfig(tree, selectedNode.id, key, value);
                                    setTree(newTree);
                                    onChange('grundstueck', newTree);
                                }}
                                onRoomConfigChange={(key, value) => {
                                    const parent = findParentNode(tree, selectedNode.id);
                                    if (!parent) return;
                                    const newTree = updateNodeConfig(tree, parent.id, key, value);
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
                        onChange={e => { setNodeLabel(e.target.value); setLabelEdited(true); setAddLabelError(null); }}
                        onKeyDown={e => e.key === 'Enter' && handleAdd()}
                        error={!!addLabelError}
                        helperText={addLabelError ?? undefined}
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
