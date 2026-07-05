import React from 'react';
import { Box, Tab, Tabs } from '@mui/material';
import { GenericApp, type GenericAppProps, type GenericAppSettings, type GenericAppState, I18n } from '@iobroker/adapter-react-v5';
import TabGeneral from './tabs/TabGeneral';
import TabGrundstueck from './tabs/TabGrundstueck';

interface AppState extends GenericAppState {
	selectedTab: number;
}

class App extends GenericApp<GenericAppProps, AppState> {
	constructor(props: GenericAppProps) {
		const extendedProps: GenericAppSettings = {
			...props,
			encryptedFields: [],
			translations: {
				// eslint-disable-next-line @typescript-eslint/no-require-imports
				en: require('./i18n/en.json'),
				// eslint-disable-next-line @typescript-eslint/no-require-imports
				de: require('./i18n/de.json'),
			},
		};
		super(props, extendedProps);
		this.state = {
			...this.state,
			selectedTab: 0,
		};
	}

	render(): React.JSX.Element {
		if (!this.state.loaded) {
			return super.render();
		}

		return (
			<Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
				<Tabs
					value={this.state.selectedTab}
					onChange={(_e: React.SyntheticEvent, v: number) => this.setState({ selectedTab: v })}
					sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
				>
					<Tab label={I18n.t('General')} />
					<Tab label={I18n.t('Property')} />
				</Tabs>

				<Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
					{this.state.selectedTab === 0 && (
						<TabGeneral
							native={this.state.native}
							onChange={(attr: string, value: unknown) => this.updateNativeValue(attr, value)}
						/>
					)}
					{this.state.selectedTab === 1 && <TabGrundstueck />}
				</Box>

				{this.renderSaveCloseButtons()}
			</Box>
		);
	}
}

export default App;

