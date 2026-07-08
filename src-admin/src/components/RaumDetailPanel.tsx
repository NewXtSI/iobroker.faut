import React, { useState } from 'react';
import {
    Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
    Divider, FormControlLabel, IconButton, List, ListItem, ListItemText,
    Stack, TextField, Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { I18n } from '@iobroker/adapter-react-v5';
import { type FautNodeConfig, type FautTreeNode } from '../types/treeTypes';

interface Props {
    node: FautTreeNode;
    onConfigChange: (key: keyof FautNodeConfig, value: unknown) => void;
}

export default function RaumDetailPanel({ node, onConfigChange }: Props): React.JSX.Element {
    const cfg = node.config ?? {};
    const [confirmDeleteScene, setConfirmDeleteScene] = useState<string | null>(null);

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

            <Divider />

            {/* Climate control */}
            <Box>
                <FormControlLabel
                    control={
                        <Checkbox
                            size="small"
                            checked={cfg.klimasteuerung ?? false}
                            onChange={e => onConfigChange('klimasteuerung', e.target.checked)}
                        />
                    }
                    label={I18n.t('Climate control')}
                />
                {cfg.klimasteuerung && (
                    <Stack spacing={1.5} sx={{ mt: 1, ml: 4 }}>
                        <Typography variant="caption" color="text.secondary">
                            {I18n.t('Climate control settings')}
                        </Typography>
                        <TextField
                            label={I18n.t('Target temperature (°C)')}
                            type="number"
                            size="small"
                            value={cfg.solltemperatur ?? 20}
                            onChange={e => onConfigChange('solltemperatur', Number(e.target.value))}
                            inputProps={{ min: 5, max: 30, step: 0.5 }}
                            sx={{ width: 220 }}
                        />
                        <TextField
                            label={I18n.t('Night setback (°C)')}
                            type="number"
                            size="small"
                            value={cfg.absenkungNacht ?? 4}
                            onChange={e => onConfigChange('absenkungNacht', Math.max(0, Number(e.target.value)))}
                            inputProps={{ min: 0, max: 10, step: 0.5 }}
                            sx={{ width: 220 }}
                        />
                        <TextField
                            label={I18n.t('Absent setback (°C)')}
                            type="number"
                            size="small"
                            value={cfg.absenkungAbwesend ?? 3}
                            onChange={e => onConfigChange('absenkungAbwesend', Math.max(0, Number(e.target.value)))}
                            inputProps={{ min: 0, max: 10, step: 0.5 }}
                            sx={{ width: 220 }}
                        />
                    </Stack>
                )}
            </Box>
            <Box>
                <FormControlLabel
                    control={
                        <Checkbox
                            size="small"
                            checked={cfg.lichtsteuerung ?? false}
                            onChange={e => onConfigChange('lichtsteuerung', e.target.checked)}
                        />
                    }
                    label={I18n.t('Light control')}
                />
                {cfg.lichtsteuerung && (
                    <Box sx={{ mt: 1, ml: 4 }}>
                        <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                            {I18n.t('Custom scenes')}
                        </Typography>
                        {(cfg.lampeSzenen ?? []).length === 0 ? (
                            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                                {I18n.t('No custom scenes')}
                            </Typography>
                        ) : (
                            <List dense disablePadding>
                                {(cfg.lampeSzenen as string[]).map(scene => (
                                    <ListItem
                                        key={scene}
                                        disablePadding
                                        secondaryAction={
                                            <IconButton
                                                edge="end"
                                                size="small"
                                                onClick={() => setConfirmDeleteScene(scene)}
                                                title={I18n.t('Delete scene')}
                                            >
                                                <DeleteIcon fontSize="small" />
                                            </IconButton>
                                        }
                                    >
                                        <ListItemText
                                            primary={scene}
                                            primaryTypographyProps={{ fontSize: '0.85rem' }}
                                        />
                                    </ListItem>
                                ))}
                            </List>
                        )}
                    </Box>
                )}
            </Box>

            {/* Delete scene confirmation dialog */}
            <Dialog open={confirmDeleteScene !== null} onClose={() => setConfirmDeleteScene(null)}>
                <DialogTitle>{I18n.t('Delete scene')}</DialogTitle>
                <DialogContent>
                    <Typography>
                        {`${I18n.t('Delete scene confirm')} „${confirmDeleteScene}"?`}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmDeleteScene(null)}>{I18n.t('Cancel')}</Button>
                    <Button
                        color="error"
                        variant="contained"
                        onClick={() => {
                            if (confirmDeleteScene) {
                                const updated = ((cfg.lampeSzenen as string[] | undefined) ?? [])
                                    .filter(s => s !== confirmDeleteScene);
                                onConfigChange('lampeSzenen', updated);
                            }
                            setConfirmDeleteScene(null);
                        }}
                    >
                        {I18n.t('Delete')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Stack>
    );
}
