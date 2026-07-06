import React, { useEffect, useState } from 'react';
import {
    Box,
    CircularProgress,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    Typography,
} from '@mui/material';
import { I18n } from '@iobroker/adapter-react-v5';
import { type FautNodeConfig, type FautTreeNode } from '../types/treeTypes';

interface Props {
    node: FautTreeNode;
    socket: any;
    onConfigChange: (key: keyof FautNodeConfig, value: string | boolean | number) => void;
}

interface Roomie {
    id: string;
    label: string;
}

export default function PersonDetailPanel({ node, socket, onConfigChange }: Props): React.JSX.Element {
    const cfg = node.config ?? {};
    const [roomies, setRoomies] = useState<Roomie[]>([]);
    const [loading, setLoading] = useState(true);
    const [noAdapter, setNoAdapter] = useState(false);

    useEffect(() => {
        setLoading(true);
        (socket.getObjectView('system', 'channel', {
            startkey: 'residents.0.roomies.',
            endkey: 'residents.0.roomies.\u9999',
        }) as Promise<unknown>)
            .then((result: unknown) => {
                const found: Roomie[] = [];
                // Handle both { rows: [{id, value}] } and Record<string, ioBroker.Object>
                const entries: Array<[string, unknown]> =
                    result && typeof result === 'object' && Array.isArray((result as any).rows)
                        ? (result as any).rows.map((r: any) => [r.id as string, r.value])
                        : Object.entries((result as Record<string, unknown>) ?? {});

                for (const [id, obj] of entries) {
                    const parts = id.split('.');
                    // residents.0.roomies.<name> = 4 parts
                    if (parts.length === 4) {
                        const name = (obj as any)?.common?.name;
                        found.push({
                            id,
                            label: typeof name === 'string' ? name : parts[3],
                        });
                    }
                }
                setRoomies(found);
                setNoAdapter(found.length === 0);
                setLoading(false);
            })
            .catch(() => {
                setNoAdapter(true);
                setLoading(false);
            });
    }, [socket]);

    return (
        <Stack spacing={2} sx={{ mt: 2 }}>
            <Typography variant="subtitle2">{I18n.t('Resident')}</Typography>

            {loading ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={18} />
                    <Typography variant="body2" color="text.secondary">
                        {I18n.t('Loading residents…')}
                    </Typography>
                </Box>
            ) : noAdapter ? (
                <Typography variant="body2" color="text.secondary">
                    {I18n.t('No roomies found – is the residents adapter installed and running?')}
                </Typography>
            ) : (
                <FormControl size="small" sx={{ minWidth: 260 }}>
                    <InputLabel>{I18n.t('Select resident')}</InputLabel>
                    <Select
                        value={(cfg.dpResident as string | undefined) ?? ''}
                        label={I18n.t('Select resident')}
                        onChange={e => onConfigChange('dpResident', e.target.value as string)}
                    >
                        <MenuItem value="">
                            <em>{I18n.t('None')}</em>
                        </MenuItem>
                        {roomies.map(r => (
                            <MenuItem key={r.id} value={r.id}>
                                {r.label}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
            )}
        </Stack>
    );
}
