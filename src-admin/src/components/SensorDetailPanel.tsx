import React from 'react';
import { Box, Checkbox, Divider, FormControlLabel, Stack, TextField } from '@mui/material';
import { I18n } from '@iobroker/adapter-react-v5';
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
    Helligkeit:   [{ key: 'dpLux',         i18nKey: 'DP Lux' }],
    Bewegung:     [{ key: 'dpBewegung',    i18nKey: 'DP Motion' }],
    'Fenster/Tür':[{ key: 'dpFensterTuer', i18nKey: 'DP Door/Window' }],
};

// ---- component ----

interface Props {
    node: FautTreeNode;
    onConfigChange: (key: keyof FautNodeConfig, value: string | boolean) => void;
}

export default function SensorDetailPanel({ node, onConfigChange }: Props): React.JSX.Element {
    const cfg = node.config ?? {};
    const fields = PRIMARY_FIELDS[node.type] ?? [];

    return (
        <Stack spacing={2} sx={{ mt: 2 }}>
            {/* Primary DP fields */}
            {fields.map(f => (
                <TextField
                    key={f.key}
                    label={I18n.t(f.i18nKey)}
                    fullWidth
                    size="small"
                    value={cfg[f.key] ?? ''}
                    onChange={e => onConfigChange(f.key, e.target.value)}
                />
            ))}

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
                    <TextField
                        label={I18n.t('DP Battery')}
                        fullWidth
                        size="small"
                        value={cfg.dpBatterie ?? ''}
                        onChange={e => onConfigChange('dpBatterie', e.target.value)}
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
                    <TextField
                        label={I18n.t('DP Reachability trigger')}
                        fullWidth
                        size="small"
                        value={cfg.dpErreichbarkeit ?? ''}
                        onChange={e => onConfigChange('dpErreichbarkeit', e.target.value)}
                        sx={{ mt: 1, ml: 4 }}
                    />
                )}
            </Box>
        </Stack>
    );
}
