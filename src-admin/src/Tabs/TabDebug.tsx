import React from 'react';
import { Box, Typography } from '@mui/material';
import { I18n } from '@iobroker/adapter-react-v5';

interface TabDebugProps {
    common: Record<string, any>;
    socket: any;
    native: Record<string, any>;
    instance: number;
    adapterName: string;
    onChange: (attr: string, value: any) => void;
}

export default function TabDebug(_props: TabDebugProps): React.JSX.Element {
    return (
        <Box sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
                {I18n.t('Debug')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
                {I18n.t('Debug information will appear here.')}
            </Typography>
        </Box>
    );
}
