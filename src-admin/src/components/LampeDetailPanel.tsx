import React, { useState } from 'react';
import {
    Box,
    Checkbox,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControlLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from '@mui/material';
import { DialogSelectID, I18n, type IobTheme } from '@iobroker/adapter-react-v5';
import {
    type FautNodeConfig,
    type FautTreeNode,
    type LampeSceneConfig,
    type LampeSceneAction,
} from '../types/treeTypes';
import DpField from './DpField';

// ---- constants ----

const BUILTIN_SCENES = ['Tag', 'Nacht'];

// ---- column definitions ----

interface ColDef {
    key:    string;
    label:  string;
    type:   'boolean' | 'number' | 'string';
    setKey: keyof LampeSceneAction;
    valKey: keyof LampeSceneAction;
    dpKey:  keyof FautNodeConfig;
}

const ALL_COLUMNS: ColDef[] = [
    { key: 'schalter', label: 'Switch',   type: 'boolean', setKey: 'setSchalter',  valKey: 'schalterWert',  dpKey: 'dpLampeSchalter'  },
    { key: 'dimmer',   label: 'Dimmer',   type: 'number',  setKey: 'setDimmer',    valKey: 'dimmerWert',    dpKey: 'dpLampeDimmer'    },
    { key: 'ct',       label: 'ct',       type: 'number',  setKey: 'setCt',        valKey: 'ctWert',        dpKey: 'dpLampeCt'        },
    { key: 'colorHex', label: 'Color',    type: 'string',  setKey: 'setColorHex',  valKey: 'colorHexWert',  dpKey: 'dpLampeColorHex'  },
    { key: 'modus',    label: 'Mode',     type: 'number',  setKey: 'setModus',     valKey: 'modusWert',     dpKey: 'dpLampeModus'     },
    { key: 'szene',    label: 'Scene DP', type: 'number',  setKey: 'setSzene',     valKey: 'szeneWert',     dpKey: 'dpLampeSzene'     },
];

// ---- ActionCell ----

interface ActionCellProps {
    type:     'boolean' | 'number' | 'string';
    set?:     boolean;
    value?:   boolean | number | string;
    onChange: (set: boolean, value: boolean | number | string) => void;
}

function ActionCell({ type, set, value, onChange }: ActionCellProps): React.JSX.Element {
    const def: boolean | number | string = type === 'boolean' ? false : type === 'number' ? 0 : '';
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Checkbox
                size="small"
                checked={set ?? false}
                onChange={e => onChange(e.target.checked, value ?? def)}
                sx={{ p: 0.25 }}
            />
            {set && (
                type === 'boolean' ? (
                    <Select
                        size="small"
                        value={value === true ? 'true' : 'false'}
                        onChange={e => onChange(true, e.target.value === 'true')}
                        sx={{ minWidth: 72, fontSize: '0.75rem' }}
                    >
                        <MenuItem value="true">true</MenuItem>
                        <MenuItem value="false">false</MenuItem>
                    </Select>
                ) : type === 'number' ? (
                    <TextField
                        type="number"
                        size="small"
                        value={value ?? 0}
                        onChange={e => onChange(true, Number(e.target.value))}
                        sx={{ width: 72 }}
                        inputProps={{ style: { fontSize: '0.75rem', padding: '4px 6px' } }}
                    />
                ) : (
                    <TextField
                        size="small"
                        value={value ?? ''}
                        onChange={e => onChange(true, e.target.value)}
                        sx={{ width: 90 }}
                        inputProps={{ style: { fontSize: '0.75rem', padding: '4px 6px' } }}
                    />
                )
            )}
        </Box>
    );
}

// ---- main component ----

interface Props {
    node:               FautTreeNode;
    parentRoom:         FautTreeNode | null;
    socket:             any;
    theme:              IobTheme;
    onConfigChange:     (key: keyof FautNodeConfig, value: unknown) => void;
    onRoomConfigChange: (key: keyof FautNodeConfig, value: unknown) => void;
}

