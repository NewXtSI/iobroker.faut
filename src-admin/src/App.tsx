import React from 'react';
import { ThemeProvider, StyledEngineProvider } from '@mui/material/styles';
import { AppBar, Tabs, Tab } from '@mui/material';

import {
    GenericApp,
    I18n,
    Loader,
    AdminConnection,
    type IobTheme,
    type GenericAppProps,
    type GenericAppState,
} from '@iobroker/adapter-react-v5';

import TabGeneral from './Tabs/TabGeneral';
import TabGrundstueck from './Tabs/TabGrundstueck';
import TabGlobal from './Tabs/TabGlobal';
import TabStatus from './Tabs/TabStatus';
import TabMessages from './Tabs/TabMessages';
import TabDebug from './Tabs/TabDebug';

import enLang from './i18n/en.json';
import deLang from './i18n/de.json';

const styles: Record<string, React.CSSProperties | ((theme: IobTheme) => React.CSSProperties)> = {
    tabContent: {
        padding: 10,
        height: 'calc(100% - 64px - 48px - 20px)',
        overflow: 'auto',
    },
};

interface AppState extends GenericAppState {
    selectedTab: string;
    theme: IobTheme;
    themeType: 'light' | 'dark';
    loaded: boolean;
    changed: boolean;
}

export default class App extends GenericApp<GenericAppProps, AppState> {
    constructor(props: any) {
        const extendedProps = { ...props };
        extendedProps.Connection = AdminConnection;
        extendedProps.translations = {
            en: enLang,
            de: deLang,
        };

        super(props, extendedProps);

        Object.assign(this.state, {
            selectedTab:
                window.localStorage.getItem(
                    `${this.adapterName}.${this.instance}.selectedTab`,
                ) || 'general',
        });
    }

    render(): React.JSX.Element {
        if (!this.state.loaded) {
            return (
                <StyledEngineProvider injectFirst>
                    <ThemeProvider theme={this.state.theme}>
                        <Loader themeType={this.state.themeType} />
                    </ThemeProvider>
                </StyledEngineProvider>
            );
        }

        return (
            <StyledEngineProvider injectFirst>
                <ThemeProvider theme={this.state.theme}>
                    <div
                        className="App"
                        style={{
                            background: this.state.theme.palette.background.default,
                            color: this.state.theme.palette.text.primary,
                            height: '100%',
                        }}
                    >
                        <AppBar position="static">
                            <Tabs
                                value={this.state.selectedTab || 'general'}
                                onChange={(_e, value: string): void => {
                                    this.setState({ selectedTab: value });
                                    window.localStorage.setItem(
                                        `${this.adapterName}.${this.instance}.selectedTab`,
                                        value,
                                    );
                                }}
                                variant="scrollable"
                                scrollButtons="auto"
                            >
                                <Tab value="general" label={I18n.t('General')} data-name="general" />
                                <Tab value="grundstueck" label={I18n.t('Property')} data-name="grundstueck" />
                                <Tab value="global" label={I18n.t('Global')} data-name="global" />
                                <Tab value="status" label={I18n.t('Status')} data-name="status" />
                                <Tab value="messages" label={I18n.t('Messages')} data-name="messages" />
                                <Tab value="debug" label={I18n.t('Debug')} data-name="debug" />
                            </Tabs>
                        </AppBar>

                        <div style={styles.tabContent as React.CSSProperties}>
                            {this.state.selectedTab === 'general' && (
                                <TabGeneral
                                    key="general"
                                    common={this.common!}
                                    socket={this.socket}
                                    native={this.state.native}
                                    instance={this.instance}
                                    adapterName={this.adapterName}
                                    onChange={(attr, value) => this.updateNativeValue(attr, value)}
                                />
                            )}
                            {this.state.selectedTab === 'grundstueck' && (
                                <TabGrundstueck
                                    key="grundstueck"
                                    common={this.common!}
                                    socket={this.socket}
                                    theme={this.state.theme}
                                    native={this.state.native}
                                    instance={this.instance}
                                    adapterName={this.adapterName}
                                    onChange={(attr, value) => this.updateNativeValue(attr, value)}
                                />
                            )}
                            {this.state.selectedTab === 'global' && (
                                <TabGlobal
                                    key="global"
                                    common={this.common!}
                                    socket={this.socket}
                                    theme={this.state.theme}
                                    native={this.state.native}
                                    instance={this.instance}
                                    adapterName={this.adapterName}
                                    onChange={(attr, value) => this.updateNativeValue(attr, value)}
                                />
                            )}
                            {this.state.selectedTab === 'status' && (
                                <TabStatus
                                    key="status"
                                    common={this.common!}
                                    socket={this.socket}
                                    native={this.state.native}
                                    instance={this.instance}
                                    adapterName={this.adapterName}
                                    onChange={(attr, value) => this.updateNativeValue(attr, value)}
                                />
                            )}
                            {this.state.selectedTab === 'messages' && (
                                <TabMessages
                                    key="messages"
                                    common={this.common!}
                                    socket={this.socket}
                                    native={this.state.native}
                                    instance={this.instance}
                                    adapterName={this.adapterName}
                                    onChange={(attr, value) => this.updateNativeValue(attr, value)}
                                />
                            )}
                            {this.state.selectedTab === 'debug' && (
                                <TabDebug
                                    key="debug"
                                    common={this.common!}
                                    socket={this.socket}
                                    native={this.state.native}
                                    instance={this.instance}
                                    adapterName={this.adapterName}
                                    onChange={(attr, value) => this.updateNativeValue(attr, value)}
                                />
                            )}
                        </div>

                        {this.renderError()}
                        {this.renderSaveCloseButtons()}
                    </div>
                </ThemeProvider>
            </StyledEngineProvider>
        );
    }
}
