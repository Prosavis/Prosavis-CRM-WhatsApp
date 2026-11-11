import { describe, expect, it, vi } from 'vitest';
import { openPostgresChannel } from './inboxRealtimeSync';

type ChannelState = 'closed' | 'joined' | 'leaving';

interface FakeChannel {
  topic: string;
  state: ChannelState;
  listeners: Array<(payload: unknown) => void>;
  onStatus?: (status: string, error?: Error) => void;
  on: (event: string, filter: unknown, callback: (payload: unknown) => void) => FakeChannel;
  subscribe: (callback?: (status: string, error?: Error) => void) => FakeChannel;
  emit: (payload: unknown) => void;
}

/**
 * Imita @supabase/realtime-js 2.106: el mismo topic devuelve el canal existente
 * aunque esté en `leaving`, y subscribe() no se une si el canal no está `closed`.
 */
function createCollidingRealtime() {
  const byTopic = new Map<string, FakeChannel>();

  const create = (topic: string): FakeChannel => {
    const channel: FakeChannel = {
      topic,
      state: 'closed',
      listeners: [],
      on(event, _filter, callback) {
        if (event !== 'postgres_changes') throw new Error(`evento inesperado: ${event}`);
        if (channel.state === 'joined') throw new Error('callback después de subscribe');
        channel.listeners.push(callback);
        return channel;
      },
      subscribe(callback) {
        if (channel.state !== 'closed') return channel;
        channel.state = 'joined';
        channel.onStatus = callback;
        callback?.('SUBSCRIBED');
        return channel;
      },
      emit(payload) {
        if (channel.state !== 'joined') return;
        for (const listener of channel.listeners) listener(payload);
      },
    };
    byTopic.set(topic, channel);
    return channel;
  };

  return {
    channel(name: string) {
      const existing = byTopic.get(name);
      if (existing && existing.state !== 'closed') return existing;
      return create(name);
    },
    removeChannel(channel: FakeChannel) {
      channel.state = 'leaving';
      queueMicrotask(() => {
        channel.state = 'closed';
        if (byTopic.get(channel.topic) === channel) byTopic.delete(channel.topic);
      });
    },
    joinedTopics() {
      return [...byTopic.values()].filter((channel) => channel.state === 'joined').map((channel) => channel.topic);
    },
    emitJoined(payload: unknown) {
      for (const channel of byTopic.values()) channel.emit(payload);
    },
  };
}

const binding = {
  filter: { event: '*', schema: 'public', table: 'whatsapp_conversations' },
};

describe('openPostgresChannel', () => {
  it('reabre la suscripción aunque el canal anterior siga cerrándose', async () => {
    const client = createCollidingRealtime();
    const first: unknown[] = [];
    const second: unknown[] = [];

    const stopFirst = openPostgresChannel({
      client,
      baseName: 'whatsapp-conversations:bot:orphans',
      bindings: [{ ...binding, callback: (payload) => first.push(payload) }],
    });
    stopFirst();

    const stopSecond = openPostgresChannel({
      client,
      baseName: 'whatsapp-conversations:bot:orphans',
      bindings: [{ ...binding, callback: (payload) => second.push(payload) }],
    });

    client.emitJoined({ eventType: 'UPDATE', new: { stable_key: 'chat' } });
    expect(second).toEqual([{ eventType: 'UPDATE', new: { stable_key: 'chat' } }]);
    expect(client.joinedTopics()).toHaveLength(1);
    expect(client.joinedTopics()[0]).not.toBe('whatsapp-conversations:bot:orphans');

    stopSecond();
    await Promise.resolve();
  });

  it('recrea el canal tras un error y avisa solo desde la segunda unión', () => {
    const client = createCollidingRealtime();
    const timers: Array<() => void> = [];
    const onResubscribed = vi.fn();
    const events: unknown[] = [];

    const stop = openPostgresChannel({
      client,
      baseName: 'whatsapp-messages:chat',
      bindings: [{ ...binding, callback: (payload) => events.push(payload) }],
      onResubscribed,
      schedule: (fn) => {
        timers.push(fn);
        return { cancel: () => undefined };
      },
    });

    expect(onResubscribed).not.toHaveBeenCalled();
    const [firstTopic] = client.joinedTopics();
    const first = [...client.joinedTopics()];
    expect(first).toHaveLength(1);
    byTopicStatus(client, firstTopic, 'CHANNEL_ERROR');
    expect(timers).toHaveLength(1);
    timers[0]();

    expect(onResubscribed).toHaveBeenCalledTimes(1);
    expect(client.joinedTopics()).toHaveLength(1);
    expect(client.joinedTopics()[0]).not.toBe(firstTopic);
    client.emitJoined({ eventType: 'INSERT' });
    expect(events).toEqual([{ eventType: 'INSERT' }]);

    stop();
  });

  it('no recrea el canal si se une de nuevo antes del reintento', () => {
    const client = createCollidingRealtime();
    const timers: Array<() => void> = [];
    const cancelled = new Set<() => void>();
    const onResubscribed = vi.fn();

    const stop = openPostgresChannel({
      client,
      baseName: 'whatsapp-conversations:comercial:strict',
      bindings: [{ ...binding, callback: () => undefined }],
      onResubscribed,
      schedule: (fn) => {
        timers.push(fn);
        return {
          cancel: () => {
            cancelled.add(fn);
          },
        };
      },
    });

    const [topic] = client.joinedTopics();
    byTopicStatus(client, topic, 'CHANNEL_ERROR');
    expect(timers).toHaveLength(1);
    byTopicStatus(client, topic, 'SUBSCRIBED');
    expect(cancelled.has(timers[0])).toBe(true);
    expect(onResubscribed).toHaveBeenCalledTimes(1);
    expect(client.joinedTopics()).toEqual([topic]);

    stop();
  });

  it('no recrea el canal después de la limpieza', () => {
    const client = createCollidingRealtime();
    const timers: Array<() => void> = [];
    const stop = openPostgresChannel({
      client,
      baseName: 'crm-directory-inbox-meta',
      bindings: [{ ...binding, callback: () => undefined }],
      schedule: (fn) => {
        timers.push(fn);
        return { cancel: () => undefined };
      },
    });

    const [topic] = client.joinedTopics();
    stop();
    byTopicStatus(client, topic, 'CLOSED');
    expect(timers).toHaveLength(0);
    expect(client.joinedTopics()).toHaveLength(0);
  });
});

function byTopicStatus(
  client: ReturnType<typeof createCollidingRealtime>,
  topic: string,
  status: string,
) {
  const channel = client.channel(topic);
  if (channel.state !== 'joined' && channel.state !== 'leaving') {
    throw new Error(`el canal ${topic} no está suscrito`);
  }
  channel.onStatus?.(status);
}
