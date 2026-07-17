import React, { useCallback, useEffect, useState } from 'react';
import {
    Box, Button, Chip, CircularProgress, Divider, IconButton,
    Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow,
    Tooltip, Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckIcon from '@mui/icons-material/Check';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import { I18n } from '@iobroker/adapter-react-v5';
import { type FautNodeConfig, type FautTreeNode } from '../types/treeTypes';

// ---- label map builder ----

function buildLabelMap(nodes: FautTreeNode[], prefix: string, parentLabel: string, out: Map<string, string>): void {
    for (const node of nodes) {
        const relId = prefix ? `${prefix}.${node.label}` : node.label;
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

interface FautMessage {
    uuid:       string;
    severity:   'info' | 'warning' | 'error';
    message:    string;
    source:     string;
    needAck:    boolean;
    msgTimeout: number;
    createdAt:  number;
    acked:      boolean;
    ackedAt?:   number;
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
    const [items,    setItems]    = useState<ProblemItem[]>([]);
    const [messages, setMessages] = useState<FautMessage[]>([]);
    const [loading,  setLoading]  = useState(false);
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

    // Load + subscribe to global.messages
    const loadMessages = useCallback(async (): Promise<void> => {
        try {
            const st = await socket.getState(`${namespace}.global.messages`);
            if (st && typeof st.val === 'string') {
                setMessages(JSON.parse(st.val) as FautMessage[]);
            }
        } catch { /* ignore */ }
    }, [socket, namespace]);

    const ackMessage = useCallback(async (uuid: string): Promise<void> => {
        setMessages(prev => {
            const updated = prev.map(m =>
                m.uuid === uuid && !m.acked ? { ...m, acked: true, ackedAt: Date.now() } : m,
            );
            socket.setState(`${namespace}.global.messages`, { val: JSON.stringify(updated), ack: false }).catch(() => {});
            return updated;
        });
    }, [socket, namespace]);

    const ackAll = useCallback(async (): Promise<void> => {
        const now = Date.now();
        setMessages(prev => {
            const updated = prev.map(m => m.acked ? m : { ...m, acked: true, ackedAt: now });
            socket.setState(`${namespace}.global.messages`, { val: JSON.stringify(updated), ack: false }).catch(() => {});
            return updated;
        });
    }, [socket, namespace]);

    useEffect(() => {
        void loadMessages();
        // Subscribe to live updates
        const handler = (_id: string, state: ioBroker.State | null | undefined): void => {
            if (state && typeof state.val === 'string' && state.ack) {
                try { setMessages(JSON.parse(state.val) as FautMessage[]); } catch { /* ignore */ }
            }
        };
        socket.subscribeState(`${namespace}.global.messages`, handler);
        return () => { socket.unsubscribeState(`${namespace}.global.messages`, handler); };
    }, [loadMessages, socket, namespace]);

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

            {/* ---- Meldungen ---- */}
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 3, mb: 1 }}>
                <Typography variant="h6">{I18n.t('Notifications')}</Typography>
                {messages.some(m => m.needAck && !m.acked) && (
                    <Tooltip title={I18n.t('Acknowledge all')}>
                        <Button
                            size="small"
                            variant="outlined"
                            startIcon={<DoneAllIcon />}
                            onClick={() => void ackAll()}
                        >
                            {I18n.t('Acknowledge all')}
                        </Button>
                    </Tooltip>
                )}
            </Stack>

            <Divider sx={{ mb: 2 }} />

            {messages.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                    {I18n.t('No notifications')}
                </Typography>
            )}

            {messages.length > 0 && (
                <Paper variant="outlined">
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell><strong>{I18n.t('Severity')}</strong></TableCell>
                                <TableCell><strong>{I18n.t('Message')}</strong></TableCell>
                                <TableCell><strong>{I18n.t('Time')}</strong></TableCell>
                                <TableCell><strong>{I18n.t('Age')}</strong></TableCell>
                                <TableCell></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {[...messages].sort((a, b) => b.createdAt - a.createdAt).map(msg => (
                                <TableRow
                                    key={msg.uuid}
                                    hover
                                    sx={msg.acked ? { opacity: 0.55 } : undefined}
                                >
                                    <TableCell>
                                        <Chip
                                            size="small"
                                            label={I18n.t(msg.severity)}
                                            color={
                                                msg.severity === 'error'   ? 'error'   :
                                                msg.severity === 'warning' ? 'warning' : 'info'
                                            }
                                        />
                                    </TableCell>
                                    <TableCell sx={{ maxWidth: 340, wordBreak: 'break-word' }}>
                                        {msg.message}
                                    </TableCell>
                                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                        {new Date(msg.createdAt).toLocaleString()}
                                    </TableCell>
                                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                        {formatDuration(Date.now() - msg.createdAt)}
                                    </TableCell>
                                    <TableCell>
                                        {msg.needAck && !msg.acked && (
                                            <Tooltip title={I18n.t('Acknowledge')}>
                                                <IconButton
                                                    size="small"
                                                    color="primary"
                                                    onClick={() => void ackMessage(msg.uuid)}
                                                >
                                                    <CheckIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        )}
                                        {msg.acked && (
                                            <Typography variant="caption" color="text.secondary">
                                                ✓ {msg.ackedAt ? new Date(msg.ackedAt).toLocaleTimeString() : ''}
                                            </Typography>
                                        )}
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
