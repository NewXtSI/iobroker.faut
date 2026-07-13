import React from 'react';
import {
    Box,
    Button,
    Card,
    CardContent,
    CardHeader,
    Checkbox,
    CircularProgress,
    FormControl,
    FormControlLabel,
    InputLabel,
    MenuItem,
    Select,
    SelectChangeEvent,
    Typography,
} from '@mui/material';
import { I18n } from '@iobroker/adapter-react-v5';

interface IobObject {
    _id: string;
    type: string;
    common?: { name?: string };
    native?: Record<string, any>;
}

interface TabMessagesProps {
    common: any;
    socket: any;
    native: any;
    instance: string;
    adapterName: string;
    onChange: (attr: string, value: any) => void;
}

interface TabMessagesState {
    telegramInstanzen: { id: string; name: string }[];
    alexaMultiroomGruppen: { id: string; name: string }[];
    loading: boolean;
    testingTelegram: boolean;
    testingAlexa: boolean;
}

export default class TabMessages extends React.Component<TabMessagesProps, TabMessagesState> {
    constructor(props: TabMessagesProps) {
        super(props);
        this.state = {
            telegramInstanzen: [],
            alexaMultiroomGruppen: [],
            loading: true,
            testingTelegram: false,
            testingAlexa: false,
        };
    }

    async componentDidMount(): Promise<void> {
        await this.loadTelegramInstances();
        await this.loadAlexaMultiroomGroups();
        this.setState({ loading: false });
    }

    private async loadTelegramInstances(): Promise<void> {
        try {
            const objs = await this.props.socket.getObjects(true);
            const instances: { id: string; name: string }[] = [];

            for (const [id, obj] of Object.entries(objs)) {
                const objTyped = obj as IobObject;
                if (
                    id.startsWith('system.adapter.telegram.') &&
                    objTyped.type === 'instance'
                ) {
                    const instanceNum = id.split('.')[3];
                    instances.push({
                        id: `telegram.${instanceNum}`,
                        name: `Telegram (${instanceNum})`,
                    });
                }
            }

            this.setState({ telegramInstanzen: instances });
        } catch (e) {
            console.error('Failed to load Telegram instances:', e);
        }
    }

    private async loadAlexaMultiroomGroups(): Promise<void> {
        try {
            const objs = await this.props.socket.getObjects(true);
            const groups: { id: string; name: string }[] = [];

            // Look for alexadevice.0 or similar
            for (const [id, obj] of Object.entries(objs)) {
                const objTyped = obj as IobObject;
                if (
                    id.match(/^system\.adapter\.alexadevice\.\d+$/) &&
                    objTyped.type === 'instance'
                ) {
                    const instanceNum = id.split('.')[3];
                    const deviceNs = `alexadevice.${instanceNum}`;

                    // Look for multiroom group objects
                    for (const [devId, devObj] of Object.entries(objs)) {
                        const devObjTyped = devObj as IobObject;
                        if (
                            devId.startsWith(deviceNs) &&
                            devId.includes('Echo_Hub') &&
                            devObjTyped.type === 'device'
                        ) {
                            const groupName =
                                devObjTyped.common?.name || devId.split('.').pop() || devId;
                            groups.push({
                                id: devId,
                                name: String(groupName),
                            });
                        }
                    }
                }
            }

            this.setState({ alexaMultiroomGruppen: groups });
        } catch (e) {
            console.error('Failed to load Alexa multiroom groups:', e);
        }
    }

    private async testTelegram(): Promise<void> {
        this.setState({ testingTelegram: true });
        try {
            const instanz = this.props.native?.telegramInstanz || '';
            if (!instanz) {
                alert('Keine Telegram Instanz ausgewählt');
                this.setState({ testingTelegram: false });
                return;
            }

            // Send test message
            await this.props.socket.setState(`${instanz}.communication`, {
                val: `Test message from ioBroker.faut at ${new Date().toLocaleTimeString()}`,
                ack: false,
            });

            alert('Test-Nachricht gesendet');
        } catch (e) {
            console.error('Telegram test failed:', e);
            alert(`Test fehlgeschlagen: ${(e as Error).message}`);
        } finally {
            this.setState({ testingTelegram: false });
        }
    }

