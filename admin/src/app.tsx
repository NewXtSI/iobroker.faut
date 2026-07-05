import React from 'react';
import { Box, Typography, CssBaseline } from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const theme = createTheme();

function App(): React.JSX.Element {
	return (
		<ThemeProvider theme={theme}>
			<CssBaseline />
			<Box sx={{ p: 3 }}>
				<Typography variant="h4" gutterBottom>
					Faut Adapter
				</Typography>
				<Typography variant="body1" color="text.secondary">
					Admin-Interface bereit.
				</Typography>
			</Box>
		</ThemeProvider>
	);
}

export default App;
