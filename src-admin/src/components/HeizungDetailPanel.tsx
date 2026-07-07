import React from 'react';
import { Box, Checkbox, Divider, FormControlLabel, Stack, Typography } from '@mui/material';
import { I18n } from '@iobroker/adapter-react-v5';
import { type FautNodeConfig, type FautTreeNode } from '../types/treeTypes';

interface Props {
    node: FautTreeNode;
    onConfigChange: (key: keyof FautNodeConfig, value: string | boolean | number) => void;
}

export default function HeizungDetailPanel({ node, onConfigChange }: Props): React.JSX.Element {
    const cfg = node.config ?? {};

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
        </Stack>
    );
}
