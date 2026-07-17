import React, { useState } from 'react';
import {
    Box,
    Checkbox,
    Divider,
    FormControlLabel,
    Stack,
} from '@mui/material';
import { DialogSelectID, I18n, type IobTheme } from '@iobroker/adapter-react-v5';
import { type FautNodeConfig, type FautTreeNode } from '../types/treeTypes';
import DpField from './DpField';

interface Props {
    node: FautTreeNode;
    socket: any;
    theme: IobTheme;
    onConfigChange: (key: keyof FautNodeConfig, value: string | boolean | number) => void;
}

export default function ThermostatDetailPanel({ node, socket, theme, onConfigChange }: Props): React.JSX.Element {
    const cfg = node.config ?? {};

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
            {/* Temperature DP */}
            <DpField
                label={I18n.t('DP Thermostat Temperature')}
                value={cfg.dpThermostatTemperatur ?? ''}
                onChange={v => onConfigChange('dpThermostatTemperatur', v)}
                onSelect={() => openSelect('dpThermostatTemperatur')}
            />

            {/* Setpoint DP */}
            <DpField
                label={I18n.t('DP Thermostat Setpoint')}
                value={cfg.dpThermostatSolltemperatur ?? ''}
                onChange={v => onConfigChange('dpThermostatSolltemperatur', v)}
                onSelect={() => openSelect('dpThermostatSolltemperatur')}
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
                    <>
                        <DpField
                            label={I18n.t('DP Reachability trigger')}
                            value={cfg.dpErreichbarkeit ?? ''}
                            onChange={v => onConfigChange('dpErreichbarkeit', v)}
                            onSelect={() => openSelect('dpErreichbarkeit')}
                            sx={{ mt: 1, ml: 4 }}
                        />
                        <FormControlLabel
                            sx={{ ml: 3 }}
                            control={
                                <Checkbox
                                    size="small"
                                    checked={cfg.dpUnreachIsBool ?? false}
                                    onChange={e => onConfigChange('dpUnreachIsBool', e.target.checked)}
                                />
                            }
                            label={I18n.t('Bool Unreach')}
                        />
                        {cfg.dpUnreachIsBool && (
                            <FormControlLabel
                                sx={{ ml: 3 }}
                                control={
                                    <Checkbox
                                        size="small"
                                        checked={cfg.dpUnreachIsAlive ?? false}
                                        onChange={e => onConfigChange('dpUnreachIsAlive', e.target.checked)}
                                    />
                                }
                                label={I18n.t('Alive State')}
                            />
                        )}
                    </>
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
