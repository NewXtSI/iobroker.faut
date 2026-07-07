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
    const logAdmin           = !!(native.logAdmin);
    const logAlexa           = !!(native.logAlexa);
    const logPresence        = !!(native.logPresence);
    const logClimate         = !!(native.logClimate);
    const logClimateExt      = !!(native.logClimateExtended);
    const logLight           = !!(native.logLight);
    const logLightExt        = !!(native.logLightExtended);
    const logEnergy          = !!(native.logEnergy);
    const logEnergyExt       = !!(native.logEnergyExtended);

    const flag = (
        label: React.ReactNode,
        checked: boolean,
        key: string,
        indent = false,
    ): React.JSX.Element => (
        <FormControlLabel
            sx={indent ? { ml: 2 } : undefined}
            control={
                <Checkbox
                    size="small"
                    checked={checked}
                    onChange={e => onChange(key, e.target.checked)}
                />
            }
            label={label}
        />
    );

    return (
        <Box sx={{ p: 2, maxWidth: 640 }}>
            <Typography variant="h6" gutterBottom>
                {I18n.t('Debug')}
            </Typography>

            <Divider sx={{ mb: 2 }} />

            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                {I18n.t('Log flags description')}
            </Typography>

            {/* ---- Adapter / Admin ---- */}
            <Typography variant="subtitle2" gutterBottom>{I18n.t('Adapter')}</Typography>
            <FormGroup sx={{ mb: 1.5 }}>
                {flag(<><code>[admin]</code> – {I18n.t('Adapter init & data point search')}</>, logAdmin, 'logAdmin')}
            </FormGroup>

            {/* ---- Rolladensteuerung ---- */}
            <Typography variant="subtitle2" gutterBottom>{I18n.t('Shuttercontrol')}</Typography>
            <FormGroup sx={{ mb: 1.5 }}>
                {flag(<><code>[shuttercontrol]</code> – {I18n.t('Log shutter init and state changes')}</>, logShutter, 'logShuttercontrol')}
                {flag(<><code>[shuttercontrol_extended]</code> – {I18n.t('Additionally log all subscribed input changes')}</>, logShutterExtended, 'logShuttercontrolExtended', true)}
            </FormGroup>

            {/* ---- Alexa ---- */}
            <Typography variant="subtitle2" gutterBottom>{I18n.t('Alexa')}</Typography>
            <FormGroup sx={{ mb: 1.5 }}>
                {flag(<><code>[alexa]</code> – {I18n.t('Alexa speak commands')}</>, logAlexa, 'logAlexa')}
            </FormGroup>

            {/* ---- Anwesenheit ---- */}
            <Typography variant="subtitle2" gutterBottom>{I18n.t('Presence')}</Typography>
            <FormGroup sx={{ mb: 1.5 }}>
                {flag(<><code>[presence]</code> – {I18n.t('Presence detection')}</>, logPresence, 'logPresence')}
            </FormGroup>

            {/* ---- Klima ---- */}
            <Typography variant="subtitle2" gutterBottom>{I18n.t('Climate')}</Typography>
            <FormGroup sx={{ mb: 1.5 }}>
                {flag(<><code>[climate]</code> – {I18n.t('Climate control')}</>, logClimate, 'logClimate')}
                {flag(<><code>[climate_extended]</code> – {I18n.t('Climate extended')}</>, logClimateExt, 'logClimateExtended', true)}
            </FormGroup>

            {/* ---- Licht ---- */}
            <Typography variant="subtitle2" gutterBottom>{I18n.t('Light')}</Typography>
            <FormGroup sx={{ mb: 1.5 }}>
                {flag(<><code>[light]</code> – {I18n.t('Light control')}</>, logLight, 'logLight')}
                {flag(<><code>[light_extended]</code> – {I18n.t('Light extended')}</>, logLightExt, 'logLightExtended', true)}
            </FormGroup>

            {/* ---- Energie ---- */}
            <Typography variant="subtitle2" gutterBottom>{I18n.t('Energy')}</Typography>
            <FormGroup>
                {flag(<><code>[energy]</code> – {I18n.t('Energy monitoring')}</>, logEnergy, 'logEnergy')}
                {flag(<><code>[energy_extended]</code> – {I18n.t('Energy extended')}</>, logEnergyExt, 'logEnergyExtended', true)}
            </FormGroup>
        </Box>
    );
}

