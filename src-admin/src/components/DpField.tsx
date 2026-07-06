import React from 'react';
import { IconButton, InputAdornment, TextField } from '@mui/material';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import { I18n } from '@iobroker/adapter-react-v5';

export interface DpFieldProps {
    label: string;
    value: string;
    onChange: (v: string) => void;
    onSelect: () => void;
    sx?: object;
}

/** Text field with a "…" button that opens an object-select dialog. */
export default function DpField({ label, value, onChange, onSelect, sx }: DpFieldProps): React.JSX.Element {
    return (
        <TextField
            label={label}
            fullWidth
            size="small"
            value={value}
            onChange={e => onChange(e.target.value)}
            sx={sx}
            InputProps={{
                endAdornment: (
                    <InputAdornment position="end">
                        <IconButton size="small" edge="end" onClick={onSelect} title={I18n.t('Select data point')}>
                            <MoreHorizIcon fontSize="small" />
                        </IconButton>
                    </InputAdornment>
                ),
            }}
        />
    );
}
