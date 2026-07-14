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
    type SelectChangeEvent,
} from '@mui/material';
import { DialogSelectID, I18n, type IobTheme } from '@iobroker/adapter-react-v5';
import DpField from '../components/DpField';

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
    instance: number;
    adapterName: string;
    theme?: IobTheme;
    onChange: (attr: string, value: any) => void;
}

interface TabMessagesState {
    telegramInstanzen: { id: string; name: string }[];
    loading: boolean;
    testingTelegram: boolean;
    testingAlexa: boolean;
    alexaSelectOpen: boolean;
}

export default class TabMessages extends React.Component<TabMessagesProps, TabMessagesState> {
    constructor(props: TabMessagesProps) {
        super(props);
        this.state = {
            telegramInstanzen: [],
            loading: true,
            testingTelegram: false,
            testingAlexa: false,
            alexaSelectOpen: false,
        };
    }

    async componentDidMount(): Promise<void> {
        await this.loadTelegramInstances();
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

    private async testTelegram(): Promise<void> {
        this.setState({ testingTelegram: true });
        try {
            const instanz = this.props.native?.telegramInstanz || '';
            if (!instanz) {
                alert(I18n.t('No Telegram instance selected'));
                this.setState({ testingTelegram: false });
                return;
            }
            await this.props.socket.setState(`${instanz}.communicate.response`, {
                val: `[TEST] ioBroker.faut – ${new Date().toLocaleTimeString()}`,
                ack: false,
            });
            alert(I18n.t('Test message sent'));
        } catch (e) {
            console.error('Telegram test failed:', e);
            alert(`${I18n.t('Test failed')}: ${(e as Error).message}`);
        } finally {
            this.setState({ testingTelegram: false });
        }
    }

    private async testAlexa(): Promise<void> {
        this.setState({ testingAlexa: true });
        try {
            const gruppe = this.props.native?.alexaMultiroomGruppe || '';
            if (!gruppe) {
                alert(I18n.t('No Alexa group selected'));
                this.setState({ testingAlexa: false });
                return;
            }
            const ttsPath = `${gruppe}.Commands.speak`;
            await this.props.socket.setState(ttsPath, {
                val: 'Das ist ein Test von ioBroker faut.',
                ack: false,
            });
            alert(I18n.t('Test message sent'));
        } catch (e) {
            console.error('Alexa test failed:', e);
            alert(`${I18n.t('Test failed')}: ${(e as Error).message}`);
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

        const alexaGruppe = (this.props.native?.alexaMultiroomGruppe as string | undefined) ?? '';

        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {/* Telegram Section */}
                <Card>
                    <CardHeader title="Telegram" />
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

                        <Box>
                            <Button
                                variant="outlined"
                                size="small"
                                onClick={() => this.testTelegram()}
                                disabled={this.state.testingTelegram || !this.props.native?.telegramInstanz}
                            >
                                {this.state.testingTelegram ? (
                                    <><CircularProgress size={16} sx={{ mr: 1 }} />{I18n.t('Testing')}...</>
                                ) : I18n.t('Test')}
                            </Button>
                        </Box>
                    </CardContent>
                </Card>

                {/* Alexa Section */}
                <Card>
                    <CardHeader title="Alexa" />
                    <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <DpField
                            label={I18n.t('Alexa Multiroom Group')}
                            value={alexaGruppe}
                            onChange={v => this.props.onChange('alexaMultiroomGruppe', v)}
                            onSelect={() => this.setState({ alexaSelectOpen: true })}
                        />

                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={this.props.native?.alexaRaumspezifischAktiv !== false}
                                    onChange={(e) =>
                                        this.props.onChange('alexaRaumspezifischAktiv', e.target.checked)
                                    }
                                />
                            }
                            label={I18n.t('Use room-specific output')}
                        />

                        <Box>
                            <Button
                                variant="outlined"
                                size="small"
                                onClick={() => this.testAlexa()}
                                disabled={this.state.testingAlexa || !alexaGruppe}
                            >
                                {this.state.testingAlexa ? (
                                    <><CircularProgress size={16} sx={{ mr: 1 }} />{I18n.t('Testing')}...</>
                                ) : I18n.t('Test')}
                            </Button>
                        </Box>
                    </CardContent>
                </Card>

                {/* DialogSelectID for Alexa group */}
                {this.state.alexaSelectOpen && (
                    <DialogSelectID
                        key="alexa-group-select"
                        socket={this.props.socket}
                        dialogName="alexaGroupSelect"
                        title={I18n.t('Alexa Multiroom Group')}
                        selected={alexaGruppe}
                        statesOnly={false}
                        onOk={(id: string | string[]) => {
                            const selected = Array.isArray(id) ? id[0] : id;
                            if (selected) this.props.onChange('alexaMultiroomGruppe', selected);
                            this.setState({ alexaSelectOpen: false });
                        }}
                        onClose={() => this.setState({ alexaSelectOpen: false })}
                    />
                )}
            </Box>
        );
    }
}
