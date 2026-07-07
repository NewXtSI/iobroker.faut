import React, { useState } from 'react';
import { Box, Checkbox, Divider, FormControlLabel, Stack, Typography } from '@mui/material';
import { DialogSelectID, I18n, type IobTheme } from '@iobroker/adapter-react-v5';
import { type FautNodeConfig, type FautNodeType, type FautTreeNode } from '../types/treeTypes';
import DpField from './DpField';

// ---- DP fields per energy node type ----

type DpKey = keyof FautNodeConfig;

interface Field {
    key: DpKey;
    i18nKey: string;
}

const ENERGY_FIELDS: Partial<Record<FautNodeType, Field[]>> = {
    Wechselrichter: [
        { key: 'dpGesamterzeugung',    i18nKey: 'DP Total generation (kWh)' },
        { key: 'dpWechselrichterPower', i18nKey: 'DP Power (W)' },
    ],
    Batteriespeicher: [
        { key: 'dpSoc',        i18nKey: 'DP State of charge (%)' },
        { key: 'dpBatterieKwh', i18nKey: 'DP Energy (kWh)' },
    ],
    Solarpanel: [
        { key: 'dpSolarpanelPower', i18nKey: 'DP Power (W)' },
    ],
};

interface Props {
    node: FautTreeNode;
    socket: any;
    theme: IobTheme;
    onConfigChange: (key: keyof FautNodeConfig, value: string | boolean | number) => void;
}

export default function EnergyNodeDetailPanel({ node, socket, theme, onConfigChange }: Props): React.JSX.Element {
    const cfg = node.config ?? {};
    const fields = ENERGY_FIELDS[node.type] ?? [];
    const [selectKey, setSelectKey] = useState<DpKey | null>(null);
    const openSelect = (key: DpKey): void => setSelectKey(key);
    const closeSelect = (): void => setSelectKey(null);
    const handleOk = (id: string | string[] | undefined): void => {
        if (selectKey && typeof id === 'string' && id) onConfigChange(selectKey, id);
        closeSelect();
    };

    return (
        <Stack spacing={2} sx={{ mt: 2 }}>
            {/* Type-specific DP fields */}
            {fields.map(f => (
                <DpField
                    key={f.key as string}
                    label={I18n.t(f.i18nKey)}
                    value={(cfg[f.key] as string | undefined) ?? ''}
                    onChange={v => onConfigChange(f.key, v)}
                    onSelect={() => openSelect(f.key)}
                />
            ))}

            <Divider />

            {/* Reachability / unreach */}
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
