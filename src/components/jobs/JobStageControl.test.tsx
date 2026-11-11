import '@/test/setup';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { format } from 'date-fns';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { JobStageControl } from '@/components/jobs/JobStageControl';
import type { JobTeamMember } from '@/types/jobApplications';

const lucia: JobTeamMember = {
  id: 'm1',
  service_id: 'svc',
  name: 'Lucía',
  email: null,
  phone_number: null,
  is_active: true,
};

function renderControl(props: Partial<ComponentProps<typeof JobStageControl>> = {}) {
  const onChange = vi.fn().mockResolvedValue(undefined);
  const onHire = vi.fn().mockResolvedValue(undefined);
  const user = userEvent.setup();
  render(
    <JobStageControl
      value="inbound"
      hasTeamMember={false}
      teamMembers={[lucia]}
      onChange={onChange}
      onHire={onHire}
      {...props}
    />,
  );
  return { onChange, onHire, user };
}

async function choose(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('combobox', { name: 'Etapa' }));
  await user.click(screen.getByRole('option', { name }));
}

describe('JobStageControl', () => {
  it('saves a simple stage immediately and shows it while waiting', async () => {
    let release: () => void = () => undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const onChange = vi.fn(() => pending);
    const { user } = renderControl({ onChange });

    await choose(user, 'Entrevista pendiente');

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith({ stage: 'interview_pending' });
    expect(screen.getByRole('combobox', { name: 'Etapa' })).toHaveTextContent('Entrevista pendiente');
    release();
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Etapa' })).toHaveTextContent('Ingreso');
    });
  });

  it('asks for a date before scheduling and sends it only on Guardar', async () => {
    const { onChange, user } = renderControl();

    await choose(user, 'Entrevista programada');

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: 'Etapa' })).toHaveTextContent('Ingreso');

    await choose(user, 'Entrevista programada');
    const when = screen.getByLabelText('Fecha y hora de la entrevista');
    await user.type(when, '2026-11-12T10:30');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onChange).toHaveBeenCalledWith({
      stage: 'interview_scheduled',
      interviewAt: new Date('2026-11-12T10:30').toISOString(),
    });
  });

  it('opens the current interview date for editing', async () => {
    const interviewAt = '2026-11-12T15:00:00.000Z';
    const { onChange, user } = renderControl({
      value: 'interview_scheduled',
      interviewAt,
    });

    await user.click(screen.getByRole('button', { name: 'Cambiar fecha' }));

    expect(screen.getByLabelText('Fecha y hora de la entrevista')).toHaveValue(
      format(new Date(interviewAt), "yyyy-MM-dd'T'HH:mm"),
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('requires a real reason before rejecting', async () => {
    const { onChange, user } = renderControl();

    await choose(user, 'Rechazada');
    const reason = screen.getByLabelText('¿Por qué se rechaza?');
    await user.type(reason, '   ');
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
    await user.clear(reason);
    await user.type(reason, '  Sin experiencia  ');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onChange).toHaveBeenCalledWith({ stage: 'rejected', note: 'Sin experiencia' });
  });

  it('hires through the team picker and does not transition', async () => {
    const { onChange, onHire, user } = renderControl();

    await choose(user, 'Contratada');

    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('combobox', { name: 'Persona del equipo' }));
    await user.click(screen.getByRole('option', { name: 'Lucía' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onChange).not.toHaveBeenCalled();
    expect(onHire).toHaveBeenCalledWith({ serviceId: 'svc', memberId: 'm1' });
  });

  it('keeps Guardar disabled when nobody is on the team', async () => {
    const { onChange, onHire, user } = renderControl({ teamMembers: [] });

    await choose(user, 'Contratada');

    expect(screen.getByText('No hay personas activas en Equipo. Agrégala primero en Equipo.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
    expect(onHire).not.toHaveBeenCalled();
  });

  it('saves Contratada immediately when a team member is already linked', async () => {
    const { onChange, onHire, user } = renderControl({ hasTeamMember: true });

    await choose(user, 'Contratada');

    expect(onChange).toHaveBeenCalledWith({ stage: 'hired' });
    expect(onHire).not.toHaveBeenCalled();
  });

  it('returns to the saved stage and explains a server error in Spanish', async () => {
    const { user } = renderControl({
      onChange: vi.fn().mockRejectedValue(new Error('a note is required')),
    });

    await choose(user, 'Rechazada');
    await user.type(screen.getByLabelText('¿Por qué se rechaza?'), 'Sin experiencia');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Escribe el motivo.')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Etapa' })).toHaveTextContent('Ingreso');
  });

  it('does not open the row when a stage is chosen', async () => {
    const onRow = vi.fn();
    const user = userEvent.setup();
    render(
      <div onClick={onRow}>
        <JobStageControl
          value="inbound"
          hasTeamMember={false}
          teamMembers={[]}
          onChange={vi.fn().mockResolvedValue(undefined)}
          onHire={vi.fn()}
        />
      </div>,
    );

    await choose(user, 'Entrevista pendiente');

    expect(onRow).not.toHaveBeenCalled();
  });
});
