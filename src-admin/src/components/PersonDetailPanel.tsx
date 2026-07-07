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

        const start = 'residents.0.roomie.';
        const end   = `residents.0.roomie.\u9999`;

        // Use getObjectViewSystem (correct admin socket API: type, start, end)
        // Residents adapter may create roomies as folder, channel, or device
        Promise.all([
            (socket.getObjectViewSystem('folder',  start, end) as Promise<Record<string, any>>).catch(() => null),
            (socket.getObjectViewSystem('channel', start, end) as Promise<Record<string, any>>).catch(() => null),
            (socket.getObjectViewSystem('device',  start, end) as Promise<Record<string, any>>).catch(() => null),
        ]).then(([r1, r2, r3]) => {
            const seen = new Set<string>();
            const found: Roomie[] = [];

            const allEntries = [
                ...Object.entries(r1 ?? {}),
                ...Object.entries(r2 ?? {}),
                ...Object.entries(r3 ?? {}),
            ];
            console.log('[admin] residents search results:', allEntries.length, 'entries found');

            for (const [id] of allEntries) {
                if (seen.has(id)) continue;
                seen.add(id);
                const parts = id.split('.');
                // residents.0.roomie.<name> = 4 parts
                if (parts.length === 4) {
                    found.push({ id, label: parts[3] });
                }
            }

            console.log('[admin] residents found:', found);
            setRoomies(found);
            setNoAdapter(found.length === 0);
            setLoading(false);
        }).catch((e: unknown) => {
            console.error('[admin] residents search failed:', e);
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
