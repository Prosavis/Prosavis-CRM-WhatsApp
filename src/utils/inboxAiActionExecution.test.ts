import { describe, expect, it, vi } from 'vitest';
import type { InboxAiProposedAction } from '../../supabase/functions/_shared/inboxAiActions';
import {
  ExecuteInboxAiActionError,
  executeInboxAiAction,
  parseExecuteInboxAiActionRequest,
  type InboxAiActionExecutionDeps,
} from '../../supabase/functions/_shared/inboxAiActionExecution';
import { FirebaseCrmBridgeHttpError } from '../../supabase/functions/_shared/firebaseHttp';

function baseAction(
  overrides: Partial<InboxAiProposedAction> & Pick<InboxAiProposedAction, 'type' | 'payload'>,
): InboxAiProposedAction {
  return {
    id: '123e4567-e89b-42d3-a456-426614174000',
    label: 'Acción',
    reason: 'motivo',
    requiresConfirmation: true,
    ...overrides,
  } as InboxAiProposedAction;
}

function createDeps(
  overrides: Partial<InboxAiActionExecutionDeps> = {},
): InboxAiActionExecutionDeps {
  return {
    crmAdminId: 'admin-1',
    loadConversation: vi.fn().mockResolvedValue({
      stableKey: '57-3001112233',
      phone: '+573001112233',
      tagIds: ['tag-existing'],
      phoneNumberId: 'phone-1',
    }),
    resolveTagByName: vi.fn().mockResolvedValue({ id: 'tag-vip', name: 'VIP' }),
    updateConversationTagIds: vi.fn().mockResolvedValue(undefined),
    resolveDirectoryId: vi.fn().mockResolvedValue('dir-1'),
    resolveGroundedPaymentUrl: vi.fn().mockResolvedValue(
      'https://checkout.wompi.co/l/6WXkiC',
    ),
    findApprovedTemplate: vi.fn().mockResolvedValue({
      name: 'hello_world',
      language: 'es_CO',
    }),
    sendTemplate: vi.fn().mockResolvedValue({ waMessageId: 'wamid.1' }),
    postAppointmentAction: vi.fn().mockResolvedValue({ appointmentId: 'appt-1' }),
    ...overrides,
  };
}

describe('parseExecuteInboxAiActionRequest', () => {
  it('requires confirmation and a stable key', () => {
    const action = baseAction({
      type: 'apply_tag',
      payload: { tagName: 'VIP' },
    });
    expect(() => parseExecuteInboxAiActionRequest({
      stableKey: 'key-1',
      action,
      suggestionFingerprint: 'fp_1',
    })).not.toThrow();

    expect(() => parseExecuteInboxAiActionRequest({
      stableKey: 'key-1',
      action: { ...action, requiresConfirmation: false },
    })).toThrow(ExecuteInboxAiActionError);

    expect(() => parseExecuteInboxAiActionRequest({
      action,
    })).toThrow(/stableKey/i);
  });
});

describe('executeInboxAiAction', () => {
  it('merges tags instead of overwriting existing ids', async () => {
    const deps = createDeps();
    const result = await executeInboxAiAction({
      stableKey: '57-3001112233',
      action: baseAction({
        type: 'apply_tag',
        payload: { tagName: 'VIP' },
      }),
      deps,
    });

    expect(deps.updateConversationTagIds).toHaveBeenCalledWith(
      '57-3001112233',
      ['tag-existing', 'tag-vip'],
    );
    expect(result).toMatchObject({
      type: 'apply_tag',
      tagId: 'tag-vip',
      alreadyPresent: false,
    });
  });

  it('returns insert_composer for grounded payment links', async () => {
    const url = 'https://checkout.wompi.co/l/6WXkiC';
    const deps = createDeps({
      resolveGroundedPaymentUrl: vi.fn().mockResolvedValue(url),
    });

    const result = await executeInboxAiAction({
      stableKey: '57-3001112233',
      action: baseAction({
        type: 'send_payment_link',
        payload: { url, amountCOP: 88_000 },
      }),
      deps,
    });

    expect(result).toEqual({
      type: 'send_payment_link',
      mode: 'insert_composer',
      text: url,
    });
  });

  it('rejects payment links that do not match grounded checkout', async () => {
    const deps = createDeps({
      resolveGroundedPaymentUrl: vi.fn().mockResolvedValue(null),
    });

    await expect(executeInboxAiAction({
      stableKey: '57-3001112233',
      action: baseAction({
        type: 'send_payment_link',
        payload: {
          url: 'https://evil.example/pay',
          amountCOP: 88_000,
        },
      }),
      deps,
    })).rejects.toMatchObject({ status: 422 });
  });

  it('sends templates only when Meta match exists', async () => {
    const deps = createDeps();
    const result = await executeInboxAiAction({
      stableKey: '57-3001112233',
      action: baseAction({
        type: 'send_template',
        payload: {
          templateName: 'hello_world',
          languageCode: 'es_CO',
          variables: { '1': 'Ana' },
        },
      }),
      deps,
    });

    expect(deps.sendTemplate).toHaveBeenCalled();
    expect(result).toMatchObject({
      type: 'send_template',
      success: true,
      waMessageId: 'wamid.1',
    });
  });

  it('maps create_appointment through the Firebase bridge with lowercase operationId', async () => {
    const deps = createDeps();
    const action = baseAction({
      id: '123E4567-E89B-42D3-A456-426614174000',
      type: 'create_appointment',
      payload: {
        scheduledDate: '2026-08-10T14:00:00.000Z',
        duration: 240,
        address: 'Calle 1',
        wantsKit: false,
      },
    });

    const result = await executeInboxAiAction({
      stableKey: '57-3001112233',
      action,
      suggestionFingerprint: 'fp_abc',
      deps,
    });

    expect(deps.postAppointmentAction).toHaveBeenCalledWith({
      operationId: '123e4567-e89b-42d3-a456-426614174000',
      crmAdminId: 'admin-1',
      type: 'create_appointment',
      directoryId: 'dir-1',
      scheduledDate: '2026-08-10T14:00:00.000Z',
      duration: 240,
      wantsKit: false,
    });
    expect(result).toMatchObject({
      type: 'create_appointment',
      appointmentId: 'appt-1',
      suggestionFingerprint: 'fp_abc',
    });
  });

  it('maps Firebase 409 to a clear conflict error', async () => {
    const deps = createDeps({
      postAppointmentAction: vi.fn().mockRejectedValue(
        new FirebaseCrmBridgeHttpError(409, { error: 'conflict' }),
      ),
    });

    await expect(executeInboxAiAction({
      stableKey: '57-3001112233',
      action: baseAction({
        type: 'reschedule_appointment',
        payload: {
          appointmentId: 'appt-old',
          scheduledDate: '2026-08-11T14:00:00.000Z',
        },
      }),
      deps,
    })).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/conflicto|conflict/i),
    });
  });
});
