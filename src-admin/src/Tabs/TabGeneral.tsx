import React from 'react';
import { FormControlLabel, Checkbox, FormGroup, Typography } from '@mui/material';
import { I18n } from '@iobroker/adapter-react-v5';

interface TabGeneralProps {
    common: Record<string, any>;
    socket: any;
    native: Record<string, any>;
    instance: number;
    adapterName: string;
    onChange: (attr: string, value: any) => void;
}

export default function TabGeneral({ native, onChange }: TabGeneralProps): React.JSX.Element {
    const aktiviert: boolean = !!native.aktiviert;
    const steuerungAktiviert: boolean = !!native.steuerungAktiviert;

    return (
        <div style={{ padding: 16 }}>
            <Typography variant="h6" gutterBottom>
                {I18n.t('General')}
            </Typography>
            <FormGroup>
                <FormControlLabel
                    control={
                        <Checkbox
                            checked={aktiviert}
                            onChange={e => onChange('aktiviert', e.target.checked)}
                        />
                    }
                    label={I18n.t('Enabled')}
                />
                <FormControlLabel
                    control={
                        <Checkbox
                            checked={steuerungAktiviert}
                            disabled={!aktiviert}
                            onChange={e => onChange('steuerungAktiviert', e.target.checked)}
                        />
                    }
                    label={I18n.t('Control enabled')}
                />
            </FormGroup>
        </div>
    );
}

