import { useCallback, useRef, useEffect } from 'react';
import {
  areSoundsEnabled,
  getSoundVolume,
  setSoundsEnabled,
  setSoundVolume,
} from '@/utils/soundPreferences';

interface SoundEffectsOptions {
  volume?: number;
  enabled?: boolean;
}

interface SoundEffects {
  playNavigation: () => void;
  playClick: () => void;
  playSuccess: () => void;
  playError: () => void;
  playNotification: () => void;
  setEnabled: (enabled: boolean) => void;
  setVolume: (volume: number) => void;
}

const useSoundEffects = (options: SoundEffectsOptions = {}): SoundEffects => {
  const { volume: initialVolume = getSoundVolume(), enabled: initialEnabled = areSoundsEnabled() } =
    options;

  const audioContextRef = useRef<AudioContext | null>(null);
  const volumeRef = useRef(initialVolume);
  const enabledRef = useRef(initialEnabled);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current && typeof window !== 'undefined' && 'AudioContext' in window) {
      try {
        audioContextRef.current = new AudioContext();
      } catch (error) {
        console.warn('No se pudo crear AudioContext:', error);
      }
    }
    return audioContextRef.current;
  }, []);

  const playSound = useCallback(
    (frequency: number, duration: number, type: OscillatorType = 'sine') => {
      if (!enabledRef.current) return;

      const audioContext = getAudioContext();
      if (!audioContext) return;

      try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
        oscillator.type = type;

        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(volumeRef.current, audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration);
      } catch (error) {
        console.warn('Error al reproducir sonido:', error);
      }
    },
    [getAudioContext],
  );

  const playAudioFile = useCallback((filename: string) => {
    if (!enabledRef.current) return;

    try {
      const audio = new Audio(`/assets/audio/${filename}`);
      audio.volume = volumeRef.current;
      void audio.play().catch(() => {});
    } catch {
      // Ignorar errores de reproducción.
    }
  }, []);

  const playNavigation = useCallback(() => {
    playAudioFile('navigation.mp3');
    setTimeout(() => playSound(800, 0.1, 'sine'), 10);
  }, [playAudioFile, playSound]);

  const playClick = useCallback(() => {
    playSound(1000, 0.05, 'square');
  }, [playSound]);

  const playSuccess = useCallback(() => {
    playSound(523, 0.1, 'sine');
    setTimeout(() => playSound(659, 0.1, 'sine'), 100);
    setTimeout(() => playSound(784, 0.15, 'sine'), 200);
  }, [playSound]);

  const playError = useCallback(() => {
    playSound(300, 0.1, 'sawtooth');
    setTimeout(() => playSound(250, 0.15, 'sawtooth'), 100);
  }, [playSound]);

  const playNotification = useCallback(() => {
    playSound(800, 0.08, 'sine');
    setTimeout(() => playSound(600, 0.08, 'sine'), 80);
  }, [playSound]);

  const setEnabled = useCallback((enabled: boolean) => {
    enabledRef.current = enabled;
    setSoundsEnabled(enabled);
  }, []);

  const setVolume = useCallback((volume: number) => {
    volumeRef.current = Math.max(0, Math.min(1, volume));
    setSoundVolume(volumeRef.current);
  }, []);

  useEffect(() => {
    enabledRef.current = areSoundsEnabled();
    volumeRef.current = getSoundVolume();
  }, []);

  useEffect(() => {
    return () => {
      void audioContextRef.current?.close();
    };
  }, []);

  return {
    playNavigation,
    playClick,
    playSuccess,
    playError,
    playNotification,
    setEnabled,
    setVolume,
  };
};

export default useSoundEffects;
