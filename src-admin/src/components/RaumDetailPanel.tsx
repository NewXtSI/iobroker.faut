import React, { useState } from 'react';
import {
    Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
    Divider, FormControlLabel, IconButton, List, ListItem, ListItemText,
    Stack, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
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
    const [addSceneDialogOpen, setAddSceneDialogOpen]   = useState(false);
    const [newSceneName, setNewSceneName]               = useState('');

    const handleAddScene = (): void => {
        const name = newSceneName.trim();
        if (!name) return;
        const existing: string[] = (cfg.lampeSzenen as string[] | undefined) ?? [];
        if (!['Tag', 'Nacht', 'Manuell'].includes(name) && !existing.includes(name)) {
            onConfigChange('lampeSzenen', [...existing, name]);
        }
        setNewSceneName('');
        setAddSceneDialogOpen(false);
    };

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
                        {(cfg.blendschutz || cfg.hitzeschutz) && (
                            <Box sx={{ mt: 1, ml: 2 }}>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                                    {I18n.t('Room-specific settings (override global)')}
                                </Typography>
                                {cfg.blendschutz && (
                                    <TextField
                                        label={I18n.t('Glare protection angle (°)')}
                                        type="number"
                                        size="small"
                                        value={cfg.blendschutzWinkel ?? ''}
                                        onChange={e => {
                                            const val = e.target.value === '' ? undefined : Number(e.target.value);
                                            onConfigChange('blendschutzWinkel', val);
                                        }}
                                        placeholder={I18n.t('Leave empty for global setting')}
                                        inputProps={{ min: 0, max: 180, step: 1 }}
                                        sx={{ width: 220, display: 'block', mb: 1 }}
                                    />
                                )}
                                {cfg.hitzeschutz && (
                                    <TextField
                                        label={I18n.t('Heat protection ΔT (°C)')}
                                        type="number"
                                        size="small"
                                        value={cfg.hitzeschutzDeltaT ?? ''}
                                        onChange={e => {
                                            const val = e.target.value === '' ? undefined : Number(e.target.value);
                                            onConfigChange('hitzeschutzDeltaT', val);
                                        }}
                                        placeholder={I18n.t('Leave empty for global setting')}
                                        inputProps={{ min: 0, max: 10, step: 0.5 }}
                                        sx={{ width: 220 }}
                                    />
                                )}
                            </Box>
                        )}
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
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1 }}>
                                {I18n.t('Custom scenes')}
                            </Typography>
                            <Button
                                size="small"
                                startIcon={<AddIcon />}
                                onClick={() => { setNewSceneName(''); setAddSceneDialogOpen(true); }}
                            >
                                {I18n.t('Add scene')}
                            </Button>
                        </Box>
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

            {/* Add scene dialog */}
            <Dialog open={addSceneDialogOpen} onClose={() => setAddSceneDialogOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>{I18n.t('Add scene')}</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        label={I18n.t('Scene name')}
                        value={newSceneName}
                        onChange={e => setNewSceneName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleAddScene(); }}
                        fullWidth
                        size="small"
                        sx={{ mt: 1 }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAddSceneDialogOpen(false)}>{I18n.t('Cancel')}</Button>
                    <Button onClick={handleAddScene} disabled={!newSceneName.trim()} variant="contained">
                        {I18n.t('Add')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Stack>
    );
}
