import React, { useState } from 'react';
import { Box, Button, Divider, Stack, Typography } from '@mui/material';
import { DialogSelectID, I18n, type IobTheme } from '@iobroker/adapter-react-v5';
import { type FautNodeConfig, type FautTreeNode } from '../types/treeTypes';
import DpField from './DpField';

interface Props {
    node: FautTreeNode;
    socket: any;
    theme: IobTheme;
    onConfigChange: (key: keyof FautNodeConfig, value: string | boolean | number) => void;
}

/**
 * Reusable section for selecting an Alexa device and triggering a test speak.
 * Intended for container nodes: Raum, Gebäude, Etage.
 * The user selects the device's root branch (channel/device), NOT a leaf state.
 * Test button writes to <device>.Command.Speak.
 */
export default function AlexaSection({ node, socket, theme, onConfigChange }: Props): React.JSX.Element {
    const cfg = node.config ?? {};
    const [selectOpen, setSelectOpen] = useState(false);
    const [testing, setTesting] = useState(false);

    const dpAlexa = (cfg.dpAlexa as string | undefined) ?? '';

    const handleTest = (): void => {
        if (!dpAlexa) return;
        setTesting(true);
        socket.setState(`${dpAlexa}.Command.Speak`, {
            val: 'Das ist ein Test von ioBroker faut.',
            ack: false,
        });
        setTimeout(() => setTesting(false), 1500);
    };

    return (
        <Box>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" gutterBottom>
                {I18n.t('Alexa Device')}
            </Typography>
            <Stack direction="row" spacing={1} alignItems="flex-start">
                <Box sx={{ flexGrow: 1 }}>
                    <DpField
                        label={I18n.t('Alexa device path')}
                        value={dpAlexa}
                        onChange={v => onConfigChange('dpAlexa', v)}
                        onSelect={() => setSelectOpen(true)}
                    />
                </Box>
                {dpAlexa && (
                    <Button
                        variant="outlined"
                        size="small"
                        disabled={testing}
                        onClick={handleTest}
                        sx={{ mt: 0.25, whiteSpace: 'nowrap' }}
                    >
                        {I18n.t('Test')}
                    </Button>
                )}
            </Stack>

            {selectOpen && (
                <DialogSelectID
                    socket={socket}
                    theme={theme}
                    title={I18n.t('Select Alexa device')}
                    selected={dpAlexa}
                    onClose={() => setSelectOpen(false)}
                    onOk={id => {
                        if (typeof id === 'string' && id) onConfigChange('dpAlexa', id);
                        setSelectOpen(false);
                    }}
                />
            )}
        </Box>
    );
}