    private async testAlexa(): Promise<void> {
        this.setState({ testingAlexa: true });
        try {
            const gruppe = this.props.native?.alexaMultiroomGruppe || '';
            if (!gruppe) {
                alert('Keine Alexa Multiroom Gruppe ausgewählt');
                this.setState({ testingAlexa: false });
                return;
            }

            // Attempt to trigger Alexa test message
            const ttsPath = `${gruppe}.Alexa.TextToSpeech`;
            await this.props.socket.setState(ttsPath, {
                val: 'Test message from ioBroker faut adapter',
                ack: false,
            });

            alert('Test-Ausgabe an Alexa gesendet');
        } catch (e) {
            console.error('Alexa test failed:', e);
            alert(`Test fehlgeschlagen: ${(e as Error).message}`);
        } finally {
            this.setState({ testingAlexa: false });
        }
    }

    render(): React.JSX.Element {
        if (this.state.loading) {
            return (
                <Box display="flex" justifyContent="center" alignItems="center" height="100%">
                    <CircularProgress />
                </Box>
            );
        }

        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {/* Telegram Section */}
                <Card>
                    <CardHeader title={I18n.t('Telegram')} />
                    <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <FormControl fullWidth>
                            <InputLabel>{I18n.t('Telegram Instance')}</InputLabel>
                            <Select
                                label={I18n.t('Telegram Instance')}
                                value={this.props.native?.telegramInstanz || ''}
                                onChange={(e: SelectChangeEvent) => {
                                    this.props.onChange('telegramInstanz', e.target.value);
                                }}
                            >
                                <MenuItem value="">
                                    <em>{I18n.t('None')}</em>
                                </MenuItem>
                                {this.state.telegramInstanzen.map((inst) => (
                                    <MenuItem key={inst.id} value={inst.id}>
                                        {inst.name}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={
                                        this.props.native?.telegramSilentNachtmodus !== false
                                    }
                                    onChange={(e) => {
                                        this.props.onChange(
                                            'telegramSilentNachtmodus',
                                            e.target.checked,
                                        );
                                    }}
                                />
                            }
                            label={I18n.t('No notifications in night mode')}
                        />

                        <Button
                            variant="contained"
                            color="primary"
                            onClick={() => this.testTelegram()}
                            disabled={this.state.testingTelegram}
                        >
                            {this.state.testingTelegram ? (
                                <>
                                    <CircularProgress size={20} sx={{ mr: 1 }} />
                                    {I18n.t('Testing')}...
                                </>
                            ) : (
                                I18n.t('Test')
                            )}
                        </Button>
                    </CardContent>
                </Card>

                {/* Alexa Section */}
                <Card>
                    <CardHeader title="Alexa" />
                    <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <FormControl fullWidth>
                            <InputLabel>{I18n.t('Alexa Multiroom Group')}</InputLabel>
                            <Select
                                label={I18n.t('Alexa Multiroom Group')}
                                value={this.props.native?.alexaMultiroomGruppe || ''}
                                onChange={(e: SelectChangeEvent) => {
                                    this.props.onChange('alexaMultiroomGruppe', e.target.value);
                                }}
                            >
                                <MenuItem value="">
                                    <em>{I18n.t('None')}</em>
                                </MenuItem>
                                {this.state.alexaMultiroomGruppen.map((gruppe) => (
                                    <MenuItem key={gruppe.id} value={gruppe.id}>
                                        {gruppe.name}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={
                                        this.props.native?.alexaRaumspezifischAktiv !== false
                                    }
                                    onChange={(e) => {
                                        this.props.onChange(
                                            'alexaRaumspezifischAktiv',
                                            e.target.checked,
                                        );
                                    }}
                                />
                            }
                            label={I18n.t('Use room-specific output')}
                        />

                        <Button
                            variant="contained"
                            color="primary"
                            onClick={() => this.testAlexa()}
                            disabled={this.state.testingAlexa}
                        >
                            {this.state.testingAlexa ? (
                                <>
                                    <CircularProgress size={20} sx={{ mr: 1 }} />
                                    {I18n.t('Testing')}...
                                </>
                            ) : (
                                I18n.t('Test')
                            )}
                        </Button>
                    </CardContent>
                </Card>
            </Box>
        );
    }
}
