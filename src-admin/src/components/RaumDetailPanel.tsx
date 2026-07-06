import React from 'react';
import { Box, Checkbox, Divider, FormControlLabel, Stack, TextField, Typography } from '@mui/material';
import { I18n } from '@iobroker/adapter-react-v5';
import { type FautNodeConfig, type FautTreeNode } from '../types/treeTypes';

interface Props {
    node: FautTreeNode;
    onConfigChange: (key: keyof FautNodeConfig, value: string | boolean | number) => void;
}

export default function RaumDetailPanel({ node, onConfigChange }: Props): React.JSX.Element {
    const cfg = node.config ?? {};

    return (
        <Stack spacing={2} sx={{ mt: 2 }}>
            {/* Motion detection */}
            <Box>
                <FormControlLabel
                    control={
                        <Checkbox
                            size="small"
                            checked={cfg.bewegungserkennung ?? false}
                            onChange={e => onConfigChange('bewegungserkennung', e.target.checked)}
                        />
                    }
                    label={I18n.t('Motion detection')}
                />
                {cfg.bewegungserkennung && (
                    <TextField
                        label={I18n.t('Motion cooldown (min)')}
                        type="number"
                        size="small"
                        value={cfg.bewegungsCooldown ?? 3}
                        onChange={e => onConfigChange('bewegungsCooldown', Math.max(1, Number(e.target.value)))}
                        inputProps={{ min: 1 }}
                        sx={{ mt: 1, ml: 4, width: 200 }}
                    />
                )}
            </Box>

            <Divider />

            {/* Darkness detection */}
            <Box>
                <FormControlLabel
                    control={
                        <Checkbox
                            size="small"
                            checked={cfg.dunkelheitserkennung ?? false}
                            onChange={e => onConfigChange('dunkelheitserkennung', e.target.checked)}
                        />
                    }
                    label={I18n.t('Darkness detection')}
                />
                {cfg.dunkelheitserkennung && (
                    <>
                        <TextField
                            label={I18n.t('Darkness threshold (lux)')}
                            type="number"
                            size="small"
                            value={cfg.dunkelgrenze ?? 150}
                            onChange={e => onConfigChange('dunkelgrenze', Math.max(0, Number(e.target.value)))}
                            inputProps={{ min: 0 }}
                            sx={{ mt: 1, ml: 4, width: 200 }}
                        />
                        <Box sx={{ mt: 1, ml: 4 }}>
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        size="small"
                                        checked={cfg.globalenSensorBenutzen ?? false}
                                        onChange={e => onConfigChange('globalenSensorBenutzen', e.target.checked)}
                                    />
                                }
                                label={I18n.t('Use global sensor')}
                            />
                        </Box>
                    </>
                )}
            </Box>

            <Divider />

            {/* Shutter control */}
            <Box>
                <FormControlLabel
                    control={
                        <Checkbox
                            size="small"
                            checked={cfg.rolladensteuerung ?? false}
                            onChange={e => onConfigChange('rolladensteuerung', e.target.checked)}
                        />
                    }
                    label={I18n.t('Shutter control')}
                />
                {cfg.rolladensteuerung && (
                    <Stack spacing={1.5} sx={{ mt: 1, ml: 4 }}>
                        <Typography variant="caption" color="text.secondary">
                            {I18n.t('Shutter control settings')}
                        </Typography>
                        <TextField
                            label={I18n.t('Direction (degrees)')}
                            type="number"
                            size="small"
                            value={cfg.himmelsrichtung ?? 180}
                            onChange={e => onConfigChange('himmelsrichtung', Math.min(360, Math.max(0, Number(e.target.value))))}
                            inputProps={{ min: 0, max: 360 }}
                            sx={{ width: 200 }}
                        />
                        <TextField
                            label={I18n.t('Sunrise offset (min)')}
                            type="number"
                            size="small"
                            value={cfg.rolladenAufgangOffset ?? 0}
                            onChange={e => onConfigChange('rolladenAufgangOffset', Number(e.target.value))}
                            sx={{ width: 200 }}
                        />
                        <TextField
                            label={I18n.t('Sunset offset (min)')}
                            type="number"
                            size="small"
                            value={cfg.rolladenUntergangOffset ?? 0}
                            onChange={e => onConfigChange('rolladenUntergangOffset', Number(e.target.value))}
                            sx={{ width: 200 }}
                        />
                        <FormControlLabel
                            control={
                                <Checkbox
                                    size="small"
                                    checked={cfg.blendschutz ?? false}
                                    onChange={e => onConfigChange('blendschutz', e.target.checked)}
                                />
                            }
                            label={I18n.t('Glare protection')}
                        />
                        <FormControlLabel
                            control={
                                <Checkbox
                                    size="small"
                                    checked={cfg.hitzeschutz ?? false}
                                    onChange={e => onConfigChange('hitzeschutz', e.target.checked)}
                                />
                            }
                            label={I18n.t('Heat protection')}
                        />
                    </Stack>
                )}
            </Box>
        </Stack>
    );
}
