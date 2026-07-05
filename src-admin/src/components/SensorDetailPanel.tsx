import React, { useState } from 'react';
import {
    Box,
    Checkbox,
    Divider,
    FormControlLabel,
    IconButton,
    InputAdornment,
    Stack,
    TextField,
} from '@mui/material';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import { DialogSelectID, I18n, type IobTheme } from '@iobroker/adapter-react-v5';
import { type FautNodeConfig, type FautNodeType, type FautTreeNode } from '../types/treeTypes';

// ---- primary DP fields per sensor type ----

type StringConfigKey = 'dpTemperatur' | 'dpLuftfeuchtigkeit' | 'dpLux' | 'dpBewegung' | 'dpFensterTuer';

interface PrimaryField {
    key: StringConfigKey;
    i18nKey: string;
}

const PRIMARY_FIELDS: Partial<Record<FautNodeType, PrimaryField[]>> = {
    Temperatur: [
        { key: 'dpTemperatur',       i18nKey: 'DP Temperature' },
        { key: 'dpLuftfeuchtigkeit', i18nKey: 'DP Humidity' },
    ],
    Helligkeit:    [{ key: 'dpLux',         i18nKey: 'DP Lux' }],
    Bewegung:      [{ key: 'dpBewegung',    i18nKey: 'DP Motion' }],
    'Fenster/Tür': [{ key: 'dpFensterTuer', i18nKey: 'DP Door/Window' }],
};

// ---- helper: text field with "..." object-select button ----

interface DpFieldProps {
    label: string;
    value: string;
    onChange: (v: string) => void;
    onSelect: () => void;
    sx?: object;
}

function DpField({ label, value, onChange, onSelect, sx }: DpFieldProps): React.JSX.Element {
    return (
        <TextField
            label={label}
            fullWidth
            size="small"
            value={value}
            onChange={e => onChange(e.target.value)}
            sx={sx}
            InputProps={{
                endAdornment: (
                    <InputAdornment position="end">
                        <IconButton size="small" edge="end" onClick={onSelect} title={I18n.t('Select data point')}>
                            <MoreHorizIcon fontSize="small" />
                        </IconButton>
                    </InputAdornment>
                ),
            }}
        />
    );
}

// ---- component ----

interface Props {
    node: FautTreeNode;
    socket: any;
    theme: IobTheme;
    onConfigChange: (key: keyof FautNodeConfig, value: string | boolean | number) => void;
}

export default function SensorDetailPanel({ node, socket, theme, onConfigChange }: Props): React.JSX.Element {
    const cfg = node.config ?? {};
    const fields = PRIMARY_FIELDS[node.type] ?? [];

    const [selectKey, setSelectKey] = useState<keyof FautNodeConfig | null>(null);

    const openSelect = (key: keyof FautNodeConfig): void => setSelectKey(key);
    const closeSelect = (): void => setSelectKey(null);
    const handleOk = (id: string | string[] | undefined): void => {
        if (selectKey && typeof id === 'string' && id) {
            onConfigChange(selectKey, id);
        }
        closeSelect();
    };

    return (
        <Stack spacing={2} sx={{ mt: 2 }}>
            {/* Primary DP fields */}
            {fields.map(f => (
                <DpField
                    key={f.key}
                    label={I18n.t(f.i18nKey)}
                    value={(cfg[f.key] as string | undefined) ?? ''}
                    onChange={v => onConfigChange(f.key, v)}
                    onSelect={() => openSelect(f.key)}
                />
            ))}

            {/* Helligkeit: global sensor toggle (exclusive across all Helligkeit nodes) */}
            {node.type === 'Helligkeit' && (
                <FormControlLabel
                    control={
                        <Checkbox
                            size="small"
                            checked={cfg.globalerSensor ?? false}
                            onChange={e => onConfigChange('globalerSensor', e.target.checked)}
                        />
                    }
                    label={I18n.t('Global sensor')}
                />
            )}

            <Divider />

            {/* Battery section */}
            <Box>
                <FormControlLabel
                    control={
                        <Checkbox
                            size="small"
                            checked={cfg.batteriebetrieben ?? false}
                            onChange={e => onConfigChange('batteriebetrieben', e.target.checked)}
                        />
                    }
                    label={I18n.t('Battery powered')}
                />
                {cfg.batteriebetrieben && (
                    <DpField
                        label={I18n.t('DP Battery')}
                        value={cfg.dpBatterie ?? ''}
                        onChange={v => onConfigChange('dpBatterie', v)}
                        onSelect={() => openSelect('dpBatterie')}
                        sx={{ mt: 1, ml: 4 }}
                    />
                )}
            </Box>

            <Divider />

            {/* Reachability section */}
            <Box>
                <FormControlLabel
                    control={
                        <Checkbox
                            size="small"
                            checked={cfg.erreichbarkeit ?? false}
                            onChange={e => onConfigChange('erreichbarkeit', e.target.checked)}
                        />
                    }
                    label={I18n.t('Reachability')}
                />
                {cfg.erreichbarkeit && (
                    <DpField
                        label={I18n.t('DP Reachability trigger')}
                        value={cfg.dpErreichbarkeit ?? ''}
                        onChange={v => onConfigChange('dpErreichbarkeit', v)}
                        onSelect={() => openSelect('dpErreichbarkeit')}
                        sx={{ mt: 1, ml: 4 }}
                    />
                )}
            </Box>

            {/* Object-select dialog */}
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