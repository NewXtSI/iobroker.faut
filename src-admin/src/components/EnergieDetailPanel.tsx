import React, { useState } from 'react';
import { Divider, Stack, Typography } from '@mui/material';
import { DialogSelectID, I18n, type IobTheme } from '@iobroker/adapter-react-v5';
import { type FautNodeConfig, type FautTreeNode } from '../types/treeTypes';
import DpField from './DpField';

interface Props {
    node: FautTreeNode;
    socket: any;
    theme: IobTheme;
    onConfigChange: (key: keyof FautNodeConfig, value: string | boolean | number) => void;
}

export default function EnergieDetailPanel({ node, socket, theme, onConfigChange }: Props): React.JSX.Element {
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
            <Typography variant="subtitle2">{I18n.t('Electricity meter data points')}</Typography>
            <Divider />

            <DpField
                label={I18n.t('DP Meter reading (kWh)')}
                value={cfg.dpStromzaehlerStand ?? ''}
                onChange={v => onConfigChange('dpStromzaehlerStand', v)}
                onSelect={() => openSelect('dpStromzaehlerStand')}
            />
            <DpField
                label={I18n.t('DP Feed-in reading (kWh)')}
                value={cfg.dpStromzaehlerEinspeisestand ?? ''}
                onChange={v => onConfigChange('dpStromzaehlerEinspeisestand', v)}
                onSelect={() => openSelect('dpStromzaehlerEinspeisestand')}
            />
            <DpField
                label={I18n.t('DP Current consumption (W)')}
                value={cfg.dpStromzaehlerVerbrauch ?? ''}
                onChange={v => onConfigChange('dpStromzaehlerVerbrauch', v)}
                onSelect={() => openSelect('dpStromzaehlerVerbrauch')}
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
