import { afterEach, describe, expect, it, vi } from 'vitest';

type PresenceStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR';

type FakeChannel = {
  topic: string;
  state: 'closed' | 'joined' | 'leaving';
  track: ReturnType<typeof vi.fn>;
  untrack: ReturnType<typeof vi.fn>;
  presenceState: () => Record<string, never>;
  on: (type: string, filter: { event: string }, callback: () => void) => FakeChannel;
  subscribe: (
    callback: (status: PresenceStatus, err?: Error) => void,
  ) => FakeChannel;
  emit: (status: PresenceStatus, err?: Error) => void;
};

const live: FakeChannel[] = [];

const channelMock = vi.hoisted(() => vi.fn());
const removeChannelMock = vi.hoisted(() => vi.fn());
const getChannelsMock = vi.hoisted(() => vi.fn(() => live));

vi.mock('@/config/supabase', () => ({
  supabase: {
    channel: channelMock,
    removeChannel: removeChannelMock,
    getChannels: getChannelsMock,
    functions: { invoke: vi.fn() },
  },
}));

function drop(channel: FakeChannel) {
  const index = live.indexOf(channel);
  if (index >= 0) live.splice(index, 1);
  channel.state = 'closed';
}

function makeChannel(name: string): FakeChannel {
  let onStatus: ((status: PresenceStatus, err?: Error) => void) | null = null;
  const channel: FakeChannel = {
    topic: `realtime:${name}`,
    state: 'closed',
    track: vi.fn(async () => 'ok'),
    untrack: vi.fn(async () => 'ok'),
    presenceState: () => ({}),
    on() {
      return channel;
    },
    subscribe(callback) {
      onStatus = callback;
      return channel;
    },
    emit(status, err) {
      channel.state = status === 'SUBSCRIBED' ? 'joined' : 'closed';
      onStatus?.(status, err);
    },
  };
  return channel;
}

channelMock.mockImplementation((name: string) => {
  const channel = makeChannel(name);
  live.push(channel);
  return channel;
});

removeChannelMock.mockImplementation(async (channel: FakeChannel) => {
  drop(channel);
  return 'ok';
});

const { setMyWhatsAppPresence, subscribeToWhatsAppAdminPresence } = await import('./whatsappService');

const phoneNumberId = 'line-comercial';
const uid = 'admin-1';

async function openPresence() {
  const unsub = subscribeToWhatsAppAdminPresence(phoneNumberId, uid, () => undefined);
  await vi.waitFor(() => expect(channelMock).toHaveBeenCalled());
  const channel = channelMock.mock.results.at(-1)?.value as FakeChannel;
  return { unsub, channel };
}

afterEach(() => {
  live.splice(0, live.length);
  vi.clearAllMocks();
  channelMock.mockImplementation((name: string) => {
    const channel = makeChannel(name);
    live.push(channel);
    return channel;
  });
  removeChannelMock.mockImplementation(async (channel: FakeChannel) => {
    drop(channel);
    return 'ok';
  });
});

describe('whatsapp admin presence', () => {
  it('does not track and warns once when the channel never joins', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { unsub, channel } = await openPresence();
    channel.emit('TIMED_OUT');

    await setMyWhatsAppPresence(uid, {
      conversationId: 'chat-1',
      phoneNumberId,
      displayName: 'Francy',
      activity: 'viewing',
    });
    await setMyWhatsAppPresence(uid, {
      conversationId: 'chat-1',
      phoneNumberId,
      displayName: 'Francy',
      activity: 'typing',
    });

    expect(channel.track).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toBe('[setMyWhatsAppPresence] track failed:');
    unsub();
    warn.mockRestore();
  });

  it('sends the latest payload after the in-flight track finishes', async () => {
    const { unsub, channel } = await openPresence();
    const pendingTracks: Array<(status: string) => void> = [];
    channel.track.mockImplementation(
      () =>
        new Promise((resolve) => {
          pendingTracks.push(resolve);
        }),
    );
    channel.emit('SUBSCRIBED');

    const viewing = setMyWhatsAppPresence(uid, {
      conversationId: 'chat-1',
      phoneNumberId,
      displayName: 'Francy',
      activity: 'viewing',
    });
    await vi.waitFor(() => expect(channel.track).toHaveBeenCalledTimes(1));
    expect(channel.track.mock.calls[0]?.[0]).toMatchObject({ activity: 'viewing' });

    const typing = setMyWhatsAppPresence(uid, {
      conversationId: 'chat-1',
      phoneNumberId,
      displayName: 'Francy',
      activity: 'typing',
    });
    pendingTracks[0]?.('ok');
    await viewing;
    await vi.waitFor(() => expect(channel.track).toHaveBeenCalledTimes(2));
    pendingTracks[1]?.('ok');
    await typing;

    expect(channel.track).toHaveBeenCalledTimes(2);
    expect(channel.track.mock.calls[1]?.[0]).toMatchObject({ activity: 'typing' });
    unsub();
  });

  it('waits to remove the previous topic before opening the next channel', async () => {
    const first = await openPresence();
    let releaseRemove: (() => void) | undefined;
    removeChannelMock.mockImplementation(
      (channel: FakeChannel) =>
        new Promise((resolve) => {
          releaseRemove = () => {
            drop(channel);
            resolve('ok');
          };
        }),
    );

    const unsub = subscribeToWhatsAppAdminPresence(phoneNumberId, uid, () => undefined);
    await Promise.resolve();
    expect(channelMock).toHaveBeenCalledTimes(1);

    releaseRemove?.();
    await vi.waitFor(() => expect(channelMock).toHaveBeenCalledTimes(2));
    expect(channelMock.mock.calls[1]?.[0]).toBe(`whatsapp-admin-presence:${phoneNumberId}`);
    expect(channelMock.mock.calls[1]?.[1]).toEqual({
      config: { presence: { key: uid, enabled: true } },
    });

    first.unsub();
    unsub();
  });
});
