import '@/test/setup';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { describe, expect, it, vi } from 'vitest';
import SuggestionSparkleControl from './SuggestionSparkleControl';

function renderControl(onRequest = vi.fn()) {
  render(
    <ThemeProvider theme={createTheme()}>
      <SuggestionSparkleControl onRequest={onRequest} />
    </ThemeProvider>,
  );
  return onRequest;
}

describe('SuggestionSparkleControl', () => {
  it('requests a suggestion without opening a mode menu', async () => {
    const user = userEvent.setup();
    const onRequest = renderControl();
    expect(screen.queryByText('Automático')).not.toBeInTheDocument();
    expect(screen.queryByText('Con contexto')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sugerir respuesta' }));
    expect(onRequest).toHaveBeenCalledWith(undefined);
  });

  it('sends the optional instruction with the suggestion', async () => {
    const user = userEvent.setup();
    const onRequest = renderControl();
    await user.click(screen.getByRole('button', { name: 'Agregar instrucción para la sugerencia' }));
    await user.type(screen.getByRole('textbox', { name: 'Instrucción opcional para la sugerencia' }), 'Ofrece la tarde');
    await user.click(screen.getByRole('button', { name: 'Sugerir respuesta' }));
    expect(onRequest).toHaveBeenCalledWith('Ofrece la tarde');
  });
});
