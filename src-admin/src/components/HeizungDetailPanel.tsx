import React, { useState } from 'react';
import { Box, Checkbox, Divider, FormControlLabel, Stack, Typography } from '@mui/material';
import { DialogSelectID, I18n, type IobTheme } from '@iobroker/adapter-react-v5';
import { type FautNodeConfig, type FautTreeNode } from '../types/treeTypes';
import DpField from './DpField';

interface Props {
    node: FautTreeNode;
    socket: any;
    theme: IobTheme;
    onConfigChange: (key: keyof FautNodeConfig, value: string | boolean | number) => void;
}

export default function HeizungDetailPanel({ node, socket, theme, onConfigChange }: Props): React.JSX.Element {
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
            <Typography variant="subtitle2">{I18n.t('Heating settings')}</Typography>
            <Divider />

            <Box>
                <FormControlLabel
                    control={
                        <Checkbox
                            size="small"
                            checked={cfg.heizperiodeAktiv ?? false}
                            onChange={e => onConfigChange('heizperiodeAktiv', e.target.checked)}
                        />
                    }
                    label={I18n.t('Heating period active')}
                />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 4 }}>
                    {I18n.t('When inactive all rooms switch to frost protection mode (off)')}
                </Typography>
            </Box>

            <Box>
                <FormControlLabel
                    control={
                        <Checkbox
                            size="small"
                            checked={cfg.energiesparmodusAktiv ?? false}
                            onChange={e => onConfigChange('energiesparmodusAktiv', e.target.checked)}
                        />
                    }
                    label={I18n.t('Energy saving mode active')}
                />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 4 }}>
                    {I18n.t('Forces absent setback in all rooms regardless of presence')}
                </Typography>
            </Box>

            <Divider />
            <Typography variant="subtitle2">{I18n.t('Heating data points')}</Typography>

            <DpField
                label={I18n.t('DP Oil level (l)')}
                value={cfg.dpOelstand ?? ''}
                onChange={v => onConfigChange('dpOelstand', v)}
                onSelect={() => openSelect('dpOelstand')}
            />
            <DpField
                label={I18n.t('DP Operating mode')}
                value={cfg.dpBetriebsart ?? ''}
                onChange={v => onConfigChange('dpBetriebsart', v)}
                onSelect={() => openSelect('dpBetriebsart')}
            />
            <DpField
                label={I18n.t('DP Fault')}
                value={cfg.dpStoerung ?? ''}
                onChange={v => onConfigChange('dpStoerung', v)}
                onSelect={() => openSelect('dpStoerung')}
            />
            <DpField
                label={I18n.t('DP Error text')}
                value={cfg.dpFehlertext ?? ''}
                onChange={v => onConfigChange('dpFehlertext', v)}
                onSelect={() => openSelect('dpFehlertext')}
            />

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
