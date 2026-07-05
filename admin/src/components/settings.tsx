import React from 'react';
import { withStyles } from '@material-ui/core/styles';
import type { CreateCSSProperties } from '@material-ui/core/styles/withStyles';
import I18n from '@iobroker/adapter-react/i18n';

const styles = (): Record<string, CreateCSSProperties> => ({
	tab: {
		width: '100%',
		minHeight: '100%',
	},
	column: {
		display: 'inline-block',
		verticalAlign: 'top',
		marginRight: 20,
	},
	columnSettings: {
		width: 'calc(100% - 20px)',
	},
});

interface SettingsProps {
	classes: Record<string, string>;
	native: Record<string, unknown>;
	onChange: (attr: string, value: unknown) => void;
}

interface SettingsState {
	dummy?: undefined;
}

class Settings extends React.Component<SettingsProps, SettingsState> {
	constructor(props: SettingsProps) {
		super(props);
		this.state = {};
	}

	render(): React.JSX.Element {
		return (
			<form className={this.props.classes.tab}>
				<div className={`${this.props.classes.column} ${this.props.classes.columnSettings}`}>
					<p>{I18n.t('No settings available yet.')}</p>
				</div>
			</form>
		);
	}
}

export default withStyles(styles)(Settings);
