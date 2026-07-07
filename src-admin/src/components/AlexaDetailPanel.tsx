import React, { useState } from 'react';
import { Box, Button, Stack } from '@mui/material';
import { DialogSelectID, I18n, type IobTheme } from '@iobroker/adapter-react-v5';
import { type FautNodeConfig, type FautTreeNode } from '../types/treeTypes';
import DpField from './DpField';
import { iobLog } from '../utils/iobLog';

interface Props {
    node: FautTreeNode;
    socket: any;
    theme: IobTheme;
    adapterName: string;
    instance: number;
    onConfigChange: (key: keyof FautNodeConfig, value: string | boolean | number) => void;
}

/**
 * Detail panel for Alexa actor nodes.
 * The user selects the device's root branch (channel/folder), NOT a leaf state.
 * statesOnly={false} enables selection of channels, devices and folders.
 * Test button writes to <device>.Command.Speak.
 */
export default function AlexaDetailPanel({ node, socket, theme, adapterName, instance, onConfigChange }: Props): React.JSX.Element {
    const cfg = node.config ?? {};
    const [selectOpen, setSelectOpen] = useState(false);
    const [testing, setTesting] = useState(false);

    const dpAlexa = (cfg.dpAlexa as string | undefined) ?? '';

    const handleTest = (): void => {
        if (!dpAlexa) return;
        setTesting(true);
        const speakId = `${dpAlexa}.Commands.speak`;
        iobLog(socket, adapterName, instance, 'alexa', `test speak on '${speakId}'`);
        (socket.setState(speakId, 'Das ist ein Test von ioBroker faut.') as Promise<void> | undefined)
            ?.catch((e: unknown) => iobLog(socket, adapterName, instance, 'alexa', `setState failed: ${String(e)}`));
        setTimeout(() => setTesting(false), 1500);
    };

    return (
        <Stack spacing={2} sx={{ mt: 2 }}>
            {/* Device path selector */}
            <DpField
                label={I18n.t('Alexa device path')}
                value={dpAlexa}
                onChange={v => onConfigChange('dpAlexa', v)}
                onSelect={() => setSelectOpen(true)}
            />

            {/* Test button */}
            {dpAlexa && (
                <Box>
                    <Button
                        variant="outlined"
                        size="small"
                        disabled={testing}
                        onClick={handleTest}
                    >
                        {I18n.t('Test')} (Commands.speak)
                    </Button>
                </Box>
            )}

            {/* Object selector – statesOnly=false allows folder/channel selection */}
            {selectOpen && (
                <DialogSelectID
                    socket={socket}
                    theme={theme}
                    title={I18n.t('Select Alexa device')}
                    selected={dpAlexa}
                    types={['channel', 'device', 'folder'] as any}
                    onClose={() => setSelectOpen(false)}
                    onOk={id => {
                        if (typeof id === 'string' && id) onConfigChange('dpAlexa', id);
                        setSelectOpen(false);
                    }}
                />
            )}
        </Stack>
    );
}
