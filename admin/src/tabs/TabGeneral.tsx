import React from 'react';
import { Box, Typography } from '@mui/material';

interface TabGeneralProps {
	native: Record<string, unknown>;
	onChange: (attr: string, value: unknown) => void;
}

export default function TabGeneral({ native: _native, onChange: _onChange }: TabGeneralProps): React.JSX.Element {
	return (
		<Box>
			<Typography variant="body2" color="text.secondary">
				Allgemeine Einstellungen – Inhalt folgt in einem der nächsten Steps.
			</Typography>
		</Box>
	);
}