export default function LampeDetailPanel({
    node, parentRoom, socket, theme, onConfigChange, onRoomConfigChange,
}: Props): React.JSX.Element {
    const cfg = node.config ?? {};

    // DP select dialog
    const [selectKey, setSelectKey] = useState<keyof FautNodeConfig | null>(null);

    const openSelect  = (key: keyof FautNodeConfig): void => setSelectKey(key);
    const closeSelect = (): void => setSelectKey(null);
    const handleOk    = (id: string | string[] | undefined): void => {
        if (selectKey && typeof id === 'string' && id) onConfigChange(selectKey, id);
        closeSelect();
    };

    // Scene data: always from parent room (Tag+Nacht are built-in)
    const uniqueScenes = [...BUILTIN_SCENES, ...((parentRoom?.config?.lampeSzenen as string[] | undefined) ?? [])];
    const sceneConfigs = (cfg.lampeSceneConfigs ?? []) as LampeSceneConfig[];

    function getEntry(scene: string): LampeSceneConfig {
        return sceneConfigs.find(c => c.scene === scene) ?? { scene, lightOn: {}, lightOff: {} };
    }

    function patchAction(scene: string, mode: 'lightOn' | 'lightOff', patch: Partial<LampeSceneAction>): void {
        const idx = sceneConfigs.findIndex(c => c.scene === scene);
        let next: LampeSceneConfig[];
        if (idx === -1) {
            const entry: LampeSceneConfig = { scene, lightOn: {}, lightOff: {} };
            entry[mode] = { ...patch } as LampeSceneAction;
            next = [...sceneConfigs, entry];
        } else {
            next = sceneConfigs.map((c, i) =>
                i === idx ? { ...c, [mode]: { ...c[mode], ...patch } } : c,
            );
        }
        onConfigChange('lampeSceneConfigs', next);
    }

    // Active columns: only show when matching DP is configured
    const columns = ALL_COLUMNS.filter(col => !!(cfg[col.dpKey]));

    return (
        <Stack spacing={2} sx={{ mt: 2 }}>

            {/* Aktiviert */}
            <FormControlLabel
                control={
                    <Checkbox
                        size="small"
                        checked={cfg.lampeAktiviert ?? true}
                        onChange={e => onConfigChange('lampeAktiviert', e.target.checked)}
                    />
                }
                label={I18n.t('Control enabled')}
            />

            <Divider />

            {/* Scene table */}
            <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
                        {I18n.t('Scenes')}
                    </Typography>
                </Box>

                {columns.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                        {I18n.t('Configure DPs below to enable scene columns.')}
                    </Typography>
                ) : (
                    <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 600, minWidth: 80 }}>{I18n.t('Scene')}</TableCell>
                                    <TableCell sx={{ width: 36 }} />
                                    {columns.map(col => (
                                        <TableCell key={col.key} sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                                            {I18n.t(col.label)}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {uniqueScenes.map(scene => {
                                    const entry = getEntry(scene);
                                    return (
                                        <React.Fragment key={scene}>
                                            {/* lightOn row */}
                                            <TableRow>
                                                <TableCell
                                                    rowSpan={2}
                                                    sx={{
                                                        fontWeight: 600,
                                                        borderRight: 1,
                                                        borderColor: 'divider',
                                                        verticalAlign: 'middle',
                                                    }}
                                                >
                                                    {scene}
                                                </TableCell>
                                                <TableCell sx={{ color: 'success.main', fontSize: '0.7rem', whiteSpace: 'nowrap', pr: 0 }}>
                                                    {I18n.t('On')}
                                                </TableCell>
                                                {columns.map(col => (
                                                    <TableCell key={col.key}>
                                                        <ActionCell
                                                            type={col.type}
                                                            set={!!(entry.lightOn[col.setKey])}
                                                            value={entry.lightOn[col.valKey] as boolean | number | string | undefined}
                                                            onChange={(s, v) => {
                                                                const patch: Partial<LampeSceneAction> = { [col.setKey]: s };
                                                                if (s) (patch as any)[col.valKey] = v;
                                                                patchAction(scene, 'lightOn', patch);
                                                            }}
                                                        />
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                            {/* lightOff row */}
                                            <TableRow sx={{ '& > td': { borderBottom: '2px solid', borderColor: 'divider' } }}>
                                                <TableCell sx={{ color: 'error.main', fontSize: '0.7rem', whiteSpace: 'nowrap', pr: 0 }}>
                                                    {I18n.t('Off')}
                                                </TableCell>
                                                {columns.map(col => (
                                                    <TableCell key={col.key}>
                                                        <ActionCell
                                                            type={col.type}
                                                            set={!!(entry.lightOff[col.setKey])}
                                                            value={entry.lightOff[col.valKey] as boolean | number | string | undefined}
                                                            onChange={(s, v) => {
                                                                const patch: Partial<LampeSceneAction> = { [col.setKey]: s };
                                                                if (s) (patch as any)[col.valKey] = v;
                                                                patchAction(scene, 'lightOff', patch);
                                                            }}
                                                        />
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        </React.Fragment>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Box>

            <Divider />

            {/* DP configuration */}
            <Typography variant="subtitle2">{I18n.t('Data points')}</Typography>

            <DpField
                label={I18n.t('DP Switch')}
                value={(cfg.dpLampeSchalter as string | undefined) ?? ''}
                onChange={v => onConfigChange('dpLampeSchalter', v)}
                onSelect={() => openSelect('dpLampeSchalter')}
            />
            <DpField
                label={I18n.t('DP Dimmer')}
                value={(cfg.dpLampeDimmer as string | undefined) ?? ''}
                onChange={v => onConfigChange('dpLampeDimmer', v)}
                onSelect={() => openSelect('dpLampeDimmer')}
            />
            <DpField
                label={I18n.t('DP ct')}
                value={(cfg.dpLampeCt as string | undefined) ?? ''}
                onChange={v => onConfigChange('dpLampeCt', v)}
                onSelect={() => openSelect('dpLampeCt')}
            />
            <DpField
                label={I18n.t('DP Color')}
                value={(cfg.dpLampeColorHex as string | undefined) ?? ''}
                onChange={v => onConfigChange('dpLampeColorHex', v)}
                onSelect={() => openSelect('dpLampeColorHex')}
            />

            {/* Mode DP + white/color values inline */}
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <Box sx={{ flexGrow: 1, minWidth: 200 }}>
                    <DpField
                        label={I18n.t('DP Mode')}
                        value={(cfg.dpLampeModus as string | undefined) ?? ''}
                        onChange={v => onConfigChange('dpLampeModus', v)}
                        onSelect={() => openSelect('dpLampeModus')}
                    />
                </Box>
                {cfg.dpLampeModus && (
                    <>
                        <TextField
                            label={I18n.t('Value white')}
                            type="number"
                            size="small"
                            value={cfg.lampeModeWertWeiss ?? 0}
                            onChange={e => onConfigChange('lampeModeWertWeiss', Number(e.target.value))}
                            sx={{ width: 120 }}
                        />
                        <TextField
                            label={I18n.t('Value color')}
                            type="number"
                            size="small"
                            value={cfg.lampeModeWertFarbe ?? 1}
                            onChange={e => onConfigChange('lampeModeWertFarbe', Number(e.target.value))}
                            sx={{ width: 120 }}
                        />
                    </>
                )}
            </Box>

            <DpField
                label={I18n.t('DP Scene')}
                value={(cfg.dpLampeSzene as string | undefined) ?? ''}
                onChange={v => onConfigChange('dpLampeSzene', v)}
                onSelect={() => openSelect('dpLampeSzene')}
            />

            <Divider />

            {/* Unreach check */}
            <Box>
                <FormControlLabel
                    control={
                        <Checkbox
                            size="small"
                            checked={cfg.lampeUnreach ?? false}
                            onChange={e => onConfigChange('lampeUnreach', e.target.checked)}
                        />
                    }
                    label={I18n.t('Unreach check')}
                />
                {cfg.lampeUnreach && (
                    <DpField
                        label={I18n.t('DP Unreach')}
                        value={(cfg.dpLampeUnreach as string | undefined) ?? ''}
                        onChange={v => onConfigChange('dpLampeUnreach', v)}
                        onSelect={() => openSelect('dpLampeUnreach')}
                        sx={{ mt: 1, ml: 4 }}
                    />
                )}
            </Box>

            {/* DP object-select dialog */}
            {selectKey !== null && (
                <DialogSelectID
                    socket={socket}
                    theme={theme}
                    title={I18n.t('Select data point')}
                    selected={(cfg[selectKey] as string | undefined) ?? ''}
                    onClose={closeSelect}
                    onOk={handleOk}
                />
            )}

        </Stack>
    );
}
