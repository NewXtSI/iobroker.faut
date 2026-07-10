import React, { useCallback, useEffect, useState } from 'react';
import {
    Box, Chip, CircularProgress, Divider, IconButton,
    Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow,
    Tooltip, Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { I18n } from '@iobroker/adapter-react-v5';
import { type FautNodeConfig, type FautTreeNode } from '../types/treeTypes';

// ---- label map builder ----

function buildLabelMap(nodes: FautTreeNode[], prefix: string, parentLabel: string, out: Map<string, string>): void {
    for (const node of nodes) {
        const relId = prefix ? `${prefix}.${node.id}` : node.id;
        const label = parentLabel ? `${parentLabel} › ${node.label}` : node.label;
        out.set(relId, label);
        if (node.children?.length) buildLabelMap(node.children, relId, label, out);
    }
}

// ---- duration formatter ----

function formatDuration(ms: number): string {
    const s = Math.floor(ms / 1000);
    if (s < 60)   return `${s} s`;
    const m = Math.floor(s / 60);
    if (m < 60)   return `${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24)   return `${h} h ${m % 60} min`;
    const d = Math.floor(h / 24);
    return `${d} d ${h % 24} h`;
}

// ---- types ----

interface ProblemItem {
    stateId:   string;   // full own-state ID, e.g. faut.0.haus.eg.wz.bewegung.lowBat
    relId:     string;   // everything between namespace and last segment
    label:     string;   // human-readable label
    kind:      'lowBat' | 'unreach';
    since:     number;   // lc timestamp (ms)
}

interface TabStatusProps {
    common:      Record<string, any>;
    socket:      any;
    native:      Record<string, any>;
    instance:    number;
    adapterName: string;
    onChange:    (attr: string, value: any) => void;
}

export default function TabStatus({ native, socket, adapterName, instance }: TabStatusProps): React.JSX.Element {
    const [items,   setItems]   = useState<ProblemItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

    const namespace = `${adapterName}.${instance}`;

    const refresh = useCallback(async (): Promise<void> => {
        setLoading(true);
        try {
            // Build label map from config tree
            const tree: FautTreeNode[] = Array.isArray(native.grundstueck)
                ? (native.grundstueck as FautTreeNode[])
                : [];
            const labelMap = new Map<string, string>();
            buildLabelMap(tree, '', '', labelMap);

            // Fetch all adapter states
            const statesObj: Record<string, ioBroker.State> =
                await socket.getStates(`${namespace}.*`);

            const found: ProblemItem[] = [];
            const now = Date.now();

            for (const [id, state] of Object.entries(statesObj)) {
                if (!state || state.val !== true) continue;

                let kind: 'lowBat' | 'unreach' | null = null;
                if (id.endsWith('.lowBat'))  kind = 'lowBat';
                if (id.endsWith('.unreach')) kind = 'unreach';
                if (!kind) continue;

                // relId = part between "namespace." and ".lowBat"/".unreach"
                const suffix  = kind === 'lowBat' ? '.lowBat' : '.unreach';
                const relId   = id.slice(namespace.length + 1, id.length - suffix.length);
                const label   = labelMap.get(relId) ?? relId;
                const since   = state.lc ?? now;

                found.push({ stateId: id, relId, label, kind, since });
            }

            // Sort by duration descending (longest problem first)
            found.sort((a, b) => a.since - b.since);
            setItems(found);
            setLastRefresh(new Date());
        } catch (e) {
            console.error('TabStatus refresh failed:', e);
        } finally {
            setLoading(false);
        }
    }, [socket, namespace, native.grundstueck]);

    // Initial load + auto-refresh every 60 s
    useEffect(() => {
        void refresh();
        const timer = setInterval(() => { void refresh(); }, 60_000);
        return () => clearInterval(timer);
    }, [refresh]);

    return (
        <Box sx={{ p: 2, maxWidth: 900 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <Typography variant="h6">{I18n.t('Status')}</Typography>
                <Tooltip title={I18n.t('Refresh')}>
                    <span>
                        <IconButton size="small" onClick={() => void refresh()} disabled={loading}>
                            {loading ? <CircularProgress size={18} /> : <RefreshIcon fontSize="small" />}
                        </IconButton>
                    </span>
                </Tooltip>
                {lastRefresh && (
                    <Typography variant="caption" color="text.secondary">
                        {I18n.t('Last update')}: {lastRefresh.toLocaleTimeString()}
                    </Typography>
                )}
            </Stack>

            <Divider sx={{ mb: 2 }} />

            {!loading && items.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                    {I18n.t('No problems detected')}
                </Typography>
            )}

            {items.length > 0 && (
                <Paper variant="outlined">
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell><strong>{I18n.t('Device')}</strong></TableCell>
                                <TableCell><strong>{I18n.t('Problem')}</strong></TableCell>
                                <TableCell><strong>{I18n.t('Since')}</strong></TableCell>
                                <TableCell><strong>{I18n.t('Duration')}</strong></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {items.map(item => (
                                <TableRow key={item.stateId} hover>
                                    <TableCell>{item.label}</TableCell>
                                    <TableCell>
                                        <Chip
                                            size="small"
                                            label={item.kind === 'lowBat' ? I18n.t('Low battery') : I18n.t('Unreachable')}
                                            color={item.kind === 'lowBat' ? 'warning' : 'error'}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        {new Date(item.since).toLocaleString()}
                                    </TableCell>
                                    <TableCell>
                                        {formatDuration(Date.now() - item.since)}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Paper>
            )}
        </Box>
    );
}
