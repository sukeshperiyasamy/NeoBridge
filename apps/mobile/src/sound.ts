import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';
import { Platform, Vibration } from 'react-native';

/**
 * Sounds and voice. The red alarm loops with vibration until acknowledged; the
 * yellow chime plays once. Voice lines use the phone's text-to-speech in Hindi
 * as a stand-in for the recorded clips (P1).
 */

let alarm: AudioPlayer | null = null;
let chime: AudioPlayer | null = null;
let modeSet = false;

async function mode() {
  if (modeSet) return;
  modeSet = true;
  await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'doNotMix' }).catch(() => undefined);
}

export async function startAlarm() {
  await mode();
  alarm ??= createAudioPlayer(require('@/assets/sounds/alarm.wav'));
  alarm.loop = true;
  alarm.volume = 1;
  alarm.play();
  if (Platform.OS !== 'web') Vibration.vibrate([0, 800, 400, 800, 400], true);
}

export function stopAlarm() {
  alarm?.pause();
  void alarm?.seekTo(0).catch(() => undefined);
  if (Platform.OS !== 'web') Vibration.cancel();
}

export async function playChime() {
  await mode();
  chime ??= createAudioPlayer(require('@/assets/sounds/chime.wav'));
  void chime.seekTo(0).catch(() => undefined);
  chime.play();
  if (Platform.OS !== 'web') Vibration.vibrate([0, 300, 200, 300]);
}

/** Speak a line in the app language (hi-IN / en-IN). */
export function say(text: string, lang: 'hi' | 'en') {
  void Speech.stop();
  Speech.speak(text, { language: lang === 'hi' ? 'hi-IN' : 'en-IN', rate: 0.9 });
}

export function stopSpeaking() {
  void Speech.stop();
}
