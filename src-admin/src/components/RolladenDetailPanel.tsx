import React, { useState } from 'react';
import { Box, Checkbox, Divider, FormControlLabel, Stack, TextField } from '@mui/material';
import { DialogSelectID, I18n, type IobTheme } from '@iobroker/adapter-react-v5';
import { type FautNodeConfig, type FautTreeNode } from '../types/treeTypes';
import DpField from './DpField';

interface Props {
    node: FautTreeNode;
    socket: any;
    theme: IobTheme;
    onConfigChange: (key: keyof FautNodeConfig, value: string | boolean | number) => void;
}

export default function RolladenDetailPanel({ node, socket, theme, onConfigChange }: Props): React.JSX.Element {
    const cfg = node.config ?? {};
    const [selectKey, setSelectKey] = useState<keyof FautNodeConfig | null>(null);

    const openSelect = (key: keyof FautNodeConfig): void => setSelectKey(key);
    const closeSelect = (): void => setSelectKey(null);
    const handleOk = (id: string | string[] | undefined): void => {
        if (selectKey && typeof id === 'string' && id) onConfigChange(selectKey, id);
        closeSelect();
    };

    return (
        <Stack spacing={2} sx={{ mt: 2 }}>
            {/* Aktiviert */}
            <FormControlLabel
                control={
                    <Checkbox
                        size="small"
                        checked={cfg.aktiviert ?? true}
                        onChange={e => onConfigChange('aktiviert', e.target.checked)}
                    />
                }
                label={I18n.t('Control enabled')}
            />

            {/* Position DP */}
            <DpField
                label={I18n.t('DP Position')}
                value={(cfg.dpPosition as string | undefined) ?? ''}
                onChange={v => onConfigChange('dpPosition', v)}
                onSelect={() => openSelect('dpPosition')}
            />

            {/* Sun/heat block positions */}
            <TextField
                label={I18n.t('Sunblock position (%)')}
                type="number"
                size="small"
                value={cfg.sunblockPosition ?? 20}
                onChange={e => onConfigChange('sunblockPosition', Math.min(100, Math.max(0, Number(e.target.value))))}
                inputProps={{ min: 0, max: 100 }}
                sx={{ width: 200 }}
            />
            <TextField
                label={I18n.t('Heatblock position (%)')}
                type="number"
                size="small"
                value={cfg.heatblockPosition ?? 0}
                onChange={e => onConfigChange('heatblockPosition', Math.min(100, Math.max(0, Number(e.target.value))))}
                inputProps={{ min: 0, max: 100 }}
                sx={{ width: 200 }}
            />

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

            {/* Reachability / alivecheck */}
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
