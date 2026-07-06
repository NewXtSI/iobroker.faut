import React from 'react';
import { Box, Checkbox, Divider, FormControlLabel, FormGroup, Typography } from '@mui/material';
import { I18n } from '@iobroker/adapter-react-v5';

interface TabDebugProps {
    common: Record<string, any>;
    socket: any;
    native: Record<string, any>;
    instance: number;
    adapterName: string;
    onChange: (attr: string, value: any) => void;
}

export default function TabDebug({ native, onChange }: TabDebugProps): React.JSX.Element {
    const logShutter         = !!(native.logShuttercontrol);
    const logShutterExtended = !!(native.logShuttercontrolExtended);

    return (
        <Box sx={{ p: 2, maxWidth: 600 }}>
            <Typography variant="h6" gutterBottom>
                {I18n.t('Debug')}
            </Typography>

            <Divider sx={{ mb: 2 }} />

            <Typography variant="subtitle2" gutterBottom>
                {I18n.t('Log flags')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                {I18n.t('Log flags description')}
            </Typography>

            <FormGroup>
                <FormControlLabel
                    control={
                        <Checkbox
                            size="small"
                            checked={logShutter}
                            onChange={e => onChange('logShuttercontrol', e.target.checked)}
                        />
                    }
                    label={<><code>[shuttercontrol]</code> – {I18n.t('Log shutter init and state changes')}</>}
                />
                <FormControlLabel
                    sx={{ ml: 2 }}
                    control={
                        <Checkbox
                            size="small"
                            checked={logShutterExtended}
                            onChange={e => onChange('logShuttercontrolExtended', e.target.checked)}
                        />
                    }
                    label={<><code>[shuttercontrol_extended]</code> – {I18n.t('Additionally log all subscribed input changes')}</>}
                />
            </FormGroup>
        </Box>
    );
}

