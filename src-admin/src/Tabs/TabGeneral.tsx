import React from 'react';
import { Typography } from '@mui/material';
import { I18n } from '@iobroker/adapter-react-v5';

interface TabGeneralProps {
    common: Record<string, any>;
    socket: any;
    native: Record<string, any>;
    instance: number;
    adapterName: string;
    onChange: (attr: string, value: any) => void;
}

export default function TabGeneral(_props: TabGeneralProps): React.JSX.Element {
    return (
        <div style={{ padding: 16 }}>
            <Typography variant="h6">{I18n.t('General')}</Typography>
            <Typography>{I18n.t('No settings available yet.')}</Typography>
        </div>
    );
}
