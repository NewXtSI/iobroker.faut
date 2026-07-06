import React, { useState } from 'react';
import { Box, Divider, Typography } from '@mui/material';
import { DialogSelectID, I18n, type IobTheme } from '@iobroker/adapter-react-v5';
import DpField from '../components/DpField';

interface TabGlobalProps {
    common: Record<string, any>;
    socket: any;
    theme: IobTheme;
    native: Record<string, any>;
    instance: number;
    adapterName: string;
    onChange: (attr: string, value: any) => void;
}

export default function TabGlobal({ native, socket, theme, onChange }: TabGlobalProps): React.JSX.Element {
    const [selectOpen, setSelectOpen] = useState(false);

    const dpNachtmodus: string = (native.dpNachtmodus as string | undefined) ?? '';

    return (
        <Box sx={{ p: 2, maxWidth: 600 }}>
            <Typography variant="h6" gutterBottom>
                {I18n.t('Global')}
            </Typography>

            <Divider sx={{ mb: 2 }} />

            <Typography variant="subtitle2" gutterBottom>
                {I18n.t('Night mode')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                {I18n.t('Night mode description')}
            </Typography>

            <DpField
                label={I18n.t('DP Night mode')}
                value={dpNachtmodus}
                onChange={v => onChange('dpNachtmodus', v)}
                onSelect={() => setSelectOpen(true)}
            />

            {selectOpen && (
                <DialogSelectID
                    socket={socket}
                    theme={theme}
                    title={I18n.t('Select data point')}
                    selected={dpNachtmodus}
                    onClose={() => setSelectOpen(false)}
                    onOk={(id: string | string[] | undefined) => {
                        if (typeof id === 'string' && id) onChange('dpNachtmodus', id);
                        setSelectOpen(false);
                    }}
                />
            )}
        </Box>
    );
}
